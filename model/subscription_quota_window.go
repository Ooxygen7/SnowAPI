package model

import (
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	mysqldriver "github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
)

const (
	SubscriptionQuotaWindowPeriod   = "period"
	SubscriptionQuotaWindowFiveHour = "five_hour"

	SubscriptionUsageStateReserved = "reserved"
	SubscriptionUsageStateSettled  = "settled"
	SubscriptionUsageStateRefunded = "refunded"

	subscriptionFiveHourWindowSeconds = int64(5 * time.Hour / time.Second)
	subscriptionQuotaTxMaxAttempts    = 4
)

var (
	ErrNoActiveSubscription          = errors.New("no active subscription")
	ErrSubscriptionQuotaInsufficient = errors.New("subscription quota insufficient")
	ErrSubscriptionUsageFinalized    = errors.New("subscription usage is finalized")
	ErrSubscriptionQuotaConflict     = errors.New("subscription quota concurrent update conflict")
	ErrSubscriptionQuotaInvalid      = errors.New("invalid subscription quota state")
)

// SubscriptionUsageRef is the stable identity carried from pre-consume through
// synchronous, streaming, legacy, and asynchronous settlement paths.
type SubscriptionUsageRef = relaycommon.SubscriptionUsageRef

// SubscriptionQuotaWindow is the auditable ledger shared by periodic and
// five-hour subscription quota windows. EndTime is exclusive.
type SubscriptionQuotaWindow struct {
	Id                 int    `json:"id"`
	UserSubscriptionId int    `json:"user_subscription_id" gorm:"not null;index;uniqueIndex:idx_subscription_quota_window_sequence,priority:1"`
	WindowType         string `json:"window_type" gorm:"type:varchar(16);not null;index;uniqueIndex:idx_subscription_quota_window_sequence,priority:2"`
	Sequence           int64  `json:"sequence" gorm:"type:bigint;not null;uniqueIndex:idx_subscription_quota_window_sequence,priority:3"`
	AmountTotal        int64  `json:"amount_total" gorm:"type:bigint;not null;default:0"`
	AmountUsed         int64  `json:"amount_used" gorm:"type:bigint;not null;default:0"`
	StartTime          int64  `json:"start_time" gorm:"type:bigint;not null;index"`
	EndTime            int64  `json:"end_time" gorm:"type:bigint;not null;index"`
	ClosedAt           int64  `json:"closed_at" gorm:"type:bigint;not null;default:0;index"`
	Version            int64  `json:"version" gorm:"type:bigint;not null;default:1"`
	CreatedAt          int64  `json:"created_at" gorm:"type:bigint"`
	UpdatedAt          int64  `json:"updated_at" gorm:"type:bigint;index"`
}

type SubscriptionQuotaWindowSummary struct {
	State       string `json:"state"`
	WindowId    int    `json:"window_id,omitempty"`
	Sequence    int64  `json:"sequence,omitempty"`
	AmountTotal int64  `json:"amount_total"`
	AmountUsed  int64  `json:"amount_used"`
	Remaining   int64  `json:"remaining"`
	StartTime   int64  `json:"start_time,omitempty"`
	EndTime     int64  `json:"end_time,omitempty"`
}

func validateSubscriptionQuotaValue(name string, value int64, allowZero bool) error {
	if value < 0 || value > int64(common.MaxQuota) || (!allowZero && value == 0) {
		minimum := 0
		if !allowZero {
			minimum = 1
		}
		err := fmt.Errorf("%w: %s must be between %d and %d, got %d", ErrSubscriptionQuotaInvalid, name, minimum, common.MaxQuota, value)
		common.SysError(err.Error())
		return err
	}
	return nil
}

func validateSubscriptionQuotaCounter(name string, value int64) error {
	if value < 0 {
		err := fmt.Errorf("%w: %s cannot be negative: %d", ErrSubscriptionQuotaInvalid, name, value)
		common.SysError(err.Error())
		return err
	}
	return nil
}

