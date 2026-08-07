package model

import (
	"errors"
	"strconv"
	"strings"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	RelayBanSourceAutomatic = "automatic"
	RelayBanSourceManual    = "manual"

	RelayBanEventApply       = "apply"
	RelayBanEventReapply     = "reapply"
	RelayBanEventExtend      = "extend"
	RelayBanEventRevoke      = "revoke"
	RelayBanEventExpire      = "expire"
	RelayBanEventShadowMatch = "shadow_match"
)

var (
	ErrRelayBanAlreadyActive = errors.New("relay ban is already active")
	ErrRelayBanNotActive     = errors.New("relay ban is not active")
	ErrRelayBanConflict      = errors.New("relay ban state changed concurrently")
	ErrRelayBanImmutable     = errors.New("relay ban events are immutable")
)

// UserRelayBan represents the durable current state. A row is retained after revoke or
// expiry so evaluation_after can prevent old observations from immediately
// reapplying an automatic ban.
type UserRelayBan struct {
	UserID          int    `json:"user_id" gorm:"primaryKey;autoIncrement:false"`
	Source          string `json:"source" gorm:"size:16;index"`
	Reason          string `json:"reason" gorm:"size:255"`
	StartsAt        int64  `json:"starts_at" gorm:"bigint;index"`
	ExpiresAt       int64  `json:"expires_at" gorm:"bigint;index"`
	RevokedAt       int64  `json:"revoked_at" gorm:"bigint;index"`
	RevokedBy       int    `json:"revoked_by"`
	EvaluationAfter int64  `json:"evaluation_after" gorm:"bigint;index"`
	Evidence        string `json:"evidence" gorm:"type:text"`
	Version         int64  `json:"version" gorm:"bigint"`
	CreatedAt       int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt       int64  `json:"updated_at" gorm:"bigint;index"`
}

func (UserRelayBan) TableName() string {
	return "user_relay_bans"
}

func (ban UserRelayBan) ActiveAt(now int64) bool {
	return ban.Version > 0 && ban.RevokedAt == 0 && ban.StartsAt <= now && (ban.ExpiresAt == 0 || ban.ExpiresAt > now)
}

func (ban UserRelayBan) EvaluationFloor() int64 {
	floor := ban.EvaluationAfter
	if ban.RevokedAt > floor {
		floor = ban.RevokedAt
	}
	if ban.ExpiresAt > floor {
		floor = ban.ExpiresAt
	}
	return floor
}

type UserRelayBanEvent struct {
	ID              int64  `json:"id" gorm:"primaryKey"`
	UserID          int    `json:"user_id" gorm:"index:idx_relay_ban_event_user_time,priority:1"`
	EventType       string `json:"event_type" gorm:"size:24;index"`
	Source          string `json:"source" gorm:"size:16;index"`
	Reason          string `json:"reason" gorm:"size:255"`
	StartsAt        int64  `json:"starts_at" gorm:"bigint"`
	ExpiresAt       int64  `json:"expires_at" gorm:"bigint"`
	EvaluationAfter int64  `json:"evaluation_after" gorm:"bigint"`
	Evidence        string `json:"evidence" gorm:"type:text"`
	ActorUserID     int    `json:"actor_user_id" gorm:"index"`
	StateVersion    int64  `json:"state_version" gorm:"bigint"`
	CreatedAt       int64  `json:"created_at" gorm:"bigint;index:idx_relay_ban_event_user_time,priority:2"`
}

func (UserRelayBanEvent) TableName() string {
	return "user_relay_ban_events"
}

func (*UserRelayBanEvent) BeforeUpdate(*gorm.DB) error {
	return ErrRelayBanImmutable
}

func (*UserRelayBanEvent) BeforeDelete(*gorm.DB) error {
	return ErrRelayBanImmutable
}

func IPBanMigrationModels() []interface{} {
	return []interface{}{&IPAuditMinute{}, &UserRelayBan{}, &UserRelayBanEvent{}}
}

func GetUserRelayBansByUserIDs(userIDs []int) (map[int]UserRelayBan, error) {
	result := make(map[int]UserRelayBan, len(userIDs))
	if len(userIDs) == 0 {
		return result, nil
	}
	rows := make([]UserRelayBan, 0, len(userIDs))
	if err := DB.Where("user_id IN ?", userIDs).Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.UserID] = row
	}
	return result, nil
}

