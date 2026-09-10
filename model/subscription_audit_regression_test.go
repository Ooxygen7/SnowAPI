package model

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"net/http/httptest"
	"testing"
)

func TestRedeemedSubscriptionUpgradeImmediatelyReplacesGroupLifecycle(t *testing.T) {
	id, key := setupRedeemFixture(t, 0)
	light := &SubscriptionPlan{Title: "Light", Enabled: true, PriceAmount: 50, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, UpgradeGroup: "Light", DowngradeGroup: "Free", TotalAmount: 1000}
	light.NormalizeDefaults()
	require.NoError(t, DB.Create(light).Error)
	require.NoError(t, DB.Model(&Redemption{}).Where(commonKeyCol+" = ?", key).Updates(map[string]interface{}{"type": RedemptionTypeGroup, "group_name": "Light", "group_duration_minutes": 4320}).Error)
	benefit, err := Redeem(key, id)
	require.NoError(t, err)
	pre, err := PreConsumeUserSubscription("upgrade-used", id, "model", 0, 100)
	require.NoError(t, err)
	require.NoError(t, SetSubscriptionUsageFinal(&pre.UsageRef, 100, SubscriptionUsageStateSettled))
	heavy := &SubscriptionPlan{Title: "Heavy", Enabled: true, PriceAmount: 200, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, UpgradeGroup: "Heavy", DowngradeGroup: "Free", TotalAmount: 10000}
	heavy.NormalizeDefaults()
	require.NoError(t, DB.Create(heavy).Error)
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		_, err := CreateUserSubscriptionFromPlanTx(tx, id, heavy, "balance")
		return err
	}))
	var user User
	require.NoError(t, DB.First(&user, id).Error)
	assert.Equal(t, "Heavy", user.Group)
	assert.Empty(t, user.GroupRestore)
	assert.Zero(t, user.GroupExpiresAt)
	var subs []UserSubscription
	require.NoError(t, DB.Where("user_id = ? AND status = ?", id, "active").Find(&subs).Error)
	require.Len(t, subs, 1)
	assert.Equal(t, benefit.GroupExpiresAt, subs[0].EndTime)
	assert.Equal(t, int64(100), subs[0].AmountUsed)
	_, err = AdminInvalidateUserSubscription(subs[0].Id)
	require.NoError(t, err)
	require.NoError(t, DB.First(&user, id).Error)
	assert.Equal(t, "Free", user.Group)
	assert.Zero(t, user.GroupExpiresAt)
}

func TestSettlementRecordsAlreadyConsumedQuotaButBlocksFurtherReservation(t *testing.T) {
	truncateTables(t)
	_, sub := seedQuotaWindowSubscription(t, 7999, 150, 150)
	pre, err := PreConsumeUserSubscription("over-limit-settlement", sub.UserId, "model", 0, 100)
	require.NoError(t, err)
	require.ErrorIs(t, SetSubscriptionUsageFinal(&pre.UsageRef, 200, SubscriptionUsageStateReserved), ErrSubscriptionQuotaInsufficient)
	require.NoError(t, SetSubscriptionUsageFinal(&pre.UsageRef, 200, SubscriptionUsageStateSettled))
	require.NoError(t, SetSubscriptionUsageFinal(&pre.UsageRef, 200, SubscriptionUsageStateSettled))
	var stored UserSubscription
	require.NoError(t, DB.First(&stored, sub.Id).Error)
	assert.Equal(t, int64(200), stored.AmountUsed)
	_, err = PreConsumeUserSubscription("after-limit", sub.UserId, "model", 0, 1)
	require.Error(t, err)
	require.NoError(t, RefundSubscriptionUsage(&pre.UsageRef))
	require.NoError(t, DB.First(&stored, sub.Id).Error)
	assert.Zero(t, stored.AmountUsed)
}

func TestGroupRateLeaseReservesSuccessSlotsAndCountsTokensWithoutLogs(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&GroupRateLease{}))
	user := User{Username: "rate-lease", Group: "Light"}
	require.NoError(t, DB.Create(&user).Error)
	t.Cleanup(func() { DB.Where("user_id = ?", user.Id).Delete(&GroupRateLease{}); DB.Unscoped().Delete(&user) })
	policy := setting.GroupPolicy{MaxRequests: 8, MaxSuccessfulRequests: 5, ConcurrencyLimit: 3, PeriodMinutes: 1, TPMLimit: 150}
	for i := 0; i < 4; i++ {
		lease, err := AcquireGroupRateLease(user.Id, policy)
		require.NoError(t, err)
		zero := int64(0)
		require.NoError(t, CompleteGroupRateLease(lease, true, &zero, 1))
	}
	last, err := AcquireGroupRateLease(user.Id, policy)
	require.NoError(t, err)
	_, err = AcquireGroupRateLease(user.Id, policy)
	require.ErrorIs(t, err, ErrGroupRateLimited)
	require.NoError(t, ReserveGroupRateTokens(last.Id, user.Id, 100, 150))
	require.NoError(t, CompleteGroupRateLease(last, false, nil, 1))
	replacement, err := AcquireGroupRateLease(user.Id, policy)
	require.NoError(t, err)
	require.NoError(t, ReserveGroupRateTokens(replacement.Id, user.Id, 120, 150))
	originalLogEnabled := common.LogConsumeEnabled
	common.LogConsumeEnabled = false
	t.Cleanup(func() { common.LogConsumeEnabled = originalLogEnabled })
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	RecordConsumeLog(ctx, user.Id, RecordConsumeLogParams{PromptTokens: 100, CompletionTokens: 50})
	actual := ctx.GetInt64(GroupRateActualTokensKey)
	assert.Equal(t, int64(150), actual)
	require.NoError(t, CompleteGroupRateLease(replacement, true, &actual, 1))
	policy.MaxSuccessfulRequests = 0
	next, err := AcquireGroupRateLease(user.Id, policy)
	require.NoError(t, err)
	assert.ErrorIs(t, ReserveGroupRateTokens(next.Id, user.Id, 1, 150), ErrGroupRateLimited)
}
