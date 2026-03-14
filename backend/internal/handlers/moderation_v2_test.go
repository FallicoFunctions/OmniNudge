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
	"github.com/omninudge/backend/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var modV2TestCounter int64

func uniqueModV2Name(base string) string {
	id := atomic.AddInt64(&modV2TestCounter, 1)
	return fmt.Sprintf("%s_modv2_%d_%d", base, time.Now().UnixNano(), id)
}

type modV2TestFixture struct {
	handler     *ModerationHandlerV2
	db          *database.Database
	modUserID   int
	targetID    int
	hubID       int
	cleanup     func()
}

func setupModV2HandlerTest(t *testing.T) *modV2TestFixture {
	db, err := database.NewTest()
	require.NoError(t, err)
	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)

	mod := &models.User{Username: uniqueModV2Name("mod"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, mod))

	target := &models.User{Username: uniqueModV2Name("target"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, target))

	hubRepo := models.NewHubRepository(db.Pool)
	hubName := uniqueModV2Name("hub")
	hub := &models.Hub{
		Name:           hubName,
		NameNormalized: hubName,
		Type:           "public",
		ContentOptions: "any",
		CreatedBy:      &mod.ID,
	}
	require.NoError(t, hubRepo.Create(ctx, hub))

	createdHub, err := hubRepo.GetByName(ctx, hubName)
	require.NoError(t, err)

	settingsRepo := repository.NewHubSettingsRepository(db.Pool)
	require.NoError(t, settingsRepo.AddModerator(ctx, createdHub.ID, mod.ID, models.ModeratorRoleOwner))

	hubBanRepo := models.NewHubBanRepository(db.Pool)
	removalReasonRepo := models.NewRemovalReasonRepository(db.Pool)
	removedContentRepo := models.NewRemovedContentRepository(db.Pool)
	modLogRepo := models.NewModLogRepository(db.Pool)
	postRepo := models.NewPlatformPostRepository(db.Pool)
	commentRepo := models.NewPostCommentRepository(db.Pool)

	handler := NewModerationHandlerV2(
		hubBanRepo,
		removalReasonRepo,
		removedContentRepo,
		modLogRepo,
		postRepo,
		commentRepo,
	)

	return &modV2TestFixture{
		handler:   handler,
		db:        db,
		modUserID: mod.ID,
		targetID:  target.ID,
		hubID:     createdHub.ID,
		cleanup:   func() { db.Close() },
	}
}

// hubIDMiddleware injects the hub_id into the gin context
func hubIDMiddleware(hubID int) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("hub_id", hubID)
		c.Next()
	}
}

func TestBanUser_Success(t *testing.T) {
	f := setupModV2HandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/ban", mockAuthMiddleware(f.modUserID), hubIDMiddleware(f.hubID), f.handler.BanUser)

	body := map[string]interface{}{
		"user_id":  f.targetID,
		"reason":   "Violated rules",
		"ban_type": "permanent",
	}
	bodyJSON, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/ban", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestBanUser_MissingHubContext(t *testing.T) {
	f := setupModV2HandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	// No hub_id middleware
	router.POST("/ban", mockAuthMiddleware(f.modUserID), f.handler.BanUser)

	body := map[string]interface{}{
		"user_id":  f.targetID,
		"ban_type": "permanent",
	}
	bodyJSON, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/ban", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestBanUser_InvalidBanType(t *testing.T) {
	f := setupModV2HandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/ban", mockAuthMiddleware(f.modUserID), hubIDMiddleware(f.hubID), f.handler.BanUser)

	body := map[string]interface{}{
		"user_id":  f.targetID,
		"ban_type": "soft", // invalid, must be permanent|temporary
	}
	bodyJSON, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/ban", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestBanUser_TemporaryRequiresExpiresAt(t *testing.T) {
	f := setupModV2HandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/ban", mockAuthMiddleware(f.modUserID), hubIDMiddleware(f.hubID), f.handler.BanUser)

	body := map[string]interface{}{
		"user_id":  f.targetID,
		"ban_type": "temporary",
		// no expires_at
	}
	bodyJSON, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/ban", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGetBannedUsers_Success(t *testing.T) {
	f := setupModV2HandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/bans", mockAuthMiddleware(f.modUserID), hubIDMiddleware(f.hubID), f.handler.GetBannedUsers)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/bans", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	_, hasBans := resp["bans"]
	assert.True(t, hasBans)
}

func TestGetRemovalReasons_Success(t *testing.T) {
	f := setupModV2HandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/reasons", hubIDMiddleware(f.hubID), f.handler.GetRemovalReasons)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/reasons", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	_, hasReasons := resp["removal_reasons"]
	assert.True(t, hasReasons)
}

func TestGetRemovalReasons_MissingHubContext(t *testing.T) {
	f := setupModV2HandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	// No hub_id middleware
	router.GET("/reasons", f.handler.GetRemovalReasons)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/reasons", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestCreateRemovalReason_Success(t *testing.T) {
	f := setupModV2HandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/reasons", mockAuthMiddleware(f.modUserID), hubIDMiddleware(f.hubID), f.handler.CreateRemovalReason)

	body := map[string]interface{}{
		"title":   "Spam",
		"message": "This content was removed because it is spam.",
	}
	bodyJSON, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/reasons", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
}

func TestGetModLog_Success(t *testing.T) {
	f := setupModV2HandlerTest(t)
	defer f.cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/logs", hubIDMiddleware(f.hubID), f.handler.GetModLog)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/logs", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	_, hasLogs := resp["logs"]
	assert.True(t, hasLogs)
}
