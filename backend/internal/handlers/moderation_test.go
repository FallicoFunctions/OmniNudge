package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupModerationHandlerTest(t *testing.T) (*ModerationHandler, *database.Database, int, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	reporter := &models.User{
		Username:     fmt.Sprintf("reporter_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, reporter))

	reportRepo := models.NewReportRepository(db.Pool)
	modRepo := models.NewHubModeratorRepository(db.Pool)
	notifRepo := models.NewNotificationRepository(db.Pool)
	handler := NewModerationHandler(reportRepo, modRepo, userRepo, notifRepo, nil, nil)

	cleanup := func() { db.Close() }
	return handler, db, reporter.ID, cleanup
}

type mockModerationBroadcaster struct {
	userIDs []int
	msgType string
	payload interface{}
	calls   int
}

func (m *mockModerationBroadcaster) BroadcastToUsers(userIDs []int, msgType string, payload interface{}) {
	m.userIDs = append([]int{}, userIDs...)
	m.msgType = msgType
	m.payload = payload
	m.calls++
}

type mockModerationEmailSender struct {
	calls int
	err   error
}

func (m *mockModerationEmailSender) SendEmail(_ []string, _, _, _ string) error {
	m.calls++
	return m.err
}

func TestCreateReport_RejectsInvalidReason(t *testing.T) {
	handler, _, reporterID, cleanup := setupModerationHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/reports", func(c *gin.Context) {
		c.Set("user_id", reporterID)
		handler.CreateReport(c)
	})

	body := map[string]interface{}{
		"target_type": "comment",
		"target_id":   123,
		"reason":      "nonsense",
	}
	payload, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/reports", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())
	var response map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	assert.Contains(t, response["error"], "Invalid reason")
}

func TestCreateReport_RateLimitedAfterTenReports(t *testing.T) {
	handler, db, reporterID, cleanup := setupModerationHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	for i := 0; i < 10; i++ {
		_, err := db.Pool.Exec(ctx, `
			INSERT INTO reports (reporter_id, target_type, target_id, reason, status, created_at)
			VALUES ($1, 'comment', $2, 'spam', 'open', NOW())
		`, reporterID, 1000+i)
		require.NoError(t, err)
	}

	router := gin.New()
	router.POST("/reports", func(c *gin.Context) {
		c.Set("user_id", reporterID)
		handler.CreateReport(c)
	})

	body := map[string]interface{}{
		"target_type": "comment",
		"target_id":   9999,
		"reason":      "spam",
	}
	payload, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/reports", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusTooManyRequests, w.Code, w.Body.String())
	var response map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	assert.Contains(t, response["error"], "Report limit reached")
}

func TestCreateReport_AcceptsCanonicalReason(t *testing.T) {
	handler, _, reporterID, cleanup := setupModerationHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/reports", func(c *gin.Context) {
		c.Set("user_id", reporterID)
		handler.CreateReport(c)
	})

	body := map[string]interface{}{
		"target_type": "comment",
		"target_id":   42,
		"reason":      "Hate_Speech", // verify normalization still works
	}
	payload, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/reports", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	var response map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	assert.Equal(t, "hate_speech", response["reason"])
}

func TestCreateReport_AcceptsOptionalDescription(t *testing.T) {
	handler, _, reporterID, cleanup := setupModerationHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/reports", func(c *gin.Context) {
		c.Set("user_id", reporterID)
		handler.CreateReport(c)
	})

	body := map[string]interface{}{
		"target_type": "comment",
		"target_id":   42,
		"reason":      "spam",
		"description": "Repeated off-topic links",
	}
	payload, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/reports", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	var response map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	assert.Equal(t, "Repeated off-topic links", response["description"])
}

func TestCreateReport_RejectsSelfReportForUserTarget(t *testing.T) {
	handler, _, reporterID, cleanup := setupModerationHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/reports", func(c *gin.Context) {
		c.Set("user_id", reporterID)
		handler.CreateReport(c)
	})

	body := map[string]interface{}{
		"target_type": "user",
		"target_id":   reporterID,
		"reason":      "harassment",
	}
	payload, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/reports", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())
	var response map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	assert.Equal(t, "You cannot report yourself", response["error"])
}

