package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

// registerUserBanRoutes is called from SetApiRouter so ordinary users can read
// only their current relay-ban status while administrators receive the
// evidence and mutation surface.
func registerUserBanRoutes(apiRouter *gin.RouterGroup) {
	apiRouter.GET("/user/relay-ban", middleware.UserAuth(), controller.GetSelfRelayBan)

	admin := apiRouter.Group("/user-relay-bans")
	admin.Use(middleware.AdminAuth())
	{
		admin.GET("", controller.ListUserRelayBans)
		admin.GET("/readiness", controller.GetRelayBanReadiness)
		admin.GET("/:user_id/events", controller.GetRelayBanEvents)
		admin.POST("/:user_id", middleware.CriticalRateLimit(), controller.ApplyManualRelayBan)
		admin.POST("/:user_id/extend", middleware.CriticalRateLimit(), controller.ExtendRelayBan)
		admin.POST("/:user_id/revoke", middleware.CriticalRateLimit(), controller.RevokeRelayBan)
	}
}
