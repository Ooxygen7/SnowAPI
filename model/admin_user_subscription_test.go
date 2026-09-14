package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func seedAdminSubscriptionUser(t *testing.T) (*SubscriptionPlan, *UserSubscription) {
	t.Helper()
	truncateTables(t)
	require.NoError(t, DB.Create(&User{Id: 9801, Username: "subscription-admin", AffCode: "adm9801", Role: common.RoleRootUser, Status: common.UserStatusEnabled}).Error)
	require.NoError(t, DB.Create(&User{Id: 9802, Username: "subscription-user", AffCode: "usr9802", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "Light", Quota: 12345}).Error)
	plan, sub := seedQuotaWindowSubscription(t, 9802, 1000, 300)
	require.NoError(t, DB.Model(plan).Updates(map[string]interface{}{"enabled": true, "upgrade_group": "Light"}).Error)
	require.NoError(t, DB.Model(sub).Updates(map[string]interface{}{"upgrade_group": "Light", "prev_user_group": "Free", "source": "balance"}).Error)
	return plan, sub
}

func TestAdminBalancesAffectAdmissionAndSettlementWithoutExtendingWindows(t *testing.T) {
	_, sub := seedAdminSubscriptionUser(t)
	first, err := PreConsumeUserSubscription("admin-first", sub.UserId, "test", 0, 100)
	require.NoError(t, err)
	require.NoError(t, SetSubscriptionUsageFinal(&first.UsageRef, 80, SubscriptionUsageStateSettled))
	var beforeWindow SubscriptionQuotaWindow
	require.NoError(t, DB.First(&beforeWindow, first.UsageRef.FiveHourWindowId).Error)
	states, err := GetAdminUserSubscriptionStates([]int{sub.UserId})
	require.NoError(t, err)
	state := states[sub.UserId]
	require.NotNil(t, state)
	assert.EqualValues(t, 920, state.PeriodRemaining)
	assert.EqualValues(t, 220, state.FiveHourRemaining)
	period, five := int64(600), int64(150)
	change := AdminSubscriptionChange{Action: "balance", SubscriptionID: sub.Id, ExpectedVersion: state.Version, PeriodRemaining: &period, FiveHourRemaining: &five}
	require.NoError(t, ChangeAdminUserSubscription(9801, sub.UserId, change))
	assert.ErrorIs(t, ChangeAdminUserSubscription(9801, sub.UserId, change), ErrSubscriptionChanged)
	_, err = PreConsumeUserSubscription("admin-too-large", sub.UserId, "test", 0, 151)
	assert.Error(t, err, "newly configured five-hour balance must gate admission")
	next, err := PreConsumeUserSubscription("admin-next", sub.UserId, "test", 0, 50)
	require.NoError(t, err)
	require.NoError(t, SetSubscriptionUsageFinal(&next.UsageRef, 30, SubscriptionUsageStateSettled))
	states, err = GetAdminUserSubscriptionStates([]int{sub.UserId})
	require.NoError(t, err)
	assert.EqualValues(t, 570, states[sub.UserId].PeriodRemaining)
	assert.EqualValues(t, 120, states[sub.UserId].FiveHourRemaining)
	assert.Equal(t, sub.EndTime, states[sub.UserId].EndTime)
	var afterWindow SubscriptionQuotaWindow
	require.NoError(t, DB.First(&afterWindow, next.UsageRef.FiveHourWindowId).Error)
	assert.Equal(t, beforeWindow.EndTime, afterWindow.EndTime)
}

func TestAdminSubscriptionRejectsUnsafeMutationsAtomically(t *testing.T) {
	for _, test := range []struct {
		name     string
		period   int64
		five     int64
		pending  bool
		actor    int
		expected error
	}{
		{name: "negative", period: -1, five: 100, actor: 9801},
		{name: "over limit rolls back both", period: 500, five: 301, actor: 9801},
		{name: "overflow", period: common.MaxQuota + 1, five: 100, actor: 9801},
		{name: "ordinary user", period: 500, five: 100, actor: 9802, expected: ErrAdminUserPermission},
		{name: "pending request", period: 500, five: 100, actor: 9801, pending: true, expected: ErrSubscriptionBusy},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, sub := seedAdminSubscriptionUser(t)
			if test.pending {
				_, err := PreConsumeUserSubscription("admin-pending", sub.UserId, "test", 0, 50)
				require.NoError(t, err)
			}
			states, err := GetAdminUserSubscriptionStates([]int{sub.UserId})
			require.NoError(t, err)
			before := *states[sub.UserId]
			err = ChangeAdminUserSubscription(test.actor, sub.UserId, AdminSubscriptionChange{Action: "balance", SubscriptionID: sub.Id, ExpectedVersion: before.Version, PeriodRemaining: &test.period, FiveHourRemaining: &test.five})
			require.Error(t, err)
			if test.expected != nil {
				assert.ErrorIs(t, err, test.expected)
			}
			states, err = GetAdminUserSubscriptionStates([]int{sub.UserId})
			require.NoError(t, err)
			assert.Equal(t, before, *states[sub.UserId])
		})
	}
}

