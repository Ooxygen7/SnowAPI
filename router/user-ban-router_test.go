package router

import (
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestRegisterUserBanRoutesExposesOnlyIntendedAPIPaths(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	registerUserBanRoutes(engine.Group("/api"))

	routes := make(map[string]string)
	for _, route := range engine.Routes() {
		routes[route.Method+" "+route.Path] = route.Handler
	}
	expected := []string{
		"GET /api/user/relay-ban",
		"GET /api/user-relay-bans",
		"GET /api/user-relay-bans/readiness",
		"GET /api/user-relay-bans/:user_id/events",
		"POST /api/user-relay-bans/:user_id",
		"POST /api/user-relay-bans/:user_id/extend",
		"POST /api/user-relay-bans/:user_id/revoke",
	}
	for _, route := range expected {
		assert.Contains(t, routes, route)
	}
	assert.Len(t, routes, len(expected))
}
