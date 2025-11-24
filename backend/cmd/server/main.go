package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/chatreddit/backend/internal/api/middleware"
	"github.com/chatreddit/backend/internal/config"
	"github.com/chatreddit/backend/internal/database"
	"github.com/chatreddit/backend/internal/handlers"
	"github.com/chatreddit/backend/internal/models"
	"github.com/chatreddit/backend/internal/services"
	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	log.Printf("Starting ChatReddit server...")

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

	// Initialize services
	authService := services.NewAuthService(
		cfg.Reddit.ClientID,
		cfg.Reddit.ClientSecret,
		cfg.Reddit.RedirectURI,
		cfg.JWT.Secret,
		cfg.Reddit.UserAgent,
	)

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(authService, userRepo)

	// Setup Gin router
	router := gin.Default()

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
			auth.GET("/reddit", authHandler.RedditLogin)
			auth.GET("/reddit/callback", authHandler.RedditCallback)
		}

		// Protected routes (auth required)
		protected := api.Group("")
		protected.Use(middleware.AuthRequired(authService))
		{
			protected.GET("/auth/me", authHandler.GetMe)
			protected.POST("/auth/logout", authHandler.Logout)
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
