package model

import (
	"errors"
	"sort"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// BatchHardDeleteUsers validates every target before deleting any account.
// Usage/audit history is retained; user and token caches are revoked after commit.
func BatchHardDeleteUsers(operatorID int, userIDs []int) ([]int, error) {
	if len(userIDs) == 0 || len(userIDs) > 100 {
		return nil, errors.New("select between 1 and 100 users")
	}
	unique := make(map[int]bool, len(userIDs))
	ids := make([]int, 0, len(userIDs))
	for _, id := range userIDs {
		if id <= 0 || id == operatorID {
			return nil, ErrAdminUserPermission
		}
		if !unique[id] {
			unique[id] = true
			ids = append(ids, id)
		}
	}
	sort.Ints(ids)
	err := DB.Transaction(func(tx *gorm.DB) error {
		var operator User
		if err := tx.Select("id", "role", "status").First(&operator, operatorID).Error; err != nil {
			return err
		}
		if operator.Status != common.UserStatusEnabled || operator.Role < common.RoleAdminUser {
			return ErrAdminUserPermission
		}
		var targets []User
		if err := lockForUpdate(tx).Unscoped().Select("id", "role").Where("id IN ?", ids).Order("id").Find(&targets).Error; err != nil {
			return err
		}
		if len(targets) != len(ids) {
			return errors.New("a selected user no longer exists; refresh the list")
		}
		for _, user := range targets {
			if operator.Role <= user.Role {
				return ErrAdminUserPermission
			}
		}
		for _, id := range ids {
			if err := retireUserAccountTx(tx, id, true); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	for _, id := range ids {
		invalidateDeletedUserCredentials(id)
	}
	return ids, nil
}