func TestAdminPlanReplacementAndReturnFreeSynchronizeEntitlements(t *testing.T) {
	_, old := seedAdminSubscriptionUser(t)
	quota := int64(200)
	require.NoError(t, ChangeAdminUserSubscription(9801, old.UserId, AdminSubscriptionChange{Action: "balance", SubscriptionID: old.Id, FiveHourRemaining: &quota}))
	state, err := GetAdminUserSubscriptionStates([]int{old.UserId})
	require.NoError(t, err)
	plan := SubscriptionPlan{Title: "Heavy", PriceAmount: 100, Enabled: true, UpgradeGroup: "Heavy", DurationUnit: SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 5000, FiveHourQuota: 1500, QuotaResetPeriod: SubscriptionResetNever, MaxPurchasePerUser: 1}
	require.NoError(t, DB.Create(&plan).Error)
	// Historical purchase caps must not prevent an explicit admin reassignment.
	require.NoError(t, DB.Create(&UserSubscription{UserId: old.UserId, PlanId: plan.Id, Status: "cancelled", EndTime: old.StartTime}).Error)
	require.NoError(t, ChangeAdminUserSubscription(9801, old.UserId, AdminSubscriptionChange{Action: "plan", SubscriptionID: old.Id, ExpectedVersion: state[old.UserId].Version, PlanID: plan.Id}))
	state, err = GetAdminUserSubscriptionStates([]int{old.UserId})
	require.NoError(t, err)
	current := state[old.UserId]
	require.NotNil(t, current)
	assert.Equal(t, old.EndTime, current.EndTime)
	assert.Equal(t, "Heavy", current.Group)
	assert.EqualValues(t, 1400, current.FiveHourRemaining)
	var user User
	require.NoError(t, DB.First(&user, old.UserId).Error)
	assert.Equal(t, "Heavy", user.Group)
	assert.Equal(t, 12345, user.Quota, "admin assignment does not charge the wallet")
	require.NoError(t, DB.Model(&user).Updates(map[string]interface{}{"group_restore": "Light", "group_expires_at": old.EndTime}).Error)
	require.NoError(t, ChangeAdminUserSubscription(9801, old.UserId, AdminSubscriptionChange{Action: "free", SubscriptionID: current.SubscriptionID, ExpectedVersion: current.Version}))
	require.NoError(t, DB.First(&user, old.UserId).Error)
	assert.Equal(t, "Free", user.Group)
	assert.Empty(t, user.GroupRestore)
	assert.Zero(t, user.GroupExpiresAt)
	state, err = GetAdminUserSubscriptionStates([]int{old.UserId})
	require.NoError(t, err)
	assert.Nil(t, state[old.UserId])
	_, err = PreConsumeUserSubscription("admin-free", old.UserId, "test", 0, 1)
	assert.ErrorIs(t, err, ErrNoActiveSubscription)
}

func TestAdminListShowsRenewedBalancesWithoutMutatingLedger(t *testing.T) {
	_, sub := seedAdminSubscriptionUser(t)
	first, err := PreConsumeUserSubscription("admin-expired-window", sub.UserId, "test", 0, 100)
	require.NoError(t, err)
	require.NoError(t, SetSubscriptionUsageFinal(&first.UsageRef, 100, SubscriptionUsageStateSettled))
	now := GetDBTimestamp()
	require.NoError(t, DB.Model(&SubscriptionQuotaWindow{}).Where("id = ?", first.UsageRef.FiveHourWindowId).Update("end_time", now-1).Error)
	require.NoError(t, DB.Model(sub).Update("next_reset_time", now-1).Error)
	states, err := GetAdminUserSubscriptionStates([]int{sub.UserId, 123456})
	require.NoError(t, err)
	assert.EqualValues(t, 1000, states[sub.UserId].PeriodRemaining)
	assert.EqualValues(t, 300, states[sub.UserId].FiveHourRemaining)
	assert.Nil(t, states[123456])
	require.NoError(t, DB.First(sub, sub.Id).Error)
	assert.EqualValues(t, 100, sub.AmountUsed)
}
