package monitoring

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/omninudge/backend/internal/metrics"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Prometheus metrics for OmniNudge

var metricFactory = newMetricFactory()

func newMetricFactory() promauto.Factory {
	// Package tests under handlers pull in both internal/metrics and internal/monitoring.
	// Both define some shared metric names, which can panic on duplicate registration.
	// Use an isolated registry only in test binaries to keep production metrics unchanged.
	if strings.HasSuffix(os.Args[0], ".test") {
		return promauto.With(prometheus.NewRegistry())
	}
	return promauto.With(prometheus.DefaultRegisterer)
}

var (
	// WebSocket Metrics
	WebSocketMessagesTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_websocket_messages_total",
			Help: "Total number of WebSocket messages by type",
		},
		[]string{"type"}, // message, typing, online_status
	)

	// Redis Metrics
	RedisCacheHits = metricFactory.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_redis_cache_hits_total",
			Help: "Total number of Redis cache hits",
		},
	)

	RedisCacheMisses = metricFactory.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_redis_cache_misses_total",
			Help: "Total number of Redis cache misses",
		},
	)

	RedisOperationsTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_redis_operations_total",
			Help: "Total number of Redis operations by type",
		},
		[]string{"operation"}, // get, set, delete, expire
	)

	RedisOperationDuration = metricFactory.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_redis_operation_duration_seconds",
			Help:    "Redis operation duration in seconds",
			Buckets: []float64{.0001, .0005, .001, .005, .01, .025, .05, .1},
		},
		[]string{"operation"},
	)

	// Queue Metrics
	QueueJobsEnqueued = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_queue_jobs_enqueued_total",
			Help: "Total number of jobs enqueued by queue name",
		},
		[]string{"queue"},
	)

	QueueJobsProcessed = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_queue_jobs_processed_total",
			Help: "Total number of jobs processed by queue name",
		},
		[]string{"queue", "status"}, // success, error
	)

	QueueJobDuration = metricFactory.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_queue_job_duration_seconds",
			Help:    "Queue job processing duration in seconds",
			Buckets: []float64{.1, .5, 1, 5, 10, 30, 60, 300, 600},
		},
		[]string{"queue"},
	)

	QueueDepth = metricFactory.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "omninudge_queue_depth",
			Help: "Number of jobs waiting in queue",
		},
		[]string{"queue"},
	)

	// Email Metrics
	EmailsSent = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_emails_sent_total",
			Help: "Total number of emails sent by type",
		},
		[]string{"type"}, // password_reset, account_deletion, data_export, welcome
	)

	EmailsSendFailed = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_emails_send_failed_total",
			Help: "Total number of failed email sends by type",
		},
		[]string{"type"},
	)

	EmailSendDuration = metricFactory.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "omninudge_email_send_duration_seconds",
			Help:    "Email send duration in seconds",
			Buckets: []float64{.1, .5, 1, 2, 5, 10},
		},
	)

	// User Metrics
	UsersTotal = metricFactory.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_users_total",
			Help: "Total number of registered users",
		},
	)

	UsersOnline = metricFactory.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_users_online",
			Help: "Number of users currently online",
		},
	)

	UsersCreated = metricFactory.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_users_created_total",
			Help: "Total number of users created",
		},
	)

	// Message Metrics
	MessagesTotal = metricFactory.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_messages_total",
			Help: "Total number of messages sent",
		},
	)

	MessagesEncrypted = metricFactory.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_messages_encrypted_total",
			Help: "Total number of encrypted messages sent",
		},
	)

	ConversationsActive = metricFactory.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_conversations_active",
			Help: "Number of active conversations (last 24h)",
		},
	)

	// Post Metrics
	PostsCreated = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_posts_created_total",
			Help: "Total number of posts created by type",
		},
		[]string{"type"}, // text, link, image, video
	)

	PostsViewed = metricFactory.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_posts_viewed_total",
			Help: "Total number of post views",
		},
	)

	CommentsCreated = metricFactory.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_comments_created_total",
			Help: "Total number of comments created",
		},
	)

	// Reddit API Metrics
	RedditAPIErrors = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_reddit_api_errors_total",
			Help: "Total number of Reddit API errors by type",
		},
		[]string{"type"}, // rate_limit, timeout, server_error, client_error
	)

	// System Metrics
	SystemMemoryUsage = metricFactory.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_system_memory_usage_bytes",
			Help: "System memory usage in bytes",
		},
	)

	SystemGoroutines = metricFactory.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_system_goroutines",
			Help: "Number of goroutines",
		},
	)

	// Error Metrics
	ErrorsTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_errors_total",
			Help: "Total number of errors by type",
		},
		[]string{"type", "severity"}, // panic, error, warning
	)

	MessageSearchRequestsTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_message_search_requests_total",
			Help: "Total number of message search requests",
		},
		[]string{"status", "has_query"}, // status: success|error
	)

	MessageSearchDuration = metricFactory.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_message_search_duration_seconds",
			Help:    "Duration of message search requests",
			Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5},
		},
		[]string{"status", "has_query"},
	)

	MessageSearchResultCount = metricFactory.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_message_search_result_count",
			Help:    "Result count returned by message search",
			Buckets: []float64{0, 1, 5, 10, 25, 50, 100, 250, 500, 1000},
		},
		[]string{"status", "has_query"},
	)

	ProfileCacheAccessTotal = metricFactory.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_profile_cache_access_total",
			Help: "Total profile cache accesses by result and scope",
		},
		[]string{"result", "scope"}, // result: hit|miss, scope: owner|public
	)

	ProfileReadDuration = metricFactory.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_profile_read_duration_seconds",
			Help:    "Duration of profile read requests",
			Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2},
		},
		[]string{"cache", "status"}, // cache: hit|miss, status: success|not_found|error
	)
)

// RecordHTTPRequest records an HTTP request metric
func RecordHTTPRequest(method, path string, status int, duration time.Duration) {
	metrics.HTTPRequestsTotal.WithLabelValues(method, path, strconv.Itoa(status)).Inc()
	metrics.HTTPRequestDuration.WithLabelValues(method, path).Observe(duration.Seconds())
}

func RecordMessageSearch(duration time.Duration, resultCount int, success bool, hasQuery bool) {
	status := "success"
	if !success {
		status = "error"
	}
	queryLabel := "false"
	if hasQuery {
		queryLabel = "true"
	}

	MessageSearchRequestsTotal.WithLabelValues(status, queryLabel).Inc()
	MessageSearchDuration.WithLabelValues(status, queryLabel).Observe(duration.Seconds())
	MessageSearchResultCount.WithLabelValues(status, queryLabel).Observe(float64(resultCount))
}

func RecordProfileCacheAccess(hit bool, scope string) {
	result := "miss"
	if hit {
		result = "hit"
	}
	ProfileCacheAccessTotal.WithLabelValues(result, scope).Inc()
}

func RecordProfileRead(duration time.Duration, cache string, status string) {
	ProfileReadDuration.WithLabelValues(cache, status).Observe(duration.Seconds())
}
