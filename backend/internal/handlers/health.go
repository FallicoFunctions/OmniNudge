package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// HealthHandler handles health check endpoints
type HealthHandler struct {
	db    *pgxpool.Pool
	redis *redis.Client
}

// NewHealthHandler creates a new health handler
func NewHealthHandler(db *pgxpool.Pool, redis *redis.Client) *HealthHandler {
	return &HealthHandler{
		db:    db,
		redis: redis,
	}
}

// LivenessProbe checks if the application is running
// Used by Kubernetes liveness probe
func (h *HealthHandler) LivenessProbe(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "alive",
		"time":   time.Now().Unix(),
	})
}

// ReadinessProbe checks if the application is ready to serve traffic
// Used by Kubernetes readiness probe
func (h *HealthHandler) ReadinessProbe(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	checks := make(map[string]string)
	ready := true

	// Check database
	if h.db != nil {
		err := h.db.Ping(ctx)
		if err != nil {
			checks["database"] = "unhealthy: " + err.Error()
			ready = false
		} else {
			checks["database"] = "healthy"
		}
	} else {
		checks["database"] = "not configured"
	}

	// Check Redis
	if h.redis != nil {
		err := h.redis.Ping(ctx).Err()
		if err != nil {
			checks["redis"] = "unhealthy: " + err.Error()
			ready = false
		} else {
			checks["redis"] = "healthy"
		}
	} else {
		checks["redis"] = "not configured"
	}

	status := http.StatusOK
	if !ready {
		status = http.StatusServiceUnavailable
	}

	c.JSON(status, gin.H{
		"status": map[string]interface{}{
			"ready":  ready,
			"checks": checks,
			"time":   time.Now().Unix(),
		},
	})
}

// HealthCheck provides detailed health information
func (h *HealthHandler) HealthCheck(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	health := gin.H{
		"status":    "healthy",
		"timestamp": time.Now().Unix(),
		"version":   "1.0.0", // TODO: Get from build info
		"services":  gin.H{},
	}

	services := make(map[string]interface{})

	// Database health
	if h.db != nil {
		dbHealth := h.checkDatabase(ctx)
		services["database"] = dbHealth
		if status, ok := dbHealth["status"].(string); ok && status != "healthy" {
			health["status"] = "degraded"
		}
	}

	// Redis health
	if h.redis != nil {
		redisHealth := h.checkRedis(ctx)
		services["redis"] = redisHealth
		if status, ok := redisHealth["status"].(string); ok && status != "healthy" {
			health["status"] = "degraded"
		}
	}

	health["services"] = services

	c.JSON(http.StatusOK, health)
}

func (h *HealthHandler) checkDatabase(ctx context.Context) gin.H {
	start := time.Now()

	err := h.db.Ping(ctx)
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return gin.H{
			"status":  "unhealthy",
			"error":   err.Error(),
			"latency": latency,
		}
	}

	stats := h.db.Stat()

	return gin.H{
		"status":             "healthy",
		"latency_ms":         latency,
		"connections_total":  stats.TotalConns(),
		"connections_active": stats.AcquiredConns(),
		"connections_idle":   stats.IdleConns(),
	}
}

func (h *HealthHandler) checkRedis(ctx context.Context) gin.H {
	start := time.Now()

	pong, err := h.redis.Ping(ctx).Result()
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return gin.H{
			"status":  "unhealthy",
			"error":   err.Error(),
			"latency": latency,
		}
	}

	// Get Redis info
	info, err := h.redis.Info(ctx, "stats").Result()
	if err != nil {
		return gin.H{
			"status":     "healthy",
			"latency_ms": latency,
			"ping":       pong,
		}
	}

	return gin.H{
		"status":     "healthy",
		"latency_ms": latency,
		"ping":       pong,
		"info":       info,
	}
}
