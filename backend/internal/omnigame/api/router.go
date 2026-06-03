package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/omnigame/api/handlers"
	"github.com/omninudge/backend/internal/omnigame/service"
	"github.com/omninudge/backend/internal/services"
)

func NewRouter(
	sessionService *service.SessionService,
	authService *services.AuthService,
	trustedProxies []string,
) *gin.Engine {
	router := gin.New()
	if err := router.SetTrustedProxies(trustedProxies); err != nil {
		panic(err)
	}
	router.Use(middleware.CORS())
	router.Use(gin.Recovery())

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	v1 := router.Group("/api/v1")
	v1.Use(middleware.AuthOptional(authService))
	launchHandler := handlers.NewLaunchHandler(
		sessionService,
		handlers.NewGuestIdentityResolver(trustedProxies),
	)
	v1.POST("/omnigame/launch/omnirave", launchHandler.CreateOmniRaveLaunch)
	v1.POST("/omnigame/session/exchange", launchHandler.ExchangeSession)

	protected := v1.Group("/omnigame/profile")
	protected.Use(middleware.AuthRequired(authService))
	profileHandler := handlers.NewProfileHandler(sessionService.ProfileService())
	protected.PUT("/omnirave/loadout", profileHandler.SaveLoadout)
	protected.PUT("/omnirave/return-point", profileHandler.SaveReturnPoint)
	protected.GET("/omnirave", profileHandler.GetProfile)

	return router
}
