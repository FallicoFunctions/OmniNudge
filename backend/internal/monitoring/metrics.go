package monitoring

import (
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Prometheus metrics for OmniNudge

var (
	// HTTP Metrics
	HTTPRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_http_requests_total",
			Help: "Total number of HTTP requests by method, path, and status",
		},
		[]string{"method", "path", "status"},
	)

	HTTPRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_http_request_duration_seconds",
			Help:    "HTTP request duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path"},
	)

	// WebSocket Metrics
	WebSocketConnectionsActive = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_websocket_connections_active",
			Help: "Number of active WebSocket connections",
		},
	)

	WebSocketMessagesTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_websocket_messages_total",
			Help: "Total number of WebSocket messages by type",
		},
		[]string{"type"}, // message, typing, online_status
	)

	WebSocketMessagesSent = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_websocket_messages_sent_total",
			Help: "Total number of WebSocket messages sent",
		},
	)

	WebSocketMessagesReceived = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_websocket_messages_received_total",
			Help: "Total number of WebSocket messages received",
		},
	)

	// Database Metrics
	DatabaseQueriesTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_database_queries_total",
			Help: "Total number of database queries by operation",
		},
		[]string{"operation"}, // select, insert, update, delete
	)

	DatabaseQueryDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_database_query_duration_seconds",
			Help:    "Database query duration in seconds",
			Buckets: []float64{.001, .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10},
		},
		[]string{"operation"},
	)

	DatabaseConnectionsActive = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_database_connections_active",
			Help: "Number of active database connections",
		},
	)

	DatabaseConnectionsIdle = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_database_connections_idle",
			Help: "Number of idle database connections",
		},
	)

	// Redis Metrics
	RedisCacheHits = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_redis_cache_hits_total",
			Help: "Total number of Redis cache hits",
		},
	)

	RedisCacheMisses = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_redis_cache_misses_total",
			Help: "Total number of Redis cache misses",
		},
	)

	RedisOperationsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_redis_operations_total",
			Help: "Total number of Redis operations by type",
		},
		[]string{"operation"}, // get, set, delete, expire
	)

	RedisOperationDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_redis_operation_duration_seconds",
			Help:    "Redis operation duration in seconds",
			Buckets: []float64{.0001, .0005, .001, .005, .01, .025, .05, .1},
		},
		[]string{"operation"},
	)

	// Queue Metrics
	QueueJobsEnqueued = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_queue_jobs_enqueued_total",
			Help: "Total number of jobs enqueued by queue name",
		},
		[]string{"queue"},
	)

	QueueJobsProcessed = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_queue_jobs_processed_total",
			Help: "Total number of jobs processed by queue name",
		},
		[]string{"queue", "status"}, // success, error
	)

	QueueJobDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_queue_job_duration_seconds",
			Help:    "Queue job processing duration in seconds",
			Buckets: []float64{.1, .5, 1, 5, 10, 30, 60, 300, 600},
		},
		[]string{"queue"},
	)

	QueueDepth = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "omninudge_queue_depth",
			Help: "Number of jobs waiting in queue",
		},
		[]string{"queue"},
	)

	// Email Metrics
	EmailsSent = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_emails_sent_total",
			Help: "Total number of emails sent by type",
		},
		[]string{"type"}, // password_reset, account_deletion, data_export, welcome
	)

	EmailsSendFailed = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_emails_send_failed_total",
			Help: "Total number of failed email sends by type",
		},
		[]string{"type"},
	)

	EmailSendDuration = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "omninudge_email_send_duration_seconds",
			Help:    "Email send duration in seconds",
			Buckets: []float64{.1, .5, 1, 2, 5, 10},
		},
	)

	// User Metrics
	UsersTotal = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_users_total",
			Help: "Total number of registered users",
		},
	)

	UsersOnline = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_users_online",
			Help: "Number of users currently online",
		},
	)

	UsersCreated = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_users_created_total",
			Help: "Total number of users created",
		},
	)

	// Message Metrics
	MessagesTotal = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_messages_total",
			Help: "Total number of messages sent",
		},
	)

	MessagesEncrypted = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_messages_encrypted_total",
			Help: "Total number of encrypted messages sent",
		},
	)

	ConversationsActive = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_conversations_active",
			Help: "Number of active conversations (last 24h)",
		},
	)

	// Post Metrics
	PostsCreated = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_posts_created_total",
			Help: "Total number of posts created by type",
		},
		[]string{"type"}, // text, link, image, video
	)

	PostsViewed = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_posts_viewed_total",
			Help: "Total number of post views",
		},
	)

	CommentsCreated = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_comments_created_total",
			Help: "Total number of comments created",
		},
	)

	// Reddit API Metrics
	RedditAPIRequests = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_reddit_api_requests_total",
			Help: "Total number of Reddit API requests by endpoint",
		},
		[]string{"endpoint"},
	)

	RedditAPIErrors = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_reddit_api_errors_total",
			Help: "Total number of Reddit API errors by type",
		},
		[]string{"type"}, // rate_limit, timeout, server_error, client_error
	)

	RedditAPIRateLimitRemaining = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_reddit_api_rate_limit_remaining",
			Help: "Reddit API rate limit remaining",
		},
	)

	// System Metrics
	SystemMemoryUsage = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_system_memory_usage_bytes",
			Help: "System memory usage in bytes",
		},
	)

	SystemGoroutines = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "omninudge_system_goroutines",
			Help: "Number of goroutines",
		},
	)

	// Error Metrics
	ErrorsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_errors_total",
			Help: "Total number of errors by type",
		},
		[]string{"type", "severity"}, // panic, error, warning
	)

	ModerationReportsCreatedTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_moderation_reports_created_total",
			Help: "Total number of moderation reports created",
		},
		[]string{"reason", "target_type"},
	)

	ModerationReportsResolvedTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_moderation_reports_resolved_total",
			Help: "Total number of moderation reports resolved by final status",
		},
		[]string{"status"},
	)

	ModerationReportResolutionDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_moderation_report_resolution_duration_seconds",
			Help:    "Time from report creation to moderation resolution",
			Buckets: []float64{60, 300, 900, 1800, 3600, 7200, 14400, 28800, 86400, 172800},
		},
		[]string{"status"},
	)

	ModerationAutoSuspensionsTotal = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "omninudge_moderation_auto_suspensions_total",
			Help: "Total number of users auto-suspended from report thresholds",
		},
	)

	ModerationHighPriorityAlertsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_moderation_high_priority_alerts_total",
			Help: "Total number of high-priority moderation alerts created",
		},
		[]string{"reason", "recipient_role"},
	)

	MessageSearchRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_message_search_requests_total",
			Help: "Total number of message search requests",
		},
		[]string{"status", "has_query"}, // status: success|error
	)

	MessageSearchDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_message_search_duration_seconds",
			Help:    "Duration of message search requests",
			Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5},
		},
		[]string{"status", "has_query"},
	)

	MessageSearchResultCount = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "omninudge_message_search_result_count",
			Help:    "Result count returned by message search",
			Buckets: []float64{0, 1, 5, 10, 25, 50, 100, 250, 500, 1000},
		},
		[]string{"status", "has_query"},
	)

	ProfileCacheAccessTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "omninudge_profile_cache_access_total",
			Help: "Total profile cache accesses by result and scope",
		},
		[]string{"result", "scope"}, // result: hit|miss, scope: owner|public
	)

	ProfileReadDuration = promauto.NewHistogramVec(
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
	HTTPRequestsTotal.WithLabelValues(method, path, strconv.Itoa(status)).Inc()
	HTTPRequestDuration.WithLabelValues(method, path).Observe(duration.Seconds())
}

