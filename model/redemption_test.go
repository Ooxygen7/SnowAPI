package model

import (
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestSearchRedemptionsFiltersAndPaginates(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&Redemption{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	})

	now := common.GetTimestamp()
	redemptions := []Redemption{
		{Id: 1, Name: "alpha-active", Key: "00000000000000000000000000000001", Status: common.RedemptionCodeStatusEnabled, ExpiredTime: 0},
		{Id: 2, Name: "alpha-future", Key: "00000000000000000000000000000002", Status: common.RedemptionCodeStatusEnabled, ExpiredTime: now + 3600},
		{Id: 3, Name: "alpha-expired", Key: "00000000000000000000000000000003", Status: common.RedemptionCodeStatusEnabled, ExpiredTime: now - 10},
		{Id: 4, Name: "beta-disabled", Key: "00000000000000000000000000000004", Status: common.RedemptionCodeStatusDisabled, ExpiredTime: 0},
		{Id: 5, Name: "beta-used", Key: "00000000000000000000000000000005", Status: common.RedemptionCodeStatusUsed, ExpiredTime: 0},
	}
	require.NoError(t, DB.Create(&redemptions).Error)

	tests := []struct {
		name      string
		keyword   string
		status    string
		startIdx  int
		num       int
		wantTotal int64
		wantIds   []int
	}{
		{
			name:      "no filters returns all rows",
			num:       10,
			wantTotal: 5,
			wantIds:   []int{5, 4, 3, 2, 1},
		},
		{
			name:      "keyword filters by name prefix",
			keyword:   "alpha",
			num:       10,
			wantTotal: 3,
			wantIds:   []int{3, 2, 1},
		},
		{
			name:      "enabled status excludes expired rows",
			status:    "1",
			num:       10,
			wantTotal: 2,
			wantIds:   []int{2, 1},
		},
		{
			name:      "expired status returns enabled expired rows",
			status:    "expired",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{3},
		},
		{
			name:      "disabled status",
			status:    "2",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{4},
		},
		{
			name:      "used status",
			status:    "3",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{5},
		},
		{
			name:      "pagination keeps unpaged total",
			startIdx:  1,
			num:       2,
			wantTotal: 5,
			wantIds:   []int{4, 3},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rows, total, err := SearchRedemptions(tt.keyword, tt.status, tt.startIdx, tt.num)
			require.NoError(t, err)
			assert.Equal(t, tt.wantTotal, total)
			gotIds := make([]int, 0, len(rows))
			for _, row := range rows {
				gotIds = append(gotIds, row.Id)
			}
			assert.Equal(t, tt.wantIds, gotIds)
		})
	}
}

func setupRedeemFixture(t *testing.T, quota int) (userId int, key string) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&Redemption{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&UserSubscription{}).Error)
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&SubscriptionPlan{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&UserSubscription{}).Error)
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&SubscriptionPlan{}).Error)
		DB.Exec("DELETE FROM users")
		DB.Exec("DELETE FROM logs")
	})

	user := &User{Username: "redeem-user", Password: "password", Status: common.UserStatusEnabled, Quota: 0}
	require.NoError(t, DB.Create(user).Error)

	key = "10000000000000000000000000000001"
	redemption := &Redemption{
		Name:        "redeem-test",
		Key:         key,
		Status:      common.RedemptionCodeStatusEnabled,
		Quota:       quota,
		CreatedTime: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(redemption).Error)
	return user.Id, key
}

func TestRedeemCreditsQuotaExactlyOnce(t *testing.T) {
	userId, key := setupRedeemFixture(t, 500)

	result, err := Redeem(key, userId)
	require.NoError(t, err)
	assert.Equal(t, RedemptionTypeQuota, result.Type)
	assert.Equal(t, 500, result.Quota)

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, 500, user.Quota)

	var redemption Redemption
	require.NoError(t, DB.First(&redemption, "name = ?", "redeem-test").Error)
	assert.Equal(t, common.RedemptionCodeStatusUsed, redemption.Status)
	assert.Equal(t, userId, redemption.UsedUserId)

	// Redeeming the same code again must fail and must not credit quota.
	_, err = Redeem(key, userId)
	require.Error(t, err)
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, 500, user.Quota)
}