func TestCreateReport_AutoSuspendsUserAfterThreeDistinctReports(t *testing.T) {
	handler, db, _, cleanup := setupModerationHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	target := &models.User{
		Username:     fmt.Sprintf("target_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, target))

	reporterIDs := make([]int, 0, 3)
	for i := 0; i < 3; i++ {
		u := &models.User{
			Username:     fmt.Sprintf("reporter_auto_%d_%d", time.Now().UnixNano(), i),
			PasswordHash: "test_hash",
		}
		require.NoError(t, userRepo.Create(ctx, u))
		reporterIDs = append(reporterIDs, u.ID)
	}

	router := gin.New()
	router.POST("/reports", func(c *gin.Context) {
		userIDHeader := c.GetHeader("X-User-ID")
		var reporterID int
		_, err := fmt.Sscanf(userIDHeader, "%d", &reporterID)
		require.NoError(t, err)
		c.Set("user_id", reporterID)
		handler.CreateReport(c)
	})

	for _, reporterID := range reporterIDs {
		body := map[string]interface{}{
			"target_type": "user",
			"target_id":   target.ID,
			"reason":      "harassment",
		}
		payload, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/reports", bytes.NewBuffer(payload))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-User-ID", fmt.Sprintf("%d", reporterID))
		router.ServeHTTP(w, req)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	}

	var banned bool
	var banReason *string
	err := db.Pool.QueryRow(ctx, `SELECT banned, ban_reason FROM users WHERE id = $1`, target.ID).Scan(&banned, &banReason)
	require.NoError(t, err)
	assert.True(t, banned)
	require.NotNil(t, banReason)
	assert.Equal(t, autoSuspendReason, *banReason)
}

func TestCreateReport_HighPriorityNotifiesAdminsAndModerators(t *testing.T) {
	handler, db, reporterID, cleanup := setupModerationHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)

	adminUser := &models.User{
		Username:     fmt.Sprintf("report_admin_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, adminUser))
	_, err := db.Pool.Exec(ctx, `UPDATE users SET role = 'admin' WHERE id = $1`, adminUser.ID)
	require.NoError(t, err)

	moderatorUser := &models.User{
		Username:     fmt.Sprintf("report_mod_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, moderatorUser))
	_, err = db.Pool.Exec(ctx, `UPDATE users SET role = 'moderator' WHERE id = $1`, moderatorUser.ID)
	require.NoError(t, err)

	target := &models.User{
		Username:     fmt.Sprintf("report_target_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, target))

	router := gin.New()
	router.POST("/reports", func(c *gin.Context) {
		c.Set("user_id", reporterID)
		handler.CreateReport(c)
	})

	body := map[string]interface{}{
		"target_type": "user",
		"target_id":   target.ID,
		"reason":      "csam",
	}
	payload, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/reports", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	var adminCount int
	err = db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM notifications
		WHERE user_id = $1 AND notification_type = $2
	`, adminUser.ID, highPriorityReportNotificationType).Scan(&adminCount)
	require.NoError(t, err)
	assert.Equal(t, 1, adminCount)

	var modCount int
	err = db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM notifications
		WHERE user_id = $1 AND notification_type = $2
	`, moderatorUser.ID, highPriorityReportNotificationType).Scan(&modCount)
	require.NoError(t, err)
	assert.Equal(t, 1, modCount)
}

func TestListReports_DefaultSortsByPriority(t *testing.T) {
	handler, db, reporterID, cleanup := setupModerationHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	reasons := []string{"spam", "other", "csam", "illegal_content", "harassment"}
	for i, reason := range reasons {
		_, err := db.Pool.Exec(ctx, `
			INSERT INTO reports (reporter_id, target_type, target_id, reason, status, created_at)
			VALUES ($1, 'message', $2, $3, 'open', NOW() - ($4 * INTERVAL '1 minute'))
		`, reporterID, 2000+i, reason, i)
		require.NoError(t, err)
	}

	router := gin.New()
	router.GET("/reports", handler.ListReports)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/reports?status=open&limit=10", nil)
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var response struct {
		Sort    string `json:"sort"`
		Reports []struct {
			Reason string `json:"reason"`
		} `json:"reports"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.GreaterOrEqual(t, len(response.Reports), 5)
	assert.Equal(t, "priority", response.Sort)

	got := []string{
		response.Reports[0].Reason,
		response.Reports[1].Reason,
		response.Reports[2].Reason,
		response.Reports[3].Reason,
		response.Reports[4].Reason,
	}
	assert.Equal(t, []string{"csam", "illegal_content", "harassment", "spam", "other"}, got)
}

func TestListReports_RecentSortUsesCursorPagination(t *testing.T) {
	handler, db, reporterID, cleanup := setupModerationHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	base := time.Now().Add(-10 * time.Minute)
	for i, reason := range []string{"spam", "harassment", "other"} {
		_, err := db.Pool.Exec(ctx, `
			INSERT INTO reports (reporter_id, target_type, target_id, reason, status, created_at)
			VALUES ($1, 'message', $2, $3, 'open', $4)
		`, reporterID, 3000+i, reason, base.Add(time.Duration(i)*time.Minute))
		require.NoError(t, err)
	}

	router := gin.New()
	router.GET("/reports", handler.ListReports)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/reports?status=open&sort=recent&limit=2", nil)
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var firstPage struct {
		Sort       string `json:"sort"`
		NextCursor string `json:"next_cursor"`
		Reports    []struct {
			Reason string `json:"reason"`
		} `json:"reports"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &firstPage))
	assert.Equal(t, "recent", firstPage.Sort)
	require.Len(t, firstPage.Reports, 2)
	require.NotEmpty(t, firstPage.NextCursor)
	assert.Equal(t, "other", firstPage.Reports[0].Reason)
	assert.Equal(t, "harassment", firstPage.Reports[1].Reason)

	w2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(
		http.MethodGet,
		fmt.Sprintf("/reports?status=open&sort=recent&limit=2&cursor=%s", firstPage.NextCursor),
		nil,
	)
	router.ServeHTTP(w2, req2)
	require.Equal(t, http.StatusOK, w2.Code, w2.Body.String())

	var secondPage struct {
		Reports []struct {
			Reason string `json:"reason"`
		} `json:"reports"`
	}
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &secondPage))
	require.Len(t, secondPage.Reports, 1)
	assert.Equal(t, "spam", secondPage.Reports[0].Reason)
}

func TestUpdateReportStatus_AcceptsResolutionStatuses(t *testing.T) {
	handler, db, reporterID, cleanup := setupModerationHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	var reportID int
	err := db.Pool.QueryRow(ctx, `
		INSERT INTO reports (reporter_id, target_type, target_id, reason, status, created_at)
		VALUES ($1, 'message', 9991, 'harassment', 'open', NOW())
		RETURNING id
	`, reporterID).Scan(&reportID)
	require.NoError(t, err)

	router := gin.New()
	router.POST("/reports/:id/status", handler.UpdateReportStatus)

	body := map[string]string{"status": "approved"}
	payload, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/reports/%d/status", reportID), bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var actualStatus string
	err = db.Pool.QueryRow(ctx, `SELECT status FROM reports WHERE id = $1`, reportID).Scan(&actualStatus)
	require.NoError(t, err)
	assert.Equal(t, "approved", actualStatus)
}

func TestUpdateReportStatus_RejectsUnknownStatus(t *testing.T) {
	handler, db, reporterID, cleanup := setupModerationHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	var reportID int
	err := db.Pool.QueryRow(ctx, `
		INSERT INTO reports (reporter_id, target_type, target_id, reason, status, created_at)
		VALUES ($1, 'message', 9992, 'spam', 'open', NOW())
		RETURNING id
	`, reporterID).Scan(&reportID)
	require.NoError(t, err)

	router := gin.New()
	router.POST("/reports/:id/status", handler.UpdateReportStatus)

	body := map[string]string{"status": "resolved"}
	payload, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/reports/%d/status", reportID), bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())

	var response map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	assert.Equal(t, "Invalid status", response["error"])
}

func TestCreateReport_BroadcastsRealtimeQueueEvent(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	reportRepo := models.NewReportRepository(db.Pool)
	modRepo := models.NewHubModeratorRepository(db.Pool)
	notifRepo := models.NewNotificationRepository(db.Pool)
	broadcaster := &mockModerationBroadcaster{}

	reporter := &models.User{
		Username:     fmt.Sprintf("reporter_rt_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, reporter))

	moderator := &models.User{
		Username:     fmt.Sprintf("moderator_rt_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, moderator))
	_, err = db.Pool.Exec(ctx, `UPDATE users SET role = 'moderator' WHERE id = $1`, moderator.ID)
	require.NoError(t, err)

	target := &models.User{
		Username:     fmt.Sprintf("target_rt_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, target))

	handler := NewModerationHandler(reportRepo, modRepo, userRepo, notifRepo, broadcaster, nil)
	router := gin.New()
	router.POST("/reports", func(c *gin.Context) {
		c.Set("user_id", reporter.ID)
		handler.CreateReport(c)
	})

	body := map[string]interface{}{
		"target_type": "user",
		"target_id":   target.ID,
		"reason":      "spam",
	}
	payload, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/reports", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	assert.Equal(t, 1, broadcaster.calls)
	assert.Equal(t, moderationReportCreatedEventType, broadcaster.msgType)
	assert.Contains(t, broadcaster.userIDs, moderator.ID)
}

func TestUpdateReportStatus_BroadcastsRealtimeQueueEvent(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	reportRepo := models.NewReportRepository(db.Pool)
	modRepo := models.NewHubModeratorRepository(db.Pool)
	notifRepo := models.NewNotificationRepository(db.Pool)
	broadcaster := &mockModerationBroadcaster{}

	reporter := &models.User{
		Username:     fmt.Sprintf("reporter_rt_upd_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, reporter))

	admin := &models.User{
		Username:     fmt.Sprintf("admin_rt_upd_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, admin))
	_, err = db.Pool.Exec(ctx, `UPDATE users SET role = 'admin' WHERE id = $1`, admin.ID)
	require.NoError(t, err)

	var reportID int
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO reports (reporter_id, target_type, target_id, reason, status, created_at)
		VALUES ($1, 'message', 4444, 'harassment', 'open', NOW())
		RETURNING id
	`, reporter.ID).Scan(&reportID)
	require.NoError(t, err)

	handler := NewModerationHandler(reportRepo, modRepo, userRepo, notifRepo, broadcaster, nil)
	router := gin.New()
	router.POST("/reports/:id/status", handler.UpdateReportStatus)

	body := map[string]string{"status": "approved"}
	payload, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/reports/%d/status", reportID), bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	assert.Equal(t, 1, broadcaster.calls)
	assert.Equal(t, moderationReportUpdatedEventType, broadcaster.msgType)
	assert.Contains(t, broadcaster.userIDs, admin.ID)
}

func TestCreateReport_HighPriorityEmailFailureDoesNotFailRequest(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	reportRepo := models.NewReportRepository(db.Pool)
	modRepo := models.NewHubModeratorRepository(db.Pool)
	notifRepo := models.NewNotificationRepository(db.Pool)
	emailSender := &mockModerationEmailSender{err: fmt.Errorf("smtp unavailable")}

	reporter := &models.User{
		Username:     fmt.Sprintf("reporter_email_fail_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, reporter))

	admin := &models.User{
		Username:     fmt.Sprintf("admin_email_fail_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, admin))
	adminEmail := fmt.Sprintf("admin_%d@example.com", time.Now().UnixNano())
	_, err = db.Pool.Exec(ctx, `UPDATE users SET role = 'admin', email = $2, email_encrypted = false WHERE id = $1`, admin.ID, adminEmail)
	require.NoError(t, err)

	target := &models.User{
		Username:     fmt.Sprintf("target_email_fail_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, target))

	handler := NewModerationHandler(reportRepo, modRepo, userRepo, notifRepo, nil, emailSender)
	router := gin.New()
	router.POST("/reports", func(c *gin.Context) {
		c.Set("user_id", reporter.ID)
		handler.CreateReport(c)
	})

	body := map[string]interface{}{
		"target_type": "user",
		"target_id":   target.ID,
		"reason":      "csam",
	}
	payload, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/reports", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	assert.Equal(t, 1, emailSender.calls)
}
