package controller

import (
	"github.com/QuantumNous/new-api/i18n"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIdentityBindingsRequireAuthenticatedSessionBeforeProcessingProof(t *testing.T) {
	require.NoError(t, i18n.Init())
	gin.SetMode(gin.TestMode)
	for _, test := range []struct {
		name    string
		handler gin.HandlerFunc
	}{
		{"email", EmailBind}, {"telegram", TelegramBind}, {"wechat", WeChatBind},
	} {
		t.Run(test.name, func(t *testing.T) {
			router := gin.New()
			router.Use(sessions.Sessions("session", cookie.NewStore([]byte("session-binding-test"))))
			router.POST("/bind", test.handler)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/bind", nil))
			assert.Equal(t, http.StatusUnauthorized, response.Code)
		})
	}
}
