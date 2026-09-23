package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
)

func registerMinimalModeRoutes(apiRouter *gin.RouterGroup) {
	readRoute := apiRouter.Group("/minimal-mode")
	readRoute.Use(middleware.AdminAuth(), middleware.RequirePermission(authz.ChannelRead))
	readRoute.GET("", controller.GetMinimalMode)

	settingsRoute := apiRouter.Group("/minimal-mode")
	settingsRoute.Use(
		middleware.RootAuth(),
		middleware.CriticalRateLimit(),
		middleware.DisableCache(),
		middleware.SecureVerificationRequired(),
	)
	settingsRoute.PUT("", controller.UpdateMinimalMode)

	writeRoute := apiRouter.Group("/minimal-mode")
	writeRoute.Use(
		middleware.AdminAuth(),
		middleware.RequirePermission(authz.ChannelSensitiveWrite),
		middleware.CriticalRateLimit(),
		middleware.DisableCache(),
		middleware.SecureVerificationRequired(),
	)
	writeRoute.POST("/upstream-models", controller.DiscoverMinimalModeModels)
	writeRoute.POST("/sources", controller.CreateMinimalModeSource)
	writeRoute.POST("/sources/batch", controller.CreateMinimalModeSources)
	writeRoute.PUT("/sources/:id", controller.UpdateMinimalModeSource)
	writeRoute.POST("/sources/:id/adopt", controller.AdoptMinimalModeSource)
	writeRoute.POST("/sources/:id/detach", controller.DetachMinimalModeSource)
	writeRoute.DELETE("/sources/:id", controller.DeleteMinimalModeSource)
}
