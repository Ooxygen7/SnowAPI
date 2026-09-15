package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClosedPaymentChannelRejectsNewOrdersBeforeProcessing(t *testing.T) {
	settings := operation_setting.GetPaymentSetting()
	previous := *settings
	t.Cleanup(func() { *settings = previous })
	settings.Enabled = false

	for name, handler := range map[string]gin.HandlerFunc{
		"wallet":              RequestEpay,
		"legacy subscription": SubscriptionRequestEpay,
	} {
		t.Run(name, func(t *testing.T) {
			response := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(response)
			ctx.Request = httptest.NewRequest(http.MethodPost, "/pay", strings.NewReader(`{"amount":10,"plan_id":1,"payment_method":"ldc"}`))
			ctx.Request.Header.Set("Content-Type", "application/json")
			handler(ctx)
			require.Equal(t, http.StatusOK, response.Code)
			var body struct {
				Success bool   `json:"success"`
				Code    string `json:"code"`
			}
			require.NoError(t, common.Unmarshal(response.Body.Bytes(), &body))
			assert.False(t, body.Success)
			assert.Equal(t, "payment_channel_closed", body.Code)
		})
	}
}

func TestClosingCheckoutPreservesExistingOrderWebhook(t *testing.T) {
	settings := operation_setting.GetPaymentSetting()
	previous := *settings
	address, id, key, methods := operation_setting.PayAddress, operation_setting.EpayId, operation_setting.EpayKey, operation_setting.PayMethods
	t.Cleanup(func() {
		*settings = previous
		operation_setting.PayAddress, operation_setting.EpayId, operation_setting.EpayKey, operation_setting.PayMethods = address, id, key, methods
	})
	settings.ComplianceConfirmed = true
	settings.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
	settings.Enabled = false
	operation_setting.PayAddress = "https://payment.example"
	operation_setting.EpayId = "test-merchant"
	operation_setting.EpayKey = "test-key"
	operation_setting.PayMethods = []map[string]string{{"name": "LDC", "type": "ldc"}}
	assert.True(t, isEpayWebhookEnabled(), "callbacks for existing orders must not be disabled with checkout")
	settings.Enabled = true
	response := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(response)
	assert.True(t, requirePaymentChannelOpen(ctx))
	assert.Empty(t, response.Body.String())
}
