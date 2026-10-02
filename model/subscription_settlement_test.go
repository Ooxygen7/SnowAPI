package model

import (
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestSubscriptionSettlementRecoveryIsAtomicAndIdempotent(t *testing.T) {
	truncateTables(t)
	_, sub := seedQuotaWindowSubscription(t, 81001, 1000, 300)
	pre, err := PreConsumeUserSubscription("atomic-recovery", sub.UserId, "model", 0, 120)
	require.NoError(t, err)
	token := Token{UserId: sub.UserId, Key: "recovery-test-key", RemainQuota: 880, UsedQuota: 120}
	require.NoError(t, DB.Create(&token).Error)
	require.NoError(t, QueueSubscriptionSettlement(&pre.UsageRef, 160, token.Id, 120))
	require.NoError(t, DB.Callback().Update().Before("gorm:update").Register("test:token_write_failure", func(tx *gorm.DB) {
		if tx.Statement.Table == "tokens" {
			tx.AddError(errors.New("injected token write failure"))
		}
	}))
	t.Cleanup(func() { DB.Callback().Update().Remove("test:token_write_failure") })
	_, err = CompleteSubscriptionSettlement(pre.UsageRef.RequestId)
	require.Error(t, err)
	var record SubscriptionPreConsumeRecord
	require.NoError(t, DB.Where("request_id = ?", pre.UsageRef.RequestId).First(&record).Error)
	assert.True(t, record.SettlementPending)
	assert.Equal(t, SubscriptionUsageStateReserved, record.Status)
	require.NoError(t, DB.First(sub, sub.Id).Error)
	assert.Equal(t, int64(120), sub.AmountUsed, "allowance must roll back when the key update fails")
	require.NoError(t, DB.Callback().Update().Remove("test:token_write_failure"))
	completed, _, err := ReconcileSubscriptionSettlements(0, 300)
	require.NoError(t, err)
	assert.Equal(t, 1, completed)
	_, err = CompleteSubscriptionSettlement(pre.UsageRef.RequestId)
	require.NoError(t, err)
	require.NoError(t, DB.First(sub, sub.Id).Error)
	require.NoError(t, DB.First(&token, token.Id).Error)
	assert.Equal(t, int64(160), sub.AmountUsed)
	assert.Equal(t, 840, token.RemainQuota)
	assert.Equal(t, 160, token.UsedQuota)
	var window SubscriptionQuotaWindow
	require.NoError(t, DB.First(&window, pre.UsageRef.FiveHourWindowId).Error)
	assert.Equal(t, int64(160), window.AmountUsed)
}

func TestQueuedSubscriptionSettlementRejectsConflictingOrUnsafeTargets(t *testing.T) {
	truncateTables(t)
	_, sub := seedQuotaWindowSubscription(t, 81002, 1000, 300)
	pre, err := PreConsumeUserSubscription("settlement-guards", sub.UserId, "model", 0, 120)
	require.NoError(t, err)
	for _, quota := range []int64{-1, int64(common.MaxQuota) + 1} {
		require.ErrorIs(t, QueueSubscriptionSettlement(&pre.UsageRef, quota, 0, 120), ErrSubscriptionQuotaInvalid)
	}
	wrongRef := pre.UsageRef
	wrongRef.UserSubscriptionId++
	require.ErrorIs(t, QueueSubscriptionSettlement(&wrongRef, 150, 0, 120), ErrSubscriptionQuotaInvalid)
	require.NoError(t, QueueSubscriptionSettlement(&pre.UsageRef, 0, 0, 120))
	require.NoError(t, QueueSubscriptionSettlement(&pre.UsageRef, 0, 0, 120))
	require.ErrorIs(t, QueueSubscriptionSettlement(&pre.UsageRef, 150, 0, 120), ErrSubscriptionUsageFinalized)
	require.ErrorIs(t, RefundSubscriptionUsage(&pre.UsageRef), ErrSubscriptionUsageFinalized)
	_, err = CompleteSubscriptionSettlement(pre.UsageRef.RequestId)
	require.NoError(t, err)
	require.NoError(t, DB.First(sub, sub.Id).Error)
	assert.Zero(t, sub.AmountUsed, "explicit zero is a valid settled amount")
}

func TestSubscriptionRecoveryRequiresUnambiguousMatchingLog(t *testing.T) {
	for _, scenario := range []string{"matching", "ambiguous", "different-user", "async-task", "wrong-window", "missing-log"} {
		t.Run(scenario, func(t *testing.T) {
			truncateTables(t)
			_, sub := seedQuotaWindowSubscription(t, 81003, 1000, 300)
			pre, err := PreConsumeUserSubscription("historic-recovery", sub.UserId, "model", 0, 120)
			require.NoError(t, err)
			require.NoError(t, DB.Model(&SubscriptionPreConsumeRecord{}).Where("request_id = ?", pre.UsageRef.RequestId).UpdateColumn("updated_at", GetDBTimestamp()-600).Error)
			details := map[string]interface{}{"billing_source": "subscription", "subscription_id": sub.Id, "subscription_period_window_id": pre.UsageRef.PeriodWindowId, "subscription_five_hour_window_id": pre.UsageRef.FiveHourWindowId, "subscription_consumed": 120}
			if scenario == "async-task" {
				details["is_task"] = true
			}
			if scenario == "wrong-window" {
				details["subscription_period_window_id"] = -1
			}
			encoded, err := common.Marshal(details)
			require.NoError(t, err)
			log := Log{RequestId: pre.UsageRef.RequestId, UserId: sub.UserId, Type: LogTypeConsume, Quota: 160, Other: string(encoded)}
			if scenario == "different-user" {
				log.UserId++
			}
			if scenario != "missing-log" {
				require.NoError(t, LOG_DB.Create(&log).Error)
			}
			if scenario == "ambiguous" {
				log.Id = 0
				require.NoError(t, LOG_DB.Create(&log).Error)
			}
			completed, _, err := ReconcileSubscriptionSettlements(0, 300)
			require.NoError(t, err)
			require.NoError(t, DB.First(sub, sub.Id).Error)
			if scenario == "matching" {
				assert.Equal(t, 1, completed)
				assert.Equal(t, int64(160), sub.AmountUsed)
			} else {
				assert.Zero(t, completed)
				assert.Equal(t, int64(120), sub.AmountUsed)
			}
		})
	}
}

func TestCleanupRetainsUnsettledSubscriptionDebitsAndTheirWindows(t *testing.T) {
	truncateTables(t)
	_, sub := seedQuotaWindowSubscription(t, 81004, 1000, 300)
	pending, err := PreConsumeUserSubscription("retained-pending", sub.UserId, "model", 0, 120)
	require.NoError(t, err)
	settled, err := PreConsumeUserSubscription("removed-settled", sub.UserId, "model", 0, 20)
	require.NoError(t, err)
	require.NoError(t, SetSubscriptionUsageFinal(&settled.UsageRef, 20, SubscriptionUsageStateSettled))
	old := GetDBTimestamp() - 8*24*3600
	require.NoError(t, DB.Model(&SubscriptionPreConsumeRecord{}).Where("user_id = ?", sub.UserId).UpdateColumn("updated_at", old).Error)
	require.NoError(t, DB.Model(&SubscriptionQuotaWindow{}).Where("user_subscription_id = ?", sub.Id).Updates(map[string]interface{}{"closed_at": old, "updated_at": old}).Error)
	removed, err := CleanupSubscriptionPreConsumeRecords(7 * 24 * 3600)
	require.NoError(t, err)
	assert.Equal(t, int64(1), removed)
	var record SubscriptionPreConsumeRecord
	require.NoError(t, DB.Where("request_id = ?", pending.UsageRef.RequestId).First(&record).Error)
	removed, err = CleanupSubscriptionQuotaWindows(7 * 24 * 3600)
	require.NoError(t, err)
	assert.Zero(t, removed)
}
