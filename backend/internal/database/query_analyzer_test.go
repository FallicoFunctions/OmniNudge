package database

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFnv1aHash(t *testing.T) {
	// want values are pre-computed FNV-1a 32-bit hashes (%08x format).
	// These pin the exact hash function implementation so any accidental switch
	// to a different algorithm (FNV-1 vs FNV-1a, 32-bit vs 64-bit) is caught.
	//
	// Derivation (Go):
	//   h := fnv.New32a(); io.WriteString(h, input); fmt.Sprintf("%08x", h.Sum32())
	//   ""                                         → "811c9dc5"  (FNV-1a 32-bit offset basis)
	//   "SELECT 1"                                 → "bce9e8b2"
	//   "SELECT id FROM users WHERE id = $1"       → "c0e708e8"
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "empty string", input: "", want: "811c9dc5"},
		{name: "simple sql", input: "SELECT 1", want: "bce9e8b2"},
		{name: "parametrized query", input: "SELECT id FROM users WHERE id = $1", want: "c0e708e8"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := fnv1aHash(tc.input)
			// Must match pre-computed FNV-1a 32-bit value.
			assert.Equal(t, tc.want, h, "hash must match FNV-1a 32-bit expected value")
			// Must be exactly 8 hex characters.
			assert.Len(t, h, 8)
			// Must be stable (deterministic) across calls.
			assert.Equal(t, h, fnv1aHash(tc.input))
		})
	}
}

func TestFnv1aHashUniqueness(t *testing.T) {
	h1 := fnv1aHash("SELECT 1")
	h2 := fnv1aHash("SELECT 2")
	assert.NotEqual(t, h1, h2, "distinct SQL strings should produce distinct hashes")
}

func TestQueryAnalyzer_BelowThreshold(t *testing.T) {
	// threshold of 10 minutes — nothing should be logged.
	// Use a captured logger to assert no output is produced.
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	qa := NewQueryAnalyzer(10*time.Minute, logger)

	ctx := qa.TraceQueryStart(context.Background(), nil, pgx.TraceQueryStartData{
		SQL:  "SELECT 1",
		Args: nil,
	})
	require.NotNil(t, ctx)

	// end immediately — elapsed << threshold, no log output expected
	qa.TraceQueryEnd(ctx, nil, pgx.TraceQueryEndData{
		Err: nil,
	})

	assert.Empty(t, buf.String(), "no log output should be emitted for a query below the threshold")
}

func TestQueryAnalyzer_AboveThreshold(t *testing.T) {
	// Use threshold of 0 so every query is "slow".
	// Capture log output via a bytes.Buffer-backed slog handler.
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	qa := NewQueryAnalyzer(0, logger)

	ctx := qa.TraceQueryStart(context.Background(), nil, pgx.TraceQueryStartData{
		SQL:  "SELECT id FROM users WHERE id = $1",
		Args: []any{42},
	})
	require.NotNil(t, ctx)

	// A zero threshold means even an instant query exceeds it.
	qa.TraceQueryEnd(ctx, nil, pgx.TraceQueryEndData{
		Err: nil,
	})

	output := buf.String()
	assert.Contains(t, output, "duration_ms", "slow query log must contain duration_ms")
	assert.Contains(t, output, "query_hash", "slow query log must contain query_hash")
	// Raw SQL and table names must never appear in log output (privacy/security).
	assert.NotContains(t, output, "SELECT", "raw SQL must not appear in log output")
	assert.NotContains(t, output, "users", "table names must not appear in log output")
}

func TestQueryAnalyzer_AboveThresholdWithError(t *testing.T) {
	// Use a captured logger so we can assert on the error-path log output.
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	qa := NewQueryAnalyzer(0, logger)

	ctx := qa.TraceQueryStart(context.Background(), nil, pgx.TraceQueryStartData{
		SQL: "SELECT * FROM missing_table",
	})

	qa.TraceQueryEnd(ctx, nil, pgx.TraceQueryEndData{
		Err: errors.New("relation \"missing_table\" does not exist"),
	})

	output := buf.String()
	assert.Contains(t, output, "duration_ms", "slow query log must contain duration_ms")
	assert.Contains(t, output, "query_hash", "slow query log must contain query_hash")
	// Non-pg errors are logged as "err_type" (not "err") — assert the exact field
	// name to avoid a false-positive substring match ("err" is a prefix of "err_type").
	assert.Contains(t, output, "err_type", "error-path log must contain the err_type field for non-pg errors")
	assert.NotContains(t, output, `"err"`, `log must not contain a plain "err" key for non-pg errors`)
	// The raw SQL text passed to TraceQueryStart must not appear in log output.
	// Note: the error message from PostgreSQL (which may mention table names) is
	// allowed to appear in the "err_type" field — we only guard against logging the
	// raw SQL string itself.
	assert.NotContains(t, output, "SELECT * FROM", "raw SQL text must not appear in log output")
}

func TestQueryAnalyzer_MissingStartTime(t *testing.T) {
	// If TraceQueryEnd is called without a prior TraceQueryStart (no start key
	// in context), it should return silently without panicking.
	qa := NewQueryAnalyzer(100*time.Millisecond, nil)
	qa.TraceQueryEnd(context.Background(), nil, pgx.TraceQueryEndData{})
}

func TestNewQueryAnalyzer_DefaultThreshold(t *testing.T) {
	tests := []struct {
		name      string
		threshold time.Duration
	}{
		{"100ms default", 100 * time.Millisecond},
		{"zero threshold", 0},
		{"1s threshold", time.Second},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// Pass nil logger — slow queries will use slog.Default() at log time.
			qa := NewQueryAnalyzer(tc.threshold, nil)
			assert.Equal(t, tc.threshold, qa.threshold)
		})
	}
}

func TestQueryAnalyzer_NilLogger_DoesNotPanic(t *testing.T) {
	// When logger is nil, TraceQueryEnd must fall back to slog.Default()
	// without panicking. This test exercises that code path directly.
	qa := NewQueryAnalyzer(0, nil) // zero threshold — every query is "slow"

	ctx := qa.TraceQueryStart(context.Background(), nil, pgx.TraceQueryStartData{
		SQL:  "SELECT 1",
		Args: nil,
	})
	require.NotNil(t, ctx)

	// Must not panic even though logger is nil.
	assert.NotPanics(t, func() {
		qa.TraceQueryEnd(ctx, nil, pgx.TraceQueryEndData{Err: nil})
	})
}
