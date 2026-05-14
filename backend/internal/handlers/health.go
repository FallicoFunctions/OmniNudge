package handlers

import (
	"bufio"
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	zlog "github.com/rs/zerolog/log"
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

// LivenessProbe checks if the application is running.
// Used by Kubernetes liveness probe
// @Summary      Liveness probe
// @Tags         Health
// @Produce      json
// @Success      200  {object}  gin.H
// @Router       /health/liveness [get]
func (h *HealthHandler) LivenessProbe(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "alive",
		"time":   time.Now().Unix(),
	})
}

// ReadinessProbe checks if the application is ready to serve traffic.
// Used by Kubernetes readiness probe
// @Summary      Readiness probe
// @Tags         Health
// @Produce      json
// @Success      200   {object}  gin.H
// @Failure      503   {object}  gin.H
// @Router       /health/readiness [get]
func (h *HealthHandler) ReadinessProbe(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	checks := make(map[string]string)
	ready := true

	// Check database
	if h.db != nil {
		err := h.db.Ping(ctx)
		if err != nil {
			// BUG-14: Do not expose raw error string; log server-side.
			zlog.Error().Err(err).Msg("readiness: database unhealthy")
			checks["database"] = "unhealthy"
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
			// BUG-14: Do not expose raw error string; log server-side.
			zlog.Error().Err(err).Msg("readiness: redis unhealthy")
			checks["redis"] = "unhealthy"
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

// HealthCheck provides detailed health information.
// @Summary      Detailed health check
// @Tags         Health
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      503  {object}  gin.H
// @Router       /health [get]
func (h *HealthHandler) HealthCheck(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	health := gin.H{
		"status":    "healthy",
		"timestamp": time.Now().Unix(),
		"version":   "dev",
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

	// BUG-15: Return 503 when any service is unhealthy or degraded.
	httpStatus := http.StatusOK
	if s, ok := health["status"].(string); ok && (s == "unhealthy" || s == "degraded") {
		httpStatus = http.StatusServiceUnavailable
	}

	c.JSON(httpStatus, health)
}

func (h *HealthHandler) checkDatabase(ctx context.Context) gin.H {
	start := time.Now()

	err := h.db.Ping(ctx)
	latency := time.Since(start).Milliseconds()

	if err != nil {
		// BUG-14: Log error server-side; return generic "unhealthy" to caller.
		zlog.Error().Err(err).Msg("health: database ping failed")
		return gin.H{
			"status":  "unhealthy",
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
		// BUG-14: Log error server-side; return generic "unhealthy" to caller.
		zlog.Error().Err(err).Msg("health: redis ping failed")
		return gin.H{
			"status":  "unhealthy",
			"latency": latency,
		}
	}

	// BUG-16: Parse Redis INFO output and return only safe, known fields.
	// Do not return the raw multi-line INFO string in the response.
	safeInfo := h.parseRedisInfoStats(ctx)

	result := gin.H{
		"status":     "healthy",
		"latency_ms": latency,
		"ping":       pong,
	}
	for k, v := range safeInfo {
		result[k] = v
	}
	return result
}

// parseRedisInfoStats fetches Redis INFO stats and extracts only safe, known fields.
// BUG-16: Only whitelisted fields are returned; raw INFO string is never exposed.
func (h *HealthHandler) parseRedisInfoStats(ctx context.Context) map[string]string {
	info, err := h.redis.Info(ctx, "stats", "clients", "memory").Result()
	if err != nil {
		return nil
	}

	allowed := map[string]bool{
		"used_memory_human":        true,
		"connected_clients":        true,
		"total_commands_processed": true,
	}

	result := make(map[string]string, 3)
	scanner := bufio.NewScanner(strings.NewReader(info))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "#") || line == "" {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		if allowed[key] {
			result[key] = val
		}
	}
	return result
}