func TestRedeemGrantsTemporaryGroupEntitlement(t *testing.T) {
	userID, key := setupRedeemFixture(t, 0)
	plan := &SubscriptionPlan{
		Title:            "Moderate",
		Enabled:          true,
		DurationUnit:     SubscriptionDurationMonth,
		DurationValue:    1,
		UpgradeGroup:     "Moderate",
		DowngradeGroup:   "Free",
		TotalAmount:      5000,
		FiveHourQuota:    1000,
		QuotaResetPeriod: SubscriptionResetWeekly,
	}
	plan.NormalizeDefaults()
	require.NoError(t, DB.Create(plan).Error)
	require.NoError(t, DB.Model(&Redemption{}).Where(commonKeyCol+" = ?", key).Updates(map[string]interface{}{
		"type":                   RedemptionTypeGroup,
		"group_name":             "Moderate",
		"group_duration_minutes": 60,
	}).Error)

	before := common.GetTimestamp()
	result, err := Redeem(key, userID)
	require.NoError(t, err)
	assert.Equal(t, RedemptionTypeGroup, result.Type)
	assert.Equal(t, "Moderate", result.GroupName)
	assert.GreaterOrEqual(t, result.GroupExpiresAt, before+60*60)
	assert.LessOrEqual(t, result.GroupExpiresAt, common.GetTimestamp()+60*60)

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userID).Error)
	assert.Equal(t, "Moderate", user.Group)
	assert.Equal(t, "Free", user.GroupRestore)
	assert.Equal(t, result.GroupExpiresAt, user.GroupExpiresAt)
	assert.Zero(t, user.Quota)

	var subscription UserSubscription
	require.NoError(t, DB.First(&subscription, "user_id = ?", userID).Error)
	assert.Equal(t, plan.Id, subscription.PlanId)
	assert.Equal(t, int64(5000), subscription.AmountTotal)
	assert.Equal(t, int64(1000), subscription.FiveHourQuota)
	assert.Equal(t, result.GroupExpiresAt, subscription.EndTime)
	assert.Equal(t, "redemption", subscription.Source)
	assert.Empty(t, subscription.UpgradeGroup)
	assert.Empty(t, subscription.DowngradeGroup)

	var redemption Redemption
	require.NoError(t, DB.First(&redemption, commonKeyCol+" = ?", key).Error)
	assert.Equal(t, common.RedemptionCodeStatusUsed, redemption.Status)
	assert.Equal(t, userID, redemption.UsedUserId)

	_, err = Redeem(key, userID)
	require.Error(t, err)
}

func TestRedeemGroupEntitlementDeniedWithActiveSubscription(t *testing.T) {
	for _, source := range []string{"redemption", PaymentMethodBalance} {
		t.Run(source, func(t *testing.T) {
			userID, key := setupRedeemFixture(t, 0)
			plan := &SubscriptionPlan{
				Title:         "Light",
				Enabled:       true,
				DurationUnit:  SubscriptionDurationMonth,
				DurationValue: 1,
				UpgradeGroup:  "Light",
				TotalAmount:   5000,
				FiveHourQuota: 1000,
			}
			plan.NormalizeDefaults()
			require.NoError(t, DB.Create(plan).Error)
			require.NoError(t, DB.Create(&UserSubscription{
				UserId:      userID,
				PlanId:      plan.Id,
				AmountTotal: 5000,
				StartTime:   common.GetTimestamp() - 60,
				EndTime:     common.GetTimestamp() + 3600,
				Status:      "active",
				Source:      source,
			}).Error)
			require.NoError(t, DB.Model(&Redemption{}).Where(commonKeyCol+" = ?", key).Updates(map[string]interface{}{
				"type":                   RedemptionTypeGroup,
				"group_name":             "Moderate",
				"group_duration_minutes": 60,
			}).Error)

			_, err := Redeem(key, userID)
			require.ErrorIs(t, err, ErrRedeemFailed)

			var redemption Redemption
			require.NoError(t, DB.First(&redemption, commonKeyCol+" = ?", key).Error)
			assert.Equal(t, common.RedemptionCodeStatusEnabled, redemption.Status)
			assert.Zero(t, redemption.UsedUserId)

			var activeCount int64
			require.NoError(t, DB.Model(&UserSubscription{}).
				Where("user_id = ? AND status = ? AND end_time > ?", userID, "active", common.GetTimestamp()).
				Count(&activeCount).Error)
			assert.Equal(t, int64(1), activeCount)
		})
	}
}