// RecordDatabaseQuery records a database query metric
func RecordDatabaseQuery(operation string, duration time.Duration) {
	DatabaseQueriesTotal.WithLabelValues(operation).Inc()
	DatabaseQueryDuration.WithLabelValues(operation).Observe(duration.Seconds())
}

// RecordRedisOperation records a Redis operation metric
func RecordRedisOperation(operation string, duration time.Duration, hit bool) {
	RedisOperationsTotal.WithLabelValues(operation).Inc()
	RedisOperationDuration.WithLabelValues(operation).Observe(duration.Seconds())

	if operation == "get" {
		if hit {
			RedisCacheHits.Inc()
		} else {
			RedisCacheMisses.Inc()
		}
	}
}

// RecordQueueJob records a queue job metric
func RecordQueueJob(queue string, duration time.Duration, success bool) {
	status := "success"
	if !success {
		status = "error"
	}
	QueueJobsProcessed.WithLabelValues(queue, status).Inc()
	QueueJobDuration.WithLabelValues(queue).Observe(duration.Seconds())
}

// RecordEmailSent records an email sent metric
func RecordEmailSent(emailType string, success bool, duration time.Duration) {
	if success {
		EmailsSent.WithLabelValues(emailType).Inc()
	} else {
		EmailsSendFailed.WithLabelValues(emailType).Inc()
	}
	EmailSendDuration.Observe(duration.Seconds())
}

// RecordError records an error metric
func RecordError(errorType, severity string) {
	ErrorsTotal.WithLabelValues(errorType, severity).Inc()
}

// UpdateDatabasePoolStats updates database connection pool metrics
func UpdateDatabasePoolStats(active, idle int) {
	DatabaseConnectionsActive.Set(float64(active))
	DatabaseConnectionsIdle.Set(float64(idle))
}

// UpdateQueueDepth updates queue depth metric
func UpdateQueueDepth(queue string, depth int) {
	QueueDepth.WithLabelValues(queue).Set(float64(depth))
}

// UpdateUserStats updates user metrics
func UpdateUserStats(total, online int) {
	UsersTotal.Set(float64(total))
	UsersOnline.Set(float64(online))
}

// IncrementWebSocketConnections increments active WebSocket connections
func IncrementWebSocketConnections() {
	WebSocketConnectionsActive.Inc()
}

// DecrementWebSocketConnections decrements active WebSocket connections
func DecrementWebSocketConnections() {
	WebSocketConnectionsActive.Dec()
}

func RecordModerationReportCreated(reason, targetType string) {
	ModerationReportsCreatedTotal.WithLabelValues(reason, targetType).Inc()
}

func RecordModerationReportResolved(status string, resolutionDuration time.Duration) {
	ModerationReportsResolvedTotal.WithLabelValues(status).Inc()
	ModerationReportResolutionDuration.WithLabelValues(status).Observe(resolutionDuration.Seconds())
}

func RecordModerationAutoSuspension() {
	ModerationAutoSuspensionsTotal.Inc()
}

func RecordModerationHighPriorityAlert(reason, recipientRole string) {
	ModerationHighPriorityAlertsTotal.WithLabelValues(reason, recipientRole).Inc()
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
