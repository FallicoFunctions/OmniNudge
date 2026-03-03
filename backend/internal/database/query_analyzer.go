package database

import (
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"io"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// queryCtxKey is a private type used to avoid context key collisions.
type queryCtxKey struct{}

// queryCtxValue holds per-query state stored in the context by TraceQueryStart.
type queryCtxValue struct {
	startedAt time.Time
	sqlHash   string // FNV-1a hex hash of the SQL text
}

// QueryAnalyzer is a pgx.QueryTracer that logs queries exceeding a configurable
// duration threshold. Raw SQL and bind values are never logged; only an FNV-1a
// hash of the SQL text is emitted so slow queries can be correlated without
// leaking user data.
type QueryAnalyzer struct {
	threshold time.Duration
	logger    *slog.Logger
}

// NewQueryAnalyzer creates a QueryAnalyzer with the given threshold.
// Queries whose execution time exceeds threshold are emitted as structured
// warning log lines. If logger is nil, slog.Default() is used at log time
// (not at construction time), so replacing the default logger after creation
// is reflected in subsequent slow-query log lines.
// A zero or negative threshold causes every query to be logged.
func NewQueryAnalyzer(threshold time.Duration, logger *slog.Logger) *QueryAnalyzer {
	return &QueryAnalyzer{
		threshold: threshold,
		logger:    logger,
	}
}

// TraceQueryStart implements pgx.QueryTracer.
// It records the wall-clock start time and a hash of the SQL in the returned
// context so TraceQueryEnd can compute duration and identify the query.
func (qa *QueryAnalyzer) TraceQueryStart(
	ctx context.Context,
	_ *pgx.Conn,
	data pgx.TraceQueryStartData,
) context.Context {
	return context.WithValue(ctx, queryCtxKey{}, queryCtxValue{
		startedAt: time.Now(),
		sqlHash:   fnv1aHash(data.SQL),
	})
}

// TraceQueryEnd implements pgx.QueryTracer.
// If the query duration exceeds the configured threshold it logs a structured
// warning with duration_ms, query_hash, and any non-nil error.
func (qa *QueryAnalyzer) TraceQueryEnd(
	ctx context.Context,
	_ *pgx.Conn,
	data pgx.TraceQueryEndData,
) {
	val, ok := ctx.Value(queryCtxKey{}).(queryCtxValue)
	if !ok {
		return
	}

	elapsed := time.Since(val.startedAt)
	if elapsed < qa.threshold {
		return
	}

	attrs := []any{
		slog.Int64("duration_ms", elapsed.Milliseconds()),
		slog.String("query_hash", val.sqlHash),
	}
	if data.Err != nil {
		// PostgreSQL error DETAIL and HINT fields can contain row data (e.g.
		// "Key (email)=(user@example.com) already exists"). Log only the safe
		// fields: severity, code, and message (which never contain row values).
		var pgErr *pgconn.PgError
		if errors.As(data.Err, &pgErr) {
			attrs = append(attrs,
				slog.String("pg_severity", pgErr.Severity),
				slog.String("pg_code", pgErr.Code),
				slog.String("pg_message", pgErr.Message),
			)
		} else {
			// Non-PostgreSQL error: log only the root error type, not the message,
			// to avoid accidentally surfacing user data embedded in error strings
			// (e.g. driver-level errors that include query text or bind values).
			// We unwrap to the root cause so we log e.g. "*net.OpError" rather
			// than "*fmt.wrapError" which is the wrapper type for fmt.Errorf("%w").
			root := data.Err
			for {
				u := errors.Unwrap(root)
				if u == nil {
					break
				}
				root = u
			}
			attrs = append(attrs, slog.String("err_type", fmt.Sprintf("%T", root)))
		}
	}

	// Use the stored logger if set, otherwise fall back to slog.Default() at
	// log time. This means replacing the default logger after construction will
	// be reflected in subsequent slow-query log lines.
	logger := qa.logger
	if logger == nil {
		logger = slog.Default()
	}
	logger.WarnContext(ctx, "slow query detected", attrs...)
}

// fnv1aHash computes an FNV-1a 32-bit hash of s and returns it as an 8-digit
// lowercase hex string. Using a hash prevents raw SQL from appearing in logs.
//
// Collision space: 2^32 (~4 billion) distinct values. For typical applications
// with hundreds of distinct SQL patterns this is astronomically collision-free.
// If your schema has thousands of unique query shapes, consider upgrading to
// FNV-1a 64-bit (fnv.New64a) for extra headroom.
func fnv1aHash(s string) string {
	h := fnv.New32a()
	_, _ = io.WriteString(h, s) // avoids []byte allocation vs h.Write([]byte(s))
	return fmt.Sprintf("%08x", h.Sum32())
}