func TestRedeemQuotaStillAllowedWithActiveSubscription(t *testing.T) {
	userID, key := setupRedeemFixture(t, 500)
	plan := &SubscriptionPlan{
		Title:         "Light",
		Enabled:       true,
		DurationUnit:  SubscriptionDurationMonth,
		DurationValue: 1,
		UpgradeGroup:  "Light",
		TotalAmount:   5000,
		FiveHourQuota: 1000,
	}
	plan.NormalizeDefaults()
	require.NoError(t, DB.Create(plan).Error)
	require.NoError(t, DB.Create(&UserSubscription{
		UserId:      userID,
		PlanId:      plan.Id,
		AmountTotal: 5000,
		StartTime:   common.GetTimestamp() - 60,
		EndTime:     common.GetTimestamp() + 3600,
		Status:      "active",
		Source:      PaymentMethodBalance,
	}).Error)

	result, err := Redeem(key, userID)
	require.NoError(t, err)
	assert.Equal(t, RedemptionTypeQuota, result.Type)
	assert.Equal(t, 500, result.Quota)

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userID).Error)
	assert.Equal(t, 500, user.Quota)
}

func TestRedeemGrantsPermanentGroupEntitlement(t *testing.T) {
	userID, key := setupRedeemFixture(t, 0)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"group":            "Light",
		"group_restore":    "Free",
		"group_expires_at": common.GetTimestamp() + 300,
	}).Error)
	require.NoError(t, DB.Model(&Redemption{}).Where(commonKeyCol+" = ?", key).Updates(map[string]interface{}{
		"type":                   RedemptionTypeGroup,
		"group_name":             "Heavy",
		"group_duration_minutes": 0,
	}).Error)

	result, err := Redeem(key, userID)
	require.NoError(t, err)
	assert.Equal(t, RedemptionTypeGroup, result.Type)
	assert.Equal(t, "Heavy", result.GroupName)
	assert.Zero(t, result.GroupExpiresAt)

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userID).Error)
	assert.Equal(t, "Heavy", user.Group)
	assert.Empty(t, user.GroupRestore)
	assert.Zero(t, user.GroupExpiresAt)
}

func TestRedeemExtendsMatchingTemporaryGroupEntitlement(t *testing.T) {
	userID, key := setupRedeemFixture(t, 0)
	plan := &SubscriptionPlan{
		Title:            "Moderate",
		Enabled:          true,
		DurationUnit:     SubscriptionDurationMonth,
		DurationValue:    1,
		UpgradeGroup:     "Moderate",
		DowngradeGroup:   "Free",
		TotalAmount:      5000,
		FiveHourQuota:    1000,
		QuotaResetPeriod: SubscriptionResetWeekly,
	}
	plan.NormalizeDefaults()
	require.NoError(t, DB.Create(plan).Error)
	initialExpiry := common.GetTimestamp() + 120
	require.NoError(t, DB.Model(&User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"group":            "Moderate",
		"group_restore":    "Free",
		"group_expires_at": initialExpiry,
	}).Error)
	require.NoError(t, DB.Model(&Redemption{}).Where(commonKeyCol+" = ?", key).Updates(map[string]interface{}{
		"type":                   RedemptionTypeGroup,
		"group_name":             "Moderate",
		"group_duration_minutes": 10,
	}).Error)

	result, err := Redeem(key, userID)
	require.NoError(t, err)
	assert.Equal(t, initialExpiry+600, result.GroupExpiresAt)

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userID).Error)
	assert.Equal(t, "Free", user.GroupRestore)
	assert.Equal(t, initialExpiry+600, user.GroupExpiresAt)
}

// Exactly one of several concurrent redeems of the same code may win, and
// quota must be credited exactly once.
func TestRedeemConcurrentSingleSuccess(t *testing.T) {
	userId, key := setupRedeemFixture(t, 300)

	const goroutines = 5
	successes := make([]bool, goroutines)
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func(idx int) {
			defer wg.Done()
			if _, err := Redeem(key, userId); err == nil {
				successes[idx] = true
			}
		}(i)
	}
	wg.Wait()

	successCount := 0
	for _, ok := range successes {
		if ok {
			successCount++
		}
	}
	assert.Equal(t, 1, successCount, "exactly one concurrent redeem should succeed")

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, 300, user.Quota, "quota must be credited exactly once")
}
