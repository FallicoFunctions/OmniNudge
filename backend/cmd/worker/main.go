package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/queue"
	"github.com/omninudge/backend/internal/services"
	zlog "github.com/rs/zerolog/log"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		zlog.Info().Msg("No .env file found, using environment variables")
	}

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		zlog.Fatal().Err(err).Msg("Failed to load config")
	}

	// Validate Redis configuration
	if cfg.Redis.Addr == "" {
		zlog.Fatal().Msg("REDIS_ADDR is required for worker")
	}

	zlog.Info().Str("redis", cfg.Redis.Addr).Msg("Starting OmniNudge worker")

	// Initialize database dependencies used by queue handlers.
	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		zlog.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer db.Close()

	mediaRepo := models.NewMediaFileRepository(db.Pool)
	tokenRepo := models.NewDeviceTokenRepository(db.Pool)

	thumbnailService := services.NewThumbnailService()
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

	var storageService services.StorageService
	switch cfg.Storage.StorageBackend {
	case "s3":
		s3Svc, s3Err := services.NewS3StorageService(cfg)
		if s3Err != nil {
			zlog.Fatal().Err(s3Err).Msg("failed to init S3 storage service")
		}
		cfg.Storage.S3SecretKey = ""
		storageService = s3Svc
		zlog.Info().Str("bucket", cfg.Storage.S3Bucket).Str("region", cfg.Storage.S3Region).Msg("worker: S3 storage initialized")
	default:
		// NOTE: base dir must match the server's upload directory so the worker
		// can Download files that were uploaded by the server (e.g. for video transcode).
		localSvc, localErr := services.NewLocalStorageService("./uploads", cfg.FrontendURL+"/uploads")
		if localErr != nil {
			zlog.Fatal().Err(localErr).Msg("failed to initialize local storage service")
		}
		storageService = localSvc
		zlog.Info().Msg("worker: local filesystem storage initialized")
	}

	var voiceStorage services.StorageService
	if cfg.Storage.StorageBackend == "s3" {
		voiceStorage = storageService
	} else {
		vs, vsErr := services.NewLocalStorageService("./uploads/voice", cfg.FrontendURL+"/uploads/voice")
		if vsErr != nil {
			zlog.Fatal().Err(vsErr).Msg("failed to initialize voice storage service")
		}
		voiceStorage = vs
	}

	var firebaseService *services.FirebaseService
	if cfg.Firebase.CredentialsPath != "" {
		firebaseService, err = services.NewFirebaseService(cfg.Firebase.CredentialsPath)
		if err != nil {
			zlog.Warn().Err(err).Msg("Firebase initialization failed, push notification jobs will be no-op")
		}
	}

	var virusScanner services.VirusScanner
	if cfg.VirusScan.Enabled {
		virusScanner = services.NewClamAVScanner(
			cfg.VirusScan.ClamAVNetwork,
			cfg.VirusScan.ClamAVAddress,
			time.Duration(cfg.VirusScan.TimeoutSeconds)*time.Second,
		)
		if err := virusScanner.Ping(context.Background()); err != nil {
			zlog.Warn().Err(err).Msg("ClamAV ping failed")
		} else {
			zlog.Info().Str("network", cfg.VirusScan.ClamAVNetwork).Str("address", cfg.VirusScan.ClamAVAddress).Msg("Virus scanner ready")
		}
	} else {
		zlog.Warn().Msg("Virus scan disabled via VIRUS_SCAN_ENABLED=false")
	}

	// Create worker with concurrency
	// Default: 10 concurrent workers, can be configured via WORKER_CONCURRENCY env var
	concurrency := 10
	if envConcurrency := os.Getenv("WORKER_CONCURRENCY"); envConcurrency != "" {
		var parsed int
		if _, err := fmt.Sscanf(envConcurrency, "%d", &parsed); err == nil && parsed > 0 {
			concurrency = parsed
		}
	}

	worker := queue.NewWorker(cfg.Redis.Addr, cfg.Redis.Password, concurrency)
	queueClient := queue.NewQueueClient(cfg.Redis.Addr, cfg.Redis.Password)

	// Register all job handlers
	handlers := queue.JobHandlers{
		VirusScan:           queue.NewVirusScanHandler(mediaRepo, virusScanner, cfg.VirusScan.FailClosed, storageService, queueClient),
		Transcription:       queue.NewUnsupportedHandler(queue.JobTypeTranscription, "transcription backend pipeline is not yet implemented"),
		Notification:        queue.NewNotificationHandler(tokenRepo, firebaseService),
		ThumbnailGeneration: queue.NewThumbnailGenerationHandler(mediaRepo, thumbnailService, storageService),
		EmailSend:           queue.NewEmailHandler(emailService),
		DataExport:          queue.NewDataExportHandler(db.Pool, storageService, cfg.Encryption.Key, emailService),
		ContentModeration:   queue.NewUnsupportedHandler(queue.JobTypeContentModeration, "content moderation backend is not yet implemented"),
		MessageReencrypt:    queue.NewUnsupportedHandler(queue.JobTypeMessageReencrypt, "message re-encryption backend pipeline is not yet implemented"),
		WaveformGeneration:  queue.NewWaveformJobHandler(db.Pool, voiceStorage).Handle,
		VideoTranscode:      queue.NewVideoTranscodeHandler(db.Pool, "./uploads/hls", storageService).Handle,
	}

	worker.RegisterAllHandlers(handlers)

	zlog.Info().Int("concurrency", concurrency).Msg("Worker configured")
	zlog.Info().Strs("handlers", []string{"virus_scan", "transcription", "notification", "thumbnail_generation", "email_send", "data_export", "content_moderation", "message_reencrypt", "waveform_generation", "video_transcode"}).Msg("Registered job handlers")

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Start worker in a goroutine so we can wait for the signal below.
	workerErrChan := make(chan error, 1)
	go func() {
		workerErrChan <- worker.Start()
	}()

	select {
	case sig := <-sigChan:
		zlog.Info().Str("signal", sig.String()).Msg("Received shutdown signal, gracefully stopping worker")
		worker.Shutdown()
	case err := <-workerErrChan:
		if err != nil {
			zlog.Fatal().Err(err).Msg("Worker failed")
		}
	}
}
