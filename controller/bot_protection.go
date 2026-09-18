package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// Saving the coupled gate, domain, TTL and provider settings is atomic. Blank
// key fields preserve saved secrets, which the options endpoint never returns.
func UpdateBotProtection(c *gin.Context) {
	var input struct {
		SnowShieldEnabled      *bool   `json:"SnowShieldEnabled"`
		SnowShieldHostname     *string `json:"SnowShieldHostname"`
		SnowShieldTrustMinutes *int    `json:"SnowShieldTrustMinutes"`
		TurnstileCheckEnabled  *bool   `json:"TurnstileCheckEnabled"`
		TurnstileSiteKey       string  `json:"TurnstileSiteKey"`
		TurnstileSecretKey     string  `json:"TurnstileSecretKey"`
	}
	if common.DecodeJson(c.Request.Body, &input) != nil || input.SnowShieldEnabled == nil || input.SnowShieldHostname == nil || input.SnowShieldTrustMinutes == nil || input.TurnstileCheckEnabled == nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid request parameters"})
		return
	}
	settings := service.SnowShieldSettings{
		Enabled:      *input.SnowShieldEnabled,
		Hostname:     strings.ToLower(strings.TrimSpace(*input.SnowShieldHostname)),
		TrustMinutes: *input.SnowShieldTrustMinutes,
	}
	siteKey, secretKey := common.TurnstileSiteKey, common.TurnstileSecretKey
	values := map[string]string{"TurnstileCheckEnabled": strconv.FormatBool(*input.TurnstileCheckEnabled)}
	if value := strings.TrimSpace(input.TurnstileSiteKey); value != "" {
		siteKey = value
		values["TurnstileSiteKey"] = value
	}
	if value := strings.TrimSpace(input.TurnstileSecretKey); value != "" {
		secretKey = value
		values["TurnstileSecretKey"] = value
	}
	if err := service.ValidateSnowShieldConfiguration(settings, siteKey, secretKey); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if settings.Enabled && !strings.EqualFold(settings.Hostname, c.Request.Host) {
		common.ApiErrorMsg(c, "The SnowShield hostname must match the current site hostname")
		return
	}
	if *input.TurnstileCheckEnabled && (siteKey == "" || secretKey == "") {
		common.ApiErrorMsg(c, "Configure the Turnstile site key and secret key before enabling protection")
		return
	}
	encoded, err := common.Marshal(settings)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	values["SnowShieldSettings"] = string(encoded)
	if err := model.UpdateOptionsBulk(values); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}