func GetActiveUserRelayBan(userID int, now int64) (*UserRelayBan, error) {
	if userID <= 0 {
		return nil, nil
	}
	var ban UserRelayBan
	err := DB.Where("user_id = ?", userID).First(&ban).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if ban.ActiveAt(now) {
		return &ban, nil
	}
	if ban.Version > 0 && ban.RevokedAt == 0 && ban.ExpiresAt > 0 && ban.ExpiresAt <= now && ban.EvaluationAfter < ban.ExpiresAt {
		if err := materializeUserRelayBanExpiry(userID, now); err != nil {
			return nil, err
		}
	}
	return nil, nil
}

func materializeUserRelayBanExpiry(userID int, now int64) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		ban, err := getUserRelayBanForUpdate(tx, userID)
		if err != nil {
			return err
		}
		if ban.Version <= 0 || ban.RevokedAt != 0 || ban.ExpiresAt <= 0 || ban.ExpiresAt > now || ban.EvaluationAfter >= ban.ExpiresAt {
			return nil
		}
		updated, err := updateUserRelayBanCAS(tx, ban, map[string]interface{}{
			"evaluation_after": ban.ExpiresAt,
			"updated_at":       now,
			"version":          ban.Version + 1,
		})
		if err != nil {
			return err
		}
		return appendUserRelayBanEvent(tx, updated, RelayBanEventExpire, 0, now)
	})
}

func GetUserRelayBanState(userID int) (*UserRelayBan, error) {
	var ban UserRelayBan
	err := DB.Where("user_id = ?", userID).First(&ban).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &ban, nil
}

func ApplyManualRelayBan(userID int, actorUserID int, reason string, expiresAt int64) (*UserRelayBan, error) {
	now := GetDBTimestamp()
	var result UserRelayBan
	err := DB.Transaction(func(tx *gorm.DB) error {
		ban, err := getOrCreateUserRelayBanForUpdate(tx, userID, now)
		if err != nil {
			return err
		}
		active := ban.ActiveAt(now)
		if active && ban.Source == RelayBanSourceManual {
			return ErrRelayBanAlreadyActive
		}
		eventType := RelayBanEventApply
		if ban.Version > 0 && !active {
			eventType = RelayBanEventReapply
		}
		updates := map[string]interface{}{
			"source":           RelayBanSourceManual,
			"reason":           strings.TrimSpace(reason),
			"starts_at":        now,
			"expires_at":       expiresAt,
			"revoked_at":       int64(0),
			"revoked_by":       0,
			"evaluation_after": now,
			"evidence":         "",
			"updated_at":       now,
			"version":          ban.Version + 1,
		}
		updated, err := updateUserRelayBanCAS(tx, ban, updates)
		if err != nil {
			return err
		}
		if err := appendUserRelayBanEvent(tx, updated, eventType, actorUserID, now); err != nil {
			return err
		}
		result = *updated
		return nil
	})
	return &result, err
}

func ApplyAutomaticRelayBan(userID int, reason string, evidence string, evaluationAfter int64) (*UserRelayBan, bool, error) {
	now := GetDBTimestamp()
	var result UserRelayBan
	applied := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		ban, err := getOrCreateUserRelayBanForUpdate(tx, userID, now)
		if err != nil {
			return err
		}
		if ban.ActiveAt(now) {
			result = *ban
			return nil
		}
		if evaluationAfter < ban.EvaluationFloor() {
			evaluationAfter = ban.EvaluationFloor()
		}
		eventType := RelayBanEventApply
		if ban.Version > 0 {
			eventType = RelayBanEventReapply
		}
		updates := map[string]interface{}{
			"source":           RelayBanSourceAutomatic,
			"reason":           strings.TrimSpace(reason),
			"starts_at":        now,
			"expires_at":       int64(0),
			"revoked_at":       int64(0),
			"revoked_by":       0,
			"evaluation_after": evaluationAfter,
			"evidence":         evidence,
			"updated_at":       now,
			"version":          ban.Version + 1,
		}
		updated, err := updateUserRelayBanCAS(tx, ban, updates)
		if err != nil {
			return err
		}
		if err := appendUserRelayBanEvent(tx, updated, eventType, 0, now); err != nil {
			return err
		}
		result = *updated
		applied = true
		return nil
	})
	return &result, applied, err
}

