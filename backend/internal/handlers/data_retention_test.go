package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func seedRetentionSettings(t *testing.T, db *database.Database) {
	t.Helper()
	ctx := context.Background()
	_, err := db.Pool.Exec(ctx, `
		INSERT INTO retention_settings (data_type, retention_days, description, action, reason) VALUES
		    ('messages', 1095, 'Direct messages', 'Delete', 'GDPR'),
		    ('call_logs', 365, 'Call logs', 'Delete', 'Billing'),
		    ('archived_conversations', 365, 'Archived conversations', 'Delete', 'User archived'),
		    ('analytics_events', 730, 'Analytics events', 'Anonymize', 'GDPR'),
		    ('deleted_users', 30, 'Deleted users', 'Delete', 'Grace period'),
		    ('audit_logs', 2555, 'Audit logs', 'Keep', 'Legal'),
		    ('database_backups', 90, 'DB backups', 'Delete', 'DR')
		ON CONFLICT (data_type) DO NOTHING
	`)
	require.NoError(t, err)
}

func setupDataRetentionTest(t *testing.T) (*DataRetentionHandler, int, int, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	seedRetentionSettings(t, db)

	userRepo := models.NewUserRepository(db.Pool)

	adminUser := &models.User{Username: uniqueBlockingMsgName("dradmin"), PasswordHash: "hash", Role: "admin"}
	require.NoError(t, userRepo.Create(ctx, adminUser))

	nonAdmin := &models.User{Username: uniqueBlockingMsgName("druser"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, nonAdmin))

	handler := NewDataRetentionHandler(db.Pool)
	return handler, adminUser.ID, nonAdmin.ID, func() { db.Close() }
}

func makeRetentionRouter(handler *DataRetentionHandler, userID int, isAdmin bool) *gin.Engine {
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("user_id", userID)
		if isAdmin {
			c.Set("role", "admin")
		}
		c.Next()
	})
	r.GET("/admin/retention/policy", handler.GetRetentionPolicy)
	r.PUT("/admin/retention/policy/:data_type", handler.UpdateRetentionPolicy)
	r.GET("/admin/retention/status", handler.GetRetentionStatus)
	r.GET("/admin/retention/history", handler.GetRetentionHistory)
	return r
}

func TestGetRetentionPolicy_Admin(t *testing.T) {
	handler, adminID, _, cleanup := setupDataRetentionTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := makeRetentionRouter(handler, adminID, true)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/admin/retention/policy", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Contains(t, resp, "policies")
}

func TestGetRetentionStatus_Admin(t *testing.T) {
	handler, adminID, _, cleanup := setupDataRetentionTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := makeRetentionRouter(handler, adminID, true)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/admin/retention/status", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Contains(t, resp, "retention_status")
}

func TestUpdateRetentionPolicy_Admin(t *testing.T) {
	handler, adminID, _, cleanup := setupDataRetentionTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := makeRetentionRouter(handler, adminID, true)

	body, _ := json.Marshal(map[string]interface{}{
		"retention_days": 500,
		"reason":         "test update",
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPut, "/admin/retention/policy/messages", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "messages", resp["data_type"])
}

func TestUpdateRetentionPolicy_InvalidDataType(t *testing.T) {
	handler, adminID, _, cleanup := setupDataRetentionTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := makeRetentionRouter(handler, adminID, true)

	body, _ := json.Marshal(map[string]interface{}{
		"retention_days": 100,
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPut, "/admin/retention/policy/nonexistent_type", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestUpdateRetentionPolicy_NegativeDays(t *testing.T) {
	handler, adminID, _, cleanup := setupDataRetentionTest(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := makeRetentionRouter(handler, adminID, true)

	body, _ := json.Marshal(map[string]interface{}{
		"retention_days": -30,
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPut, "/admin/retention/policy/messages", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}
