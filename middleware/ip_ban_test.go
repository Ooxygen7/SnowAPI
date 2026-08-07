package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUntrustedDirectClientCannotForgeRelayAuditIP(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	require.NoError(t, router.SetTrustedProxies([]string{"127.0.0.1", "::1"}))
	observed := ""
	router.GET("/relay", func(c *gin.Context) {
		observed = c.ClientIP()
		c.Status(http.StatusNoContent)
	})

	request := httptest.NewRequest(http.MethodGet, "/relay", nil)
	request.RemoteAddr = "9.9.9.9:54321"
	request.Header.Set("X-Forwarded-For", "8.8.8.8")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	assert.Equal(t, http.StatusNoContent, response.Code)
	assert.Equal(t, "9.9.9.9", observed)
}

func TestRelayBanStopsRequestBeforeHandler(t *testing.T) {
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open("file:relay-ban-middleware?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })
	require.NoError(t, db.AutoMigrate(&model.UserRelayBan{}))
	now := time.Now().Unix()
	require.NoError(t, db.Create(&model.UserRelayBan{
		UserID:    123,
		Source:    model.RelayBanSourceManual,
		Reason:    "test fixture",
		StartsAt:  now - 60,
		ExpiresAt: 0,
		Version:   1,
		CreatedAt: now - 60,
		UpdatedAt: now - 60,
	}).Error)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handlerCalled := false
	router.Use(func(c *gin.Context) {
		c.Set("id", 123)
		c.Set("username", "relay-ban-user")
		c.Next()
	})
	router.Use(RelayIPAuditAndBan())
	router.POST("/relay", func(c *gin.Context) {
		handlerCalled = true
		c.Status(http.StatusNoContent)
	})

	request := httptest.NewRequest(http.MethodPost, "/relay", strings.NewReader(`{}`))
	request.RemoteAddr = "9.9.9.9:54321"
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	assert.Equal(t, http.StatusForbidden, response.Code)
	assert.False(t, handlerCalled)
	assert.Contains(t, response.Body.String(), `"code":"user_relay_banned"`)
	assert.Contains(t, response.Body.String(), "您已被封禁，请联系管理员。")
}
