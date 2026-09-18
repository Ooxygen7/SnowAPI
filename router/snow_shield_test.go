package router

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type snowShieldTransport func(*http.Request) (*http.Response, error)

func (f snowShieldTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSnowShieldProtectsDashboardWithoutBreakingRelayAndCallbacks(t *testing.T) {
	t.Setenv("SNOW_SHIELD_ENABLED", "true")
	engine := gin.New()
	engine.Use(middleware.SnowShield())
	paths := []struct {
		path string
		want int
	}{
		{"/api/user/self", 403}, {"/api/user/login", 403}, {"/api/oauth/state", 403},
		{"/api/status", 200}, {"/v1/chat/completions", 200}, {"/v1/responses", 200}, {"/v1/messages", 200},
		{"/api/user/epay/notify", 200}, {"/api/subscription/epay/notify", 200}, {"/api/oauth/linuxdo", 200},
	}
	for _, tc := range paths {
		engine.GET(tc.path, func(c *gin.Context) { c.Status(200) })
	}
	for _, tc := range paths {
		r := httptest.NewRequest("GET", tc.path, nil)
		writer := httptest.NewRecorder()
		engine.ServeHTTP(writer, r)
		assert.Equal(t, tc.want, writer.Code, tc.path)
	}
	t.Run("logged-in-browser-with-expired-trust-is-still-challenged", func(t *testing.T) {
		r := httptest.NewRequest("GET", "/api/user/self", nil)
		r.AddCookie(&http.Cookie{Name: "session", Value: "existing-login-session"})
		value, _ := service.IssueSnowShieldTicket(r, "clearance", -time.Minute, "expired-visit")
		r.AddCookie(&http.Cookie{Name: service.SnowShieldClearanceCookie, Value: value})
		writer := httptest.NewRecorder()
		engine.ServeHTTP(writer, r)
		assert.Equal(t, http.StatusForbidden, writer.Code)
		assert.Contains(t, writer.Body.String(), "snow_shield_required")
		assert.Empty(t, writer.Header().Values("Set-Cookie"))
	})
	t.Setenv("SNOW_SHIELD_ENABLED", "false")
	writer := httptest.NewRecorder()
	engine.ServeHTTP(writer, httptest.NewRequest("GET", "/api/user/self", nil))
	assert.Equal(t, 200, writer.Code)
}

func TestSnowShieldVerificationIssuesIndependentClearance(t *testing.T) {
	t.Setenv("SNOW_SHIELD_ENABLED", "true")
	t.Setenv("SNOW_SHIELD_HOSTNAME", "api.example.test")
	oldSite, oldSecret, oldSecure := common.TurnstileSiteKey, common.TurnstileSecretKey, common.SessionCookieSecure
	common.TurnstileSiteKey, common.TurnstileSecretKey, common.SessionCookieSecure = "site-key", "secret-key", true
	t.Cleanup(func() {
		common.TurnstileSiteKey, common.TurnstileSecretKey, common.SessionCookieSecure = oldSite, oldSecret, oldSecure
	})
	engine := gin.New()
	engine.GET("/api/security/shield", controller.GetSnowShield)
	engine.POST("/api/security/shield/verify", controller.VerifySnowShield)
	start := httptest.NewRecorder()
	engine.ServeHTTP(start, httptest.NewRequest("GET", "https://api.example.test/api/security/shield", nil))
	require.Equal(t, 200, start.Code)
	var data struct {
		Data struct {
			ID      string `json:"verification_id"`
			SiteKey string `json:"site_key"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(start.Body.Bytes(), &data))
	require.NotEmpty(t, data.Data.ID)
	assert.Equal(t, "site-key", data.Data.SiteKey)
	assert.Equal(t, "no-store, private", start.Header().Get("Cache-Control"))
	challenge := start.Result().Cookies()[0]
	oldTransport := http.DefaultTransport
	t.Cleanup(func() { http.DefaultTransport = oldTransport })
	http.DefaultTransport = snowShieldTransport(func(r *http.Request) (*http.Response, error) {
		body, err := common.Marshal(map[string]any{"success": true, "hostname": "api.example.test", "action": "snow_shield", "cdata": data.Data.ID})
		require.NoError(t, err)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(body)), Header: make(http.Header)}, nil
	})
	for _, tc := range []struct {
		name, origin, id string
		cookie           bool
		status           int
	}{
		{"cross-origin", "https://evil.test", data.Data.ID, true, 403},
		{"missing-cookie", "https://api.example.test", data.Data.ID, false, 400},
		{"wrong-id", "https://api.example.test", "wrong", true, 400},
		{"verified", "https://api.example.test", data.Data.ID, true, 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body, err := common.Marshal(map[string]string{"token": "token", "verification_id": tc.id})
			require.NoError(t, err)
			r := httptest.NewRequest("POST", "https://api.example.test/api/security/shield/verify", bytes.NewReader(body))
			r.Header.Set("Origin", tc.origin)
			r.Header.Set("Content-Type", "application/json")
			if tc.cookie {
				r.AddCookie(challenge)
			}
			writer := httptest.NewRecorder()
			engine.ServeHTTP(writer, r)
			require.Equal(t, tc.status, writer.Code)
			assert.NotContains(t, strings.Join(writer.Header().Values("Set-Cookie"), ";"), "session=")
			if tc.status == 200 {
				cookies := writer.Result().Cookies()
				require.Len(t, cookies, 2)
				r2 := httptest.NewRequest("GET", "/api/user/self", nil)
				r2.AddCookie(cookies[0])
				assert.True(t, service.HasSnowShieldClearance(r2))
				assert.Equal(t, -1, cookies[1].MaxAge)
			}
		})
	}
}
