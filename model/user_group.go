package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

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
		user := &User{}
		if err := lockForUpdate(tx).Where("id = ?", userID).First(user).Error; err != nil {
			return err
		}
		if user.GroupExpiresAt == 0 || user.GroupExpiresAt > common.GetTimestamp() {
			group = user.Group
			return nil
		}
		group = user.GroupRestore
		if group == "" {
			group = "Free"
		}
		return tx.Model(&User{}).Where("id = ?", userID).Updates(map[string]interface{}{
			"group":            group,
			"group_restore":    "",
			"group_expires_at": 0,
		}).Error
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
