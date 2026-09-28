package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFiveHourWindowDeadlineIsFixedAfterFirstUse(t *testing.T) {
	truncateTables(t)
	_, sub := seedQuotaWindowSubscription(t, 991101, 2000, 300)
	first, err := PreConsumeUserSubscription("fixed-first", sub.UserId, "test-model", 0, 100)
	require.NoError(t, err)
	// Simulate a later request within the same window without wall-clock sleeps.
	now := GetDBTimestamp()
	start, end := now-3600, now+14400
	require.NoError(t, DB.Model(&SubscriptionQuotaWindow{}).Where("id = ?", first.UsageRef.FiveHourWindowId).
		Updates(map[string]interface{}{"start_time": start, "end_time": end}).Error)
	second, err := PreConsumeUserSubscription("fixed-second", sub.UserId, "test-model", 0, 100)
	require.NoError(t, err)
	assert.Equal(t, first.UsageRef.FiveHourWindowId, second.UsageRef.FiveHourWindowId)
	var window SubscriptionQuotaWindow
	require.NoError(t, DB.First(&window, second.UsageRef.FiveHourWindowId).Error)
	assert.Equal(t, start, window.StartTime)
	assert.Equal(t, end, window.EndTime)
	assert.EqualValues(t, 200, window.AmountUsed)
	count, err := ResetDueFiveHourSubscriptionWindows(10)
	require.NoError(t, err)
	assert.Zero(t, count, "maintenance must not reset an unexpired window")
}

func TestFiveHourAllowanceRestoresWithoutMaintenanceAtBoundary(t *testing.T) {
	for _, tc := range []struct {
		name      string
		endOffset int64
		allowed   bool
	}{
		{"before_boundary", 60, false},
		{"at_boundary", 0, true},
		{"idle_for_three_days", -3 * 86400, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			truncateTables(t)
			_, sub := seedQuotaWindowSubscription(t, 991102, 2500000, 1000000)
			first, err := PreConsumeUserSubscription("expiry-first", sub.UserId, "test-model", 0, 1000000)
			require.NoError(t, err)
			now := GetDBTimestamp()
			require.NoError(t, DB.Model(&SubscriptionQuotaWindow{}).Where("id = ?", first.UsageRef.FiveHourWindowId).
				Updates(map[string]interface{}{"start_time": now + tc.endOffset - 18000, "end_time": now + tc.endOffset}).Error)
			second, err := PreConsumeUserSubscription("expiry-next", sub.UserId, "test-model", 0, 1000000)
			if !tc.allowed {
				require.ErrorIs(t, err, ErrSubscriptionQuotaInsufficient)
				return
			}
			require.NoError(t, err)
			assert.NotEqual(t, first.UsageRef.FiveHourWindowId, second.UsageRef.FiveHourWindowId)
			assert.EqualValues(t, 1000000, second.FiveHourUsedAfter)
			var old, current SubscriptionQuotaWindow
			require.NoError(t, DB.First(&old, first.UsageRef.FiveHourWindowId).Error)
			require.NoError(t, DB.First(&current, second.UsageRef.FiveHourWindowId).Error)
			assert.EqualValues(t, 1000000, old.AmountUsed)
			assert.EqualValues(t, 18000, current.EndTime-current.StartTime)
			assert.GreaterOrEqual(t, current.StartTime, now)
		})
	}
}

