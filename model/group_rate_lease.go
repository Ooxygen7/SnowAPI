package model

import (
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"gorm.io/gorm"
)

var ErrGroupRateLimited = errors.New("group rate limit reached")

const GroupRateActualTokensKey = "group_rate_actual_tokens"
const GroupRateTPMLimitKey = "group_rate_tpm_limit"

// GroupRateLease keeps admissions and actual token usage independent of
// optional consume logs. User row locks serialize admission across instances.
type GroupRateLease struct {
	Id          int   `gorm:"primaryKey"`
	UserId      int   `gorm:"index:idx_group_rate_user_start,priority:1;index:idx_group_rate_user_finish,priority:1"`
	StartedAt   int64 `gorm:"type:bigint;index:idx_group_rate_user_start,priority:2"`
	CompletedAt int64 `gorm:"type:bigint;index:idx_group_rate_user_finish,priority:2"`
	LeaseUntil  int64 `gorm:"type:bigint"`
	RetainUntil int64 `gorm:"type:bigint;index"`
	Tokens      int64 `gorm:"type:bigint"`
	Success     bool
}

func AcquireGroupRateLease(userID int, policy setting.GroupPolicy) (*GroupRateLease, error) {
	if userID <= 0 || policy.PeriodMinutes < 1 {
		return nil, errors.New("invalid group rate admission")
	}
	var result GroupRateLease
	err := runSubscriptionQuotaTransaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id").First(&user, userID).Error; err != nil {
			return err
		}
		now := getSubscriptionDBTimestampTx(tx)
		cutoff := now - int64(policy.PeriodMinutes)*60
		var requests, pending, successes int64
		if err := tx.Model(&GroupRateLease{}).Where("user_id = ? AND started_at > ?", userID, cutoff).Count(&requests).Error; err != nil {
			return err
		}
		if policy.MaxRequests > 0 && requests >= int64(policy.MaxRequests) {
			return fmt.Errorf("%w: at most %d requests every %d minutes", ErrGroupRateLimited, policy.MaxRequests, policy.PeriodMinutes)
		}
		if err := tx.Model(&GroupRateLease{}).Where("user_id = ? AND completed_at = 0 AND lease_until > ?", userID, now).Count(&pending).Error; err != nil {
			return err
		}
		if policy.ConcurrencyLimit > 0 && pending >= int64(policy.ConcurrencyLimit) {
			return fmt.Errorf("%w: concurrency limit %d", ErrGroupRateLimited, policy.ConcurrencyLimit)
		}
		if policy.MaxSuccessfulRequests > 0 {
			if err := tx.Model(&GroupRateLease{}).Where("user_id = ? AND completed_at > ? AND success = ?", userID, cutoff, true).Count(&successes).Error; err != nil {
				return err
			}
			if successes+pending >= int64(policy.MaxSuccessfulRequests) {
				return fmt.Errorf("%w: at most %d successful requests every %d minutes", ErrGroupRateLimited, policy.MaxSuccessfulRequests, policy.PeriodMinutes)
			}
		}
		result = GroupRateLease{UserId: userID, StartedAt: now, LeaseUntil: now + 120, RetainUntil: now + int64(policy.PeriodMinutes)*60 + 120}
		return tx.Create(&result).Error
	})
	return &result, err
}

// ReserveGroupRateTokens admits estimated input plus the client's declared
// output budget atomically. Upstream-reported usage replaces this at completion.
func ReserveGroupRateTokens(leaseID, userID int, tokens, limit int64) error {
	if tokens < 0 || tokens > int64(common.MaxQuota) || limit <= 0 {
		return errors.New("invalid TPM reservation")
	}
	return runSubscriptionQuotaTransaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id").First(&user, userID).Error; err != nil {
			return err
		}
		var lease GroupRateLease
		if err := tx.Where("id = ? AND user_id = ? AND completed_at = 0", leaseID, userID).First(&lease).Error; err != nil {
			return err
		}
		now := getSubscriptionDBTimestampTx(tx)
		var used int64
		if err := tx.Model(&GroupRateLease{}).
			Where("user_id = ? AND id <> ? AND ((completed_at = 0 AND lease_until > ?) OR completed_at > ?)", userID, leaseID, now, now-60).
			Select("COALESCE(SUM(tokens), 0)").Scan(&used).Error; err != nil {
			return err
		}
		if used >= limit || tokens > limit-used {
			return fmt.Errorf("%w: TPM limit %d, reserved/used %d, requested %d", ErrGroupRateLimited, limit, used, tokens)
		}
		return tx.Model(&lease).Update("tokens", tokens).Error
	})
}

func CompleteGroupRateLease(lease *GroupRateLease, success bool, actualTokens *int64, periodMinutes int) error {
	if lease == nil || lease.Id <= 0 {
		return errors.New("invalid group rate lease")
	}
	return runSubscriptionQuotaTransaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id").First(&user, lease.UserId).Error; err != nil {
			return err
		}
		var stored GroupRateLease
		if err := tx.First(&stored, lease.Id).Error; err != nil {
			return err
		}
		if stored.CompletedAt != 0 {
			return nil
		}
		tokens := stored.Tokens
		if actualTokens != nil {
			tokens = *actualTokens
			if tokens < 0 {
				return errors.New("negative TPM usage")
			}
		} else if !success {
			tokens = 0
		}
		now := getSubscriptionDBTimestampTx(tx)
		retention := max(int64(periodMinutes)*60, 120)
		return tx.Model(&stored).Updates(map[string]interface{}{"completed_at": now, "success": success, "tokens": tokens, "retain_until": now + retention}).Error
	})
}

func RenewGroupRateLease(leaseID int) error {
	return DB.Model(&GroupRateLease{}).Where("id = ? AND completed_at = 0", leaseID).Update("lease_until", common.GetTimestamp()+120).Error
}

// Cleanup removes only expired accounting history, never a live reservation.
func CleanupGroupRateLeases() error {
	now := common.GetTimestamp()
	return DB.Where("retain_until < ? AND (completed_at > 0 OR lease_until < ?)", now, now).Delete(&GroupRateLease{}).Error
}

func StartGroupRateLeaseCleanup() {
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			if err := CleanupGroupRateLeases(); err != nil {
				common.SysError("group rate lease cleanup failed: " + err.Error())
			}
		}
	}()
}
