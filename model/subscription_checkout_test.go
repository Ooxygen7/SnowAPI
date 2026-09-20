package model

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"math"
	"testing"
)

func TestSubscriptionGatewayAmountUsesConfiguredRateAndRejectsInvalidMoney(t *testing.T) {
	for _, tc := range []struct {
		usd, rate, want float64
		invalid         bool
	}{
		{10, 10, 100, false}, {1.25, 7.3, 9.13, false}, {0.5, 1, 0.5, false},
		{-1, 10, 0, true}, {10, 0, 0, true}, {math.NaN(), 1, 0, true},
		{1, math.Inf(1), 0, true}, {math.MaxFloat64, 10, 0, true},
	} {
		amount, err := SubscriptionGatewayAmount(tc.usd, tc.rate)
		if tc.invalid {
			require.Error(t, err)
			continue
		}
		require.NoError(t, err)
		assert.Equal(t, tc.want, amount)
	}
}

func TestSubscriptionCheckoutSettlesSnapshotExactlyOnce(t *testing.T) {
	userId, _ := setupRedeemFixture(t, 0)
	require.NoError(t, DB.AutoMigrate(&SubscriptionOrder{}, &TopUp{}))
	plan := &SubscriptionPlan{Title: "Light", Enabled: true, PriceAmount: 10, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, UpgradeGroup: "Light", TotalAmount: 1000}
	require.NoError(t, DB.Create(plan).Error)
	order, err := CreateSubscriptionCheckoutOrder(userId, plan.Id, "epay", "checkout-once", 10, 100)
	require.NoError(t, err)
	t.Cleanup(func() {
		DB.Where("trade_no = ?", order.TradeNo).Delete(&SubscriptionOrder{})
		DB.Where("trade_no = ?", order.TradeNo).Delete(&TopUp{})
	})
	assert.Error(t, ValidateSubscriptionPaymentAmount(order.TradeNo, "1.00"))
	retry, err := CreateSubscriptionCheckoutOrder(userId, plan.Id, "epay", "checkout-once", 10, 100)
	require.NoError(t, err)
	assert.Equal(t, order.Id, retry.Id)
	_, err = CreateSubscriptionCheckoutOrder(userId, plan.Id, "epay", "checkout-once", 10, 99)
	assert.Error(t, err, "retry cannot charge more than the newly displayed price")
	require.NoError(t, ValidateSubscriptionPaymentAmount(order.TradeNo, "100.00"))
	require.NoError(t, DB.Model(plan).Update("total_amount", 2000).Error)
	require.ErrorIs(t, CompleteSubscriptionOrder(order.TradeNo, "", "wrong-provider", "epay"), ErrPaymentMethodMismatch)
	require.NoError(t, CompleteSubscriptionOrder(order.TradeNo, "signed", PaymentProviderEpay, "epay"))
	require.NoError(t, CompleteSubscriptionOrder(order.TradeNo, "signed", PaymentProviderEpay, "epay"))
	var subs []UserSubscription
	require.NoError(t, DB.Where("user_id = ? AND status = ?", userId, "active").Find(&subs).Error)
	require.Len(t, subs, 1)
	assert.Equal(t, int64(1000), subs[0].AmountTotal)
	var user User
	require.NoError(t, DB.First(&user, userId).Error)
	assert.Zero(t, user.Quota)
	assert.Equal(t, "Light", user.Group)
}

func TestSubscriptionCheckoutUpgradeKeepsCycleAndRejectsStaleEntitlement(t *testing.T) {
	for _, scenario := range []string{"unchanged", "replaced-account", "replaced-subscription"} {
		t.Run(scenario, func(t *testing.T) {
			userId, _ := setupRedeemFixture(t, 0)
			require.NoError(t, DB.AutoMigrate(&SubscriptionOrder{}, &TopUp{}))
			light := &SubscriptionPlan{Title: "Checkout Light", Enabled: true, PriceAmount: 10, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 1000}
			heavy := &SubscriptionPlan{Title: "Checkout Heavy", Enabled: true, PriceAmount: 100, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 10000}
			require.NoError(t, DB.Create(light).Error)
			require.NoError(t, DB.Create(heavy).Error)
			var original *UserSubscription
			require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
				var err error
				original, err = CreateUserSubscriptionFromPlanTx(tx, userId, light, "admin")
				return err
			}))
			quote, err := GetSubscriptionCheckoutQuote(userId, heavy.Id)
			require.NoError(t, err)
			assert.True(t, quote.IsUpgrade)
			assert.LessOrEqual(t, quote.AmountDue, 90.0)
			money, err := SubscriptionGatewayAmount(quote.AmountDue, 10)
			require.NoError(t, err)
			order, err := CreateSubscriptionCheckoutOrder(userId, heavy.Id, "epay", "checkout-upgrade", 10, money)
			require.NoError(t, err)
			t.Cleanup(func() {
				DB.Where("trade_no = ?", order.TradeNo).Delete(&SubscriptionOrder{})
				DB.Where("trade_no = ?", order.TradeNo).Delete(&TopUp{})
			})
			// Account identity changes cannot transfer a paid order to a replacement login.
			var user User
			require.NoError(t, DB.First(&user, userId).Error)
			if scenario == "replaced-account" {
				require.NoError(t, DB.Model(&user).Update("session_nonce", "replacement-identity").Error)
			}
			if scenario == "replaced-subscription" {
				require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
					_, err := CreateUserSubscriptionFromPlanTx(tx, userId, light, "admin")
					return err
				}))
			}
			require.NoError(t, CompleteSubscriptionOrder(order.TradeNo, "signed", PaymentProviderEpay, "epay"))
			if scenario == "unchanged" {
				assert.Equal(t, common.TopUpStatusSuccess, GetSubscriptionOrderByTradeNo(order.TradeNo).Status)
				var active []UserSubscription
				require.NoError(t, DB.Where("user_id = ? AND status = ?", userId, "active").Find(&active).Error)
				require.Len(t, active, 1)
				assert.Equal(t, original.StartTime, active[0].StartTime)
				assert.Equal(t, original.EndTime, active[0].EndTime)
				assert.Equal(t, heavy.Id, active[0].PlanId)
				return
			}
			assert.Equal(t, SubscriptionOrderPaidReview, GetSubscriptionOrderByTradeNo(order.TradeNo).Status)
			var stored UserSubscription
			require.NoError(t, DB.First(&stored, original.Id).Error)
			if scenario == "replaced-account" {
				assert.Equal(t, "active", stored.Status)
				assert.Equal(t, original.EndTime, stored.EndTime)
			}
			assert.NotEqual(t, common.TopUpStatusSuccess, GetSubscriptionOrderByTradeNo(order.TradeNo).Status)
		})
	}
}

func TestSubscriptionCheckoutBalanceCannotExceedConfirmedQuote(t *testing.T) {
	userId, _ := setupRedeemFixture(t, 0)
	plan := &SubscriptionPlan{Title: "Balance", Enabled: true, PriceAmount: 100, DurationUnit: SubscriptionDurationMonth, DurationValue: 1}
	require.NoError(t, DB.Create(plan).Error)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", userId).Update("quota", 100000000).Error)
	expected := 1
	_, err := PurchaseSubscriptionWithBalance(userId, plan.Id, &expected)
	require.Error(t, err)
	var user User
	require.NoError(t, DB.First(&user, userId).Error)
	assert.Equal(t, 100000000, user.Quota)
	var count int64
	require.NoError(t, DB.Model(&UserSubscription{}).Where("user_id = ?", userId).Count(&count).Error)
	assert.Zero(t, count)
}
