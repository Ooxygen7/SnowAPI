package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"net/http"
	"strconv"
	"strings"
)

func GetSubscriptionCheckout(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}
	planId, err := strconv.Atoi(c.Query("plan_id"))
	if err != nil || planId <= 0 {
		common.ApiErrorMsg(c, "invalid plan id")
		return
	}
	quote, err := model.GetSubscriptionCheckoutQuote(c.GetInt("id"), planId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	methods := []gin.H{}
	if operation_setting.GetPaymentSetting().Enabled && isEpayTopUpEnabled() {
		money, err := model.SubscriptionGatewayAmount(quote.AmountDue, operation_setting.Price)
		if err == nil {
			seen := map[string]bool{}
			for _, method := range operation_setting.PayMethods {
				kind := strings.TrimSpace(method["type"])
				if kind == "" || kind == model.PaymentMethodBalance || seen[kind] {
					continue
				}
				seen[kind] = true
				name := strings.TrimSpace(method["name"])
				if name == "" {
					name = kind
				}
				methods = append(methods, gin.H{"type": kind, "name": name, "icon": method["icon"], "amount": money})
			}
		}
	}
	common.ApiSuccess(c, gin.H{"quote": quote, "payment_methods": methods})
}

func GetSubscriptionCheckoutStatus(c *gin.Context) {
	order := model.GetSubscriptionOrderByTradeNo(c.Query("trade_no"))
	if order == nil || order.UserId != c.GetInt("id") {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "order not found"})
		return
	}
	common.ApiSuccess(c, gin.H{"status": order.Status})
}
