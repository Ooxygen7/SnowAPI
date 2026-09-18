package controller

import (
	"net/http"
	"os"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetSnowShield(c *gin.Context) {
	c.Header("Cache-Control", "no-store, private")
	if !service.SnowShieldEnabled() {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"enabled": false, "verified": false}})
		return
	}
	if c.GetHeader("Sec-Fetch-Site") == "cross-site" {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	if err := service.ValidateSnowShieldSettings(); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "code": "snow_shield_unavailable"})
		return
	}
	if ticket, ok := service.ReadSnowShieldTicket(c.Request, service.SnowShieldClearanceCookie, "clearance"); ok {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"enabled": true, "verified": true, "verification_id": ticket.ID, "expires_in": ticket.Expires - time.Now().Unix()}})
		return
	}
	ticket, ok := service.ReadSnowShieldTicket(c.Request, service.SnowShieldChallengeCookie, "challenge")
	if !ok {
		var value string
		value, ticket = service.IssueSnowShieldTicket(c.Request, "challenge", service.SnowShieldChallengeTTL, "")
		service.SetSnowShieldCookie(c.Writer, service.SnowShieldChallengeCookie, value, int(service.SnowShieldChallengeTTL.Seconds()))
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"enabled": true, "verified": false, "site_key": common.TurnstileSiteKey, "verification_id": ticket.ID}})
}

func VerifySnowShield(c *gin.Context) {
	c.Header("Cache-Control", "no-store, private")
	if !service.SnowShieldEnabled() {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	if c.GetHeader("Origin") != "https://"+os.Getenv("SNOW_SHIELD_HOSTNAME") || c.GetHeader("Sec-Fetch-Site") == "cross-site" {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	ticket, valid := service.ReadSnowShieldTicket(c.Request, service.SnowShieldChallengeCookie, "challenge")
	var input struct {
		Token          string `json:"token"`
		VerificationID string `json:"verification_id"`
	}
	if !valid || c.ShouldBindJSON(&input) != nil || input.VerificationID != ticket.ID {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "code": "snow_shield_expired"})
		return
	}
	if err := service.VerifySnowShieldToken(c.Request.Context(), input.Token, ticket.ID, c.ClientIP()); err != nil {
		common.SysLog("SnowShield verification failed id=" + ticket.ID + " reason=" + err.Error())
		c.JSON(http.StatusForbidden, gin.H{"success": false, "code": "snow_shield_failed", "verification_id": ticket.ID})
		return
	}
	value, clearance := service.IssueSnowShieldTicket(c.Request, "clearance", service.SnowShieldClearanceTTL, ticket.ID)
	service.SetSnowShieldCookie(c.Writer, service.SnowShieldClearanceCookie, value, int(service.SnowShieldClearanceTTL.Seconds()))
	service.SetSnowShieldCookie(c.Writer, service.SnowShieldChallengeCookie, "", -1)
	c.JSON(http.StatusOK, gin.H{"success": true, "expires_in": clearance.Expires - time.Now().Unix()})
}
