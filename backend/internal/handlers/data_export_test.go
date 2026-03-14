package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/utils"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var dataExportTestCounter int64

func uniqueDataExportUsername(base string) string {
	id := atomic.AddInt64(&dataExportTestCounter, 1)
	return fmt.Sprintf("%s_dexport_%d_%d", base, time.Now().UnixNano(), id)
}

func setupDataExportHandlerTest(t *testing.T) (*DataExportHandler, *database.Database, int, func()) {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	password := "TestPassword123!"
	hash, err := utils.HashPassword(password)
	require.NoError(t, err)

	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     uniqueDataExportUsername("user"),
		PasswordHash: hash,
	}
	require.NoError(t, userRepo.Create(ctx, user))

	// nil queue — skips enqueue step; export is still inserted as pending.
	handler := NewDataExportHandler(db.Pool, nil, "test-master-key-32-chars-padded!!")

	return handler, db, user.ID, func() {}
}

func TestRequestDataExport_Success(t *testing.T) {
	handler, _, userID, _ := setupDataExportHandlerTest(t)

	body, _ := json.Marshal(map[string]interface{}{
		"password":   "TestPassword123!",
		"data_types": []string{"profile", "posts"},
	})

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/account/export", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", userID)

	handler.RequestDataExport(c)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.NotEmpty(t, resp["export_id"])
	assert.Equal(t, "pending", resp["status"])
}

func TestRequestDataExport_WrongPassword(t *testing.T) {
	handler, _, userID, _ := setupDataExportHandlerTest(t)

	body, _ := json.Marshal(map[string]interface{}{
		"password": "WrongPassword!",
	})

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/account/export", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", userID)

	handler.RequestDataExport(c)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestRequestDataExport_MissingPassword(t *testing.T) {
	handler, _, userID, _ := setupDataExportHandlerTest(t)

	body, _ := json.Marshal(map[string]interface{}{
		"data_types": []string{"profile"},
	})

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/account/export", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", userID)

	handler.RequestDataExport(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGetExportStatus_Success(t *testing.T) {
	handler, db, userID, _ := setupDataExportHandlerTest(t)

	// Insert an export record directly.
	exportID := "export_test_status_abc123"
	expiresAt := time.Now().Add(7 * 24 * time.Hour)
	_, err := db.Pool.Exec(context.Background(), `
		INSERT INTO data_export_requests (user_id, export_id, data_types, include_deleted, status, expires_at)
		VALUES ($1, $2, $3, false, 'pending', $4)
	`, userID, exportID, []string{"profile"}, expiresAt)
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/account/export/"+exportID, nil)
	c.Set("user_id", userID)
	c.Params = gin.Params{{Key: "export_id", Value: exportID}}

	handler.GetExportStatus(c)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "pending", resp["status"])
	assert.Equal(t, exportID, resp["export_id"])
}

func TestGetExportStatus_NotOwner(t *testing.T) {
	handler, db, userID, _ := setupDataExportHandlerTest(t)

	// Create a second user.
	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	other := &models.User{Username: uniqueDataExportUsername("other"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, other))

	exportID := "export_test_owner_check_xyz"
	expiresAt := time.Now().Add(7 * 24 * time.Hour)
	_, err := db.Pool.Exec(ctx, `
		INSERT INTO data_export_requests (user_id, export_id, data_types, include_deleted, status, expires_at)
		VALUES ($1, $2, $3, false, 'pending', $4)
	`, userID, exportID, []string{"profile"}, expiresAt)
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/account/export/"+exportID, nil)
	c.Set("user_id", other.ID) // different user
	c.Params = gin.Params{{Key: "export_id", Value: exportID}}

	handler.GetExportStatus(c)

	// Handler returns 404 when record not found for that user_id — effectively hides it.
	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestGetExportStatus_NotFound(t *testing.T) {
	handler, _, userID, _ := setupDataExportHandlerTest(t)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/account/export/nonexistent_id", nil)
	c.Set("user_id", userID)
	c.Params = gin.Params{{Key: "export_id", Value: "nonexistent_id"}}

	handler.GetExportStatus(c)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestListExportRequests_Empty(t *testing.T) {
	handler, _, userID, _ := setupDataExportHandlerTest(t)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/account/exports", nil)
	c.Set("user_id", userID)

	handler.ListExportRequests(c)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, float64(0), resp["total"])
}

func TestListExportRequests_WithRecords(t *testing.T) {
	handler, db, userID, _ := setupDataExportHandlerTest(t)

	expiresAt := time.Now().Add(7 * 24 * time.Hour)
	for i := 0; i < 3; i++ {
		exportID := fmt.Sprintf("export_list_test_%d_%d", userID, i)
		_, err := db.Pool.Exec(context.Background(), `
			INSERT INTO data_export_requests (user_id, export_id, data_types, include_deleted, status, expires_at)
			VALUES ($1, $2, $3, false, 'pending', $4)
		`, userID, exportID, []string{"profile"}, expiresAt)
		require.NoError(t, err)
	}

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/account/exports", nil)
	c.Set("user_id", userID)

	handler.ListExportRequests(c)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, float64(3), resp["total"])
}
