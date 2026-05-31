// @title           OmniNudge API
// @version         1.0
// @description     OmniNudge social platform API
// @termsOfService  http://omninudge.com/terms/
// @contact.name    OmniNudge Support
// @contact.email   support@omninudge.com
// @license.name    Proprietary
// @host            localhost:8080
// @BasePath        /api/v1
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description JWT Bearer token. Format: "Bearer {token}"

package main

import (
	"context"
	"net/http"
	nethttppprof "net/http/pprof"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"github.com/hibiken/asynqmon"
	_ "github.com/omninudge/backend/docs"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/audit"
	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/domain/events"
	"github.com/omninudge/backend/internal/eventhandlers"
	"github.com/omninudge/backend/internal/handlers"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/jobs"
	"github.com/omninudge/backend/internal/monitoring"
	"github.com/omninudge/backend/internal/observability"
	"github.com/omninudge/backend/internal/queue"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/services"
	linkpreviewsvc "github.com/omninudge/backend/internal/services/linkpreview"
	"github.com/omninudge/backend/internal/tracing"
	"github.com/omninudge/backend/internal/utils"
	"github.com/omninudge/backend/internal/websocket"
	"github.com/omninudge/backend/internal/workers"
	"github.com/omninudge/backend/pkg/logger"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	zlog "github.com/rs/zerolog/log"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

// serviceName is the OTel / log service identifier — single source of truth.
const serviceName = "omninudge-api"

// appVersion is set at build time via:
//
//	go build -ldflags="-X main.appVersion=1.2.3" ./cmd/server/...
//
// Falls back to "dev" when not injected.
var appVersion = "dev"

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		// zerolog's global logger is operational before Initialize() is called
		// (it defaults to os.Stderr with info level). Fatal() logs and calls os.Exit(1).
		zlog.Fatal().Err(err).Msg("Failed to load config")
	}

	// Initialize zerolog structured logger — must come before any other log calls.
	logger.Initialize(cfg.AppEnv, appVersion, serviceName)

	// Initialize Sentry error tracking (no-op when SENTRY_DSN is empty).
	observability.InitSentry(os.Getenv("SENTRY_DSN"), cfg.AppEnv, appVersion)
	defer observability.FlushSentry()

	// Initialize Pyroscope continuous profiling (no-op when PYROSCOPE_SERVER_ADDRESS is empty).
	observability.InitPyroscope(os.Getenv("PYROSCOPE_SERVER_ADDRESS"), serviceName, cfg.AppEnv)

	zlog.Info().Str("version", appVersion).Str("env", cfg.AppEnv).Msg("Starting OmniNudge server")

	// Initialize OpenTelemetry tracing (P0-040)
	tracingShutdown, err := tracing.Setup(context.Background(), serviceName, appVersion)
	if err != nil {
		zlog.Warn().Err(err).Msg("Warning: failed to initialize tracing")
	} else {
		defer func() {
			if err := tracingShutdown(context.Background()); err != nil {
				zlog.Warn().Err(err).Msg("Warning: tracing shutdown error")
			}
		}()
		zlog.Info().Msg("OpenTelemetry tracing initialized")
	}

	// Initialize email encryption
	if err := utils.SetEncryptionKey(cfg.Encryption.Key); err != nil {
		zlog.Fatal().Err(err).Msg("Failed to initialize email encryption")
	}
	zlog.Info().Msg("Email encryption initialized")

	// Connect to database
	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		zlog.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer db.Close()
	zlog.Info().Str("db", cfg.Database.DBName).Msg("Connected to PostgreSQL database")

	if cfg.Database.AutoMigrate {
		zlog.Info().Msg("Running database migrations...")
		migrateCtx, migrateCancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer migrateCancel()
		if err := db.Migrate(migrateCtx); err != nil {
			zlog.Fatal().Err(err).Msg("Failed to run migrations")
		}
		zlog.Info().Msg("Migrations complete")
	} else {
		zlog.Info().Msg("Skipping embedded database migrations (DB_AUTO_MIGRATE=false)")
	}

	// Initialize repositories
	userRepo := repository.NewPostgresUserRepository(db.Pool)
	userSettingsRepo := repository.NewPostgresUserSettingsRepository(db.Pool)
	postRepo := repository.NewPostgresPlatformPostRepository(db.Pool)
	commentRepo := repository.NewPostgresPostCommentRepository(db.Pool)
	conversationRepo := repository.NewPostgresConversationRepository(db.Pool)
	messageRepo := repository.NewPostgresMessageRepository(db.Pool)
	mediaRepo := repository.NewPostgresMediaFileRepository(db.Pool)
	hubRepo := repository.NewPostgresHubRepository(db.Pool)
	reportRepo := repository.NewPostgresReportRepository(db.Pool)
	hubModRepo := repository.NewPostgresHubModeratorRepository(db.Pool)
	notificationRepo := repository.NewPostgresNotificationRepository(db.Pool)
	baselineRepo := repository.NewPostgresUserBaselineRepository(db.Pool)
	batchRepo := repository.NewPostgresNotificationBatchRepository(db.Pool)
	slideshowRepo := repository.NewPostgresSlideshowRepository(db.Pool)
	redditPostRepo := repository.NewPostgresRedditPostRepository(db.Pool)
	passwordResetRepo := repository.NewPostgresPasswordResetRepository(db.Pool)
	feedRepo := repository.NewPostgresFeedRepository(db.Pool)
	themeRepo := repository.NewPostgresUserThemeRepository(db.Pool)
	themeOverrideRepo := repository.NewPostgresUserThemeOverrideRepository(db.Pool)
	installedThemeRepo := repository.NewPostgresUserInstalledThemeRepository(db.Pool)
	redditCommentRepo := repository.NewPostgresRedditPostCommentRepository(db.Pool)
	savedItemsRepo := repository.NewPostgresSavedItemsRepository(db.Pool)
	hubSubRepo := repository.NewPostgresHubSubscriptionRepository(db.Pool)
	subredditSubRepo := repository.NewPostgresSubredditSubscriptionRepository(db.Pool)
	tokenRepo := repository.NewPostgresDeviceTokenRepository(db.Pool)

	// Feature 1: Message Reactions repository
	messageReactionRepo := repository.NewPostgresMessageReactionRepository(db.Pool)
	userProfileRepo := repository.NewPostgresUserProfileRepository(db.Pool)
	userFriendshipRepo := repository.NewPostgresUserFriendshipRepository(db.Pool)

	// Moderation Phase 1 repositories
	hubBanRepo := repository.NewPostgresHubBanRepository(db.Pool)
	removalReasonRepo := repository.NewPostgresRemovalReasonRepository(db.Pool)
	removedContentRepo := repository.NewPostgresRemovedContentRepository(db.Pool)
	modLogRepo := repository.NewPostgresModLogRepository(db.Pool)

	// Hub Settings and Themes repositories (from repository package)
	hubSettingsRepo := repository.NewHubSettingsRepository(db.Pool)
	hubWikiRepo := repository.NewHubWikiRepository(db.Pool)

	// Access request repository
	hubAccessRequestRepo := repository.NewPostgresHubAccessRequestRepository(db.Pool)

	// Bug reporting repositories
	bugReportRepo := repository.NewPostgresBugReportRepository(db.Pool)
	knownBugRepo := repository.NewPostgresKnownBugRepository(db.Pool)

	// Initialize WebSocket hub
	hub := websocket.NewHub()
	go hub.Run()

	// Initialize domain event bus and register event handlers.
	// Log events in non-production environments so they can be inspected via
	// GetEventLog in tests and staging. In production the log is disabled to
	// prevent the slice growing without bound.
	eventBus := events.NewEventBus(cfg.AppEnv != "production")
	userEventHandlers := eventhandlers.NewUserEventHandlers()
	eventBus.Subscribe("UserRegistered", userEventHandlers.OnUserRegistered)
	eventBus.Subscribe("UserBanned", userEventHandlers.OnUserBanned)
	eventBus.Subscribe("UserUnbanned", userEventHandlers.OnUserUnbanned)
	eventBus.Subscribe("UserDeleted", userEventHandlers.OnUserDeleted)
	eventBus.Subscribe("PasswordChanged", userEventHandlers.OnPasswordChanged)
	zlog.Info().Msg("Domain event bus initialized")

	// Initialize services
	if cfg.Turnstile.Secret == "" {
		zlog.Warn().Msg("Turnstile.Secret is not configured — CAPTCHA validation is disabled")
	}
	authService := services.NewAuthService(
		cfg.JWT.Secret,
		cfg.Reddit.UserAgent,
		cfg.Turnstile.Secret,
	)
	authService.SetUserRepository(userRepo)

	// Redis is optional in dev. If it's configured but unreachable, fall back to in-memory cache and disable the job queue
	// (otherwise Asynq will spam errors and unrelated endpoints can fail).
	var redisClient *redis.Client
	redisAvailable := false
	if cfg.Redis.Addr != "" {
		rc := redis.NewClient(&redis.Options{
			Addr:     cfg.Redis.Addr,
			Password: cfg.Redis.Password,
			// DialTimeout shorter than the ping context (750ms) so the TCP dial
			// does not outlive the context and leak a goroutine/fd on slow DNS.
			DialTimeout: 500 * time.Millisecond,
		})
		pingCtx, pingCancel := context.WithTimeout(context.Background(), 750*time.Millisecond)
		pingErr := rc.Ping(pingCtx).Err()
		pingCancel()
		if pingErr != nil {
			zlog.Warn().Str("addr", cfg.Redis.Addr).Err(pingErr).Msg("Redis unavailable, disabling Redis-backed cache and job queue")
			_ = rc.Close()
		} else {
			redisClient = rc
			redisAvailable = true
			zlog.Info().Str("addr", cfg.Redis.Addr).Msg("Connected to Redis")
		}
	} else {
		zlog.Info().Msg("Redis not configured")
	}

	var cache services.Cache
	var cacheType string
	if redisAvailable {
		// ResilientRedisCache wraps the go-redis client with a gobreaker circuit
		// breaker (opens after 5 consecutive failures) and singleflight to prevent
		// thundering-herd on cache misses.
		// NOTE: we do NOT call resilientCache.Close() separately on shutdown because
		// ResilientRedisCache.Close() is equivalent to redisClient.Close(), which is
		// already called below at graceful shutdown. Calling it twice would be a no-op
		// for go-redis, but we keep a single close site to avoid confusion.
		cache = services.NewResilientRedisCacheWithClient(redisClient)
		cacheType = "redis"
	} else {
		// Use in-memory cache as fallback. Retain the concrete pointer so we
		// can call Stop() on graceful shutdown to terminate the cleanup goroutine.
		memCache := services.NewMemoryCache()
		defer memCache.Stop()
		cache = memCache
		cacheType = "memory"
		zlog.Info().Msg("Using in-memory cache (Redis unavailable)")
	}
	cache = services.NewInstrumentedCache(cache, cacheType)
	redditClient := services.NewRedditClient(
		cfg.Reddit.UserAgent,
		cache,
		time.Duration(cfg.Redis.TTLSeconds)*time.Second,
	)

	// Initialize job queue client (P0-002)
	var queueClient *queue.QueueClient
	if redisAvailable {
		queueClient = queue.NewQueueClient(cfg.Redis.Addr, cfg.Redis.Password)
		zlog.Info().Msg("Job queue client initialized")
	} else {
		zlog.Warn().Msg("Job queue disabled (Redis unavailable)")
	}

	// Initialize Firebase Cloud Messaging (P0-042)
	var firebaseService *services.FirebaseService
	if cfg.Firebase.CredentialsPath != "" {
		var err error
		firebaseService, err = services.NewFirebaseService(cfg.Firebase.CredentialsPath)
		if err != nil {
			zlog.Warn().Err(err).Msg("Failed to initialize Firebase")
		}
	} else {
		zlog.Info().Msg("Firebase credentials not configured, push notifications disabled")
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
		tokenRepo,
		firebaseService,
		hub,
	)
	baselineCalculatorService := services.NewBaselineCalculatorService(db.Pool, baselineRepo)

	// Feature 1: Message Reactions service
	reactionService := services.NewReactionService(db.Pool, messageReactionRepo, messageRepo, notificationService, hub)

	// Initialize feature flag repository
	featureFlagRepo := repository.NewFeatureFlagRepository(db.Pool)

	// Initialize feature flag service (P0-012)
	featureFlagService := services.NewFeatureFlagService(featureFlagRepo, redisClient, hub, cfg.AppEnv)

	// Background goroutine: auto-rollback feature flags when error thresholds are exceeded.
	// Reuses cleanupCtx so it stops cleanly on graceful shutdown.
	rollbackCtx, rollbackCancel := context.WithCancel(context.Background())
	defer rollbackCancel()
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				featureFlagService.CheckAutoRollbacks(rollbackCtx)
			case <-rollbackCtx.Done():
				return
			}
		}
	}()

	// Initialize analytics service (P0-027)
	analyticsService := services.NewAnalyticsService(db.Pool)

	// Initialize storage service (P0-016 / REFACTOR_13)
	// STORAGE_BACKEND=s3 enables S3/CloudFront; defaults to local filesystem.
	var storageService services.StorageService
	var s3StorageService *services.S3StorageService
	switch cfg.Storage.StorageBackend {
	case "s3":
		s3Svc, err := services.NewS3StorageService(cfg)
		if err != nil {
			zlog.Fatal().Err(err).Msg("Failed to init S3 storage service")
		}
		// SEC-5: Zero the S3 secret key from memory now that the client is built.
		cfg.Storage.S3SecretKey = ""
		storageService = s3Svc
		s3StorageService = s3Svc
		zlog.Info().Str("bucket", cfg.Storage.S3Bucket).Str("region", cfg.Storage.S3Region).Msg("S3 storage initialized")
	default:
		// NOTE: These paths are relative to the server's working directory.
		// Ensure the binary is started from the project root, or set absolute paths via environment variables.
		localSvc, err := services.NewLocalStorageService("./uploads", cfg.FrontendURL+"/uploads")
		if err != nil {
			zlog.Fatal().Err(err).Msg("Failed to initialize local storage service")
		}
		storageService = localSvc
		zlog.Info().Msg("Local filesystem storage initialized")
	}

	// Initialize voice storage service (F11).
	// When S3 is active, reuse the same service — key prefixes distinguish files.
	// When local, use a dedicated voice uploads directory.
	var voiceStorage services.StorageService
	if cfg.Storage.StorageBackend == "s3" {
		voiceStorage = storageService
	} else {
		vs, err := services.NewLocalStorageService("./uploads/voice", cfg.FrontendURL+"/uploads/voice")
		if err != nil {
			zlog.Fatal().Err(err).Msg("Failed to initialize voice storage")
		}
		voiceStorage = vs
	}

	// Declare virusScanner at package scope so it can be passed to voice handler.
	var virusScanner services.VirusScanner

	// Initialize scrubber service (P0-017)
	scrubberService := services.NewScrubberService(db.Pool, storageService)

	// Initialize email service (P0-036)
	// Provider selection order: SendGrid > Mailgun > SMTP > stub (logs only).
	emailService := services.NewEmailServiceFull(services.EmailServiceConfig{
		SendGridAPIKey: cfg.SMTP.SendGridAPIKey,
		MailgunAPIKey:  cfg.SMTP.MailgunAPIKey,
		MailgunDomain:  cfg.SMTP.MailgunDomain,
		SMTPHost:       cfg.SMTP.Host,
		SMTPPort:       cfg.SMTP.Port,
		SMTPUser:       cfg.SMTP.User,
		SMTPPassword:   cfg.SMTP.Password,
		FromAddress:    cfg.SMTP.FromAddress,
		FromName:       cfg.SMTP.FromName,
		FrontendURL:    cfg.FrontendURL,
	})
	switch {
	case cfg.SMTP.SendGridAPIKey != "":
		zlog.Info().Msg("Email service initialized (provider: SendGrid)")
	case cfg.SMTP.MailgunAPIKey != "":
		zlog.Info().Str("domain", cfg.SMTP.MailgunDomain).Msg("Email service initialized (provider: Mailgun)")
	case cfg.SMTP.Host != "":
		zlog.Info().Str("host", cfg.SMTP.Host).Msg("Email service initialized (provider: SMTP)")
	default:
		zlog.Warn().Msg("No email provider configured — emails will be logged but not sent")
	}

	// Initialize SMS service (stub mode unless Twilio credentials are configured).
	smsService := services.NewSMSService(
		cfg.Twilio.AccountSID,
		cfg.Twilio.AuthToken,
		cfg.Twilio.FromNumber,
	)
	_ = smsService // available for future use by handlers that need SMS

	// Start job queue worker (P0-002: background job processing)
	if queueClient != nil {
		jobWorker := queue.NewWorker(cfg.Redis.Addr, cfg.Redis.Password, 10) // 10 concurrent workers
		queueThumbnailService := services.NewThumbnailService()
		if cfg.VirusScan.Enabled {
			virusScanner = services.NewClamAVScanner(
				cfg.VirusScan.ClamAVNetwork,
				cfg.VirusScan.ClamAVAddress,
				time.Duration(cfg.VirusScan.TimeoutSeconds)*time.Second,
			)
			if err := virusScanner.Ping(context.Background()); err != nil {
				zlog.Warn().Err(err).Msg("ClamAV ping failed")
			}
		} else {
			zlog.Warn().Msg("Virus scan disabled via VIRUS_SCAN_ENABLED=false")
		}

		// Register job handlers
		jobWorker.RegisterAllHandlers(queue.JobHandlers{
			EmailSend:           queue.NewEmailHandler(emailService),
			DataExport:          queue.NewDataExportHandler(db.Pool, storageService, cfg.Encryption.Key, emailService),
			VirusScan:           queue.NewVirusScanHandler(mediaRepo, virusScanner, cfg.VirusScan.FailClosed, storageService, queueClient),
			Transcription:       queue.NewUnsupportedHandler(queue.JobTypeTranscription, "transcription backend pipeline is not yet implemented"),
			Notification:        queue.NewNotificationHandler(tokenRepo, firebaseService),
			ThumbnailGeneration: queue.NewThumbnailGenerationHandler(mediaRepo, queueThumbnailService, storageService),
			ContentModeration:   queue.NewUnsupportedHandler(queue.JobTypeContentModeration, "content moderation backend is not yet implemented"),
			MessageReencrypt:    queue.NewUnsupportedHandler(queue.JobTypeMessageReencrypt, "message re-encryption backend pipeline is not yet implemented"),
			WaveformGeneration:  queue.NewWaveformJobHandler(db.Pool, voiceStorage).Handle,
			VideoTranscode: func() func(context.Context, *asynq.Task) error {
				if cfg.Storage.StorageBackend != "s3" {
					zlog.Warn().Msg("video transcoding registered with local storage backend — HLS segments will not be CDN-served")
				}
				return queue.NewVideoTranscodeHandler(db.Pool, "./uploads/hls", storageService).Handle
			}(),
		})

		// Start worker in background
		go func() {
			zlog.Info().Msg("Starting job queue worker...")
			if err := jobWorker.Start(); err != nil {
				zlog.Error().Err(err).Msg("Job queue worker error")
			}
		}()
		zlog.Info().Msg("Job queue worker started with 10 concurrent workers")
	}

	// Initialize audit logger (REFACTOR_05: security hardening)
	auditLogger := audit.NewAuditLogger(db.Pool)

	// Initialize account lockout service (REFACTOR_05: brute-force protection)
	lockoutService := services.NewAccountLockoutService(db.Pool)

	// Start security cleanup job (REFACTOR_05: purge stale failed_login_attempts and audit_logs).
	// The context is derived from a cancel function that is called during graceful
	// shutdown so the goroutine is not leaked after the HTTP server stops.
	// Fix 2: defer cleanupCancel immediately after creation so all exit paths
	// (panic, fatal, normal shutdown) trigger cancellation — the explicit call
	// below during shutdown is kept for clarity but the defer is the safety net.
	cleanupCtx, cleanupCancel := context.WithCancel(context.Background())
	defer cleanupCancel()
	go jobs.NewCleanupJob(db.Pool).Start(cleanupCtx)

	// Start materialized view refresh job (refreshes analytics views every 5 minutes).
	viewRefreshJob := jobs.NewRefreshMaterializedViewsJob(db.Pool, zlog.Logger)
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if err := viewRefreshJob.Run(cleanupCtx); err != nil {
					zlog.Error().Err(err).Msg("view refresh job failed")
				}
			case <-cleanupCtx.Done():
				return
			}
		}
	}()

	// Start background workers
	// Fix 10: use a single cancellable context for all background workers so
	// they are cleanly cancelled on graceful shutdown.
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()
	workerManager := workers.NewWorkerManager(
		notificationService,
		baselineCalculatorService,
		analyticsService,
		featureFlagService,
	)
	workerManager.Start(workerCtx)

	// Start account cleanup worker (P0-017: permanently delete accounts after grace period)
	accountCleanupWorker := workers.NewAccountCleanupWorker(db.Pool, scrubberService, storageService)
	go accountCleanupWorker.Start(workerCtx)

	// Start data retention worker (P0-034: automated data deletion per retention policy)
	retentionWorker := workers.NewRetentionWorker(db.Pool, scrubberService, storageService, cfg.Retention)
	go retentionWorker.Start(workerCtx)

	// Crypto payment services
	priceOracleSvc := services.NewPriceOracleService("")
	cryptoVerifySvc := services.NewCryptoVerificationService(
		cfg.Crypto.BTCWallet,
		cfg.Crypto.ETHWallet,
		cfg.Crypto.CAHContract,
		"", "",
	)
	planSvc := services.NewPlanService(models.NewUserRepository(db.Pool))
	cryptoPaymentRepo := models.NewCryptoPaymentRepository(db.Pool)

	go workers.NewCryptoPaymentWorker(cryptoPaymentRepo, planSvc, cryptoVerifySvc).Start(workerCtx)
	go workers.NewPlanExpiryWorker(planSvc).Start(workerCtx)

	// Initialize repositories for email verification
	emailVerificationRepo := repository.NewPostgresEmailVerificationRepository(db.Pool)

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(authService, userRepo, emailService, passwordResetRepo, emailVerificationRepo, cfg.FrontendURL, auditLogger, lockoutService, cfg.AppEnv)
	settingsHandler := handlers.NewSettingsHandler(userSettingsRepo)
	postsHandler := handlers.NewPostsHandler(db.Pool, postRepo, hubRepo, userRepo, hubModRepo, feedRepo, hubSettingsRepo)
	postsHandler.SetLinkPreviewService(linkpreviewsvc.NewService(nil, storageService, virusScanner))
	commentsHandler := handlers.NewCommentsHandler(db.Pool, commentRepo, postRepo, hubRepo, userRepo, hubModRepo)
	redditHandler := handlers.NewRedditHandler(redditClient, redditPostRepo)
	conversationsHandler := handlers.NewConversationsHandler(db.Pool, conversationRepo, messageRepo, userRepo)
	foldersHandler := handlers.NewFoldersHandler(db.Pool, conversationRepo)
	// Initialize thumbnail service
	thumbnailService := services.NewThumbnailService()

	// Initialize CSS sanitizer
	cssSanitizer := services.NewCSSSanitizer()

	messagesHandler := handlers.NewMessagesHandler(db.Pool, messageRepo, conversationRepo, userSettingsRepo, hub, notificationService, cache, queueClient)
	usersHandler := handlers.NewUsersHandler(userRepo, userProfileRepo, userFriendshipRepo, userSettingsRepo, postRepo, commentRepo, authService, hubModRepo, cache, thumbnailService)
	mediaQuota := handlers.MediaQuotaConfig{
		FreeTierBytes: cfg.Media.FreeTierQuotaBytes,
		ProTierBytes:  cfg.Media.ProTierQuotaBytes,
	}
	mediaHandler := handlers.NewMediaHandler(mediaRepo, thumbnailService, queueClient, mediaQuota, cfg.VirusScan.FailClosed)
	// Inject storage service so all uploads go through the configured backend.
	mediaHandler.SetStorageService(storageService)
	// Also inject S3 service when S3 storage backend is active so presigned URL
	// endpoint can generate PUT presigned URLs and CDN URLs.
	if s3StorageService != nil {
		mediaHandler.SetS3Service(s3StorageService)
	}
	storageHandler := handlers.NewStorageHandler(mediaRepo, mediaQuota)
	hubsHandler := handlers.NewHubsHandlerWithAccessRequest(hubRepo, postRepo, hubModRepo, hubSubRepo, hubSettingsRepo, hubAccessRequestRepo)
	subscriptionsHandler := handlers.NewSubscriptionsHandler(hubSubRepo, subredditSubRepo, hubRepo)
	moderationHandler := handlers.NewModerationHandler(reportRepo, hubModRepo, userRepo, notificationRepo, hub, emailService)
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
	wsHandler := handlers.NewWebSocketHandler(hub, wsAuthorizer, userSettingsRepo)
	notificationsHandler := handlers.NewNotificationsHandler(notificationRepo)
	searchHandler := handlers.NewSearchHandler(db.Pool)
	blockingHandler := handlers.NewBlockingHandler(db.Pool, userRepo)
	slideshowHandler := handlers.NewSlideshowHandler(db.Pool, slideshowRepo, conversationRepo, hub)
	mediaGalleryHandler := handlers.NewMediaGalleryHandler(db.Pool)
	uploadsHandler := handlers.NewUploadsHandler(mediaRepo, "./uploads")
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
		savedItemsRepo,
		redditClient,
		cache,
		time.Duration(cfg.Redis.TTLSeconds)*time.Second,
	)
	bugReportsHandler := handlers.NewBugReportsHandler(bugReportRepo, knownBugRepo, mediaRepo)
	modMailHandler := handlers.NewModMailHandler(db.Pool, conversationRepo, messageRepo, userRepo, hubModRepo, hubRepo)
	hubSettingsHandler := handlers.NewHubSettingsHandler(hubRepo, hubSettingsRepo, userRepo)
	hubWikiHandler := handlers.NewHubWikiHandler(hubRepo, hubSettingsRepo, hubWikiRepo)
	accessRequestHandler := handlers.NewAccessRequestHandler(hubAccessRequestRepo, hubRepo, hubSettingsRepo, userRepo)
	jobsHandler := handlers.NewJobsHandler(queueClient)
	audioEncoderHandler := handlers.NewAudioEncoderHandler(mediaRepo, userSettingsRepo, queueClient)
	voiceHandler := handlers.NewVoiceMessagesHandler(db.Pool, voiceStorage, virusScanner, hub, queueClient, cfg.VirusScan.FailClosed)
	featureFlagsHandler := handlers.NewFeatureFlagHandler(featureFlagService)
	accountDeletionHandler := handlers.NewAccountDeletionHandler(db.Pool, queueClient)
	dataExportHandler := handlers.NewDataExportHandler(db.Pool, queueClient, storageService, cfg.Encryption.Key)
	analyticsHandler := handlers.NewAnalyticsHandler(analyticsService)
	logHandler := handlers.NewLogHandler(analyticsService)
	groupHandler := handlers.NewGroupHandler(db.Pool)
	dataRetentionHandler := handlers.NewDataRetentionHandler(db.Pool)
	paymentsHandler := handlers.NewPaymentsHandler(cryptoPaymentRepo, planSvc, cryptoVerifySvc, priceOracleSvc)
	pushNotificationHandler := handlers.NewPushNotificationHandler(db.Pool, tokenRepo, firebaseService)
	callsHandler := handlers.NewCallsHandler(db.Pool, hub, cfg.TURN)
	zlog.Info().Bool("gemini_key_set", cfg.Gemini.APIKey != "").Str("gemini_model", cfg.Gemini.Model).Msg("AI designer config")
	hubAIDesignerHandler := handlers.NewHubAIDesignerHandler(
		db.Pool, hubSettingsRepo,
		cfg.Gemini.APIKey, cfg.Gemini.Model,
	)

	// Feature 1: Message Reactions handler + rate limiter
	reactionsHandler := handlers.NewReactionsHandler(reactionService)
	reactionRateLimiter := middleware.ReactionRateLimiter()

	// Rate limiters hoisted so they are accessible at graceful shutdown.
	themeCreationLimiter := middleware.ThemeCreationRateLimiter()
	themePreviewLimiter := middleware.ThemePreviewRateLimiter()
	generalLimiter := middleware.GeneralAPIRateLimiter()
	uploadRateLimiter := middleware.UploadRateLimiter()
	aiDesignRateLimiter := middleware.AIDesignRateLimiter(cache)
	aiChatRateLimiter := middleware.ChatDesignRateLimiter(cache)
	// Auth rate limiters — Redis-backed so they work across restarts and are IP-keyed
	// (no user_id exists at login/register time, so the Redis limiter falls back to ClientIP).
	authRateLimiter := middleware.AuthRateLimiter(cache)
	passwordResetRateLimiter := middleware.PasswordResetRateLimiter(cache)

	// Check ffmpeg availability for iOS audio encoding (P0-003)
	if err := handlers.CheckFFmpegAvailability(); err != nil {
		zlog.Warn().Err(err).Msg("FFmpeg not available - iOS voice recording will not work")
	} else {
		zlog.Info().Msg("FFmpeg available for audio encoding")
	}

	// Inject notification service into handlers
	postsHandler.SetNotificationService(notificationService)
	commentsHandler.SetNotificationService(notificationService)

	// ── Middleware stack ─────────────────────────────────────────────────────
	// ORDER IS CRITICAL — do not rearrange without understanding the effects:
	//  1. Recovery    — catches panics before anything else can observe them
	//  2. RequestID   — sets X-Request-ID so every downstream log has a trace ID
	//  3. Tracing     — starts OTel span; before Logger so trace/span IDs are in logs
	//  4. Logger      — logs after handlers so it has status code + latency
	//  5. CORS        — must precede static-file serving (preflight OPTIONS)
	//  6. Security    — adds response security headers early
	//  7. APIVersion  — adds X-API-Version header
	//  8. CacheCtrl   — adds Cache-Control before any response body is written
	//  9. Compression — wraps response writer; must come before Metrics so that
	//                   Prometheus measures compressed-bytes, not raw bytes
	// 10. MaxBodySize — rejects oversized request bodies before handler reads them
	// 11. Timeout     — sets 30s context deadline; handlers/DB drivers that honour
	//                   ctx.Done() will be cancelled automatically
	// 12. Metrics     — measures handler latency last so compression is included
	router := gin.New()
	router.Use(middleware.Recovery())
	router.Use(observability.SentryMiddleware())
	router.Use(middleware.RequestID())
	router.Use(middleware.Tracing(serviceName))
	router.Use(middleware.StructuredLogger())
	router.Use(middleware.CORS())
	router.Use(middleware.SecurityHeaders())
	router.Use(middleware.APIVersion())
	router.Use(middleware.CacheControl())
	router.Use(middleware.Compression())
	// Reject request bodies larger than 50 MB (protects against OOM DoS).
	// NOTE on interaction with api.Use(middleware.RequestSizeLimiter(1<<20)) below:
	// The global 50 MB MaxBytesReader here is a safety net for non-API routes
	// (uploads, WebSocket upgrades, etc.).  For API routes, RequestSizeLimiter
	// enforces the lower per-route cap at read-time, so the global wrapper is
	// typically not consumed for API payload-size enforcement.
	// The two limits are therefore complementary and do not conflict.
	router.Use(func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 50<<20)
		c.Next()
	})
	router.Use(middleware.Timeout(30 * time.Second))
	router.Use(monitoring.MetricsMiddleware())

	// Serve uploads through scan-aware gate (fail-closed for media files)
	router.GET("/uploads/*filepath", uploadsHandler.ServeUpload)
	router.HEAD("/uploads/*filepath", uploadsHandler.ServeUpload)

	// Health check — used by load balancers and uptime monitors.
	// Version is intentionally omitted to avoid exposing the exact commit hash publicly.
	router.GET("/health", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()

		if err := db.Health(ctx); err != nil {
			c.Header("Retry-After", "10")
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status":   "unhealthy",
				"database": "disconnected",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"status":   "healthy",
			"database": "connected",
		})
	})

	// Prometheus metrics endpoint — restricted to internal/admin traffic.
	// In production, fail closed unless METRICS_TOKEN is configured.
	if cfg.AppEnv == "production" && cfg.MetricsToken == "" {
		zlog.Warn().Msg("METRICS_TOKEN is not set — /metrics endpoint disabled in production")
	} else {
		router.GET("/metrics", func(c *gin.Context) {
			if token := cfg.MetricsToken; token != "" {
				if c.GetHeader("Authorization") != "Bearer "+token {
					c.AbortWithStatus(http.StatusUnauthorized)
					return
				}
			}
			promhttp.Handler().ServeHTTP(c.Writer, c.Request)
		})
	}

	// Swagger UI (disabled in production)
	if cfg.AppEnv != "production" {
		router.GET("/api/v1/docs/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}

	// Asynqmon — queue monitoring dashboard at /admin/queues
	// Protected by ASYNQMON_TOKEN bearer token; empty token allows unrestricted access (dev only).
	// In production always set ASYNQMON_TOKEN to a strong random secret.
	if redisAvailable {
		if cfg.AsynqmonToken == "" && cfg.AppEnv == "production" {
			zlog.Warn().Msg("ASYNQMON_TOKEN is not set — /admin/queues dashboard disabled in production")
		} else {
			mon := asynqmon.New(asynqmon.Options{
				RootPath: "/admin/queues",
				RedisConnOpt: asynq.RedisClientOpt{
					Addr:     cfg.Redis.Addr,
					Password: cfg.Redis.Password,
				},
			})

			// asynqmonAuth enforces bearer token protection for all queue dashboard routes.
			asynqmonAuth := func(c *gin.Context) {
				if token := cfg.AsynqmonToken; token != "" {
					if c.GetHeader("Authorization") != "Bearer "+token {
						c.AbortWithStatus(http.StatusUnauthorized)
						return
					}
				}
				c.Next()
			}

			// Asynqmon uses GET (UI), POST (pause/resume/run/archive/cancel), DELETE (delete tasks/queues).
			// Confirmed from asynqmon v0.7.2 handler.go — no PATCH or PUT routes exist.
			adminQueues := router.Group("/admin/queues", asynqmonAuth)
			for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodDelete} {
				adminQueues.Handle(method, "", func(c *gin.Context) { mon.ServeHTTP(c.Writer, c.Request) })
				adminQueues.Handle(method, "/*path", func(c *gin.Context) { mon.ServeHTTP(c.Writer, c.Request) })
			}

			zlog.Info().Str("path", "/admin/queues").Msg("Asynqmon queue dashboard enabled")
		}
	}

	// Liveness — process is running (used by Kubernetes liveness probe)
	router.GET("/health/liveness", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "alive", "version": appVersion})
	})

	// Readiness — service can handle traffic (checks DB + Redis)
	router.GET("/health/readiness", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()

		deps := gin.H{"database": "ok", "redis": "ok"}
		ready := true

		if err := db.Health(ctx); err != nil {
			deps["database"] = "disconnected"
			ready = false
		}

		if redisAvailable {
			// Use a fresh context so the 500ms Redis ping timeout is independent of
			// the outer 2s handler timeout (a nested deadline is bounded by its parent).
			pingCtx, pingCancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
			defer pingCancel()
			if err := redisClient.Ping(pingCtx).Err(); err != nil {
				deps["redis"] = "disconnected"
				ready = false
			}
		}

		if ready {
			c.JSON(http.StatusOK, gin.H{"status": "ready", "deps": deps, "version": appVersion})
		} else {
			c.Header("Retry-After", "5")
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "not ready", "deps": deps, "version": appVersion})
		}
	})

	// API v1 routes
	api := router.Group("/api/v1")
	api.Use(middleware.I18nMiddleware())
	// Apply a 1 MB body-size cap on all API routes.  Upload endpoints override
	// this with a more generous 10 MB limit registered at the route level.
	api.Use(middleware.RequestSizeLimiter(1 << 20))
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
			logs.POST("/frontend", logHandler.HandleFrontendLogs)
		}

		// Auth routes (no auth required)
		auth := api.Group("/auth")
		{
			// Username/password authentication — 5 attempts per 15 min per IP
			auth.POST("/register", authRateLimiter.Middleware(), authHandler.Register)
			auth.POST("/login", authRateLimiter.Middleware(), authHandler.Login)

			// Password reset — 3 requests per hour per IP
			auth.POST("/forgot-password", passwordResetRateLimiter.Middleware(), authHandler.ForgotPassword)
			auth.POST("/reset-password", passwordResetRateLimiter.Middleware(), authHandler.ResetPassword)
			auth.GET("/validate-reset-token", authHandler.ValidateResetToken)

			// Email verification — 3 requests per hour per IP
			auth.GET("/verify-email", authHandler.VerifyEmail)
			auth.POST("/resend-verification", passwordResetRateLimiter.Middleware(), authHandler.ResendVerification)
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

			// Hub AI design (public — active design only)
			hubs.GET("/:name/ai-design", hubAIDesignerHandler.GetActive)
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
		users.Use(middleware.AuthOptional(authService))
		{
			users.GET("/status", userStatusHandler.GetUsersStatus)
			users.GET("/id/:id/profile", usersHandler.GetUserProfileByID)
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
			analytics.POST("/session/start", analyticsHandler.StartSession)
			analytics.POST("/session/end", analyticsHandler.EndSession)
			analytics.POST("/identify", analyticsHandler.Identify)
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
			protected.POST("/auth/ws-token", authHandler.GenerateWSToken)
			protected.PUT("/auth/public-key", authHandler.UpdatePublicKey)
			protected.GET("/auth/public-keys", authHandler.GetPublicKeys)
			protected.PUT("/auth/encrypted-private-key", authHandler.UpdateEncryptedPrivateKey)
			protected.GET("/auth/encrypted-private-key", authHandler.GetEncryptedPrivateKey)

			protected.GET("/settings", settingsHandler.GetSettings)
			protected.PUT("/settings", settingsHandler.UpdateSettings)
			protected.GET("/users/me/settings", settingsHandler.GetSettings)
			protected.PUT("/users/me/settings", settingsHandler.UpdateSettings)
			protected.GET("/users/me/saved", savedItemsHandler.GetSavedItems)

			// Feature flags (P0-012: check if feature enabled for user)
			protected.GET("/feature-flags", featureFlagsHandler.GetUserFlags)

			// Account deletion (P0-017: GDPR right to erasure)
			protected.POST("/account/delete", accountDeletionHandler.RequestAccountDeletion)
			protected.POST("/account/cancel-deletion", accountDeletionHandler.CancelAccountDeletion)
			protected.GET("/account/deletion-status", accountDeletionHandler.GetAccountDeletionStatus)

			// GDPR Data Export (P0-016: GDPR right to data portability)
			protected.POST("/account/export", dataExportHandler.RequestDataExport)
			protected.GET("/account/export/:export_id", dataExportHandler.GetExportStatus)
			protected.GET("/account/export/:export_id/download", dataExportHandler.DownloadExport)
			protected.GET("/account/exports", dataExportHandler.ListExportRequests)

			// Push notifications (P0-042: device token registration)
			protected.POST("/devices/register", pushNotificationHandler.RegisterDeviceToken)
			protected.DELETE("/devices/unregister", pushNotificationHandler.UnregisterDeviceToken)
			protected.GET("/devices", pushNotificationHandler.GetUserDevices)
			protected.POST("/devices/test", middleware.RequireRole("admin"), pushNotificationHandler.TestNotification)

			protected.GET("/users/me/hidden", savedItemsHandler.GetHiddenItems)
			protected.GET("/hubs/agent-targets", hubsHandler.GetAgentTargets)

			// Theme customization routes with rate limiting

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
			protected.GET("/conversations/archived", conversationsHandler.GetArchivedConversations)
			protected.GET("/conversations/:id", conversationsHandler.GetConversation)
			protected.POST("/conversations/archive-batch", conversationsHandler.ArchiveConversationBatch)
			protected.PUT("/conversations/:id/archive", conversationsHandler.ArchiveConversation)
			protected.PUT("/conversations/:id/unarchive", conversationsHandler.UnarchiveConversation)
			protected.PUT("/conversations/:id/mute", conversationsHandler.MuteConversation)
			protected.PUT("/conversations/:id/unmute", conversationsHandler.UnmuteConversation)
			protected.DELETE("/conversations/:id", conversationsHandler.DeleteConversation)
			protected.POST("/folders", foldersHandler.CreateFolder)
			protected.GET("/folders", foldersHandler.ListFolders)
			protected.PATCH("/folders/:id", foldersHandler.UpdateFolder)
			protected.DELETE("/folders/:id", foldersHandler.DeleteFolder)
			protected.POST("/folders/reorder", foldersHandler.ReorderFolders)
			protected.POST("/folders/:id/conversations/:conv_id", foldersHandler.AddConversationToFolder)
			protected.DELETE("/folders/:id/conversations/:conv_id", foldersHandler.RemoveConversationFromFolder)
			protected.GET("/folders/:id/conversations", foldersHandler.GetFolderConversations)
			protected.GET("/conversations/:id/folders", foldersHandler.GetConversationFolders)

			// Protected messages routes
			protected.POST("/messages", messagesHandler.SendMessage)
			protected.POST("/messages/forward", messagesHandler.ForwardMessage)
			protected.GET("/messages/:id/forward-info", messagesHandler.GetForwardInfo)
			protected.GET("/conversations/:id/messages", messagesHandler.GetMessages)
			protected.GET("/messages/:id/thread", messagesHandler.GetThread)
			protected.PUT("/messages/:id/thread/mute", messagesHandler.MuteThread)
			protected.PUT("/messages/:id/thread/unmute", messagesHandler.UnmuteThread)
			protected.GET("/messages/:id/history", messagesHandler.GetMessageHistory)
			protected.GET("/conversations/:id/pinned-messages", messagesHandler.GetPinnedMessages)
			protected.POST("/conversations/:id/read", messagesHandler.MarkAsRead)
			protected.POST("/messages/:id/read", messagesHandler.MarkSingleMessageAsRead)
			protected.PATCH("/messages/:id", messagesHandler.EditMessage)
			protected.DELETE("/messages/:id", messagesHandler.DeleteMessage)
			protected.POST("/messages/:id/pin", messagesHandler.PinMessage)
			protected.DELETE("/messages/:id/pin", messagesHandler.UnpinMessage)

			// Voice messages (F11)
			protected.POST("/messages/:id/voice", voiceHandler.UploadVoice)
			protected.GET("/messages/:id/voice", voiceHandler.GetVoiceMessage)
			protected.GET("/voice/:id/download", voiceHandler.DownloadVoice)
			protected.GET("/search/messages", searchHandler.SearchMessages)

			// Feature 1: Message Reactions (rate-limited on mutating endpoints)
			protected.GET("/messages/:id/reactions", reactionsHandler.GetReactions)
			protected.POST("/messages/:id/reactions", reactionRateLimiter.Middleware(), reactionsHandler.AddReaction)
			protected.DELETE("/messages/:id/reactions/:reaction_id", reactionRateLimiter.Middleware(), reactionsHandler.RemoveReaction)

			// Group conversation routes
			protected.POST("/groups", groupHandler.CreateGroup)
			protected.GET("/groups", groupHandler.DiscoverGroups)
			protected.GET("/groups/invites", groupHandler.GetMyGroupInvites)
			protected.POST("/groups/invites/:invite_id/accept", groupHandler.AcceptGroupInvite)
			protected.POST("/groups/invites/:invite_id/decline", groupHandler.DeclineGroupInvite)
			protected.GET("/groups/:id/participants", groupHandler.GetGroupParticipants)
			protected.POST("/groups/:id/participants", groupHandler.AddGroupParticipant)
			protected.DELETE("/groups/:id/participants/:user_id", groupHandler.RemoveGroupParticipant)
			protected.PATCH("/groups/:id/participants/:user_id/role", groupHandler.UpdateParticipantRole)
			protected.PUT("/groups/:id", groupHandler.UpdateGroup)
			protected.GET("/groups/:id/settings", groupHandler.GetGroupSettings)
			protected.PUT("/groups/:id/settings", groupHandler.UpdateGroupSettings)
			protected.POST("/groups/:id/invites", groupHandler.CreateGroupInvite)
			protected.POST("/groups/:id/leave", groupHandler.LeaveGroup)
			protected.POST("/groups/:id/transfer-ownership", groupHandler.TransferOwnership)

			// Group admin controls (F10)
			groupAdminHandler := handlers.NewGroupAdminHandler(db.Pool, hub, cache)
			protected.POST("/groups/:id/members/:user_id/mute", groupAdminHandler.MuteGroupMember)
			protected.DELETE("/groups/:id/members/:user_id/mute", groupAdminHandler.UnmuteGroupMember)
			protected.POST("/groups/:id/members/:user_id/ban", groupAdminHandler.BanGroupMember)
			protected.DELETE("/groups/:id/members/:user_id/ban", groupAdminHandler.UnbanGroupMember)
			protected.GET("/groups/:id/restrictions", groupAdminHandler.GetGroupRestrictions)
			protected.GET("/groups/:id/my-restriction", groupAdminHandler.GetMyGroupRestriction)
			protected.DELETE("/groups/:id/messages/:message_id", groupAdminHandler.AdminDeleteMessage)
			protected.PUT("/groups/:id/slow-mode", groupAdminHandler.SetSlowMode)
			protected.GET("/groups/:id/audit-log", groupAdminHandler.GetAuditLog)

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

			// Hub AI Designer routes (requires moderator permissions)
			protected.POST("/hubs/:name/ai-design/generate", aiDesignRateLimiter.Middleware(), hubAIDesignerHandler.Generate)
			protected.GET("/hubs/:name/ai-designs", hubAIDesignerHandler.ListDesigns)
			protected.GET("/hubs/:name/ai-designs/:id", hubAIDesignerHandler.GetDesign)
			protected.POST("/hubs/:name/ai-designs/:id/activate", hubAIDesignerHandler.Activate)
			protected.POST("/hubs/:name/ai-design/deactivate", hubAIDesignerHandler.Deactivate)
			protected.DELETE("/hubs/:name/ai-designs/:id", hubAIDesignerHandler.DeleteDesign)
			protected.PUT("/hubs/:name/ai-designs/:id", hubAIDesignerHandler.UpdateDesign)
			protected.POST("/hubs/:name/ai-designs/:id/copy", hubAIDesignerHandler.CopyDesign)
			protected.GET("/hubs/:name/ai-designs/:id/versions", hubAIDesignerHandler.GetDesignVersions)
			protected.POST("/hubs/:name/ai-designs/:id/versions", hubAIDesignerHandler.SaveDesignVersion)
			protected.POST("/hubs/:name/ai-designs/:id/chat", aiChatRateLimiter.Middleware(), hubAIDesignerHandler.ChatDesign)

			// Voice/Video Call routes (F12)
			protected.POST("/conversations/:id/calls", callsHandler.StartCall)
			protected.GET("/conversations/:id/calls", callsHandler.GetCallHistory)
			protected.POST("/calls/:id/answer", callsHandler.AnswerCall)
			protected.POST("/calls/:id/reject", callsHandler.RejectCall)
			protected.POST("/calls/:id/end", callsHandler.EndCall)
			protected.POST("/calls/:id/signal", callsHandler.Signal)
			protected.GET("/calls/ice-servers", callsHandler.GetICEServers)
			protected.POST("/calls/:id/screen-share/start", callsHandler.StartScreenShare)
			protected.POST("/calls/:id/screen-share/stop", callsHandler.StopScreenShare)

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

			// Media upload (with rate limiting: 10 uploads per minute).
			// A 10 MB per-request cap overrides the 1 MB API-wide limit set above.
			uploadSizeLimiter := middleware.RequestSizeLimiter(10 << 20)
			protected.POST("/media/upload", uploadRateLimiter.Middleware(), uploadSizeLimiter, mediaHandler.UploadMedia)
			// Batch media upload (same request rate limiter as single upload; per-request file count capped in handler)
			protected.POST("/media/batch-upload", uploadRateLimiter.Middleware(), uploadSizeLimiter, mediaHandler.BatchUploadMedia)
			protected.GET("/files/:id/thumbnail", mediaHandler.GetThumbnail)
			// Audio encoding for iOS Safari (P0-003)
			protected.POST("/media/encode-audio", audioEncoderHandler.EncodeAudio)
			// S3 presigned upload URL (REFACTOR_13: direct-to-S3 uploads; 501 when local storage)
			protected.POST("/media/presigned-url", uploadRateLimiter.Middleware(), mediaHandler.GetPresignedURL)
			protected.POST("/media/confirm-upload", uploadRateLimiter.Middleware(), mediaHandler.ConfirmUpload)

			// User profile management
			protected.GET("/users/me/profile", usersHandler.GetMyProfile)
			protected.GET("/users/me/storage", storageHandler.GetMyStorage)
			protected.PUT("/users/me/profile", usersHandler.UpdateProfile)
			protected.POST("/users/me/avatar", usersHandler.UploadMyAvatar)
			protected.PUT("/users/profile", usersHandler.UpdateProfile)
			protected.PUT("/users/email", authHandler.UpdateEmail)
			protected.POST("/users/change-password", usersHandler.ChangePassword)
			protected.POST("/users/me/ping", usersHandler.Ping)

			// Agent activity tracking
			protected.POST("/users/me/agent/post", usersHandler.UpdateLastAgentPostAt)
			protected.POST("/users/me/agent/browse", usersHandler.UpdateLastAgentBrowseAt)
			protected.POST("/users/me/agent/state", usersHandler.GetAgentState)

			// Crypto payments
			protected.POST("/payments/crypto/submit", paymentsHandler.SubmitCryptoPayment)
			protected.GET("/payments/crypto/:txid/status", paymentsHandler.GetPaymentStatus)

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
				admin.GET("/feature-flags", featureFlagsHandler.ListFlags)
				admin.GET("/feature-flags/:key", featureFlagsHandler.GetFeatureFlag)
				admin.POST("/feature-flags", featureFlagsHandler.CreateFlag)
				admin.PUT("/feature-flags/:key", featureFlagsHandler.UpdateFlag)
				admin.DELETE("/feature-flags/:key", featureFlagsHandler.DeleteFlag)
				admin.POST("/feature-flags/:key/overrides", featureFlagsHandler.SetOverride)
				admin.DELETE("/feature-flags/:key/overrides/:userID", featureFlagsHandler.RemoveOverride)
				admin.GET("/feature-flags/:key/audit", featureFlagsHandler.GetAuditLog)

				// Analytics management (P0-027)
				admin.GET("/analytics/dashboard", analyticsHandler.GetDashboard)
				admin.POST("/analytics/refresh", analyticsHandler.RefreshAnalytics)

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

	// Admin-only pprof profiling endpoints.
	// Access requires a valid JWT with role=admin.
	// In production, additionally restrict these routes at the load-balancer
	// or network layer so they are never reachable from the public internet.
	//
	// We use a dedicated ServeMux (not http.DefaultServeMux) for the catch-all
	// /:name handler to avoid exposing any third-party handlers that may have
	// registered themselves on DefaultServeMux via init().
	pprofMux := http.NewServeMux()
	pprofMux.HandleFunc("/debug/pprof/", nethttppprof.Index)
	pprofMux.HandleFunc("/debug/pprof/cmdline", nethttppprof.Cmdline)
	pprofMux.HandleFunc("/debug/pprof/profile", nethttppprof.Profile)
	pprofMux.HandleFunc("/debug/pprof/symbol", nethttppprof.Symbol)
	pprofMux.HandleFunc("/debug/pprof/trace", nethttppprof.Trace)

	pprofGroup := router.Group("/debug/pprof",
		middleware.AuthRequired(authService),
		middleware.RequireRole("admin"),
	)
	{
		pprofGroup.GET("/", gin.WrapF(nethttppprof.Index))
		pprofGroup.GET("/cmdline", gin.WrapF(nethttppprof.Cmdline))
		pprofGroup.GET("/profile", gin.WrapF(nethttppprof.Profile))
		pprofGroup.GET("/symbol", gin.WrapF(nethttppprof.Symbol))
		// /symbol also accepts POST requests (pprof client sends POST with addresses).
		pprofGroup.POST("/symbol", gin.WrapF(nethttppprof.Symbol))
		pprofGroup.GET("/trace", gin.WrapF(nethttppprof.Trace))
		// Catch-all for named profiles (heap, goroutine, block, mutex, threadcreate, …).
		// Uses the dedicated pprofMux (not http.DefaultServeMux) so only explicitly
		// registered pprof handlers are reachable — third-party init() handlers on
		// DefaultServeMux are intentionally excluded.
		// gin.WrapH preserves r.URL.Path (e.g. /debug/pprof/heap) so pprofMux
		// dispatches correctly without path rewriting.
		pprofGroup.GET("/:name", gin.WrapH(pprofMux))
	}

	// Create HTTP server
	addr := cfg.Server.Host + ":" + cfg.Server.Port
	srv := &http.Server{
		Addr: addr,
		// ReadHeaderTimeout guards against Slowloris attacks (slow header delivery).
		// It is a separate timeout from ReadTimeout and must be set explicitly.
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		// WriteTimeout must exceed the longest possible pprof CPU profile duration.
		// The default /debug/pprof/profile runs for 30 s; clients may request up
		// to 60 s via ?seconds=60.  65 s provides a 5-second safety margin.
		WriteTimeout: 65 * time.Second,
		IdleTimeout:  60 * time.Second,
		Handler:      router,
	}

	// Shutdown context — cancelled when SIGTERM/SIGINT is received.
	// Used by background goroutines so they stop promptly on shutdown.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	stopCtx, stopCancel := context.WithCancel(context.Background())
	defer stopCancel()
	go func() {
		<-quit
		stopCancel()
	}()

	// Start server in a goroutine
	go func() {
		zlog.Info().Str("addr", addr).Msg("Server listening")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			zlog.Fatal().Err(err).Msg("Failed to start server")
		}
	}()

	// Wait for shutdown signal (already wired above)
	<-stopCtx.Done()
	zlog.Info().Msg("Shutting down server...")

	// Give outstanding requests 30 seconds to complete (draining window).
	shutdownStart := time.Now()
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		zlog.Error().Err(err).Msg("Server forced to shutdown")
	}

	// Drain WebSocket connections — send close frames to all connected clients.
	hub.Shutdown()

	// Close the queue client so no new jobs are enqueued after shutdown.
	if queueClient != nil {
		if err := queueClient.Close(); err != nil {
			zlog.Warn().Err(err).Msg("Error closing queue client")
		}
	}

	zlog.Info().
		Dur("duration", time.Since(shutdownStart)).
		Msg("shutdown complete")

	// Stop rate limiter eviction goroutines.
	// ORDERING: these Stop() calls must run AFTER srv.Shutdown() (so no new
	// requests arrive) but BEFORE the process exits. cleanupCancel() and
	// workerCancel() are deferred and fire on return from main() — after this
	// block. Do not move these Stop() calls into defers without careful ordering.
	reactionRateLimiter.Stop()
	themeCreationLimiter.Stop()
	themePreviewLimiter.Stop()
	generalLimiter.Stop()
	uploadRateLimiter.Stop()
	handlers.StopLogLimiterEviction()

	// Close Redis connection pool after all handlers have stopped.
	if redisClient != nil {
		if err := redisClient.Close(); err != nil {
			zlog.Warn().Err(err).Msg("Error closing Redis client")
		}
	}

	zlog.Info().Msg("Server exited")
}

// asynqmonDashboard is a swaggo documentation stub for the Asynqmon queue
// monitoring dashboard. The actual handler is wired inline in main() because
// asynqmon provides a net/http handler that cannot be expressed as a named
// gin HandlerFunc. This stub exists solely so swag init can generate the
// OpenAPI entry for the route.
//
// @Summary      Queue monitoring dashboard
// @Description  Asynqmon web UI — view and manage background job queues (active, pending, scheduled, retry, dead). Requires Redis to be available.
// @Tags         Admin
// @Security     BearerAuth
// @Produce      html
// @Success      200  "HTML dashboard"
// @Failure      401  {object}  response.ErrorResponse  "Unauthorized — ASYNQMON_TOKEN required in production"
// @Router       /admin/queues [get]
func asynqmonDashboard() {} //nolint:unused
