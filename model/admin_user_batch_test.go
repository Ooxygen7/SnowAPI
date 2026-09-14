package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBatchDeleteUsersIsAtomicAndProtectsPrivilegedAccounts(t *testing.T) {
	for _, test := range []struct {
		name string
		ids  []int
		ok   bool
	}{
		{name: "deduplicated users", ids: []int{9822, 9823, 9822}, ok: true},
		{name: "self", ids: []int{9822, 9821}},
		{name: "root", ids: []int{9822, 9824}},
		{name: "missing", ids: []int{9822, 99999}},
		{name: "empty", ids: []int{}},
	} {
		t.Run(test.name, func(t *testing.T) {
			truncateTables(t)
			users := []User{{Id: 9821, Username: "batch-admin", Role: common.RoleAdminUser, Status: common.UserStatusEnabled}, {Id: 9822, Username: "batch-a", Role: common.RoleCommonUser}, {Id: 9823, Username: "batch-b", Role: common.RoleCommonUser}, {Id: 9824, Username: "batch-root", Role: common.RoleRootUser}}
			for i := range users {
				users[i].AffCode = users[i].Username
			}
			require.NoError(t, DB.Create(&users).Error)
			require.NoError(t, DB.Create(&UserOAuthBinding{UserId: 9822, ProviderId: 1, ProviderUserId: "batch-oauth"}).Error)
			deleted, err := BatchHardDeleteUsers(9821, test.ids)
			var count, bindings int64
			require.NoError(t, DB.Unscoped().Model(&User{}).Count(&count).Error)
			require.NoError(t, DB.Model(&UserOAuthBinding{}).Where("user_id = ?", 9822).Count(&bindings).Error)
			if test.ok {
				require.NoError(t, err)
				assert.Equal(t, []int{9822, 9823}, deleted)
				assert.EqualValues(t, 2, count)
				assert.Zero(t, bindings)
			} else {
				require.Error(t, err)
				assert.EqualValues(t, 4, count)
				assert.EqualValues(t, 1, bindings)
			}
		})
	}
}
