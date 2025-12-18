package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/handlers"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/websocket"
	"github.com/omninudge/backend/internal/workers"
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

	if cfg.Database.AutoMigrate {
		log.Println("Running database migrations...")
		if err := db.Migrate(context.Background()); err != nil {
			log.Fatalf("Failed to run migrations: %v", err)
		}
		log.Println("Migrations complete")
	} else {
		log.Println("Skipping embedded database migrations (DB_AUTO_MIGRATE=false)")
	}

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
	redditCommentRepo := models.NewRedditPostCommentRepository(db.Pool)
	savedItemsRepo := models.NewSavedItemsRepository(db.Pool)
	hubSubRepo := models.NewHubSubscriptionRepository(db.Pool)
	subredditSubRepo := models.NewSubredditSubscriptionRepository(db.Pool)

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
	postsHandler := handlers.NewPostsHandler(postRepo, hubRepo, userRepo, hubModRepo, feedRepo)
	commentsHandler := handlers.NewCommentsHandler(commentRepo, postRepo, hubModRepo)
	redditHandler := handlers.NewRedditHandler(redditClient, redditPostRepo)
	conversationsHandler := handlers.NewConversationsHandler(conversationRepo, messageRepo, userRepo)
	// Initialize thumbnail service
	thumbnailService := services.NewThumbnailService()

	// Initialize CSS sanitizer
	cssSanitizer := services.NewCSSSanitizer()

	messagesHandler := handlers.NewMessagesHandler(db.Pool, messageRepo, conversationRepo, hub)
	usersHandler := handlers.NewUsersHandler(userRepo, postRepo, commentRepo, authService, hubModRepo)
	mediaHandler := handlers.NewMediaHandler(mediaRepo, thumbnailService)
	hubsHandler := handlers.NewHubsHandler(hubRepo, postRepo, hubModRepo, hubSubRepo)
	subscriptionsHandler := handlers.NewSubscriptionsHandler(hubSubRepo, subredditSubRepo, hubRepo)
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
	redditCommentsHandler := handlers.NewRedditCommentsHandler(redditCommentRepo)
	savedItemsHandler := handlers.NewSavedItemsHandler(savedItemsRepo, postRepo, commentRepo, redditCommentRepo, redditClient)
	feedHandler := handlers.NewFeedHandler(postRepo, hubSubRepo, subredditSubRepo, redditClient)

	// Inject notification service into handlers
	postsHandler.SetNotificationService(notificationService)
	commentsHandler.SetNotificationService(notificationService)

	// Setup Gin router
	router := gin.Default()

	// Apply CORS middleware BEFORE static files
	router.Use(middleware.CORS())

	// Serve static files with CORS headers
	router.Static("/uploads", "./uploads")

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

		// Combined feed routes (optional auth)
		feed := api.Group("/feed")
		feed.Use(middleware.AuthOptional(authService))
		{
			feed.GET("/home", feedHandler.GetHomeFeed)
		}

		// Public posts routes (no auth required for viewing)
		posts := api.Group("/posts")
		posts.Use(middleware.AuthOptional(authService))
		{
			posts.GET("/feed", postsHandler.GetFeed)
			posts.GET("/:id", postsHandler.GetPost)
			posts.GET("/:id/comments", commentsHandler.GetComments)
		}

		// Public comments routes (no auth required for viewing)
		comments := api.Group("/comments")
		comments.Use(middleware.AuthOptional(authService))
		{
			comments.GET("/:id", commentsHandler.GetComment)
			comments.GET("/:id/replies", commentsHandler.GetCommentReplies)
		}

		// Public Reddit routes (no auth required - browsing only)
		reddit := api.Group("/reddit")
		reddit.Use(middleware.AuthOptional(authService))
		{
			reddit.GET("/frontpage", redditHandler.GetFrontPage)
			reddit.GET("/subreddits/autocomplete", redditHandler.AutocompleteSubreddits)
			reddit.GET("/r/:subreddit", redditHandler.GetSubredditPosts)
			reddit.GET("/r/:subreddit/media", redditHandler.GetSubredditMedia)
			reddit.GET("/r/:subreddit/comments/:postId", redditHandler.GetPostComments)
			reddit.GET("/search", redditHandler.SearchPosts)
			reddit.GET("/user/:username/about", redditHandler.GetRedditUserAbout)
			reddit.GET("/user/:username/trophies", redditHandler.GetRedditUserTrophies)
			reddit.GET("/user/:username/moderated", redditHandler.GetRedditUserModerated)
			reddit.GET("/user/:username/:section", redditHandler.GetRedditUserListing)

			// Local comments on Reddit posts (site-only comments)
			reddit.GET("/posts/:subreddit/:postId/comments", redditCommentsHandler.GetRedditPostComments)
		}

		// Local hub routes (public feeds, optional auth for user context)
		hubs := api.Group("/hubs")
		hubs.Use(middleware.AuthOptional(authService))
		{
			hubs.GET("", hubsHandler.List)
			hubs.GET("/h/all", hubsHandler.GetAllFeed)
			hubs.GET("/h/popular", hubsHandler.GetPopularFeed)
			hubs.GET("/search", hubsHandler.SearchHubs)
			hubs.GET("/trending", hubsHandler.GetTrendingHubs)
			hubs.GET("/:name", hubsHandler.Get)
			hubs.GET("/:name/posts", hubsHandler.GetPosts)
		}

		// Hub subscription check (optional auth)
		hubsOptAuth := api.Group("/hubs")
		hubsOptAuth.Use(middleware.AuthOptional(authService))
		{
			hubsOptAuth.GET("/:name/subscription", subscriptionsHandler.CheckHubSubscription)
		}

		// Local subreddit crosspost feeds (no auth required to view, optional auth for context)
		subreddits := api.Group("/subreddits")
		subreddits.Use(middleware.AuthOptional(authService))
		{
			subreddits.GET("/:name/posts", postsHandler.GetSubredditPosts)
			subreddits.GET("/:name/subscription", subscriptionsHandler.CheckSubredditSubscription)
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
			protected.PUT("/auth/public-key", authHandler.UpdatePublicKey)
			protected.GET("/auth/public-keys", authHandler.GetPublicKeys)

			protected.GET("/settings", settingsHandler.GetSettings)
			protected.PUT("/settings", settingsHandler.UpdateSettings)
			protected.GET("/users/me/saved", savedItemsHandler.GetSavedItems)
			protected.GET("/users/me/hidden", savedItemsHandler.GetHiddenItems)

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
			protected.POST("/posts/:id/save", savedItemsHandler.SavePost)
			protected.DELETE("/posts/:id/save", savedItemsHandler.UnsavePost)
			protected.POST("/posts/:id/hide", savedItemsHandler.HidePost)
			protected.DELETE("/posts/:id/hide", savedItemsHandler.UnhidePost)
			protected.POST("/posts/:id/comments/:commentId/preferences", commentsHandler.UpdateCommentPreferences)

			// Protected comments routes (auth required for creating/editing)
			protected.POST("/posts/:id/comments", commentsHandler.CreateComment)
			protected.PUT("/comments/:id", commentsHandler.UpdateComment)
			protected.DELETE("/comments/:id", commentsHandler.DeleteComment)
			protected.POST("/comments/:id/vote", commentsHandler.VoteComment)
			protected.POST("/saved/comments/:commentId", savedItemsHandler.SavePostComment)
			protected.DELETE("/saved/comments/:commentId", savedItemsHandler.UnsavePostComment)

			// Protected Reddit post comments routes (site-only comments on Reddit posts)
			protected.POST("/reddit/posts/:subreddit/:postId/comments", redditCommentsHandler.CreateRedditPostComment)
			protected.PUT("/reddit/posts/:subreddit/:postId/comments/:commentId", redditCommentsHandler.UpdateRedditPostComment)
			protected.DELETE("/reddit/posts/:subreddit/:postId/comments/:commentId", redditCommentsHandler.DeleteRedditPostComment)
			protected.POST("/reddit/posts/:subreddit/:postId/comments/:commentId/preferences", redditCommentsHandler.UpdateRedditPostCommentPreferences)
			protected.POST("/reddit/posts/:subreddit/:postId/comments/:commentId/vote", redditCommentsHandler.VoteRedditPostComment)
			protected.POST("/reddit/posts/:subreddit/:postId/comments/:commentId/save", savedItemsHandler.SaveRedditComment)
			protected.DELETE("/reddit/posts/:subreddit/:postId/comments/:commentId/save", savedItemsHandler.UnsaveRedditComment)
			protected.POST("/reddit/posts/:subreddit/:postId/save", savedItemsHandler.SaveRedditPost)
			protected.DELETE("/reddit/posts/:subreddit/:postId/save", savedItemsHandler.UnsaveRedditPost)
			protected.POST("/reddit/posts/:subreddit/:postId/hide", savedItemsHandler.HideRedditPost)
			protected.DELETE("/reddit/posts/:subreddit/:postId/hide", savedItemsHandler.UnhideRedditPost)

			// Protected hub creation and crossposting
			protected.POST("/hubs", hubsHandler.Create)
			protected.GET("/users/me/hubs", hubsHandler.GetUserHubs)
			protected.POST("/hubs/:name/crosspost", hubsHandler.CrosspostToHub)
			protected.POST("/subreddits/:name/crosspost", hubsHandler.CrosspostToSubreddit)

			// Hub subscription routes (auth required)
			protected.POST("/hubs/:name/subscribe", subscriptionsHandler.SubscribeToHub)
			protected.DELETE("/hubs/:name/unsubscribe", subscriptionsHandler.UnsubscribeFromHub)
			protected.GET("/users/me/subscriptions/hubs", subscriptionsHandler.GetUserHubSubscriptions)

			// Subreddit subscription routes (auth required)
			protected.POST("/subreddits/:name/subscribe", subscriptionsHandler.SubscribeToSubreddit)
			protected.DELETE("/subreddits/:name/unsubscribe", subscriptionsHandler.UnsubscribeFromSubreddit)
			protected.GET("/users/me/subscriptions/subreddits", subscriptionsHandler.GetUserSubredditSubscriptions)

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
			protected.POST("/users/me/ping", usersHandler.Ping)

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