func checkedSubscriptionQuotaAdd(current int64, delta int64) (int64, error) {
	if err := validateSubscriptionQuotaCounter("current quota usage", current); err != nil {
		return 0, err
	}
	if delta > int64(common.MaxQuota) || delta < -int64(common.MaxQuota) {
		err := fmt.Errorf("%w: quota delta out of range: %d", ErrSubscriptionQuotaInvalid, delta)
		common.SysError(err.Error())
		return 0, err
	}
	if delta < 0 && -delta >= current {
		return 0, nil
	}
	if delta > 0 && current > math.MaxInt64-delta {
		err := fmt.Errorf("%w: quota addition overflow: current=%d delta=%d", ErrSubscriptionQuotaInvalid, current, delta)
		common.SysError(err.Error())
		return 0, err
	}
	return current + delta, nil
}

type sqlStateError interface {
	SQLState() string
}

func isRetryableSubscriptionQuotaError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, ErrSubscriptionQuotaConflict) || isRetryableSQLiteLockError(err) {
		return true
	}
	var mysqlError *mysqldriver.MySQLError
	if errors.As(err, &mysqlError) && mysqlError.Number == 1213 {
		return true
	}
	var postgresError sqlStateError
	return errors.As(err, &postgresError) && postgresError.SQLState() == "40P01"
}

func runSubscriptionQuotaWithRetry(run func() error) error {
	var lastErr error
	for attempt := 0; attempt < subscriptionQuotaTxMaxAttempts; attempt++ {
		lastErr = run()
		if lastErr == nil {
			return nil
		}
		if !isRetryableSubscriptionQuotaError(lastErr) {
			return lastErr
		}
		if attempt+1 < subscriptionQuotaTxMaxAttempts {
			time.Sleep(time.Duration(attempt+1) * 5 * time.Millisecond)
		}
	}
	return lastErr
}

func runSubscriptionQuotaTransaction(fn func(tx *gorm.DB) error) error {
	return runSubscriptionQuotaWithRetry(func() error {
		return DB.Transaction(fn)
	})
}

func getSubscriptionDBTimestampTx(tx *gorm.DB) int64 {
	if tx == nil {
		return GetDBTimestamp()
	}
	var timestamp int64
	var err error
	switch {
	case common.UsingMainDatabase(common.DatabaseTypePostgreSQL):
		err = tx.Raw("SELECT EXTRACT(EPOCH FROM NOW())::bigint").Scan(&timestamp).Error
	case common.UsingMainDatabase(common.DatabaseTypeSQLite):
		err = tx.Raw("SELECT strftime('%s','now')").Scan(&timestamp).Error
	default:
		err = tx.Raw("SELECT UNIX_TIMESTAMP()").Scan(&timestamp).Error
	}
	if err != nil || timestamp <= 0 {
		return common.GetTimestamp()
	}
	return timestamp
}

