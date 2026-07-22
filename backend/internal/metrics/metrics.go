package metrics

import (
	"os"
	"strings"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// metricFactory uses an isolated registry in test binaries to prevent duplicate
// registration panics when both internal/metrics and internal/monitoring are
// imported in the same test binary.
var metricFactory = newMetricFactory()

func newMetricFactory() promauto.Factory {
	if strings.HasSuffix(os.Args[0], ".test") {
		return promauto.With(prometheus.NewRegistry())
	}
	return promauto.With(prometheus.DefaultRegisterer)
}

// Prometheus metrics for monitoring
var (
	// HTTP metrics
	HTTPRequestsTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_http_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"method", "path", "status"},
	)

	HTTPRequestDuration = metricFactory.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_http_request_duration_seconds",
			Help:    "HTTP request duration in seconds",
			Buckets: prometheus.DefBuckets, // 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10
		},
		[]string{"method", "path"},
	)

	HTTPRequestSize = metricFactory.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_http_request_size_bytes",
			Help:    "HTTP request size in bytes",
			Buckets: prometheus.ExponentialBuckets(100, 10, 7), // 100, 1000, 10000, ..., 100000000
		},
		[]string{"method", "path"},
	)

	HTTPResponseSize = metricFactory.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_http_response_size_bytes",
			Help:    "HTTP response size in bytes",
			Buckets: prometheus.ExponentialBuckets(100, 10, 7),
		},
		[]string{"method", "path"},
	)

	// WebSocket metrics
	WebSocketConnectionsActive = metricFactory.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_websocket_connections_active",
			Help: "Number of active WebSocket connections",
		},
	)

	WebSocketConnectionsTotal = metricFactory.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_websocket_connections_total",
			Help: "Total number of WebSocket connections established",
		},
	)

	WebSocketMessagesReceived = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_websocket_messages_received_total",
			Help: "Total number of WebSocket messages received",
		},
		[]string{"message_type"},
	)

	WebSocketMessagesSent = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_websocket_messages_sent_total",
			Help: "Total number of WebSocket messages sent",
		},
		[]string{"message_type"},
	)

	WebSocketErrors = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_websocket_errors_total",
			Help: "Total number of WebSocket errors",
		},
		[]string{"error_type"},
	)

	// Database metrics
	DatabaseQueriesTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_database_queries_total",
			Help: "Total number of database queries",
		},
		[]string{"operation", "table"},
	)

	DatabaseQueryDuration = metricFactory.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_database_query_duration_seconds",
			Help:    "Database query duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"operation", "table"},
	)

	DatabaseConnectionsActive = metricFactory.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_database_connections_active",
			Help: "Number of active database connections",
		},
	)

	DatabaseConnectionsIdle = metricFactory.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_database_connections_idle",
			Help: "Number of idle database connections",
		},
	)

	// Message metrics
	MessagesCreatedTotal = metricFactory.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_messages_created_total",
			Help: "Total number of messages created",
		},
	)

	MessagesSentTotal = metricFactory.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_messages_sent_total",
			Help: "Total number of messages sent successfully",
		},
	)

	MessagesFailedTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_messages_failed_total",
			Help: "Total number of failed message sends",
		},
		[]string{"reason"},
	)

	MessageSendDuration = metricFactory.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "omninudge_message_send_duration_seconds",
			Help:    "Time to send a message (including encryption)",
			Buckets: prometheus.DefBuckets,
		},
	)

	// Encryption metrics
	EncryptionOperationsTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_encryption_operations_total",
			Help: "Total number of encryption operations",
		},
		[]string{"operation", "algorithm"},
	)

	EncryptionDuration = metricFactory.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_encryption_duration_seconds",
			Help:    "Encryption operation duration in seconds",
			Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1},
		},
		[]string{"operation", "algorithm"},
	)

	// Cache metrics (with key_prefix label for per-prefix observability)
	CacheHits = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_cache_hits_total",
			Help: "Total cache hits",
		},
		[]string{"cache_type", "key_prefix"},
	)

	CacheMisses = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_cache_misses_total",
			Help: "Total cache misses",
		},
		[]string{"cache_type", "key_prefix"},
	)

	CacheErrors = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_cache_errors_total",
			Help: "Total cache errors",
		},
		[]string{"cache_type", "operation"},
	)

	CacheEvictionsTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_cache_evictions_total",
			Help: "Total number of cache evictions",
		},
		[]string{"cache_type"},
	)

	// Rate limiting metrics
	RateLimitHitsTotal = metricFactory.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_rate_limit_hits_total",
			Help: "Total number of rate limit events across all tiers (warn + throttle + block).",
		},
	)

	RateLimitRequestsTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_rate_limit_requests_total",
			Help: "Total number of requests checked by rate limiter",
		},
		[]string{"limit_type"},
	)

	RateLimitWarningsTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_rate_limit_warnings_total",
			Help: "Total number of rate limit warnings (token budget < 20%)",
		},
		[]string{"endpoint"},
	)

	RateLimitThrottledTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_rate_limit_throttled_total",
			Help: "Total number of throttled requests (artificial delay applied)",
		},
		[]string{"endpoint"},
	)

	RateLimitBlockedTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_rate_limit_blocked_total",
			Help: "Total number of blocked requests (429 returned)",
		},
		[]string{"endpoint"},
	)

	// File upload metrics
	FileUploadsTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_file_uploads_total",
			Help: "Total number of file uploads",
		},
		[]string{"file_type"},
	)

	FileUploadSize = metricFactory.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_file_upload_size_bytes",
			Help:    "File upload size in bytes",
			Buckets: prometheus.ExponentialBuckets(1024, 10, 8), // 1KB to 10GB
		},
		[]string{"file_type"},
	)

	FileUploadDuration = metricFactory.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_file_upload_duration_seconds",
			Help:    "File upload duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"file_type"},
	)

	// Job queue metrics
	JobsEnqueuedTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_jobs_enqueued_total",
			Help: "Total number of jobs enqueued",
		},
		[]string{"queue", "job_type"},
	)

	JobsCompletedTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_jobs_completed_total",
			Help: "Total number of jobs completed",
		},
		[]string{"queue", "job_type"},
	)

	JobsFailedTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_jobs_failed_total",
			Help: "Total number of jobs failed",
		},
		[]string{"queue", "job_type"},
	)

	JobDuration = metricFactory.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_job_duration_seconds",
			Help:    "Job processing duration in seconds",
			Buckets: prometheus.ExponentialBuckets(0.1, 2, 10), // 0.1s to 51.2s
		},
		[]string{"queue", "job_type"},
	)

	// Reddit API metrics
	RedditAPIRequestsTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_reddit_api_requests_total",
			Help: "Total number of Reddit API requests",
		},
		[]string{"endpoint", "status"},
	)

	RedditAPIRequestDuration = metricFactory.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_reddit_api_request_duration_seconds",
			Help:    "Reddit API request duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"endpoint"},
	)

	RedditAPIRateLimitRemaining = metricFactory.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_reddit_api_rate_limit_remaining",
			Help: "Remaining Reddit API requests before rate limit",
		},
	)
)