func ExtendUserRelayBan(userID int, actorUserID int, durationSeconds int64, permanent bool, reason string) (*UserRelayBan, error) {
	now := GetDBTimestamp()
	var result UserRelayBan
	err := DB.Transaction(func(tx *gorm.DB) error {
		ban, err := getUserRelayBanForUpdate(tx, userID)
		if err != nil {
			return err
		}
		if !ban.ActiveAt(now) {
			return ErrRelayBanNotActive
		}
		expiresAt := int64(0)
		if !permanent {
			base := now
			if ban.ExpiresAt > base {
				base = ban.ExpiresAt
			}
			expiresAt = base + durationSeconds
		}
		newReason := strings.TrimSpace(reason)
		if newReason == "" {
			newReason = ban.Reason
		}
		updates := map[string]interface{}{
			"source":     RelayBanSourceManual,
			"reason":     newReason,
			"expires_at": expiresAt,
			"updated_at": now,
			"version":    ban.Version + 1,
		}
		updated, err := updateUserRelayBanCAS(tx, ban, updates)
		if err != nil {
			return err
		}
		if err := appendUserRelayBanEvent(tx, updated, RelayBanEventExtend, actorUserID, now); err != nil {
			return err
		}
		result = *updated
		return nil
	})
	return &result, err
}

func RevokeUserRelayBan(userID int, actorUserID int, reason string) (*UserRelayBan, error) {
	now := GetDBTimestamp()
	var result UserRelayBan
	err := DB.Transaction(func(tx *gorm.DB) error {
		ban, err := getUserRelayBanForUpdate(tx, userID)
		if err != nil {
			return err
		}
		if !ban.ActiveAt(now) {
			return ErrRelayBanNotActive
		}
		newReason := strings.TrimSpace(reason)
		if newReason == "" {
			newReason = ban.Reason
		}
		updates := map[string]interface{}{
			"reason":           newReason,
			"revoked_at":       now,
			"revoked_by":       actorUserID,
			"evaluation_after": now,
			"updated_at":       now,
			"version":          ban.Version + 1,
		}
		updated, err := updateUserRelayBanCAS(tx, ban, updates)
		if err != nil {
			return err
		}
		if err := appendUserRelayBanEvent(tx, updated, RelayBanEventRevoke, actorUserID, now); err != nil {
			return err
		}
		result = *updated
		return nil
	})
	return &result, err
}

func RecordRelayBanShadowMatch(userID int, evidence string, now int64) error {
	var recent int64
	if err := DB.Model(&UserRelayBanEvent{}).Where(
		"user_id = ? AND event_type = ? AND created_at > ?",
		userID, RelayBanEventShadowMatch, now-60,
	).Count(&recent).Error; err != nil {
		return err
	}
	if recent > 0 {
		return nil
	}
	state, err := GetUserRelayBanState(userID)
	if err != nil {
		return err
	}
	version := int64(0)
	if state != nil {
		version = state.Version
	}
	return DB.Create(&UserRelayBanEvent{
		UserID:       userID,
		EventType:    RelayBanEventShadowMatch,
		Source:       RelayBanSourceAutomatic,
		Reason:       "automatic relay-ban rule matched in shadow mode",
		Evidence:     evidence,
		StateVersion: version,
		CreatedAt:    now,
	}).Error
}