func saveSubscriptionWindowStateTx(tx *gorm.DB, sub *UserSubscription, now int64) error {
	if tx == nil || sub == nil || sub.Id <= 0 || sub.QuotaWindowVersion < 0 {
		return ErrSubscriptionQuotaInvalid
	}
	expectedVersion := sub.QuotaWindowVersion
	nextVersion := expectedVersion + 1
	result := tx.Model(&UserSubscription{}).
		Where("id = ? AND quota_window_version = ?", sub.Id, expectedVersion).
		Updates(map[string]interface{}{
			"amount_used":                 sub.AmountUsed,
			"last_reset_time":             sub.LastResetTime,
			"next_reset_time":             sub.NextResetTime,
			"current_period_window_id":    sub.CurrentPeriodWindowId,
			"current_five_hour_window_id": sub.CurrentFiveHourWindowId,
			"period_window_sequence":      sub.PeriodWindowSequence,
			"five_hour_window_sequence":   sub.FiveHourWindowSequence,
			"quota_window_version":        nextVersion,
			"updated_at":                  now,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrSubscriptionQuotaConflict
	}
	sub.QuotaWindowVersion = nextVersion
	sub.UpdatedAt = now
	return nil
}

func loadSubscriptionQuotaWindowTx(tx *gorm.DB, id int, subId int, windowType string) (*SubscriptionQuotaWindow, error) {
	if id <= 0 {
		return nil, nil
	}
	var window SubscriptionQuotaWindow
	if err := lockForUpdate(tx).Where("id = ?", id).First(&window).Error; err != nil {
		return nil, err
	}
	if window.UserSubscriptionId != subId || window.WindowType != windowType {
		return nil, fmt.Errorf("%w: quota window %d does not belong to subscription %d", ErrSubscriptionQuotaInvalid, id, subId)
	}
	if err := validateSubscriptionQuotaCounter("window total", window.AmountTotal); err != nil {
		return nil, err
	}
	if window.WindowType == SubscriptionQuotaWindowFiveHour {
		if err := validateSubscriptionQuotaValue("five hour window total", window.AmountTotal, false); err != nil {
			return nil, err
		}
	}
	if err := validateSubscriptionQuotaCounter("window usage", window.AmountUsed); err != nil {
		return nil, err
	}
	if window.AmountTotal > 0 && window.AmountUsed > window.AmountTotal {
		err := fmt.Errorf("%w: quota window %d usage %d exceeds total %d", ErrSubscriptionQuotaInvalid, window.Id, window.AmountUsed, window.AmountTotal)
		common.SysError(err.Error())
		return nil, err
	}
	return &window, nil
}

func createSubscriptionQuotaWindowTx(tx *gorm.DB, sub *UserSubscription, windowType string, total int64, used int64, start int64, end int64, now int64) (*SubscriptionQuotaWindow, error) {
	if err := validateSubscriptionQuotaCounter("window total", total); err != nil {
		return nil, err
	}
	if windowType == SubscriptionQuotaWindowFiveHour {
		if err := validateSubscriptionQuotaValue("five hour window total", total, false); err != nil {
			return nil, err
		}
	}
	if err := validateSubscriptionQuotaCounter("window usage", used); err != nil {
		return nil, err
	}
	if total > 0 && used > total {
		err := fmt.Errorf("%w: new quota window usage %d exceeds total %d", ErrSubscriptionQuotaInvalid, used, total)
		common.SysError(err.Error())
		return nil, err
	}
	if end <= start {
		return nil, fmt.Errorf("%w: invalid quota window [%d,%d)", ErrSubscriptionQuotaInvalid, start, end)
	}
	var sequence int64
	switch windowType {
	case SubscriptionQuotaWindowPeriod:
		sub.PeriodWindowSequence++
		sequence = sub.PeriodWindowSequence
	case SubscriptionQuotaWindowFiveHour:
		sub.FiveHourWindowSequence++
		sequence = sub.FiveHourWindowSequence
	default:
		return nil, fmt.Errorf("%w: unsupported window type %q", ErrSubscriptionQuotaInvalid, windowType)
	}
	window := &SubscriptionQuotaWindow{
		UserSubscriptionId: sub.Id,
		WindowType:         windowType,
		Sequence:           sequence,
		AmountTotal:        total,
		AmountUsed:         used,
		StartTime:          start,
		EndTime:            end,
		Version:            1,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	if err := tx.Create(window).Error; err != nil {
		return nil, fmt.Errorf("%w: create quota window: %v", ErrSubscriptionQuotaConflict, err)
	}
	return window, nil
}

func updateSubscriptionQuotaWindowUsageTx(tx *gorm.DB, window *SubscriptionQuotaWindow, newUsed int64, now int64) error {
	if window == nil {
		return ErrSubscriptionQuotaInvalid
	}
	if err := validateSubscriptionQuotaCounter("window usage", newUsed); err != nil {
		return err
	}
	if window.AmountTotal > 0 && newUsed > window.AmountTotal {
		return fmt.Errorf("%w: window=%d need=%d remaining=%d", ErrSubscriptionQuotaInsufficient, window.Id, newUsed-window.AmountUsed, window.AmountTotal-window.AmountUsed)
	}
	expectedVersion := window.Version
	nextVersion := expectedVersion + 1
	result := tx.Model(&SubscriptionQuotaWindow{}).
		Where("id = ? AND version = ?", window.Id, expectedVersion).
		Updates(map[string]interface{}{
			"amount_used": newUsed,
			"version":     nextVersion,
			"updated_at":  now,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrSubscriptionQuotaConflict
	}
	window.AmountUsed = newUsed
	window.Version = nextVersion
	window.UpdatedAt = now
	return nil
}

func closeSubscriptionQuotaWindowTx(tx *gorm.DB, window *SubscriptionQuotaWindow, now int64) error {
	if window == nil || window.ClosedAt > 0 {
		return nil
	}
	expectedVersion := window.Version
	nextVersion := expectedVersion + 1
	result := tx.Model(&SubscriptionQuotaWindow{}).
		Where("id = ? AND version = ?", window.Id, expectedVersion).
		Updates(map[string]interface{}{
			"closed_at":  now,
			"version":    nextVersion,
			"updated_at": now,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrSubscriptionQuotaConflict
	}
	window.ClosedAt = now
	window.Version = nextVersion
	window.UpdatedAt = now
	return nil
}

func ensurePeriodQuotaWindowTx(tx *gorm.DB, sub *UserSubscription, now int64) (*SubscriptionQuotaWindow, error) {
	if sub.CurrentPeriodWindowId > 0 {
		window, err := loadSubscriptionQuotaWindowTx(tx, sub.CurrentPeriodWindowId, sub.Id, SubscriptionQuotaWindowPeriod)
		if err != nil {
			return nil, err
		}
		sub.AmountUsed = window.AmountUsed
		return window, nil
	}
	start := sub.LastResetTime
	if start <= 0 {
		start = sub.StartTime
	}
	end := sub.NextResetTime
	if end <= 0 || (sub.EndTime > 0 && end > sub.EndTime) {
		end = sub.EndTime
	}
	if end <= start {
		end = sub.EndTime
	}
	window, err := createSubscriptionQuotaWindowTx(tx, sub, SubscriptionQuotaWindowPeriod, sub.AmountTotal, sub.AmountUsed, start, end, now)
	if err != nil {
		return nil, err
	}
	sub.CurrentPeriodWindowId = window.Id
	return window, nil
}

func prepareFiveHourQuotaWindowTx(tx *gorm.DB, sub *UserSubscription, now int64) (*SubscriptionQuotaWindow, *SubscriptionQuotaWindow, error) {
	if sub.FiveHourQuota == 0 {
		return nil, nil, nil
	}
	if err := validateSubscriptionQuotaValue("five hour quota", sub.FiveHourQuota, false); err != nil {
		return nil, nil, err
	}
	if sub.CurrentFiveHourWindowId <= 0 {
		return nil, nil, nil
	}
	window, err := loadSubscriptionQuotaWindowTx(tx, sub.CurrentFiveHourWindowId, sub.Id, SubscriptionQuotaWindowFiveHour)
	if err != nil {
		return nil, nil, err
	}
	if now >= window.EndTime {
		return nil, window, nil
	}
	return window, nil, nil
}

func createFiveHourQuotaWindowTx(tx *gorm.DB, sub *UserSubscription, expired *SubscriptionQuotaWindow, now int64) (*SubscriptionQuotaWindow, error) {
	if expired != nil {
		if err := closeSubscriptionQuotaWindowTx(tx, expired, now); err != nil {
			return nil, err
		}
	}
	end := now + subscriptionFiveHourWindowSeconds
	if sub.EndTime > 0 && end > sub.EndTime {
		end = sub.EndTime
	}
	window, err := createSubscriptionQuotaWindowTx(tx, sub, SubscriptionQuotaWindowFiveHour, sub.FiveHourQuota, 0, now, end, now)
	if err != nil {
		return nil, err
	}
	sub.CurrentFiveHourWindowId = window.Id
	return window, nil
}

func adjustSubscriptionUsageTx(tx *gorm.DB, record *SubscriptionPreConsumeRecord, ref *SubscriptionUsageRef, finalConsumed int64, state string, now int64) error {
	if record == nil || ref == nil || !ref.Valid() {
		return ErrSubscriptionQuotaInvalid
	}
	if record.RequestId != ref.RequestId || record.UserSubscriptionId != ref.UserSubscriptionId || record.PeriodWindowId != ref.PeriodWindowId || record.FiveHourWindowId != ref.FiveHourWindowId {
		return fmt.Errorf("%w: subscription usage reference mismatch", ErrSubscriptionQuotaInvalid)
	}
	if err := validateSubscriptionQuotaValue("final consumed quota", finalConsumed, true); err != nil {
		return err
	}
	if record.Version != ref.Version {
		if record.FinalConsumed == finalConsumed && record.Status == state {
			ref.Version = record.Version
			return nil
		}
		return ErrSubscriptionQuotaConflict
	}
	if record.FinalConsumed == finalConsumed && record.Status == state {
		return nil
	}
	if record.Status == SubscriptionUsageStateRefunded {
		if finalConsumed == 0 && state == SubscriptionUsageStateRefunded {
			return nil
		}
		return ErrSubscriptionUsageFinalized
	}
	delta := finalConsumed - record.FinalConsumed
	if delta == 0 {
		return updateSubscriptionUsageRecordTx(tx, record, ref, finalConsumed, state, now)
	}

	// All quota mutations acquire rows in the same order: subscription, period
	// window, then five-hour window. The usage record is already locked by the
	// caller and serializes retries for the same request.
	var sub UserSubscription
	if err := lockForUpdate(tx).Where("id = ?", ref.UserSubscriptionId).First(&sub).Error; err != nil {
		return err
	}
	periodWindow, err := loadSubscriptionQuotaWindowTx(tx, ref.PeriodWindowId, ref.UserSubscriptionId, SubscriptionQuotaWindowPeriod)
	if err != nil {
		return err
	}
	periodUsed, err := checkedSubscriptionQuotaAdd(periodWindow.AmountUsed, delta)
	if err != nil {
		return err
	}
	if periodWindow.AmountTotal > 0 && periodUsed > periodWindow.AmountTotal {
		return fmt.Errorf("%w: periodic window remaining=%d need=%d", ErrSubscriptionQuotaInsufficient, periodWindow.AmountTotal-periodWindow.AmountUsed, delta)
	}
	var fiveHourWindow *SubscriptionQuotaWindow
	var fiveHourUsed int64
	if ref.FiveHourWindowId > 0 {
		fiveHourWindow, err = loadSubscriptionQuotaWindowTx(tx, ref.FiveHourWindowId, ref.UserSubscriptionId, SubscriptionQuotaWindowFiveHour)
		if err != nil {
			return err
		}
		fiveHourUsed, err = checkedSubscriptionQuotaAdd(fiveHourWindow.AmountUsed, delta)
		if err != nil {
			return err
		}
		if fiveHourUsed > fiveHourWindow.AmountTotal {
			return fmt.Errorf("%w: five-hour window remaining=%d need=%d", ErrSubscriptionQuotaInsufficient, fiveHourWindow.AmountTotal-fiveHourWindow.AmountUsed, delta)
		}
	}
	if err := updateSubscriptionQuotaWindowUsageTx(tx, periodWindow, periodUsed, now); err != nil {
		return err
	}
	if fiveHourWindow != nil {
		if err := updateSubscriptionQuotaWindowUsageTx(tx, fiveHourWindow, fiveHourUsed, now); err != nil {
			return err
		}
	}
	if sub.CurrentPeriodWindowId == ref.PeriodWindowId {
		sub.AmountUsed = periodUsed
		if err := saveSubscriptionWindowStateTx(tx, &sub, now); err != nil {
			return err
		}
	}
	return updateSubscriptionUsageRecordTx(tx, record, ref, finalConsumed, state, now)
}

func updateSubscriptionUsageRecordTx(tx *gorm.DB, record *SubscriptionPreConsumeRecord, ref *SubscriptionUsageRef, finalConsumed int64, state string, now int64) error {
	nextVersion := record.Version + 1
	updates := map[string]interface{}{
		"final_consumed": finalConsumed,
		"status":         state,
		"version":        nextVersion,
		"updated_at":     now,
	}
	if state == SubscriptionUsageStateSettled {
		updates["settled_at"] = now
	}
	if state == SubscriptionUsageStateRefunded {
		updates["refunded_at"] = now
	}
	result := tx.Model(&SubscriptionPreConsumeRecord{}).
		Where("id = ? AND version = ?", record.Id, record.Version).
		Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrSubscriptionQuotaConflict
	}
	record.FinalConsumed = finalConsumed
	record.Status = state
	record.Version = nextVersion
	ref.Version = nextVersion
	return nil
}

func SetSubscriptionUsageFinal(ref *SubscriptionUsageRef, finalConsumed int64, state string) error {
	if ref == nil || !ref.Valid() {
		return ErrSubscriptionQuotaInvalid
	}
	if state != SubscriptionUsageStateReserved && state != SubscriptionUsageStateSettled && state != SubscriptionUsageStateRefunded {
		return fmt.Errorf("%w: unsupported subscription usage state %q", ErrSubscriptionQuotaInvalid, state)
	}
	originalRef := *ref
	updatedRef := originalRef
	err := runSubscriptionQuotaTransaction(func(tx *gorm.DB) error {
		attemptRef := originalRef
		var record SubscriptionPreConsumeRecord
		if err := lockForUpdate(tx).Where("request_id = ?", attemptRef.RequestId).First(&record).Error; err != nil {
			return err
		}
		if err := adjustSubscriptionUsageTx(tx, &record, &attemptRef, finalConsumed, state, getSubscriptionDBTimestampTx(tx)); err != nil {
			return err
		}
		updatedRef = attemptRef
		return nil
	})
	if err != nil {
		return err
	}
	*ref = updatedRef
	return nil
}

func RefundSubscriptionUsage(ref *SubscriptionUsageRef) error {
	return SetSubscriptionUsageFinal(ref, 0, SubscriptionUsageStateRefunded)
}

func buildSubscriptionQuotaWindowSummaries(subs []UserSubscription) map[int]*SubscriptionQuotaWindowSummary {
	result := make(map[int]*SubscriptionQuotaWindowSummary, len(subs))
	windowIds := make([]int, 0, len(subs))
	for _, sub := range subs {
		if sub.FiveHourQuota <= 0 {
			result[sub.Id] = nil
			continue
		}
		result[sub.Id] = &SubscriptionQuotaWindowSummary{
			State:       "idle",
			AmountTotal: sub.FiveHourQuota,
			Remaining:   sub.FiveHourQuota,
		}
		if sub.CurrentFiveHourWindowId > 0 {
			windowIds = append(windowIds, sub.CurrentFiveHourWindowId)
		}
	}
	if len(windowIds) == 0 {
		return result
	}
	var windows []SubscriptionQuotaWindow
	if err := DB.Where("id IN ?", windowIds).Find(&windows).Error; err != nil {
		return result
	}
	byId := make(map[int]SubscriptionQuotaWindow, len(windows))
	for _, window := range windows {
		byId[window.Id] = window
	}
	now := GetDBTimestamp()
	for _, sub := range subs {
		if sub.FiveHourQuota <= 0 || sub.CurrentFiveHourWindowId <= 0 {
			continue
		}
		window, ok := byId[sub.CurrentFiveHourWindowId]
		if !ok || window.WindowType != SubscriptionQuotaWindowFiveHour {
			continue
		}
		state := "active"
		if now >= window.EndTime {
			state = "expired"
		}
		remaining := window.AmountTotal - window.AmountUsed
		if remaining < 0 {
			remaining = 0
		}
		result[sub.Id] = &SubscriptionQuotaWindowSummary{
			State:       state,
			WindowId:    window.Id,
			Sequence:    window.Sequence,
			AmountTotal: window.AmountTotal,
			AmountUsed:  window.AmountUsed,
			Remaining:   remaining,
			StartTime:   window.StartTime,
			EndTime:     window.EndTime,
		}
	}
	return result
}

// CleanupSubscriptionQuotaWindows removes only closed, old ledger rows that no
// retained pre-consume record still references.
func CleanupSubscriptionQuotaWindows(olderThanSeconds int64) (int64, error) {
	if olderThanSeconds <= 0 {
		olderThanSeconds = 7 * 24 * 3600
	}
	cutoff := GetDBTimestamp() - olderThanSeconds
	periodRefs := DB.Model(&SubscriptionPreConsumeRecord{}).Select("period_window_id")
	fiveHourRefs := DB.Model(&SubscriptionPreConsumeRecord{}).Select("five_hour_window_id")
	result := DB.Where("closed_at > 0 AND updated_at < ?", cutoff).
		Where("id NOT IN (?)", periodRefs).
		Where("id NOT IN (?)", fiveHourRefs).
		Delete(&SubscriptionQuotaWindow{})
	return result.RowsAffected, result.Error
}
