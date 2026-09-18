package middleware

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// Applies only to dashboard APIs, never model relay endpoints. A clearance is
// additional bot mitigation and never replaces the route's own authentication.
func SnowShield() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !service.SnowShieldEnabled() || c.Request.Method == http.MethodOptions || service.HasSnowShieldClearance(c.Request) {
			c.Next()
			return
		}
		path := c.Request.URL.Path
		switch path {
		case "/api/security/shield", "/api/security/shield/verify", "/api/status", "/api/setup", "/api/user-agreement", "/api/privacy-policy", "/api/user/logout", "/api/user/epay/notify", "/api/subscription/epay/notify", "/api/subscription/epay/return":
			c.Next()
			return
		}
		// OAuth callbacks retain their own state/signature checks. Binding and
		// state-creation endpoints remain gated, so this is not a blanket bypass.
		if c.Request.Method == http.MethodGet && strings.HasPrefix(path, "/api/oauth/") && path != "/api/oauth/state" && !strings.HasSuffix(path, "/bind") {
			c.Next()
			return
		}
		if !strings.HasPrefix(path, "/api/") {
			c.Next()
			return
		}
		// Automation access tokens must actually validate; merely sending an
		// Authorization header must not bypass browser verification.
		if token := c.GetHeader("Authorization"); token != "" {
			if user, err := model.ValidateAccessToken(token); err == nil && user != nil {
				c.Next()
				return
			}
		}
		c.Header("Cache-Control", "no-store, private")
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"success": false, "code": "snow_shield_required", "message": "Browser verification required"})
	}
}
