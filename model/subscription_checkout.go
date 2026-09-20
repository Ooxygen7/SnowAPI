package model

import (
	"errors"
	"math"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const SubscriptionOrderPaidReview = "paid_review"

type subscriptionCheckoutSnapshot struct {
	Plan                  SubscriptionPlan `json:"plan"`
	CurrentSubscriptionId int              `json:"current_subscription_id"`
	CurrentEndTime        int64            `json:"current_end_time"`
	UserNonce             string           `json:"user_nonce"`
}

// SubscriptionGatewayAmount uses only the gateway's configured local/USD price.
// Wallet top-up discounts and user quota display units do not price subscriptions.
func SubscriptionGatewayAmount(usd, rate float64) (float64, error) {
	if math.IsNaN(usd) || math.IsInf(usd, 0) || usd < 0 || math.IsNaN(rate) || math.IsInf(rate, 0) || rate <= 0 {
		return 0, errors.New("invalid subscription payment price")
	}
	money := decimal.NewFromFloat(usd).Mul(decimal.NewFromFloat(rate)).Round(2)
	if money.LessThan(decimal.NewFromFloat(0.01)) || money.GreaterThan(decimal.NewFromInt(2147483647)) {
		return 0, errors.New("subscription payment amount is out of range")
	}
	return money.InexactFloat64(), nil
}

func GetSubscriptionCheckoutQuote(userId, planId int) (*SubscriptionBalanceQuote, error) {
	plan, err := GetSubscriptionPlanById(planId)
	if err != nil {
		return nil, err
	}
	if userId <= 0 || !plan.Enabled {
		return nil, errors.New("subscription plan is unavailable")
	}
	quote, _, err := calculateSubscriptionBalanceQuoteTx(DB, userId, plan, GetDBTimestamp(), false)
	return quote, err
}

// Snapshot both the purchased benefits and the upgraded billing cycle. The
// callback must not grant today's edited plan for yesterday's paid price.
func CreateSubscriptionCheckoutOrder(userId, planId int, method, tradeNo string, rate, expectedMoney float64) (*SubscriptionOrder, error) {
	if userId <= 0 || planId <= 0 || method == "" || tradeNo == "" {
		return nil, errors.New("invalid subscription checkout")
	}
	var order *SubscriptionOrder
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).First(&user, userId).Error; err != nil {
			return err
		}
		var existing SubscriptionOrder
		lookup := tx.Where("trade_no = ?", tradeNo).First(&existing)
		if lookup.Error == nil {
			if existing.UserId != userId || existing.PlanId != planId || existing.PaymentMethod != method || existing.Status != common.TopUpStatusPending {
				return errors.New("subscription checkout already exists")
			}
			if existing.Money != expectedMoney {
				return errors.New("payment price changed; refresh the quote")
			}
			order = &existing
			return nil
		}
		if !errors.Is(lookup.Error, gorm.ErrRecordNotFound) {
			return lookup.Error
		}
		plan, err := getSubscriptionPlanByIdTx(tx, planId)
		if err != nil {
			return err
		}
		if !plan.Enabled {
			return errors.New("subscription plan is unavailable")
		}
		if plan.MaxPurchasePerUser > 0 {
			var count int64
			if err := tx.Model(&UserSubscription{}).Where("user_id = ? AND plan_id = ?", userId, planId).Count(&count).Error; err != nil {
				return err
			}
			if count >= int64(plan.MaxPurchasePerUser) {
				return errors.New("subscription purchase limit reached")
			}
		}
		quote, selection, err := calculateSubscriptionBalanceQuoteTx(tx, userId, plan, getSubscriptionDBTimestampTx(tx), true)
		if err != nil {
			return err
		}
		money, err := SubscriptionGatewayAmount(quote.AmountDue, rate)
		if err != nil {
			return err
		}
		if money != expectedMoney {
			return errors.New("payment price changed; refresh the quote")
		}
		snapshot := subscriptionCheckoutSnapshot{Plan: *plan, CurrentSubscriptionId: quote.CurrentSubscriptionId, UserNonce: user.SessionNonce}
		if selection.Current != nil {
			snapshot.CurrentEndTime = selection.Current.EndTime
		}
		payload, err := common.Marshal(snapshot)
		if err != nil {
			return err
		}
		order = &SubscriptionOrder{UserId: userId, PlanId: planId, Money: money, TradeNo: tradeNo,
			PaymentMethod: method, PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusPending,
			CreateTime: common.GetTimestamp(), CheckoutSnapshot: string(payload)}
		if err := tx.Create(order).Error; err != nil {
			return err
		}
		// Pending subscription payments belong in the same user-owned order
		// history as recharge payments, but must never credit wallet quota.
		return tx.Create(&TopUp{UserId: userId, Amount: 0, Money: money, TradeNo: tradeNo,
			PaymentMethod: method, PaymentProvider: PaymentProviderEpay,
			CreateTime: order.CreateTime, Status: common.TopUpStatusPending}).Error
	})
	return order, err
}

// The signed callback's amount must match the persisted quote, not a current
// setting or a browser-supplied price. Never grant benefits for a partial payment.
func ValidateSubscriptionPaymentAmount(tradeNo, amount string) error {
	order := GetSubscriptionOrderByTradeNo(tradeNo)
	if order == nil {
		return ErrSubscriptionOrderNotFound
	}
	paid, err := decimal.NewFromString(amount)
	if err != nil || !paid.Equal(decimal.NewFromFloat(order.Money)) {
		return errors.New("subscription payment amount mismatch")
	}
	return nil
}
