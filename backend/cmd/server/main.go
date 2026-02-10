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
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/handlers"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/queue"
	"github.com/omninudge/backend/internal/monitoring"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/utils"
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

	// Initialize email encryption
	if err := utils.SetEncryptionKey(cfg.Encryption.Key); err != nil {
		log.Fatalf("Failed to initialize email encryption: %v", err)
	}
	log.Println("Email encryption initialized")

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
	passwordResetRepo := models.NewPasswordResetRepository(db.Pool)
	feedRepo := models.NewFeedRepository(db.Pool)
	themeRepo := models.NewUserThemeRepository(db.Pool)
	themeOverrideRepo := models.NewUserThemeOverrideRepository(db.Pool)
	installedThemeRepo := models.NewUserInstalledThemeRepository(db.Pool)
	redditCommentRepo := models.NewRedditPostCommentRepository(db.Pool)
	savedItemsRepo := models.NewSavedItemsRepository(db.Pool)
	hubSubRepo := models.NewHubSubscriptionRepository(db.Pool)
	subredditSubRepo := models.NewSubredditSubscriptionRepository(db.Pool)

	// Moderation Phase 1 repositories
	hubBanRepo := models.NewHubBanRepository(db.Pool)
	removalReasonRepo := models.NewRemovalReasonRepository(db.Pool)
	removedContentRepo := models.NewRemovedContentRepository(db.Pool)
	modLogRepo := models.NewModLogRepository(db.Pool)

	// Hub Settings and Themes repositories (from repository package)
	hubSettingsRepo := repository.NewHubSettingsRepository(db.Pool)
	hubThemesRepo := repository.NewHubThemesRepository(db.Pool)
	hubWikiRepo := repository.NewHubWikiRepository(db.Pool)

	// Access request repository
	hubAccessRequestRepo := models.NewHubAccessRequestRepository(db.Pool)

	// Bug reporting repositories
	bugReportRepo := models.NewBugReportRepository(db.Pool)
	knownBugRepo := models.NewKnownBugRepository(db.Pool)

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
		cfg.Turnstile.Secret,
	)
	var cache services.Cache
	if cfg.Redis.Addr != "" {
		cache = services.NewRedisCache(cfg.Redis.Addr, cfg.Redis.Password, 2*time.Second)
	} else {
		// Use in-memory cache as fallback
		cache = services.NewMemoryCache()
		log.Println("Using in-memory cache (Redis not configured)")
	}
	redditClient := services.NewRedditClient(
		cfg.Reddit.UserAgent,
		cache,
		time.Duration(cfg.Redis.TTLSeconds)*time.Second,
		cfg.Reddit.ClientID,
		cfg.Reddit.ClientSecret,
	)

	// Initialize job queue client (P0-002)
	var queueClient *queue.QueueClient
	if cfg.Redis.Addr != "" {
		queueClient = queue.NewQueueClient(cfg.Redis.Addr, cfg.Redis.Password)
		log.Println("Job queue client initialized")
	} else {
		log.Println("Warning: Job queue disabled (Redis not configured)")
	}

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

	// Initialize feature flag service (P0-012)
	featureFlagService := services.NewFeatureFlagService(db.Pool)

	// Initialize analytics service (P0-027)
	analyticsService := services.NewAnalyticsService(db.Pool)

	// Initialize Firebase Cloud Messaging (P0-042)
	var firebaseService *services.FirebaseService
	if cfg.Firebase.CredentialsPath != "" {
		var err error
		firebaseService, err = services.NewFirebaseService(cfg.Firebase.CredentialsPath)
		if err != nil {
			log.Printf("Warning: Failed to initialize Firebase: %v", err)
		}
	} else {
		log.Println("Firebase credentials not configured, push notifications disabled")
	}

	// Initialize email service (P0-036)
	emailService := services.NewEmailService(
		cfg.SMTP.Host,
		cfg.SMTP.Port,
		cfg.SMTP.User,
		cfg.SMTP.Password,
		cfg.SMTP.FromAddress,
		cfg.SMTP.FromName,
	)
	if cfg.SMTP.Host != "" {
		log.Println("Email service initialized")
	} else {
		log.Println("Warning: SMTP not configured, emails will not be sent")
	}

	// Start job queue worker (P0-002: background job processing)
	if queueClient != nil && cfg.Redis.Addr != "" {
		jobWorker := queue.NewWorker(cfg.Redis.Addr, cfg.Redis.Password, 10) // 10 concurrent workers

		// Register job handlers
		jobWorker.RegisterAllHandlers(queue.JobHandlers{
			EmailSend:  queue.NewEmailHandler(emailService),
			DataExport: queue.NewDataExportHandler(db.Pool),
			// Other handlers still use placeholders for now
			VirusScan:           queue.HandleVirusScan,
			Transcription:       queue.HandleTranscription,
			Notification:        queue.HandleNotification,
			ThumbnailGeneration: queue.HandleThumbnailGeneration,
			ContentModeration:   queue.HandleContentModeration,
		})

		// Start worker in background
		go func() {
			log.Println("Starting job queue worker...")
			if err := jobWorker.Start(); err != nil {
				log.Printf("Job queue worker error: %v", err)
			}
		}()
		log.Println("Job queue worker started with 10 concurrent workers")
	}

	// Start background workers
	workerCtx := context.Background()
	workerManager := workers.NewWorkerManager(notificationService, baselineCalculatorService)
	workerManager.Start(workerCtx)

	// Start account cleanup worker (P0-017: permanently delete accounts after grace period)
	accountCleanupWorker := workers.NewAccountCleanupWorker(db.Pool)
	go accountCleanupWorker.Start(workerCtx)

	// Start data retention worker (P0-034: automated data deletion per retention policy)
	dataRetentionWorker := workers.NewDataRetentionWorker(db.Pool)
	go dataRetentionWorker.Start(workerCtx)

	// Initialize repositories for email verification
	emailVerificationRepo := models.NewEmailVerificationRepository(db.Pool)

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(authService, userRepo, emailService, passwordResetRepo, emailVerificationRepo, cfg.FrontendURL)
	settingsHandler := handlers.NewSettingsHandler(userSettingsRepo)
	postsHandler := handlers.NewPostsHandler(db.Pool, postRepo, hubRepo, userRepo, hubModRepo, feedRepo, hubSettingsRepo)
	commentsHandler := handlers.NewCommentsHandler(db.Pool, commentRepo, postRepo, hubRepo, userRepo, hubModRepo)
	redditHandler := handlers.NewRedditHandler(redditClient, redditPostRepo)
	conversationsHandler := handlers.NewConversationsHandler(db.Pool, conversationRepo, messageRepo, userRepo)
	// Initialize thumbnail service
	thumbnailService := services.NewThumbnailService()

	// Initialize CSS sanitizer
	cssSanitizer := services.NewCSSSanitizer()

	messagesHandler := handlers.NewMessagesHandler(db.Pool, messageRepo, conversationRepo, userSettingsRepo, hub, firebaseService)
	usersHandler := handlers.NewUsersHandler(userRepo, postRepo, commentRepo, authService, hubModRepo)
	mediaHandler := handlers.NewMediaHandler(mediaRepo, thumbnailService)
	hubsHandler := handlers.NewHubsHandlerWithAccessRequest(hubRepo, postRepo, hubModRepo, hubSubRepo, hubSettingsRepo, hubAccessRequestRepo)
	subscriptionsHandler := handlers.NewSubscriptionsHandler(hubSubRepo, subredditSubRepo, hubRepo)
	moderationHandler := handlers.NewModerationHandler(reportRepo, hubModRepo)
	moderationHandlerV2 := handlers.NewModerationHandlerV2(
		hubBanRepo,
		removalReasonRepo,
		removedContentRepo,
		modLogRepo,
		postRepo,
		commentRepo,
	)
	adminHandler := handlers.NewAdminHandler(userRepo, hubModRepo, db.Pool)
	// Create authorizer for WebSocket message authorization (P0-008b)
	wsAuthorizer := websocket.NewAuthorizer(db.Pool)
	wsHandler := handlers.NewWebSocketHandler(hub, wsAuthorizer)
	notificationsHandler := handlers.NewNotificationsHandler(notificationRepo)
	searchHandler := handlers.NewSearchHandler(db.Pool)
	blockingHandler := handlers.NewBlockingHandler(db.Pool, userRepo)
	slideshowHandler := handlers.NewSlideshowHandler(db.Pool, slideshowRepo, conversationRepo, hub)
	mediaGalleryHandler := handlers.NewMediaGalleryHandler(db.Pool)
	userStatusHandler := handlers.NewUserStatusHandler(hub)
	presenceStore := services.NewPresenceStore(10 * time.Minute)
	subredditPresenceHandler := handlers.NewSubredditPresenceHandler(presenceStore)
	hubPresenceHandler := handlers.NewHubPresenceHandler(presenceStore)
	themesHandler := handlers.NewThemesHandler(themeRepo, themeOverrideRepo, installedThemeRepo, userSettingsRepo, cssSanitizer)
	redditCommentsHandler := handlers.NewRedditCommentsHandler(redditCommentRepo)
	savedItemsHandler := handlers.NewSavedItemsHandler(savedItemsRepo, postRepo, commentRepo, redditCommentRepo, redditClient)
	feedHandler := handlers.NewFeedHandler(
		postRepo,
		hubSubRepo,
		subredditSubRepo,
		redditClient,
		cache,
		time.Duration(cfg.Redis.TTLSeconds)*time.Second,
	)
	bugReportsHandler := handlers.NewBugReportsHandler(bugReportRepo, knownBugRepo, mediaRepo)
	modMailHandler := handlers.NewModMailHandler(db.Pool, conversationRepo, messageRepo, userRepo, hubModRepo, hubRepo)
	hubSettingsHandler := handlers.NewHubSettingsHandler(hubRepo, hubSettingsRepo, userRepo)
	hubThemesHandler := handlers.NewHubThemesHandler(hubThemesRepo, hubSettingsRepo)
	hubWikiHandler := handlers.NewHubWikiHandler(hubRepo, hubSettingsRepo, hubWikiRepo)
	accessRequestHandler := handlers.NewAccessRequestHandler(hubAccessRequestRepo, hubRepo, hubSettingsRepo, userRepo)
	jobsHandler := handlers.NewJobsHandler(queueClient)
	audioEncoderHandler := handlers.NewAudioEncoderHandler(mediaRepo, queueClient)
	featureFlagsHandler := handlers.NewFeatureFlagHandler(featureFlagService)
	accountDeletionHandler := handlers.NewAccountDeletionHandler(db.Pool, queueClient)
	dataExportHandler := handlers.NewDataExportHandler(db.Pool, queueClient)
	analyticsHandler := handlers.NewAnalyticsHandler(analyticsService)
	dataRetentionHandler := handlers.NewDataRetentionHandler(db.Pool)
	pushNotificationHandler := handlers.NewPushNotificationHandler(db.Pool, firebaseService)

	// Check ffmpeg availability for iOS audio encoding (P0-003)
	if err := handlers.CheckFFmpegAvailability(); err != nil {
		log.Printf("Warning: FFmpeg not available - iOS voice recording will not work: %v", err)
	} else {
		log.Println("FFmpeg available for audio encoding")
	}

	// Inject notification service into handlers
	postsHandler.SetNotificationService(notificationService)
	commentsHandler.SetNotificationService(notificationService)

	// Setup Gin router
	router := gin.Default()

	// Apply CORS middleware BEFORE static files
	router.Use(middleware.CORS())

	// Apply security headers (CSP, X-Frame-Options, etc.)
	router.Use(middleware.SecurityHeaders())

	// Apply monitoring middleware
	router.Use(monitoring.MetricsMiddleware())
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

	// Prometheus metrics endpoint
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// Detailed health check endpoints (for monitoring)
	router.GET("/health/liveness", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "alive"})
	})

	router.GET("/health/readiness", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()

		ready := true
		if err := db.Health(ctx); err != nil {
			ready = false
		}

		if ready {
			c.JSON(http.StatusOK, gin.H{"status": "ready"})
		} else {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "not ready"})
		}
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

		// Frontend logs endpoint (no auth required - allow error reporting from unauthenticated users)
		logs := api.Group("/logs")
		{
			logs.POST("/frontend", handlers.HandleFrontendLogs)
		}

		// Auth routes (no auth required)
		auth := api.Group("/auth")
		{
			// Username/password authentication
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)

			// Reddit OAuth (for future use)
			auth.GET("/reddit", authHandler.RedditLogin)
			auth.GET("/reddit/callback", authHandler.RedditCallback)

			// Password reset
			auth.POST("/forgot-password", authHandler.ForgotPassword)
			auth.POST("/reset-password", authHandler.ResetPassword)
			auth.GET("/validate-reset-token", authHandler.ValidateResetToken)

			// Email verification
			auth.GET("/verify-email", authHandler.VerifyEmail)
			auth.POST("/resend-verification", authHandler.ResendVerification)
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
			reddit.GET("/subreddits/search", redditHandler.SearchSubreddits)
			reddit.GET("/r/:subreddit", redditHandler.GetSubredditPosts)
			reddit.GET("/r/:subreddit/about", redditHandler.GetSubredditAbout)
			reddit.GET("/r/:subreddit/media", redditHandler.GetSubredditMedia)
			revisions := reddit.Group("/r/:subreddit/wiki/revisions")
			{
				revisions.GET("", redditHandler.GetSubredditWikiRevisions)
				revisions.GET("/:pagePath", redditHandler.GetSubredditWikiRevisions)
				revisions.GET("/:pagePath/*rest", redditHandler.GetSubredditWikiRevisions)
			}

			discussions := reddit.Group("/r/:subreddit/wiki/discussions")
			{
				discussions.GET("", redditHandler.GetSubredditWikiDiscussions)
				discussions.GET("/:pagePath", redditHandler.GetSubredditWikiDiscussions)
				discussions.GET("/:pagePath/*rest", redditHandler.GetSubredditWikiDiscussions)
			}

			wiki := reddit.Group("/r/:subreddit/wiki")
			{
				wiki.GET("", redditHandler.GetSubredditWikiPage)
				wiki.GET("/:pagePath", redditHandler.GetSubredditWikiPage)
				wiki.GET("/:pagePath/*rest", redditHandler.GetSubredditWikiPage)
			}
			reddit.GET("/r/:subreddit/comments/:postId", redditHandler.GetPostComments)
			reddit.GET("/r/:subreddit/gallery/:postId", redditHandler.GetPostGalleryImages)
			reddit.GET("/search", redditHandler.SearchPosts)
			reddit.GET("/wiki/:pagePath", redditHandler.GetWikiPage)
			reddit.GET("/user/:username/about", redditHandler.GetRedditUserAbout)
			reddit.GET("/user/:username/trophies", redditHandler.GetRedditUserTrophies)
			reddit.GET("/user/:username/moderated", redditHandler.GetRedditUserModerated)
			reddit.GET("/user/:username/:section", redditHandler.GetRedditUserListing)
			reddit.GET("/users/search", redditHandler.SearchRedditUsers)
			reddit.GET("/media/proxy", redditHandler.ProxyRedditMedia)

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
			hubs.GET("/:name/wiki", hubWikiHandler.GetHubWikiPage)
			hubs.GET("/:name/wiki/:pagePath", hubWikiHandler.GetHubWikiPage)
			hubs.GET("/:name/active-users", hubPresenceHandler.GetHubActiveUsers)
			hubs.POST("/:name/active-users/ping", hubPresenceHandler.PingHubPresence)

			// Hub settings (public can view some, moderators see all)
			hubs.GET("/:name/settings", hubSettingsHandler.GetHubSettings)

			// Hub moderators list (public)
			hubs.GET("/:name/moderators", hubSettingsHandler.GetHubModerators)

			// Hub theme (public)
			hubs.GET("/:name/theme", hubThemesHandler.GetActiveTheme)
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
			subreddits.GET("/:name/active-users", subredditPresenceHandler.GetSubredditActiveUsers)
			subreddits.POST("/:name/active-users/ping", subredditPresenceHandler.PingSubredditPresence)
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

		// Bug reporting routes (public access for known bugs, optional auth for reports)
		bugReports := api.Group("/bug-reports")
		bugReports.Use(middleware.AuthOptional(authService))
		{
			bugReports.POST("", bugReportsHandler.CreateBugReport)   // Anyone can report bugs
			bugReports.GET("/known", bugReportsHandler.GetKnownBugs) // Public list of known bugs
		}

		// Analytics routes (P0-027: track events, optional auth for user context)
		analytics := api.Group("/analytics")
		analytics.Use(middleware.AuthOptional(authService))
		{
			analytics.POST("/track", analyticsHandler.TrackEvent)
		}

		// Job status routes (P0-002: job status queryable via API)
		jobs := api.Group("/jobs")
		{
			jobs.GET("/:queue/:id", jobsHandler.GetJobStatus)
		}

		// Protected routes (auth required)
		protected := api.Group("")
		protected.Use(middleware.AuthRequired(authService))
		protected.Use(middleware.BanEnforcement(userRepo))
		{
			protected.GET("/auth/me", authHandler.GetMe)
			protected.POST("/auth/logout", authHandler.Logout)
			protected.PUT("/auth/public-key", authHandler.UpdatePublicKey)
			protected.GET("/auth/public-keys", authHandler.GetPublicKeys)
			protected.PUT("/auth/encrypted-private-key", authHandler.UpdateEncryptedPrivateKey)
			protected.GET("/auth/encrypted-private-key", authHandler.GetEncryptedPrivateKey)

			protected.GET("/settings", settingsHandler.GetSettings)
			protected.PUT("/settings", settingsHandler.UpdateSettings)
			protected.GET("/users/me/saved", savedItemsHandler.GetSavedItems)

			// Feature flags (P0-012: check if feature enabled for user)
			protected.GET("/features/:key", featureFlagsHandler.GetFlag)

			// Account deletion (P0-017: GDPR right to erasure)
			protected.POST("/account/delete", accountDeletionHandler.RequestAccountDeletion)
			protected.POST("/account/cancel-deletion", accountDeletionHandler.CancelAccountDeletion)
			protected.GET("/account/deletion-status", accountDeletionHandler.GetAccountDeletionStatus)

			// GDPR Data Export (P0-016: GDPR right to data portability)
			protected.POST("/account/export", dataExportHandler.RequestDataExport)
			protected.GET("/account/export/:export_id", dataExportHandler.GetExportStatus)
			protected.GET("/account/exports", dataExportHandler.ListExportRequests)

			// Push notifications (P0-042: device token registration)
			protected.POST("/devices/register", pushNotificationHandler.RegisterDeviceToken)
			protected.DELETE("/devices/unregister", pushNotificationHandler.UnregisterDeviceToken)
			protected.GET("/devices", pushNotificationHandler.GetUserDevices)
			protected.POST("/devices/test", pushNotificationHandler.TestNotification)

			protected.GET("/users/me/hidden", savedItemsHandler.GetHiddenItems)
			protected.GET("/hubs/agent-targets", hubsHandler.GetAgentTargets)

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
			protected.POST("/reddit/api-comments/save", savedItemsHandler.SaveRedditAPIComment)
			protected.DELETE("/reddit/api-comments/:commentId/save", savedItemsHandler.UnsaveRedditAPIComment)
			protected.POST("/reddit/posts/:subreddit/:postId/save", savedItemsHandler.SaveRedditPost)
			protected.DELETE("/reddit/posts/:subreddit/:postId/save", savedItemsHandler.UnsaveRedditPost)
			protected.POST("/reddit/posts/:subreddit/:postId/hide", savedItemsHandler.HideRedditPost)
			protected.DELETE("/reddit/posts/:subreddit/:postId/hide", savedItemsHandler.UnhideRedditPost)

			// Protected hub creation and crossposting
			protected.POST("/hubs", hubsHandler.Create)
			protected.PUT("/hubs/:name/nsfw", hubsHandler.UpdateHubNSFW)
			protected.GET("/users/me/hubs", hubsHandler.GetUserHubs)
			protected.POST("/hubs/:name/crosspost", hubsHandler.CrosspostToHub)
			protected.POST("/subreddits/:name/crosspost", hubsHandler.CrosspostToSubreddit)

			// Hub subscription routes (auth required)
			protected.POST("/hubs/:name/subscribe", subscriptionsHandler.SubscribeToHub)
			protected.DELETE("/hubs/:name/unsubscribe", subscriptionsHandler.UnsubscribeFromHub)
			protected.GET("/users/me/subscriptions/hubs", subscriptionsHandler.GetUserHubSubscriptions)

			// Hub access request routes (auth required)
			protected.POST("/hubs/:name/access-request", accessRequestHandler.CreateRequest)
			protected.GET("/hubs/:name/access-request/status", accessRequestHandler.CheckRequestStatus)
			protected.GET("/users/me/access-requests", accessRequestHandler.GetUserRequests)

			// Subreddit subscription routes (auth required)
			protected.POST("/subreddits/:name/subscribe", subscriptionsHandler.SubscribeToSubreddit)
			protected.DELETE("/subreddits/:name/unsubscribe", subscriptionsHandler.UnsubscribeFromSubreddit)
			protected.GET("/users/me/subscriptions/subreddits", subscriptionsHandler.GetUserSubredditSubscriptions)

			// Protected conversations routes
			protected.POST("/conversations", conversationsHandler.CreateConversation)
			protected.GET("/conversations", conversationsHandler.GetConversations)
			protected.GET("/conversations/:id", conversationsHandler.GetConversation)
			protected.PUT("/conversations/:id/archive", conversationsHandler.ArchiveConversation)
			protected.PUT("/conversations/:id/unarchive", conversationsHandler.UnarchiveConversation)
			protected.DELETE("/conversations/:id", conversationsHandler.DeleteConversation)

			// Protected messages routes
			protected.POST("/messages", messagesHandler.SendMessage)
			protected.GET("/conversations/:id/messages", messagesHandler.GetMessages)
			protected.POST("/conversations/:id/read", messagesHandler.MarkAsRead)
			protected.POST("/messages/:id/read", messagesHandler.MarkSingleMessageAsRead)
			protected.DELETE("/messages/:id", messagesHandler.DeleteMessage)

			// Mod mail routes
			protected.POST("/mod-mail", modMailHandler.CreateModMail)
			protected.GET("/mod-mail/user", modMailHandler.GetUserModMail)
			protected.GET("/mod-mail/hubs/:hub_name/recipients", modMailHandler.GetModMailRecipients)
			protected.GET("/mod-mail/hubs/:hub_name", modMailHandler.GetModMailForHub)
			protected.GET("/mod-mail/:id", modMailHandler.GetModMailConversation)
			protected.PATCH("/mod-mail/:id/status", modMailHandler.UpdateModMailStatus)

			// Hub Settings routes (requires moderator permissions)
			protected.PUT("/hubs/:name/settings", hubSettingsHandler.UpdateHubSettings)
			protected.POST("/hubs/:name/moderators", hubSettingsHandler.AddHubModerator)
			protected.PATCH("/hubs/:name/moderators/:user_id", hubSettingsHandler.UpdateModeratorRole)
			protected.DELETE("/hubs/:name/moderators/:user_id", hubSettingsHandler.RemoveHubModerator)
			protected.PUT("/hubs/:name/wiki", hubWikiHandler.UpdateHubWikiPage)
			protected.PUT("/hubs/:name/wiki/:pagePath", hubWikiHandler.UpdateHubWikiPage)

			// Hub Theme routes (requires moderator permissions)
			protected.GET("/hubs/:name/themes", hubThemesHandler.GetAllThemes)
			protected.POST("/hubs/:name/themes", hubThemesHandler.CreateTheme)
			protected.PUT("/hubs/:name/themes/:id", hubThemesHandler.UpdateTheme)
			protected.POST("/hubs/:name/themes/:id/activate", hubThemesHandler.ActivateTheme)
			protected.DELETE("/hubs/:name/themes/:id", hubThemesHandler.DeleteTheme)
			protected.POST("/hubs/:name/themes/preview", hubThemesHandler.PreviewTheme)

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

			// Media upload (with rate limiting: 30 uploads per minute)
			uploadRateLimiter := middleware.UploadRateLimiter()
			protected.POST("/media/upload", uploadRateLimiter.Middleware(), mediaHandler.UploadMedia)
			// Batch media upload (no individual rate limiting, processes multiple files concurrently)
			protected.POST("/media/batch-upload", mediaHandler.BatchUploadMedia)
			// Audio encoding for iOS Safari (P0-003)
			protected.POST("/media/encode-audio", audioEncoderHandler.EncodeAudio)

			// User profile management
			protected.PUT("/users/profile", usersHandler.UpdateProfile)
			protected.PUT("/users/email", authHandler.UpdateEmail)
			protected.POST("/users/change-password", usersHandler.ChangePassword)
			protected.POST("/users/me/ping", usersHandler.Ping)

			// Agent activity tracking
			protected.POST("/users/me/agent/post", usersHandler.UpdateLastAgentPostAt)
			protected.POST("/users/me/agent/browse", usersHandler.UpdateLastAgentBrowseAt)
			protected.POST("/users/me/agent/state", usersHandler.GetAgentState)

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

			// Global moderation endpoints (require site-wide moderator/admin role)
			globalMod := protected.Group("/mod")
			globalMod.Use(middleware.RequireRole("moderator", "admin"))
			{
				globalMod.GET("/reports", moderationHandler.ListReports)
				globalMod.POST("/reports/:id/status", moderationHandler.UpdateReportStatus)
			}

			// Hub-specific moderation endpoints (per-hub moderator check done in middleware)
			hubMod := protected.Group("/mod")
			hubMod.Use(middleware.RequireHubModeratorOrAdmin(
				hubRepo,
				hubModRepo,
				postRepo,
				commentRepo,
				removalReasonRepo,
				hubAccessRequestRepo,
			))
			{
				// User bans
				hubMod.POST("/hubs/:hub_name/bans", moderationHandlerV2.BanUser)
				hubMod.DELETE("/hubs/:hub_name/bans/:user_id", moderationHandlerV2.UnbanUser)
				hubMod.GET("/hubs/:hub_name/bans", moderationHandlerV2.GetBannedUsers)

				// Post moderation
				hubMod.POST("/posts/:id/remove", moderationHandlerV2.RemovePost)
				hubMod.POST("/posts/:id/approve", moderationHandlerV2.ApprovePost)
				hubMod.POST("/posts/:id/lock", moderationHandlerV2.LockPost)
				hubMod.POST("/posts/:id/unlock", moderationHandlerV2.UnlockPost)
				hubMod.POST("/posts/:id/pin", moderationHandlerV2.PinPost)
				hubMod.POST("/posts/:id/unpin", moderationHandlerV2.UnpinPost)
				hubMod.POST("/hubs/:hub_name/pinned-order", moderationHandlerV2.UpdatePinnedOrder)

				// Comment moderation
				hubMod.POST("/comments/:id/remove", moderationHandlerV2.RemoveComment)
				hubMod.POST("/comments/:id/approve", moderationHandlerV2.ApproveComment)

				// Removal reasons
				hubMod.POST("/hubs/:hub_name/removal-reasons", moderationHandlerV2.CreateRemovalReason)
				hubMod.PUT("/removal-reasons/:id", moderationHandlerV2.UpdateRemovalReason)
				hubMod.DELETE("/removal-reasons/:id", moderationHandlerV2.DeleteRemovalReason)
				hubMod.GET("/hubs/:hub_name/removal-reasons", moderationHandlerV2.GetRemovalReasons)

				// Mod log
				hubMod.GET("/hubs/:hub_name/mod-log", moderationHandlerV2.GetModLog)

				// Access request moderation
				hubMod.GET("/hubs/:hub_name/access-requests", accessRequestHandler.GetPendingRequests)
				hubMod.POST("/hubs/:hub_name/access-requests/add-user", accessRequestHandler.AddUserAccessByUsername)
				hubMod.POST("/access-requests/:request_id/approve", accessRequestHandler.ApproveRequest)
				hubMod.POST("/access-requests/:request_id/deny", accessRequestHandler.DenyRequest)
			}

			// Admin endpoints
			admin := protected.Group("/admin")
			admin.Use(middleware.RequireRole("admin"))
			{
				// User management
				admin.GET("/users", adminHandler.ListUsers)
				admin.POST("/users/:id/role", adminHandler.PromoteUser)
				admin.POST("/users/:id/ban", adminHandler.BanUser)
				admin.POST("/users/:id/shadow-ban", adminHandler.ShadowBanUser)
				admin.POST("/users/:id/unban", adminHandler.UnbanUser)
				admin.POST("/users/:id/delete", adminHandler.SoftDeleteUser)
				admin.GET("/users/:id/ban-history", adminHandler.GetBanHistory)
				admin.GET("/ban-history", adminHandler.GetAllBanHistory)

				// Hub moderator management
				admin.POST("/hubs/:name/moderators", hubsHandler.AddModerator)
				admin.GET("/hubs/:hub_id/moderators", adminHandler.GetHubModerators)
				admin.DELETE("/hubs/:hub_id/moderators/:user_id", adminHandler.RemoveHubModerator)

				// Site statistics
				admin.GET("/stats", adminHandler.GetSiteStats)

				// Bug report management
				admin.GET("/bug-reports", bugReportsHandler.GetBugReports)
				admin.PUT("/bug-reports/:id", bugReportsHandler.UpdateBugReport)

				// Known bugs management
				admin.POST("/known-bugs", bugReportsHandler.CreateKnownBug)
				admin.PUT("/known-bugs/:id", bugReportsHandler.UpdateKnownBug)
				admin.DELETE("/known-bugs/:id", bugReportsHandler.DeleteKnownBug)

				// Feature flags management (P0-012)
				admin.GET("/features", featureFlagsHandler.ListFlags)
				admin.PUT("/features/:key", featureFlagsHandler.UpdateFlag)
				admin.POST("/features/:key/overrides", featureFlagsHandler.SetUserOverride)
				admin.DELETE("/features/:key/overrides/:user_id", featureFlagsHandler.RemoveUserOverride)
				admin.GET("/features/:key/audit", featureFlagsHandler.GetAuditLog)
				admin.POST("/features/:key/rollout", featureFlagsHandler.SetRolloutPercentage)

				// Analytics management (P0-027)
				admin.GET("/analytics/dashboard", analyticsHandler.GetDashboard)

				// Data retention management (P0-034)
				admin.GET("/retention/status", dataRetentionHandler.GetRetentionStatus)
				admin.GET("/retention/policy", dataRetentionHandler.GetRetentionPolicy)
				admin.PUT("/retention/policy/:data_type", dataRetentionHandler.UpdateRetentionPolicy)
				admin.GET("/retention/history", dataRetentionHandler.GetRetentionHistory)
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
