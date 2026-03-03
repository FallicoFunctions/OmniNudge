package audit_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/omninudge/backend/internal/audit"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)


func TestAuditLogger_Log(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	logger := audit.NewAuditLogger(db.Pool)
	ctx := context.Background()

	// Seed a real user so that the audit_logs.user_id FK constraint is satisfied.
	fx := testutil.NewFixtures(t, db)
	seededUser := fx.CreateUser("auditlogger_user")
	userID := seededUser.ID
	targetID := seededUser.ID

	tests := []struct {
		name       string
		userID     *int
		action     string
		targetType string
		targetID   *int
		ipAddress  string
		userAgent  string
		metadata   map[string]any
	}{
		{
			name:       "full event with all fields",
			userID:     &userID,
			action:     "audit_test_login",
			targetType: "user",
			targetID:   &targetID,
			ipAddress:  "127.0.0.1",
			userAgent:  "Go-Test/1.0",
			metadata:   map[string]any{"method": "password"},
		},
		{
			name:       "minimal event — no optional fields",
			userID:     nil,
			action:     "audit_test_page_view",
			targetType: "",
			targetID:   nil,
			ipAddress:  "",
			userAgent:  "",
			metadata:   nil,
		},
		{
			name:       "admin ban event",
			userID:     &userID,
			action:     "audit_test_ban_user",
			targetType: "user",
			targetID:   &targetID,
			ipAddress:  "10.0.0.1",
			userAgent:  "Mozilla/5.0",
			metadata:   map[string]any{"reason": "spam", "duration": "permanent"},
		},
		{
			name:       "empty metadata map",
			userID:     nil,
			action:     "audit_test_unknown",
			targetType: "",
			targetID:   nil,
			ipAddress:  "",
			userAgent:  "",
			metadata:   map[string]any{},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := logger.Log(ctx,
				tc.userID, tc.action, tc.targetType, tc.targetID,
				tc.ipAddress, tc.userAgent, tc.metadata,
			)
			require.NoError(t, err)

			// Verify exactly one row was written for this unique action.
			var count int
			err = db.Pool.QueryRow(ctx,
				"SELECT COUNT(*) FROM audit_logs WHERE action = $1", tc.action,
			).Scan(&count)
			require.NoError(t, err)
			assert.Equal(t, 1, count, "expected exactly one row for action %q", tc.action)

			// Also assert the stored action value matches what was written.
			var storedAction string
			err = db.Pool.QueryRow(ctx,
				"SELECT action FROM audit_logs WHERE action = $1 ORDER BY id DESC LIMIT 1",
				tc.action,
			).Scan(&storedAction)
			require.NoError(t, err)
			assert.Equal(t, tc.action, storedAction)

			// Fix 9: round-trip ip_address, user_agent, target_type for the full-fields case.
			// Use host(ip_address) to get the bare IP without the /32 CIDR suffix that
			// PostgreSQL appends when casting inet back to text.
			if tc.ipAddress != "" {
				var storedIP, storedUA, storedTargetType string
				err = db.Pool.QueryRow(ctx,
					"SELECT COALESCE(host(ip_address),''), COALESCE(user_agent,''), COALESCE(target_type,'') FROM audit_logs WHERE action=$1 ORDER BY id DESC LIMIT 1",
					tc.action,
				).Scan(&storedIP, &storedUA, &storedTargetType)
				require.NoError(t, err)
				assert.Equal(t, tc.ipAddress, storedIP)
				assert.Equal(t, tc.userAgent, storedUA)
				assert.Equal(t, tc.targetType, storedTargetType)
			}

			// Fix 5: for the minimal/empty-fields case, verify NULL storage.
			if tc.ipAddress == "" && tc.userAgent == "" && tc.targetType == "" {
				var ipNull, uaNull bool
				err = db.Pool.QueryRow(ctx,
					"SELECT ip_address IS NULL, user_agent IS NULL FROM audit_logs WHERE action=$1 ORDER BY id DESC LIMIT 1",
					tc.action,
				).Scan(&ipNull, &uaNull)
				require.NoError(t, err)
				assert.True(t, ipNull, "empty ipAddress should be stored as NULL")
				assert.True(t, uaNull, "empty userAgent should be stored as NULL")
			}
		})
	}
}

// TestAuditLogger_Log_ActionTooLong verifies that actions exceeding the 100-
// character limit are rejected before any DB write is attempted.
func TestAuditLogger_Log_ActionTooLong(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	logger := audit.NewAuditLogger(db.Pool)
	ctx := context.Background()

	longAction := strings.Repeat("x", audit.MaxActionLen+1)
	err := logger.Log(ctx, nil, longAction, "", nil, "", "", nil)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "exceeds max length")
}

// TestAuditLogger_Log_NilMetadata verifies that a nil metadata map is stored
// as a valid JSON object ({}) rather than null, ensuring downstream consumers
// never receive a JSON null for the metadata column.
func TestAuditLogger_Log_NilMetadata(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	logger := audit.NewAuditLogger(db.Pool)
	ctx := context.Background()

	require.NoError(t, logger.Log(ctx, nil, "nil_meta_test", "", nil, "", "", nil))

	// The metadata column should contain a JSON object, not null.
	var rawMeta []byte
	err := db.Pool.QueryRow(ctx,
		"SELECT metadata FROM audit_logs WHERE action = 'nil_meta_test' ORDER BY id DESC LIMIT 1",
	).Scan(&rawMeta)
	require.NoError(t, err)
	assert.Equal(t, "{}", string(rawMeta))
}

// TestAuditLogger_Log_MetadataSanitization verifies that oversized metadata
// (too many keys or values that are too long) is truncated gracefully rather
// than returning an error.
func TestAuditLogger_Log_MetadataSanitization(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	logger := audit.NewAuditLogger(db.Pool)
	ctx := context.Background()

	// Build a metadata map with a value that exceeds the 1000-char limit.
	longValue := strings.Repeat("a", 1500)
	meta := map[string]any{"big": longValue}

	err := logger.Log(ctx, nil, "meta_sanitize_test", "", nil, "", "", meta)
	require.NoError(t, err)

	var count int
	err = db.Pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM audit_logs WHERE action = 'meta_sanitize_test'",
	).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 1, count)

	// Fix 21: read back the metadata column and assert the "big" key's value
	// was truncated to at most maxMetadataValueLen bytes.
	var metaBytes []byte
	err = db.Pool.QueryRow(ctx,
		"SELECT metadata FROM audit_logs WHERE action = 'meta_sanitize_test' ORDER BY id DESC LIMIT 1",
	).Scan(&metaBytes)
	require.NoError(t, err)
	var stored map[string]any
	require.NoError(t, json.Unmarshal(metaBytes, &stored))
	if bigVal, ok := stored["big"].(string); ok {
		assert.LessOrEqual(t, len(bigVal), audit.MaxMetadataValueLen,
			"stored 'big' value must not exceed MaxMetadataValueLen (%d)", audit.MaxMetadataValueLen)
	}
}
