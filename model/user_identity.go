package model

import (
	"crypto/subtle"
	"errors"
	"math"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrSessionIdentityInvalid = errors.New("session identity is no longer valid")

// UserIDSequence retains the high-water mark even after physical account deletion.
// It does not depend on SQLite's optional AUTOINCREMENT table declaration.
type UserIDSequence struct {
	ID     int `gorm:"primaryKey;autoIncrement:false"`
	LastID int `gorm:"type:bigint;not null"`
}

func reserveUserIdentity(tx *gorm.DB, user *User) error {
	query := tx.Session(&gorm.Session{NewDB: true})
	var maximum int
	if err := query.Unscoped().Model(&User{}).Select("COALESCE(MAX(id), 0)").Scan(&maximum).Error; err != nil {
		return err
	}
	if user.Id > maximum {
		maximum = user.Id
	}
	if maximum >= math.MaxInt32 {
		return errors.New("user identity space exhausted")
	}
	if err := query.Clauses(clause.OnConflict{DoNothing: true}).Create(&UserIDSequence{ID: 1, LastID: maximum}).Error; err != nil {
		return err
	}
	if user.Id > 0 {
		return query.Model(&UserIDSequence{}).Where("id = ? AND last_id < ?", 1, maximum).Update("last_id", maximum).Error
	}
	// UPDATE acquires the database write/row lock before SELECT, including SQLite.
	result := query.Model(&UserIDSequence{}).Where("id = ? AND last_id < ?", 1, math.MaxInt32).
		Update("last_id", gorm.Expr("CASE WHEN last_id < ? THEN ? ELSE last_id + 1 END", maximum, maximum+1))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("user identity space exhausted")
	}
	var sequence UserIDSequence
	if err := query.First(&sequence, 1).Error; err != nil {
		return err
	}
	user.Id = sequence.LastID
	return nil
}

// InitializeUserIdentities runs before serving requests. Existing cookies without
// an incarnation nonce are deliberately not accepted after this migration.
func InitializeUserIdentities() error {
	var maximum int
	for _, table := range []string{"users", "tokens", "logs", "top_ups", "quota_data", "tasks", "midjourneys", "user_subscriptions", "subscription_orders", "subscription_pre_consume_records", "user_oauth_bindings", "passkey_credentials", "redemptions", "invitation_codes", "checkins", "user_announcement_reads", "user_relay_bans", "user_relay_ban_events", "ip_audit_minutes", "group_rate_leases"} {
		if !DB.Migrator().HasTable(table) {
			continue
		}
		column := "user_id"
		if table == "users" {
			column = "id"
		}
		columns := []string{column}
		if table == "redemptions" {
			columns = append(columns, "used_user_id")
		}
		if table == "invitation_codes" {
			columns = []string{"created_by", "used_by"}
		}
		if table == "users" {
			columns = append(columns, "inviter_id")
		}
		for _, reference := range columns {
			var value int
			if err := DB.Table(table).Select("COALESCE(MAX(" + reference + "), 0)").Scan(&value).Error; err != nil {
				return err
			}
			if value > maximum {
				maximum = value
			}
		}
	}
	if LOG_DB != nil && LOG_DB != DB {
		var value int
		if err := LOG_DB.Model(&Log{}).Select("COALESCE(MAX(user_id), 0)").Scan(&value).Error; err != nil {
			return err
		}
		if value > maximum {
			maximum = value
		}
	}
	if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&UserIDSequence{ID: 1, LastID: maximum}).Error; err != nil {
		return err
	}
	if err := DB.Model(&UserIDSequence{}).Where("id = ? AND last_id < ?", 1, maximum).Update("last_id", maximum).Error; err != nil {
		return err
	}
	for {
		var users []User
		if err := DB.Select("id").Where("session_nonce IS NULL OR session_nonce = ?", "").Limit(100).Find(&users).Error; err != nil {
			return err
		}
		if len(users) == 0 {
			return nil
		}
		for _, user := range users {
			if err := DB.Model(&User{}).Where("id = ? AND (session_nonce IS NULL OR session_nonce = ?)", user.Id, "").Update("session_nonce", common.GetUUID()).Error; err != nil {
				return err
			}
		}
	}
}

// ValidateSessionUser never promotes a numeric ID into a different account.
func ValidateSessionUser(id int, nonce string) (*User, error) {
	if id <= 0 || nonce == "" {
		return nil, ErrSessionIdentityInvalid
	}
	var user User
	err := DB.Select("id", "username", "role", "status", "group", "session_nonce").First(&user, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrSessionIdentityInvalid
	}
	if err != nil {
		return nil, err
	}
	if user.Status != common.UserStatusEnabled || user.SessionNonce == "" || subtle.ConstantTimeCompare([]byte(user.SessionNonce), []byte(nonce)) != 1 {
		return nil, ErrSessionIdentityInvalid
	}
	return &user, nil
}

// ValidateTokenOwner is deliberately database-backed: an evicted or stale Redis
// entry must not keep a deleted account's API credentials alive.
func ValidateTokenOwner(token *Token) error {
	var user User
	err := DB.Select("id", "status", "created_at").First(&user, token.UserId).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrTokenInvalid
	}
	if err != nil {
		return err
	}
	if user.Status != common.UserStatusEnabled || (token.CreatedTime > 0 && token.CreatedTime < user.CreatedAt) {
		return ErrTokenInvalid
	}
	return nil
}

func retireUserAccountTx(tx *gorm.DB, id int, hardDelete bool) error {
	var user User
	if err := lockForUpdate(tx).Unscoped().First(&user, id).Error; err != nil {
		return err
	}
	if err := reserveUserIdentity(tx, &user); err != nil {
		return err
	}
	if err := deleteUserOAuthBindingsByUserId(tx, id); err != nil {
		return err
	}
	if err := tx.Unscoped().Where("user_id = ?", id).Delete(&PasskeyCredential{}).Error; err != nil {
		return err
	}
	if err := tx.Model(&Token{}).Where("user_id = ?", id).Update("status", common.TokenStatusDisabled).Error; err != nil {
		return err
	}
	now := common.GetTimestamp()
	if err := tx.Model(&UserSubscription{}).Where("user_id = ? AND status = ?", id, "active").Updates(map[string]interface{}{"status": "cancelled", "end_time": now, "updated_at": now}).Error; err != nil {
		return err
	}
	if hardDelete {
		return tx.Unscoped().Delete(&user).Error
	}
	return tx.Delete(&user).Error
}

func invalidateDeletedUserCredentials(id int) {
	if err := InvalidateUserCache(id); err != nil {
		common.SysError(err.Error())
	}
	if err := InvalidateUserTokensCache(id); err != nil {
		common.SysError(err.Error())
	}
}
