package controller

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

// Gate only new orders. Existing signed callbacks must still settle while
// operators pause checkout, so webhook availability stays independent.
func requirePaymentChannelOpen(c *gin.Context) bool {
	if operation_setting.GetPaymentSetting().Enabled {
		return true
	}
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"code": "payment_channel_closed",
		"message": "The payment channel is currently closed.",
	})
	return false
}

func isEpayTopUpEnabled() bool {
	if !operation_setting.IsPaymentComplianceConfirmed() {
		return false
	}
	return isEpayWebhookConfigured() && len(operation_setting.PayMethods) > 0
}

func isEpayWebhookConfigured() bool {
	return strings.TrimSpace(operation_setting.PayAddress) != "" &&
		strings.TrimSpace(operation_setting.EpayId) != "" &&
		strings.TrimSpace(operation_setting.EpayKey) != ""
}

func isEpayWebhookEnabled() bool {
	return isEpayTopUpEnabled()
}