func TestFiveHourMaintenancePreservesPeriodAndLateSettlement(t *testing.T) {
	truncateTables(t)
	_, sub := seedQuotaWindowSubscription(t, 991103, 1000, 300)
	first, err := PreConsumeUserSubscription("maintenance-first", sub.UserId, "test-model", 0, 100)
	require.NoError(t, err)
	now := GetDBTimestamp()
	require.NoError(t, DB.Model(&SubscriptionQuotaWindow{}).Where("id = ?", first.UsageRef.FiveHourWindowId).
		Update("end_time", now).Error)
	count, err := ResetDueFiveHourSubscriptionWindows(10)
	require.NoError(t, err)
	assert.Equal(t, 1, count)
	require.NoError(t, DB.First(sub, sub.Id).Error)
	assert.Zero(t, sub.CurrentFiveHourWindowId)
	assert.EqualValues(t, 100, sub.AmountUsed)
	assert.Equal(t, first.UsageRef.PeriodWindowId, sub.CurrentPeriodWindowId)
	count, err = ResetDueFiveHourSubscriptionWindows(10)
	require.NoError(t, err)
	assert.Zero(t, count, "idle windows must not restart without usage")

	second, err := PreConsumeUserSubscription("maintenance-next", sub.UserId, "test-model", 0, 100)
	require.NoError(t, err)
	require.NoError(t, SetSubscriptionUsageFinal(&first.UsageRef, 200, SubscriptionUsageStateSettled))
	var old, current SubscriptionQuotaWindow
	require.NoError(t, DB.First(&old, first.UsageRef.FiveHourWindowId).Error)
	require.NoError(t, DB.First(&current, second.UsageRef.FiveHourWindowId).Error)
	assert.EqualValues(t, 200, old.AmountUsed)
	assert.GreaterOrEqual(t, old.ClosedAt, now)
	assert.EqualValues(t, 100, current.AmountUsed)
	assert.EqualValues(t, 2, current.Sequence)
	require.NoError(t, RefundSubscriptionUsage(&first.UsageRef))
	require.NoError(t, DB.First(&current, current.Id).Error)
	assert.EqualValues(t, 100, current.AmountUsed)
	require.NoError(t, DB.First(sub, sub.Id).Error)
	assert.EqualValues(t, 100, sub.AmountUsed)
}

func TestPeriodResetKeepsLiveFiveHourLimit(t *testing.T) {
	truncateTables(t)
	plan, sub := seedQuotaWindowSubscription(t, 991104, 1000, 300)
	first, err := PreConsumeUserSubscription("period-before", sub.UserId, "test-model", 0, 100)
	require.NoError(t, err)
	now := GetDBTimestamp()
	require.NoError(t, DB.Model(plan).Updates(map[string]interface{}{
		"quota_reset_period": SubscriptionResetCustom, "quota_reset_custom_seconds": 3600,
	}).Error)
	InvalidateSubscriptionPlanCache(plan.Id)
	require.NoError(t, DB.Model(sub).Updates(map[string]interface{}{
		"start_time": now - 18000, "last_reset_time": now - 18000, "next_reset_time": now - 14400,
	}).Error)
	require.NoError(t, DB.Model(&SubscriptionQuotaWindow{}).Where("id = ?", first.UsageRef.PeriodWindowId).
		Updates(map[string]interface{}{"start_time": now - 18000, "end_time": now - 14400}).Error)
	count, err := ResetDueSubscriptions(10)
	require.NoError(t, err)
	assert.Equal(t, 1, count)
	require.NoError(t, DB.First(sub, sub.Id).Error)
	assert.Zero(t, sub.AmountUsed)
	assert.Greater(t, sub.NextResetTime, now)
	_, err = PreConsumeUserSubscription("period-five-capped", sub.UserId, "test-model", 0, 201)
	require.ErrorIs(t, err, ErrSubscriptionQuotaInsufficient)
	second, err := PreConsumeUserSubscription("period-after", sub.UserId, "test-model", 0, 200)
	require.NoError(t, err)
	assert.Equal(t, first.UsageRef.FiveHourWindowId, second.UsageRef.FiveHourWindowId)
	assert.NotEqual(t, first.UsageRef.PeriodWindowId, second.UsageRef.PeriodWindowId)
}

func TestSubscriptionSummaryDoesNotExposeAnotherSubscriptionsWindow(t *testing.T) {
	truncateTables(t)
	_, owner := seedQuotaWindowSubscription(t, 991105, 1000, 300)
	_, other := seedQuotaWindowSubscription(t, 991106, 1000, 300)
	usage, err := PreConsumeUserSubscription("summary-owner", owner.UserId, "test-model", 0, 100)
	require.NoError(t, err)
	require.NoError(t, DB.Model(other).Update("current_five_hour_window_id", usage.UsageRef.FiveHourWindowId).Error)
	summaries, err := GetAllUserSubscriptions(other.UserId)
	require.NoError(t, err)
	require.Len(t, summaries, 1)
	require.NotNil(t, summaries[0].FiveHourWindow)
	assert.Zero(t, summaries[0].FiveHourWindow.WindowId)
	assert.Zero(t, summaries[0].FiveHourWindow.AmountUsed)
	_, err = PreConsumeUserSubscription("invalid-owner", other.UserId, "test-model", 0, 1)
	require.ErrorIs(t, err, ErrSubscriptionQuotaInvalid, "invalid linkage must still fail admission")
}
