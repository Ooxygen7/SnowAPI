package service

import (
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestSubscriptionBillingSessionRetainsFailedSettlementForRecovery(t *testing.T) {
	truncate(t)
	plan := model.SubscriptionPlan{Title: "Recovery", DurationUnit: model.SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 1000, FiveHourQuota: 300}
	require.NoError(t, model.DB.Create(&plan).Error)
	sub := model.UserSubscription{UserId: 82001, PlanId: plan.Id, AmountTotal: 1000, FiveHourQuota: 300, Status: "active", EndTime: model.GetDBTimestamp() + 86400}
	require.NoError(t, model.DB.Create(&sub).Error)
	seedToken(t, 82001, sub.UserId, "settlement-recovery-key", 880)
	funding := &SubscriptionFunding{requestId: "service-recovery", userId: sub.UserId, modelName: "model", amount: 120}
	require.NoError(t, funding.PreConsume(120))
	info := &relaycommon.RelayInfo{UserId: sub.UserId, TokenId: 82001, BillingSource: BillingSourceSubscription}
	session := &BillingSession{relayInfo: info, funding: funding, preConsumedQuota: 120, tokenConsumed: 120}
	require.NoError(t, model.DB.Callback().Update().Before("gorm:update").Register("test:settlement_failure", func(tx *gorm.DB) {
		if tx.Statement.Table == "subscription_quota_windows" {
			tx.AddError(errors.New("injected settlement failure"))
		}
	}))
	t.Cleanup(func() { model.DB.Callback().Update().Remove("test:settlement_failure") })
	require.Error(t, session.Settle(160))
	assert.False(t, session.NeedsRefund(), "a successful upstream request waiting for settlement must not be refunded")
	require.NoError(t, model.DB.Callback().Update().Remove("test:settlement_failure"))
	recovered, _, err := model.ReconcileSubscriptionSettlements(0, 300)
	require.NoError(t, err)
	assert.Equal(t, 1, recovered)
	require.NoError(t, session.Settle(160), "request and worker retries must share the same idempotency record")
	var token model.Token
	require.NoError(t, model.DB.First(&token, 82001).Error)
	assert.Equal(t, 840, token.RemainQuota)
	assert.Equal(t, int64(40), info.SubscriptionPostDelta)
}
