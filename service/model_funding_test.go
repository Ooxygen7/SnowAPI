package service

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setModelFundingRulesForTest(t *testing.T, rules map[string]string) {
	t.Helper()
	common.OptionMapRWMutex.Lock()
	previous := operation_setting.GetQuotaSetting().ModelFundingSources
	operation_setting.GetQuotaSetting().ModelFundingSources = rules
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		operation_setting.GetQuotaSetting().ModelFundingSources = previous
		common.OptionMapRWMutex.Unlock()
	})
}

func TestModelFundingRestrictions(t *testing.T) {
	// Initialize the model package's dialect-specific column names against the
	// existing isolated SQLite fixture, including token key lookups.
	t.Setenv("LOG_SQL_DSN", "")
	require.NoError(t, model.InitLogDB())
	cases := []struct {
		name, rule, preference, wantSource string
		wallet                             int
		subscription, expired              bool
		periodUsed, fiveHourQuota          int64
		free, changeRule, reserveDenied    bool
		rejected                           bool
	}{
		{name: "subscription overrides wallet preference", rule: "subscription_only", preference: "wallet_only", wallet: 500, subscription: true, fiveHourQuota: 800, wantSource: BillingSourceSubscription},
		{name: "wallet overrides subscription preference", rule: "wallet_only", preference: "subscription_only", wallet: 500, subscription: true, fiveHourQuota: 800, wantSource: BillingSourceWallet},
		{name: "no subscription cannot spend wallet", rule: "subscription_only", preference: "wallet_first", wallet: 500, rejected: true},
		{name: "expired subscription cannot spend wallet", rule: "subscription_only", wallet: 500, subscription: true, expired: true, rejected: true},
		{name: "period exhausted cannot overflow to wallet", rule: "subscription_only", wallet: 500, subscription: true, periodUsed: 1000, fiveHourQuota: 800, rejected: true},
		{name: "five hour budget cannot overflow to wallet", rule: "subscription_only", wallet: 500, subscription: true, fiveHourQuota: 50, rejected: true},
		{name: "empty wallet cannot spend subscription", rule: "wallet_only", subscription: true, fiveHourQuota: 800, rejected: true},
		{name: "insufficient wallet cannot spend subscription", rule: "wallet_only", wallet: 50, subscription: true, fiveHourQuota: 800, rejected: true},
		{name: "unrestricted wallet preference unchanged", preference: "wallet_only", wallet: 500, subscription: true, fiveHourQuota: 800, wantSource: BillingSourceWallet},
		{name: "unrestricted subscription preference unchanged", preference: "subscription_only", wallet: 500, subscription: true, fiveHourQuota: 800, wantSource: BillingSourceSubscription},
		{name: "zero priced subscription model still requires subscription", rule: "subscription_only", wallet: 500, free: true, rejected: true},
		{name: "zero priced wallet model still requires wallet", rule: "wallet_only", subscription: true, free: true, rejected: true},
		{name: "zero priced model validates subscription without final charge", rule: "subscription_only", wallet: 500, subscription: true, fiveHourQuota: 800, free: true, wantSource: BillingSourceSubscription},
		{name: "in flight subscription funding cannot change during reserve or settle", rule: "subscription_only", wallet: 500, subscription: true, fiveHourQuota: 800, changeRule: true, wantSource: BillingSourceSubscription},
		{name: "in flight wallet funding cannot change during reserve or settle", rule: "wallet_only", wallet: 500, subscription: true, fiveHourQuota: 800, changeRule: true, wantSource: BillingSourceWallet},
		{name: "subscription additional reserve never spills into wallet", rule: "subscription_only", wallet: 500, subscription: true, fiveHourQuota: 150, reserveDenied: true, wantSource: BillingSourceSubscription},
	}
	for index, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			truncate(t)
			rules := map[string]string{"mapped-upstream": "wallet_only"}
			if tc.rule != "" {
				rules["restricted-model"] = tc.rule
			}
			setModelFundingRulesForTest(t, rules)
			userID := 9100 + index
			key := fmt.Sprintf("funding-test-%d", index)
			seedUser(t, userID, tc.wallet)
			seedToken(t, userID, userID, key, 10000)
			var sub model.UserSubscription
			if tc.subscription {
				plan := model.SubscriptionPlan{Title: tc.name, PriceAmount: 10, DurationUnit: model.SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 1000, FiveHourQuota: tc.fiveHourQuota, QuotaResetPeriod: model.SubscriptionResetNever, AllowWalletOverflow: common.GetPointer(true)}
				require.NoError(t, model.DB.Create(&plan).Error)
				now := time.Now().Unix()
				sub = model.UserSubscription{UserId: userID, PlanId: plan.Id, AmountTotal: 1000, AmountUsed: tc.periodUsed, FiveHourQuota: tc.fiveHourQuota, StartTime: now - 60, EndTime: now + 86400, Status: "active"}
				if tc.expired {
					sub.EndTime = now - 1
				}
				require.NoError(t, model.DB.Create(&sub).Error)
			}
			info := &relaycommon.RelayInfo{UserId: userID, TokenId: userID, TokenKey: key, RequestId: key, OriginModelName: "restricted-model", UserSetting: dto.UserSetting{BillingPreference: tc.preference}, ForcePreConsume: true, PriceData: types.PriceData{FreeModel: tc.free}}
			info.ChannelMeta = &relaycommon.ChannelMeta{UpstreamModelName: "mapped-upstream"}
			c, _ := gin.CreateTestContext(nil)
			require.True(t, ShouldPreConsumeBilling(info))
			pre := 100
			if tc.free {
				pre = 0
			}
			apiErr := PreConsumeBilling(c, pre, info)
			if tc.rejected {
				require.NotNil(t, apiErr)
				assert.Equal(t, http.StatusForbidden, apiErr.StatusCode)
				assert.Equal(t, types.ErrorCodeInsufficientUserQuota, apiErr.GetErrorCode())
				assert.Nil(t, info.Billing)
			} else {
				require.Nil(t, apiErr)
				require.NotNil(t, info.Billing)
				assert.Equal(t, tc.wantSource, info.BillingSource)
				session := info.Billing.(*BillingSession)
				if tc.changeRule {
					opposite := "subscription_only"
					if tc.rule == opposite {
						opposite = "wallet_only"
					}
					setModelFundingRulesForTest(t, map[string]string{"restricted-model": opposite})
				}
				actual := 160
				if tc.free {
					actual = 0
				} else if tc.reserveDenied {
					reserveErr := session.Reserve(200)
					require.Error(t, reserveErr)
					var quotaErr *types.NewAPIError
					require.ErrorAs(t, reserveErr, &quotaErr)
					assert.Equal(t, types.ErrorCodeInsufficientUserQuota, quotaErr.GetErrorCode())
					actual = 100
				} else {
					require.NoError(t, session.Reserve(200))
				}
				require.NoError(t, session.Settle(actual))
				// A second settlement is idempotent and must not debit either budget again.
				require.NoError(t, session.Settle(actual))
			}
			expectedWallet := tc.wallet
			expectedUsed := tc.periodUsed
			actual := int64(160)
			if tc.free {
				actual = 0
			}
			if tc.reserveDenied {
				actual = 100
			}
			if !tc.rejected {
				if tc.wantSource == BillingSourceWallet {
					expectedWallet -= int(actual)
				} else {
					expectedUsed += actual
				}
			}
			var user model.User
			require.NoError(t, model.DB.First(&user, userID).Error)
			assert.Equal(t, expectedWallet, user.Quota)
			if tc.subscription {
				require.NoError(t, model.DB.First(&sub, sub.Id).Error)
				assert.Equal(t, expectedUsed, sub.AmountUsed)
			}
			var token model.Token
			require.NoError(t, model.DB.First(&token, userID).Error)
			expectedToken := 10000
			if !tc.rejected {
				expectedToken -= int(actual)
			}
			assert.Equal(t, expectedToken, token.RemainQuota)
		})
	}
}

func TestModelFundingFreeBypassAndExactModelID(t *testing.T) {
	setModelFundingRulesForTest(t, map[string]string{"restricted-model": "subscription_only"})
	info := &relaycommon.RelayInfo{OriginModelName: "other-model", PriceData: types.PriceData{FreeModel: true}}
	assert.False(t, ShouldPreConsumeBilling(info))
	info.OriginModelName = "restricted-model"
	assert.True(t, ShouldPreConsumeBilling(info))
	info.OriginModelName = "Restricted-Model"
	assert.False(t, ShouldPreConsumeBilling(info))
}
