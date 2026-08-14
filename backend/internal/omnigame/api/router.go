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
	admissionService *service.AdmissionService,
	personaAdmission *services.PersonaAdmissionAuth,
	worldEvents *services.WorldEventAuth,
	characterMemory *services.OmniChatMemoryService,
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

	// Registered off router rather than v1 on purpose. v1 carries AuthOptional,
	// which attaches a browser identity whenever a site cookie happens to be
	// present; this path must have no browser identity attached to it at all,
	// so that a signed-in user's session can never be part of what admits a
	// character. RequirePersonaAdmission is the only credential it accepts.
	//
	// The world is named in the path deliberately. OmniVerse will need its own
	// admission shape -- a different token, a different set of eligibility
	// rules -- and a single generic /admit endpoint would have to grow a mode
	// switch that decides which world's rules apply. One route per world keeps
	// each world's rules where they can be read.
	personaAdmissionHandler := handlers.NewPersonaAdmissionHandler(admissionService)
	router.POST(
		"/api/v1/omnigame/admit/omnirave",
		middleware.RequirePersonaAdmission(personaAdmission),
		personaAdmissionHandler.AdmitOmniRave,
	)

	// Off router rather than v1 for the same reason admission is: v1 carries
	// AuthOptional, and a browser identity must never be part of what writes a
	// character's own memory. The self tier is read by everyone who talks to
	// that character, so a user who could write it could put words in its
	// mouth for every other user. RequireWorldEvent is the only credential
	// this path accepts, and it is not the admission credential either.
	//
	// The world is named in the path deliberately, as it is for admission.
	// OmniVerse reports different things about a different kind of presence,
	// and a single generic /world-event endpoint would have to grow a mode
	// switch deciding whose rules apply to a write into character memory.
	worldEventHandler := handlers.NewWorldEventHandler(characterMemory)
	router.POST(
		"/api/v1/omnigame/world-event/omnirave",
		middleware.RequireWorldEvent(worldEvents),
		worldEventHandler.RecordOmniRave,
	)

	v1 := router.Group("/api/v1")
	v1.Use(middleware.AuthOptional(authService))
	launchHandler := handlers.NewLaunchHandler(
		sessionService,
		handlers.NewGuestIdentityResolver(trustedProxies),
	)
	runtimeAuthHandler := handlers.NewRuntimeAuthHandler(handlers.NewRuntimeAuthService(sessionService, authService))
	v1.POST("/omnigame/launch/omnirave", launchHandler.CreateOmniRaveLaunch)
	v1.POST("/omnigame/session/exchange", launchHandler.ExchangeSession)
	v1.POST("/omnigame/runtime/auth/login", runtimeAuthHandler.Login)
	v1.POST("/omnigame/runtime/auth/signup", runtimeAuthHandler.Signup)
	v1.POST("/omnigame/runtime/auth/logout", runtimeAuthHandler.Logout)

	protected := v1.Group("/omnigame/profile")
	protected.Use(middleware.AuthRequired(authService))
	profileHandler := handlers.NewProfileHandler(sessionService.ProfileService())
	protected.PUT("/omnirave/loadout", profileHandler.SaveLoadout)
	protected.PUT("/omnirave/settings", profileHandler.SaveRuntimeSettings)
	protected.PUT("/omnirave/last-venue", profileHandler.SaveLastVenue)
	protected.PUT("/omnirave/return-point", profileHandler.SaveReturnPoint)
	protected.GET("/omnirave", profileHandler.GetProfile)

	return router
}
