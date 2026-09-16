package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestPasswordRecoveryEndpointsAreRemoved(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	SetApiRouter(router)
	for _, request := range []struct{ method, path string }{
		{http.MethodGet, "/api/reset_password?email=example@example.com"},
		{http.MethodPost, "/api/user/reset"},
	} {
		t.Run(request.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(request.method, request.path, strings.NewReader(`{"email":"example@example.com","token":"old-link"}`)))
			assert.Equal(t, http.StatusNotFound, response.Code)
		})
	}
}
