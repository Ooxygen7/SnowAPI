package model

import (
	"errors"
	"fmt"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	mysqldriver "github.com/go-sql-driver/mysql"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type testPostgresError struct {
	state string
}

func (err testPostgresError) Error() string {
	return "postgres transaction error: " + err.state
}

func (err testPostgresError) SQLState() string {
	return err.state
}

func seedQuotaWindowSubscription(t *testing.T, userId int, periodQuota int64, fiveHourQuota int64) (*SubscriptionPlan, *UserSubscription) {
	t.Helper()
	now := GetDBTimestamp()
	plan := &SubscriptionPlan{
		Title:            "Window plan",
		PriceAmount:      1,
		DurationUnit:     SubscriptionDurationMonth,
		DurationValue:    1,
		TotalAmount:      periodQuota,
		FiveHourQuota:    fiveHourQuota,
		QuotaResetPeriod: SubscriptionResetNever,
	}
	require.NoError(t, DB.Create(plan).Error)
	sub := &UserSubscription{
		UserId:             userId,
		PlanId:             plan.Id,
		AmountTotal:        periodQuota,
		FiveHourQuota:      fiveHourQuota,
		StartTime:          now - 60,
		EndTime:            now + 30*24*3600,
		Status:             "active",
		QuotaWindowVersion: 0,
	}
	require.NoError(t, DB.Create(sub).Error)
	return plan, sub
}

func TestPreConsumeCreatesBothWindowsAtomicallyAndIsIdempotent(t *testing.T) {
	truncateTables(t)
	_, sub := seedQuotaWindowSubscription(t, 7101, 1000, 300)

	result, err := PreConsumeUserSubscription("window-atomic", sub.UserId, "test-model", 0, 120)
	require.NoError(t, err)
	require.True(t, result.UsageRef.Valid())
	assert.Equal(t, int64(120), result.AmountUsedAfter)
	assert.Equal(t, int64(120), result.FiveHourUsedAfter)

	var periodWindow SubscriptionQuotaWindow
	require.NoError(t, DB.First(&periodWindow, result.UsageRef.PeriodWindowId).Error)
	assert.Equal(t, SubscriptionQuotaWindowPeriod, periodWindow.WindowType)
	assert.Equal(t, int64(120), periodWindow.AmountUsed)

	var fiveHourWindow SubscriptionQuotaWindow
	require.NoError(t, DB.First(&fiveHourWindow, result.UsageRef.FiveHourWindowId).Error)
	assert.Equal(t, SubscriptionQuotaWindowFiveHour, fiveHourWindow.WindowType)
	assert.Equal(t, subscriptionFiveHourWindowSeconds, fiveHourWindow.EndTime-fiveHourWindow.StartTime)
	assert.Equal(t, int64(120), fiveHourWindow.AmountUsed)

	retry, err := PreConsumeUserSubscription("window-atomic", sub.UserId, "test-model", 0, 120)
	require.NoError(t, err)
	assert.Equal(t, result.UsageRef.PeriodWindowId, retry.UsageRef.PeriodWindowId)
	assert.Equal(t, result.UsageRef.FiveHourWindowId, retry.UsageRef.FiveHourWindowId)

	require.NoError(t, DB.First(&periodWindow, result.UsageRef.PeriodWindowId).Error)
	require.NoError(t, DB.First(&fiveHourWindow, result.UsageRef.FiveHourWindowId).Error)
	assert.Equal(t, int64(120), periodWindow.AmountUsed)
	assert.Equal(t, int64(120), fiveHourWindow.AmountUsed)
}

func TestPreConsumePrefersSubscriptionMatchingCurrentUserGroup(t *testing.T) {
	truncateTables(t)
	const userId = 7108
	require.NoError(t, DB.Create(&User{
		Id:       userId,
		Username: "window-group-user",
		Password: "test-password",
		Group:    "Moderate",
		Status:   1,
	}).Error)
	now := GetDBTimestamp()
	lightPlan, light := seedQuotaWindowSubscription(t, userId, 1000, 0)
	moderatePlan, moderate := seedQuotaWindowSubscription(t, userId, 2000, 500)
	InvalidateSubscriptionPlanCache(lightPlan.Id)
	InvalidateSubscriptionPlanCache(moderatePlan.Id)
	require.NoError(t, DB.Model(light).Updates(map[string]interface{}{
		"upgrade_group": "Light",
		"end_time":      now + 10*24*3600,
	}).Error)
	require.NoError(t, DB.Model(moderate).Updates(map[string]interface{}{
		"upgrade_group": "Moderate",
		"end_time":      now + 20*24*3600,
	}).Error)

	result, err := PreConsumeUserSubscription("window-group-match", userId, "test-model", 0, 50)
	require.NoError(t, err)
	assert.Equal(t, moderate.Id, result.UserSubscriptionId)
	assert.NotZero(t, result.UsageRef.FiveHourWindowId)

	var storedLight UserSubscription
	require.NoError(t, DB.First(&storedLight, light.Id).Error)
	assert.Zero(t, storedLight.AmountUsed)
}

func TestSubscriptionUpgradeChargesProratedDifferenceAndReplacesActivePlan(t *testing.T) {
	truncateTables(t)
	const userId = 7109
	initialQuota := int(common.QuotaPerUnit * 100)
	require.NoError(t, DB.Create(&User{
		Id:       userId,
		Username: "subscription-upgrade-user",
		Password: "test-password",
		Group:    "Light",
		Status:   1,
		Quota:    initialQuota,
	}).Error)
	now := GetDBTimestamp()
	lightPlan := &SubscriptionPlan{
		Title:            "Light",
		PriceAmount:      10,
		DurationUnit:     SubscriptionDurationMonth,
		DurationValue:    1,
		TotalAmount:      1000,
		FiveHourQuota:    300,
		QuotaResetPeriod: SubscriptionResetNever,
		UpgradeGroup:     "Light",
		Enabled:          true,
		SortOrder:        1,
	}
	heavyPlan := &SubscriptionPlan{
		Title:            "Heavy",
		PriceAmount:      30,
		DurationUnit:     SubscriptionDurationMonth,
		DurationValue:    1,
		TotalAmount:      3000,
		FiveHourQuota:    900,
		QuotaResetPeriod: SubscriptionResetNever,
		UpgradeGroup:     "Heavy",
		Enabled:          true,
		SortOrder:        2,
	}
	require.NoError(t, DB.Create(lightPlan).Error)
	require.NoError(t, DB.Create(heavyPlan).Error)
	InvalidateSubscriptionPlanCache(lightPlan.Id)
	InvalidateSubscriptionPlanCache(heavyPlan.Id)
	oldSubscription := &UserSubscription{
		UserId:             userId,
		PlanId:             lightPlan.Id,
		AmountTotal:        lightPlan.TotalAmount,
		AmountUsed:         200,
		FiveHourQuota:      lightPlan.FiveHourQuota,
		StartTime:          now - 100,
		EndTime:            now + 100,
		Status:             "active",
		UpgradeGroup:       "Light",
		PrevUserGroup:      "Free",
		QuotaWindowVersion: 0,
	}
	require.NoError(t, DB.Create(oldSubscription).Error)
	periodWindow := &SubscriptionQuotaWindow{
		UserSubscriptionId: oldSubscription.Id,
		WindowType:         SubscriptionQuotaWindowPeriod,
		Sequence:           1,
		AmountTotal:        lightPlan.TotalAmount,
		AmountUsed:         200,
		StartTime:          now - 100,
		EndTime:            now + 100,
		Version:            1,
	}
	fiveHourWindow := &SubscriptionQuotaWindow{
		UserSubscriptionId: oldSubscription.Id,
		WindowType:         SubscriptionQuotaWindowFiveHour,
		Sequence:           1,
		AmountTotal:        lightPlan.FiveHourQuota,
		AmountUsed:         100,
		StartTime:          now - 60,
		EndTime:            now + 5*3600 - 60,
		Version:            1,
	}
	require.NoError(t, DB.Create(periodWindow).Error)
	require.NoError(t, DB.Create(fiveHourWindow).Error)
	require.NoError(t, DB.Model(oldSubscription).Updates(map[string]interface{}{
		"current_period_window_id":    periodWindow.Id,
		"current_five_hour_window_id": fiveHourWindow.Id,
		"period_window_sequence":      1,
		"five_hour_window_sequence":   1,
	}).Error)

	quote, err := PurchaseSubscriptionWithBalance(userId, heavyPlan.Id)
	require.NoError(t, err)
	require.NotNil(t, quote)
	assert.True(t, quote.IsUpgrade)
	assert.InDelta(t, 25, quote.AmountDue, 0.1)
	assert.InDelta(t, 5, quote.UpgradeCredit, 0.1)

	var activeSubscriptions []UserSubscription
	require.NoError(t, DB.Where("user_id = ? AND status = ?", userId, "active").Find(&activeSubscriptions).Error)
	require.Len(t, activeSubscriptions, 1)
	upgraded := activeSubscriptions[0]
	assert.Equal(t, heavyPlan.Id, upgraded.PlanId)
	assert.Equal(t, int64(200), upgraded.AmountUsed)
	assert.Equal(t, "Free", upgraded.PrevUserGroup)
	assert.NotZero(t, upgraded.CurrentPeriodWindowId)
	assert.NotZero(t, upgraded.CurrentFiveHourWindowId)

	var carriedFiveHourWindow SubscriptionQuotaWindow
	require.NoError(t, DB.First(&carriedFiveHourWindow, upgraded.CurrentFiveHourWindowId).Error)
	assert.Equal(t, int64(100), carriedFiveHourWindow.AmountUsed)
	assert.Equal(t, heavyPlan.FiveHourQuota, carriedFiveHourWindow.AmountTotal)
	assert.Equal(t, fiveHourWindow.EndTime, carriedFiveHourWindow.EndTime)

	var cancelled UserSubscription
	require.NoError(t, DB.First(&cancelled, oldSubscription.Id).Error)
	assert.Equal(t, "cancelled", cancelled.Status)
	assert.Equal(t, now, cancelled.EndTime)

	var user User
	require.NoError(t, DB.First(&user, userId).Error)
	assert.Equal(t, "Heavy", user.Group)
	assert.Equal(t, initialQuota-quote.RequiredQuota, user.Quota)
}

func TestConcurrentFirstPreConsumesShareOneWindowSequence(t *testing.T) {
	truncateTables(t)
	_, sub := seedQuotaWindowSubscription(t, 7106, 1000, 500)

	const requestCount = 5
	results := make([]*SubscriptionPreConsumeResult, requestCount)
	errs := make([]error, requestCount)
	var waitGroup sync.WaitGroup
	waitGroup.Add(requestCount)
	for i := 0; i < requestCount; i++ {
		go func(index int) {
			defer waitGroup.Done()
			results[index], errs[index] = PreConsumeUserSubscription(fmt.Sprintf("window-concurrent-%d", index), sub.UserId, "test-model", 0, 30)
		}(i)
	}
	waitGroup.Wait()

	periodWindowId := 0
	fiveHourWindowId := 0
	for i := range results {
		require.NoError(t, errs[i])
		require.NotNil(t, results[i])
		if periodWindowId == 0 {
			periodWindowId = results[i].UsageRef.PeriodWindowId
			fiveHourWindowId = results[i].UsageRef.FiveHourWindowId
		}
		assert.Equal(t, periodWindowId, results[i].UsageRef.PeriodWindowId)
		assert.Equal(t, fiveHourWindowId, results[i].UsageRef.FiveHourWindowId)
	}

	var windows []SubscriptionQuotaWindow
	require.NoError(t, DB.Where("user_subscription_id = ?", sub.Id).Order("window_type asc").Find(&windows).Error)
	require.Len(t, windows, 2)
	for _, window := range windows {
		assert.Equal(t, int64(1), window.Sequence)
		assert.Equal(t, int64(requestCount*30), window.AmountUsed)
	}
}

func TestSubscriptionQuotaTransactionRetriesSupportedDeadlocksWithBound(t *testing.T) {
	tests := []struct {
		name             string
		err              error
		failures         int
		expectedAttempts int
		expectSuccess    bool
	}{
		{
			name:             "mysql deadlock 1213",
			err:              fmt.Errorf("wrapped: %w", &mysqldriver.MySQLError{Number: 1213, Message: "deadlock"}),
			failures:         2,
			expectedAttempts: 3,
			expectSuccess:    true,
		},
		{
			name:             "postgres deadlock 40P01",
			err:              fmt.Errorf("wrapped: %w", testPostgresError{state: "40P01"}),
			failures:         1,
			expectedAttempts: 2,
			expectSuccess:    true,
		},
		{
			name:             "persistent deadlock is bounded",
			err:              &mysqldriver.MySQLError{Number: 1213, Message: "deadlock"},
			failures:         subscriptionQuotaTxMaxAttempts,
			expectedAttempts: subscriptionQuotaTxMaxAttempts,
		},
		{
			name:             "non-retryable error",
			err:              errors.New("invalid request"),
			failures:         1,
			expectedAttempts: 1,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			attempts := 0
			err := runSubscriptionQuotaWithRetry(func() error {
				attempts++
				if attempts <= test.failures {
					return test.err
				}
				return nil
			})
			assert.Equal(t, test.expectedAttempts, attempts)
			if test.expectSuccess {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
}

func TestSubscriptionSettlementLocksSubscriptionBeforeQuotaWindows(t *testing.T) {
	truncateTables(t)
	_, sub := seedQuotaWindowSubscription(t, 7107, 1000, 500)
	preConsumed, err := PreConsumeUserSubscription("window-lock-order", sub.UserId, "test-model", 0, 100)
	require.NoError(t, err)

	callbackName := "test:subscription_settlement_lock_order"
	queriedTables := make([]string, 0, 4)
	require.NoError(t, DB.Callback().Query().Before("gorm:query").Register(callbackName, func(tx *gorm.DB) {
		queriedTables = append(queriedTables, tx.Statement.Table)
	}))
	t.Cleanup(func() {
		require.NoError(t, DB.Callback().Query().Remove(callbackName))
	})

	usageRef := preConsumed.UsageRef
	require.NoError(t, SetSubscriptionUsageFinal(&usageRef, 120, SubscriptionUsageStateSettled))
	subscriptionIndex := -1
	firstWindowIndex := -1
	for index, table := range queriedTables {
		switch table {
		case "user_subscriptions":
			if subscriptionIndex < 0 {
				subscriptionIndex = index
			}
		case "subscription_quota_windows":
			if firstWindowIndex < 0 {
				firstWindowIndex = index
			}
		}
	}
	require.NotEqual(t, -1, subscriptionIndex, queriedTables)
	require.NotEqual(t, -1, firstWindowIndex, queriedTables)
	assert.Less(t, subscriptionIndex, firstWindowIndex, queriedTables)
}

func TestFailedFirstPreConsumeLeavesNoWindowsOrCounters(t *testing.T) {
	truncateTables(t)
	_, sub := seedQuotaWindowSubscription(t, 7102, 1000, 100)

	result, err := PreConsumeUserSubscription("window-failed", sub.UserId, "test-model", 0, 101)
	require.Error(t, err)
	assert.Nil(t, result)
	assert.True(t, errors.Is(err, ErrSubscriptionQuotaInsufficient))

	var windowCount int64
	require.NoError(t, DB.Model(&SubscriptionQuotaWindow{}).Where("user_subscription_id = ?", sub.Id).Count(&windowCount).Error)
	assert.Zero(t, windowCount)
	var recordCount int64
	require.NoError(t, DB.Model(&SubscriptionPreConsumeRecord{}).Where("request_id = ?", "window-failed").Count(&recordCount).Error)
	assert.Zero(t, recordCount)

	var stored UserSubscription
	require.NoError(t, DB.First(&stored, sub.Id).Error)
	assert.Zero(t, stored.AmountUsed)
	assert.Zero(t, stored.CurrentPeriodWindowId)
	assert.Zero(t, stored.CurrentFiveHourWindowId)
}

func TestExpiredFiveHourBoundaryCreatesNextWindowOnSuccessfulRequest(t *testing.T) {
	truncateTables(t)
	_, sub := seedQuotaWindowSubscription(t, 7103, 1000, 300)

	first, err := PreConsumeUserSubscription("window-boundary-1", sub.UserId, "test-model", 0, 50)
	require.NoError(t, err)
	boundary := GetDBTimestamp()
	require.NoError(t, DB.Model(&SubscriptionQuotaWindow{}).
		Where("id = ?", first.UsageRef.FiveHourWindowId).
		Updates(map[string]interface{}{"end_time": boundary, "updated_at": boundary}).Error)

	second, err := PreConsumeUserSubscription("window-boundary-2", sub.UserId, "test-model", 0, 60)
	require.NoError(t, err)
	assert.NotEqual(t, first.UsageRef.FiveHourWindowId, second.UsageRef.FiveHourWindowId)

	var oldWindow SubscriptionQuotaWindow
	require.NoError(t, DB.First(&oldWindow, first.UsageRef.FiveHourWindowId).Error)
	assert.GreaterOrEqual(t, oldWindow.ClosedAt, boundary)
	var newWindow SubscriptionQuotaWindow
	require.NoError(t, DB.First(&newWindow, second.UsageRef.FiveHourWindowId).Error)
	assert.Equal(t, int64(2), newWindow.Sequence)
	assert.GreaterOrEqual(t, newWindow.StartTime, boundary)
	assert.Equal(t, subscriptionFiveHourWindowSeconds, newWindow.EndTime-newWindow.StartTime)
}

func TestSettlementAndRefundStayOnOriginalWindows(t *testing.T) {
	truncateTables(t)
	_, sub := seedQuotaWindowSubscription(t, 7104, 1000, 300)
	preConsumed, err := PreConsumeUserSubscription("window-settle", sub.UserId, "test-model", 0, 100)
	require.NoError(t, err)

	var stored UserSubscription
	require.NoError(t, DB.First(&stored, sub.Id).Error)
	now := GetDBTimestamp()
	newPeriod := &SubscriptionQuotaWindow{
		UserSubscriptionId: stored.Id,
		WindowType:         SubscriptionQuotaWindowPeriod,
		Sequence:           stored.PeriodWindowSequence + 1,
		AmountTotal:        stored.AmountTotal,
		StartTime:          now,
		EndTime:            stored.EndTime,
		Version:            1,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	require.NoError(t, DB.Create(newPeriod).Error)
	require.NoError(t, DB.Model(&UserSubscription{}).Where("id = ?", stored.Id).Updates(map[string]interface{}{
		"current_period_window_id": newPeriod.Id,
		"period_window_sequence":   newPeriod.Sequence,
		"amount_used":              0,
	}).Error)

	usageRef := preConsumed.UsageRef
	require.NoError(t, SetSubscriptionUsageFinal(&usageRef, 150, SubscriptionUsageStateSettled))
	versionAfterSettle := usageRef.Version
	require.NoError(t, SetSubscriptionUsageFinal(&usageRef, 150, SubscriptionUsageStateSettled))
	assert.Equal(t, versionAfterSettle, usageRef.Version)

	var originalPeriod SubscriptionQuotaWindow
	require.NoError(t, DB.First(&originalPeriod, preConsumed.UsageRef.PeriodWindowId).Error)
	assert.Equal(t, int64(150), originalPeriod.AmountUsed)
	var originalFiveHour SubscriptionQuotaWindow
	require.NoError(t, DB.First(&originalFiveHour, preConsumed.UsageRef.FiveHourWindowId).Error)
	assert.Equal(t, int64(150), originalFiveHour.AmountUsed)
	require.NoError(t, DB.First(&stored, sub.Id).Error)
	assert.Zero(t, stored.AmountUsed, "historical settlement must not overwrite the current periodic mirror")

	require.NoError(t, RefundSubscriptionUsage(&usageRef))
	require.NoError(t, RefundSubscriptionUsage(&usageRef))
	require.NoError(t, DB.First(&originalPeriod, preConsumed.UsageRef.PeriodWindowId).Error)
	require.NoError(t, DB.First(&originalFiveHour, preConsumed.UsageRef.FiveHourWindowId).Error)
	assert.Zero(t, originalPeriod.AmountUsed)
	assert.Zero(t, originalFiveHour.AmountUsed)
	require.NoError(t, DB.First(&stored, sub.Id).Error)
	assert.Zero(t, stored.AmountUsed)
}

func TestSubscriptionSummariesExposeDisabledIdleActiveAndExpiredWindows(t *testing.T) {
	truncateTables(t)
	_, enabledSub := seedQuotaWindowSubscription(t, 7105, 1000, 300)
	_, disabledSub := seedQuotaWindowSubscription(t, 7105, 1000, 0)

	summaries, err := GetAllUserSubscriptions(7105)
	require.NoError(t, err)
	require.Len(t, summaries, 2)
	states := make(map[int]*SubscriptionQuotaWindowSummary, len(summaries))
	for _, summary := range summaries {
		states[summary.Subscription.Id] = summary.FiveHourWindow
	}
	assert.Nil(t, states[disabledSub.Id])
	require.NotNil(t, states[enabledSub.Id])
	assert.Equal(t, "idle", states[enabledSub.Id].State)

	preConsumed, err := PreConsumeUserSubscription("window-summary-active", enabledSub.UserId, "test-model", 0, 50)
	require.NoError(t, err)
	summaries, err = GetAllUserSubscriptions(7105)
	require.NoError(t, err)
	for _, summary := range summaries {
		if summary.Subscription.Id == enabledSub.Id {
			require.NotNil(t, summary.FiveHourWindow)
			assert.Equal(t, "active", summary.FiveHourWindow.State)
			assert.Equal(t, int64(50), summary.FiveHourWindow.AmountUsed)
		}
	}

	boundary := GetDBTimestamp()
	require.NoError(t, DB.Model(&SubscriptionQuotaWindow{}).
		Where("id = ?", preConsumed.UsageRef.FiveHourWindowId).
		Update("end_time", boundary).Error)
	summaries, err = GetAllUserSubscriptions(7105)
	require.NoError(t, err)
	for _, summary := range summaries {
		if summary.Subscription.Id == enabledSub.Id {
			require.NotNil(t, summary.FiveHourWindow)
			assert.Equal(t, "expired", summary.FiveHourWindow.State)
		}
	}
}
