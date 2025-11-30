package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/handlers"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/websocket"
	"github.com/omninudge/backend/internal/workers"
	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	log.Printf("Starting OmniNudge server...")

	// Connect to database
	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()
	log.Printf("Connected to PostgreSQL database: %s", cfg.Database.DBName)

	// Run database migrations
	log.Println("Running database migrations...")
	if err := db.Migrate(context.Background()); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}
	log.Println("Migrations complete")

	// Initialize repositories
	userRepo := models.NewUserRepository(db.Pool)
	userSettingsRepo := models.NewUserSettingsRepository(db.Pool)
	postRepo := models.NewPlatformPostRepository(db.Pool)
	commentRepo := models.NewPostCommentRepository(db.Pool)
	conversationRepo := models.NewConversationRepository(db.Pool)
	messageRepo := models.NewMessageRepository(db.Pool)
	mediaRepo := models.NewMediaFileRepository(db.Pool)
	hubRepo := models.NewHubRepository(db.Pool)
	reportRepo := models.NewReportRepository(db.Pool)
	hubModRepo := models.NewHubModeratorRepository(db.Pool)
	notificationRepo := models.NewNotificationRepository(db.Pool)
	baselineRepo := models.NewUserBaselineRepository(db.Pool)
	batchRepo := models.NewNotificationBatchRepository(db.Pool)
	slideshowRepo := models.NewSlideshowRepository(db.Pool)
	redditPostRepo := models.NewRedditPostRepository(db.Pool)
	feedRepo := models.NewFeedRepository(db.Pool)
	themeRepo := models.NewUserThemeRepository(db.Pool)
	themeOverrideRepo := models.NewUserThemeOverrideRepository(db.Pool)
	installedThemeRepo := models.NewUserInstalledThemeRepository(db.Pool)

	// Initialize WebSocket hub
	hub := websocket.NewHub()
	go hub.Run()

	// Initialize services
	authService := services.NewAuthService(
		cfg.Reddit.ClientID,
		cfg.Reddit.ClientSecret,
		cfg.Reddit.RedirectURI,
		cfg.JWT.Secret,
		cfg.Reddit.UserAgent,
	)
	var cache services.Cache = services.NoopCache{}
	if cfg.Redis.Addr != "" {
		cache = services.NewRedisCache(cfg.Redis.Addr, cfg.Redis.Password, 2*time.Second)
	}
	redditClient := services.NewRedditClient(cfg.Reddit.UserAgent, cache, time.Duration(cfg.Redis.TTLSeconds)*time.Second)

	// Initialize notification services
	notificationService := services.NewNotificationService(
		db.Pool,
		notificationRepo,
		baselineRepo,
		batchRepo,
		userSettingsRepo,
		postRepo,
		commentRepo,
		hub,
	)
	baselineCalculatorService := services.NewBaselineCalculatorService(db.Pool, baselineRepo)

	// Start background workers
	workerCtx := context.Background()
	workerManager := workers.NewWorkerManager(notificationService, baselineCalculatorService)
	workerManager.Start(workerCtx)

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(authService, userRepo)
	settingsHandler := handlers.NewSettingsHandler(userSettingsRepo)
	postsHandler := handlers.NewPostsHandler(postRepo, hubRepo, hubModRepo, feedRepo)
	commentsHandler := handlers.NewCommentsHandler(commentRepo, postRepo, hubModRepo)
	redditHandler := handlers.NewRedditHandler(redditClient, redditPostRepo)
	conversationsHandler := handlers.NewConversationsHandler(conversationRepo, messageRepo, userRepo)
	// Initialize thumbnail service
	thumbnailService := services.NewThumbnailService()

	// Initialize CSS sanitizer
	cssSanitizer := services.NewCSSSanitizer()

	messagesHandler := handlers.NewMessagesHandler(db.Pool, messageRepo, conversationRepo, hub)
	usersHandler := handlers.NewUsersHandler(userRepo, postRepo, commentRepo, authService)
	mediaHandler := handlers.NewMediaHandler(mediaRepo, thumbnailService)
	hubsHandler := handlers.NewHubsHandler(hubRepo, postRepo, hubModRepo)
	moderationHandler := handlers.NewModerationHandler(reportRepo, hubModRepo)
	adminHandler := handlers.NewAdminHandler(userRepo)
	wsHandler := handlers.NewWebSocketHandler(hub)
	notificationsHandler := handlers.NewNotificationsHandler(notificationRepo)
	searchHandler := handlers.NewSearchHandler(db.Pool)
	blockingHandler := handlers.NewBlockingHandler(db.Pool, userRepo)
	slideshowHandler := handlers.NewSlideshowHandler(db.Pool, slideshowRepo, conversationRepo, hub)
	mediaGalleryHandler := handlers.NewMediaGalleryHandler(db.Pool)
	userStatusHandler := handlers.NewUserStatusHandler(hub)
	themesHandler := handlers.NewThemesHandler(themeRepo, themeOverrideRepo, installedThemeRepo, userSettingsRepo, cssSanitizer)

	// Inject notification service into handlers
	postsHandler.SetNotificationService(notificationService)
	commentsHandler.SetNotificationService(notificationService)

	// Setup Gin router
	router := gin.Default()
	router.Static("/uploads", "./uploads")

	// Apply CORS middleware
	router.Use(middleware.CORS())

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()

		if err := db.Health(ctx); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status":   "unhealthy",
				"database": "disconnected",
				"error":    err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"status":   "healthy",
			"database": "connected",
		})
	})

	// API v1 routes
	api := router.Group("/api/v1")
	{
		// Ping endpoint (no auth required)
		api.GET("/ping", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"message": "pong",
			})
		})

		// Auth routes (no auth required)
		auth := api.Group("/auth")
		{
			// Username/password authentication
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)

			// Reddit OAuth (for future use)
			auth.GET("/reddit", authHandler.RedditLogin)
			auth.GET("/reddit/callback", authHandler.RedditCallback)
		}

		// Public posts routes (no auth required for viewing)
		posts := api.Group("/posts")
		{
			posts.GET("/feed", postsHandler.GetFeed)
			posts.GET("/:id", postsHandler.GetPost)
			posts.GET("/:id/comments", commentsHandler.GetComments)
		}

		// Public comments routes (no auth required for viewing)
		comments := api.Group("/comments")
		{
			comments.GET("/:id", commentsHandler.GetComment)
			comments.GET("/:id/replies", commentsHandler.GetCommentReplies)
		}

		// Public Reddit routes (no auth required - browsing only)
		reddit := api.Group("/reddit")
		{
			reddit.GET("/frontpage", redditHandler.GetFrontPage)
			reddit.GET("/r/:subreddit", redditHandler.GetSubredditPosts)
			reddit.GET("/r/:subreddit/media", redditHandler.GetSubredditMedia)
			reddit.GET("/r/:subreddit/comments/:postId", redditHandler.GetPostComments)
			reddit.GET("/search", redditHandler.SearchPosts)
		}

		// Local hub routes
		hubs := api.Group("/hubs")
		{
			hubs.GET("", hubsHandler.List)
			hubs.GET("/:name", hubsHandler.Get)
			hubs.GET("/:name/posts", hubsHandler.GetPosts)
		}

		// Public user profile routes
		users := api.Group("/users")
		{
			users.GET("/status", userStatusHandler.GetUsersStatus)
			users.GET("/:username", usersHandler.GetUserProfile)
			users.GET("/:username/posts", usersHandler.GetUserPosts)
			users.GET("/:username/comments", usersHandler.GetUserComments)
		}

		// Public search routes
		search := api.Group("/search")
		{
			search.GET("/posts", searchHandler.SearchPosts)
			search.GET("/comments", searchHandler.SearchComments)
			search.GET("/users", searchHandler.SearchUsers)
			search.GET("/hubs", searchHandler.SearchHubs)
		}

		// Protected routes (auth required)
		protected := api.Group("")
		protected.Use(middleware.AuthRequired(authService))
		{
			protected.GET("/auth/me", authHandler.GetMe)
			protected.POST("/auth/logout", authHandler.Logout)

			protected.GET("/settings", settingsHandler.GetSettings)
			protected.PUT("/settings", settingsHandler.UpdateSettings)

			// Theme customization routes with rate limiting
			themeCreationLimiter := middleware.ThemeCreationRateLimiter()
			themePreviewLimiter := middleware.ThemePreviewRateLimiter()
			generalLimiter := middleware.GeneralAPIRateLimiter()

			// Predefined themes (public access within protected routes, general rate limit)
			protected.GET("/themes/predefined", generalLimiter.Middleware(), themesHandler.GetPredefinedThemes)

			// Browse public themes (preview rate limit)
			protected.GET("/themes/browse", themePreviewLimiter.Middleware(), themesHandler.BrowseThemes)

			// User's own themes (creation/write operations use stricter limit)
			protected.POST("/themes", themeCreationLimiter.Middleware(), themesHandler.CreateTheme)
			protected.GET("/themes/my", generalLimiter.Middleware(), themesHandler.GetMyThemes)
			protected.GET("/themes/:id", themePreviewLimiter.Middleware(), themesHandler.GetTheme)
			protected.PUT("/themes/:id", themeCreationLimiter.Middleware(), themesHandler.UpdateTheme)
			protected.DELETE("/themes/:id", themeCreationLimiter.Middleware(), themesHandler.DeleteTheme)

			// Theme installation & activation (general rate limit)
			protected.POST("/themes/install", generalLimiter.Middleware(), themesHandler.InstallTheme)
			protected.DELETE("/themes/install/:themeId", generalLimiter.Middleware(), themesHandler.UninstallTheme)
			protected.POST("/themes/active", generalLimiter.Middleware(), themesHandler.SetActiveTheme)
			protected.GET("/themes/installed", generalLimiter.Middleware(), themesHandler.GetInstalledThemes)

			// Per-page theme overrides (Level 4, creation limit for writes)
			protected.POST("/themes/overrides", themeCreationLimiter.Middleware(), themesHandler.SetPageOverride)
			protected.GET("/themes/overrides", generalLimiter.Middleware(), themesHandler.GetAllOverrides)
			protected.GET("/themes/overrides/:pageName", generalLimiter.Middleware(), themesHandler.GetPageOverride)
			protected.DELETE("/themes/overrides/:pageName", themeCreationLimiter.Middleware(), themesHandler.DeletePageOverride)

			// Advanced mode toggle (general rate limit)
			protected.POST("/themes/advanced-mode", generalLimiter.Middleware(), themesHandler.SetAdvancedMode)

			// Theme rating & reviews (Phase 2c, general rate limit)
			protected.POST("/themes/rate", generalLimiter.Middleware(), themesHandler.RateTheme)

			// Protected posts routes (auth required for creating/editing)
			protected.POST("/posts", postsHandler.CreatePost)
			protected.PUT("/posts/:id", postsHandler.UpdatePost)
			protected.DELETE("/posts/:id", postsHandler.DeletePost)
			protected.POST("/posts/:id/vote", postsHandler.VotePost)

			// Protected comments routes (auth required for creating/editing)
			protected.POST("/posts/:id/comments", commentsHandler.CreateComment)
			protected.PUT("/comments/:id", commentsHandler.UpdateComment)
			protected.DELETE("/comments/:id", commentsHandler.DeleteComment)
			protected.POST("/comments/:id/vote", commentsHandler.VoteComment)

			// Protected hub creation
			protected.POST("/hubs", hubsHandler.Create)

			// Protected conversations routes
			protected.POST("/conversations", conversationsHandler.CreateConversation)
			protected.GET("/conversations", conversationsHandler.GetConversations)
			protected.GET("/conversations/:id", conversationsHandler.GetConversation)
			protected.DELETE("/conversations/:id", conversationsHandler.DeleteConversation)

			// Protected messages routes
			protected.POST("/messages", messagesHandler.SendMessage)
			protected.GET("/conversations/:id/messages", messagesHandler.GetMessages)
			protected.POST("/conversations/:id/read", messagesHandler.MarkAsRead)
			protected.POST("/messages/:id/read", messagesHandler.MarkSingleMessageAsRead)
			protected.DELETE("/messages/:id", messagesHandler.DeleteMessage)

			// Slideshow routes
			protected.POST("/conversations/:id/slideshow", slideshowHandler.StartSlideshow)
			protected.GET("/conversations/:id/slideshow", slideshowHandler.GetSlideshow)
			protected.POST("/slideshows/:id/navigate", slideshowHandler.NavigateSlideshow)
			protected.POST("/slideshows/:id/transfer-control", slideshowHandler.TransferControl)
			protected.PUT("/slideshows/:id/auto-advance", slideshowHandler.UpdateAutoAdvance)
			protected.DELETE("/slideshows/:id", slideshowHandler.StopSlideshow)

			// Media gallery routes
			protected.GET("/conversations/:id/media", mediaGalleryHandler.GetConversationMedia)
			protected.GET("/conversations/:id/media/:messageId/index", mediaGalleryHandler.FindMediaIndex)

			// Media upload (with rate limiting: 10 uploads per minute)
			uploadRateLimiter := middleware.UploadRateLimiter()
			protected.POST("/media/upload", uploadRateLimiter.Middleware(), mediaHandler.UploadMedia)

			// User profile management
			protected.PUT("/users/profile", usersHandler.UpdateProfile)
			protected.POST("/users/change-password", usersHandler.ChangePassword)

			// User blocking
			protected.POST("/users/block", blockingHandler.BlockUser)
			protected.DELETE("/users/block/:username", blockingHandler.UnblockUser)
			protected.GET("/users/blocked", blockingHandler.GetBlockedUsers)

			// Notifications
			protected.GET("/notifications", notificationsHandler.GetNotifications)
			protected.GET("/notifications/unread/count", notificationsHandler.GetUnreadCount)
			protected.POST("/notifications/:id/read", notificationsHandler.MarkAsRead)
			protected.POST("/notifications/read-all", notificationsHandler.MarkAllAsRead)
			protected.DELETE("/notifications/:id", notificationsHandler.DeleteNotification)

			// Moderation reports
			protected.POST("/reports", moderationHandler.CreateReport)
			// Admin/mod endpoints
			mod := protected.Group("/mod")
			mod.Use(middleware.RequireRole("moderator", "admin"))
			{
				mod.GET("/reports", moderationHandler.ListReports)
				mod.POST("/reports/:id/status", moderationHandler.UpdateReportStatus)
			}

			// Admin endpoints
			admin := protected.Group("/admin")
			admin.Use(middleware.RequireRole("admin"))
			{
				admin.POST("/users/:id/role", adminHandler.PromoteUser)
				admin.POST("/hubs/:name/moderators", hubsHandler.AddModerator)
			}

			// WebSocket endpoint for real-time messaging
			protected.GET("/ws", wsHandler.HandleWebSocket)
		}
	}

	// Create HTTP server
	addr := cfg.Server.Host + ":" + cfg.Server.Port
	srv := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in a goroutine
	go func() {
		log.Printf("Server listening on http://%s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	// Give outstanding requests 5 seconds to complete
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