func getOrCreateUserRelayBanForUpdate(tx *gorm.DB, userID int, now int64) (*UserRelayBan, error) {
	ban, err := getUserRelayBanForUpdate(tx, userID)
	if err == nil {
		return ban, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	candidate := &UserRelayBan{UserID: userID, CreatedAt: now, UpdatedAt: now}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(candidate).Error; err != nil {
		return nil, err
	}
	return getUserRelayBanForUpdate(tx, userID)
}

func getUserRelayBanForUpdate(tx *gorm.DB, userID int) (*UserRelayBan, error) {
	var ban UserRelayBan
	if err := lockForUpdate(tx).Where("user_id = ?", userID).First(&ban).Error; err != nil {
		return nil, err
	}
	return &ban, nil
}

func updateUserRelayBanCAS(tx *gorm.DB, current *UserRelayBan, updates map[string]interface{}) (*UserRelayBan, error) {
	result := tx.Model(&UserRelayBan{}).
		Where("user_id = ? AND version = ?", current.UserID, current.Version).
		Updates(updates)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected != 1 {
		return nil, ErrRelayBanConflict
	}
	return getUserRelayBanForUpdate(tx, current.UserID)
}

func appendUserRelayBanEvent(tx *gorm.DB, ban *UserRelayBan, eventType string, actorUserID int, now int64) error {
	return tx.Create(&UserRelayBanEvent{
		UserID:          ban.UserID,
		EventType:       eventType,
		Source:          ban.Source,
		Reason:          ban.Reason,
		StartsAt:        ban.StartsAt,
		ExpiresAt:       ban.ExpiresAt,
		EvaluationAfter: ban.EvaluationAfter,
		Evidence:        ban.Evidence,
		ActorUserID:     actorUserID,
		StateVersion:    ban.Version,
		CreatedAt:       now,
	}).Error
}

type UserRelayBanListQuery struct {
	Page     int
	PageSize int
	Keyword  string
	Status   string
}

type UserRelayBanListItem struct {
	Ban         UserRelayBan `json:"ban"`
	Username    string       `json:"username"`
	DisplayName string       `json:"display_name"`
	Status      string       `json:"status"`
}

type UserRelayBanListResult struct {
	Items    []UserRelayBanListItem `json:"items"`
	Page     int                    `json:"page"`
	PageSize int                    `json:"page_size"`
	Total    int64                  `json:"total"`
}

func ListUserRelayBans(query UserRelayBanListQuery) (*UserRelayBanListResult, error) {
	if query.Page <= 0 {
		query.Page = 1
	}
	if query.PageSize <= 0 {
		query.PageSize = 20
	}
	if query.PageSize > 100 {
		query.PageSize = 100
	}
	now := GetDBTimestamp()
	db := DB.Model(&UserRelayBan{})
	switch query.Status {
	case "active":
		db = db.Where("version > 0 AND revoked_at = 0 AND starts_at <= ? AND (expires_at = 0 OR expires_at > ?)", now, now)
	case "inactive":
		db = db.Where("version = 0 OR revoked_at > 0 OR starts_at > ? OR (expires_at > 0 AND expires_at <= ?)", now, now)
	}
	keyword := strings.TrimSpace(query.Keyword)
	if keyword != "" {
		users := make([]User, 0)
		userQuery := DB.Select("id").Where("LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?", "%"+strings.ToLower(keyword)+"%", "%"+strings.ToLower(keyword)+"%")
		if userID, err := strconv.Atoi(keyword); err == nil && userID > 0 {
			userQuery = userQuery.Or("id = ?", userID)
		}
		if err := userQuery.Find(&users).Error; err != nil {
			return nil, err
		}
		ids := make([]int, 0, len(users))
		for _, user := range users {
			ids = append(ids, user.Id)
		}
		if len(ids) == 0 {
			return &UserRelayBanListResult{Items: []UserRelayBanListItem{}, Page: query.Page, PageSize: query.PageSize}, nil
		}
		db = db.Where("user_id IN ?", ids)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, err
	}
	bans := make([]UserRelayBan, 0, query.PageSize)
	if err := db.Order("updated_at desc, user_id asc").Limit(query.PageSize).Offset((query.Page - 1) * query.PageSize).Find(&bans).Error; err != nil {
		return nil, err
	}
	userIDs := make([]int, 0, len(bans))
	for _, ban := range bans {
		userIDs = append(userIDs, ban.UserID)
	}
	users := make([]User, 0, len(userIDs))
	if len(userIDs) > 0 {
		if err := DB.Select("id", "username", "display_name").Where("id IN ?", userIDs).Find(&users).Error; err != nil {
			return nil, err
		}
	}
	userByID := make(map[int]User, len(users))
	for _, user := range users {
		userByID[user.Id] = user
	}
	result := &UserRelayBanListResult{
		Items:    make([]UserRelayBanListItem, 0, len(bans)),
		Page:     query.Page,
		PageSize: query.PageSize,
		Total:    total,
	}
	for _, ban := range bans {
		status := "revoked"
		if ban.ActiveAt(now) {
			status = "active"
		} else if ban.RevokedAt == 0 && ban.ExpiresAt > 0 && ban.ExpiresAt <= now {
			status = "expired"
		}
		user := userByID[ban.UserID]
		result.Items = append(result.Items, UserRelayBanListItem{
			Ban:         ban,
			Username:    user.Username,
			DisplayName: user.DisplayName,
			Status:      status,
		})
	}
	return result, nil
}

func GetUserRelayBanEvents(userID int, limit int) ([]UserRelayBanEvent, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	events := make([]UserRelayBanEvent, 0)
	err := DB.Where("user_id = ?", userID).Order("created_at desc, id desc").Limit(limit).Find(&events).Error
	return events, err
}
