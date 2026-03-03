// Package audit provides structured audit logging for security-relevant events.
package audit

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// MaxActionLen is the maximum permitted length for an action string.
	MaxActionLen = 100

	// MaxMetadataKeys caps the number of key-value pairs stored per audit event.
	MaxMetadataKeys = 20

	// MaxMetadataValueLen caps the length of any single string value in metadata.
	MaxMetadataValueLen = 1000
)

// AuditLogger writes structured audit events to the audit_logs table.
type AuditLogger struct {
	pool *pgxpool.Pool
}

// NewAuditLogger creates a new AuditLogger backed by the given connection pool.
func NewAuditLogger(pool *pgxpool.Pool) *AuditLogger {
	return &AuditLogger{pool: pool}
}

// sanitizeMetadata bounds-checks the metadata map before it is marshalled to
// JSON.  It limits the number of keys to maxMetadataKeys and truncates any
// string values longer than maxMetadataValueLen.  A nil input is returned as
// an empty map so the database column always receives a valid JSON object
// rather than a JSON null.
func sanitizeMetadata(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	// Sort keys before iterating so that which keys are kept (when the map
	// exceeds maxMetadataKeys) is deterministic across Go versions and runs.
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make(map[string]any, min(len(keys), MaxMetadataKeys))
	for i, k := range keys {
		if i >= MaxMetadataKeys {
			break
		}
		if s, ok := m[k].(string); ok {
			if len(s) > MaxMetadataValueLen {
				s = s[:MaxMetadataValueLen]
			}
			out[k] = s
		} else {
			out[k] = m[k]
		}
	}
	return out
}

// Log inserts a single audit event into the audit_logs table.
//
// userID, targetType, targetID, ipAddress and userAgent are all optional; pass
// nil / empty string when not applicable.  metadata may be nil.
func (a *AuditLogger) Log(
	ctx context.Context,
	userID *int,
	action string,
	targetType string,
	targetID *int,
	ipAddress string,
	userAgent string,
	metadata map[string]any,
) error {
	if len(action) > MaxActionLen {
		return fmt.Errorf("audit: action exceeds max length of %d characters", MaxActionLen)
	}

	metadata = sanitizeMetadata(metadata)

	metaJSON, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("audit: marshal metadata: %w", err)
	}

	// Convert empty strings to nil so PostgreSQL stores NULL for optional fields.
	var ipArg *string
	if ipAddress != "" {
		ipArg = &ipAddress
	}
	var uaArg *string
	if userAgent != "" {
		uaArg = &userAgent
	}
	var ttArg *string
	if targetType != "" {
		ttArg = &targetType
	}

	const q = `
		INSERT INTO audit_logs
		    (user_id, action, target_type, target_id, ip_address, user_agent, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`

	if _, err := a.pool.Exec(ctx, q,
		userID, action, ttArg, targetID, ipArg, uaArg, metaJSON,
	); err != nil {
		return fmt.Errorf("audit: insert audit_logs: %w", err)
	}

	return nil
}
