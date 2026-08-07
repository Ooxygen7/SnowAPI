package model

import (
	"errors"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const MaxRedemptionGroupDurationMinutes int64 = 10 * 365 * 24 * 60

func loadUserGroupStateForUpdateTx(tx *gorm.DB, userID int, now int64) (*User, error) {
	if tx == nil || userID <= 0 {
		return nil, errors.New("invalid user group state args")
	}
	user := &User{}
	if err := lockForUpdate(tx).Where("id = ?", userID).First(user).Error; err != nil {
		return nil, err
	}
	if user.GroupExpiresAt == 0 || user.GroupExpiresAt > now {
		return user, nil
	}
	restoredGroup := strings.TrimSpace(user.GroupRestore)
	if restoredGroup == "" {
		restoredGroup = "Free"
	}
	if err := tx.Model(&User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"group":            restoredGroup,
		"group_restore":    "",
		"group_expires_at": 0,
	}).Error; err != nil {
		return nil, err
	}
	user.Group = restoredGroup
	user.GroupRestore = ""
	user.GroupExpiresAt = 0
	return user, nil
}

func applyUserGroupEntitlementTx(tx *gorm.DB, userID int, targetGroup string, durationMinutes int64, now int64) (int64, error) {
	targetGroup = strings.TrimSpace(targetGroup)
	if targetGroup == "" || len(targetGroup) > 64 {
		return 0, errors.New("invalid target group")
	}
	if durationMinutes < 0 || durationMinutes > MaxRedemptionGroupDurationMinutes {
		return 0, errors.New("invalid group entitlement duration")
	}
	user, err := loadUserGroupStateForUpdateTx(tx, userID, now)
	if err != nil {
		return 0, err
	}
	if durationMinutes == 0 {
		if err := tx.Model(&User{}).Where("id = ?", userID).Updates(map[string]interface{}{
			"group":            targetGroup,
			"group_restore":    "",
			"group_expires_at": 0,
		}).Error; err != nil {
			return 0, err
		}
		return 0, nil
	}

	restoreGroup := strings.TrimSpace(user.Group)
	expiresFrom := now
	if user.GroupExpiresAt > now {
		restoreGroup = strings.TrimSpace(user.GroupRestore)
		if user.Group == targetGroup {
			expiresFrom = user.GroupExpiresAt
		}
	}
	if restoreGroup == "" {
		restoreGroup = "Free"
	}
	durationSeconds := durationMinutes * 60
	if expiresFrom > math.MaxInt64-durationSeconds {
		return 0, errors.New("group entitlement expiry overflow")
	}
	expiresAt := expiresFrom + durationSeconds
	if err := tx.Model(&User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"group":            targetGroup,
		"group_restore":    restoreGroup,
		"group_expires_at": expiresAt,
	}).Error; err != nil {
		return 0, err
	}
	return expiresAt, nil
}

func ResolveExpiredUserGroup(user *User) error {
	if user == nil || user.GroupExpiresAt == 0 || user.GroupExpiresAt > common.GetTimestamp() {
		return nil
	}
	group, err := ResolveExpiredUserGroupByID(user.Id)
	if err != nil {
		return err
	}
	user.Group = group
	user.GroupRestore = ""
	user.GroupExpiresAt = 0
	return nil
}

func ResolveExpiredUserGroupByID(userID int) (string, error) {
	if userID <= 0 {
		return "", errors.New("invalid user id")
	}
	group := ""
	err := DB.Transaction(func(tx *gorm.DB) error {
		user, err := loadUserGroupStateForUpdateTx(tx, userID, common.GetTimestamp())
		if err != nil {
			return err
		}
		group = user.Group
		return nil
	})
	if err != nil {
		return "", err
	}
	if err := invalidateUserCache(userID); err != nil {
		common.SysError("failed to invalidate user cache after group expiry: " + err.Error())
	}
	return group, nil
}

func CountUsersInGroups(groups []string) (int64, error) {
	if len(groups) == 0 {
		return 0, nil
	}
	var count int64
	err := DB.Model(&User{}).Where(commonGroupCol+" IN ? OR group_restore IN ?", groups, groups).Count(&count).Error
	return count, err
}
