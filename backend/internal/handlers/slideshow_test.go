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

	"github.com/chatreddit/backend/internal/database"
	"github.com/chatreddit/backend/internal/models"
	"github.com/chatreddit/backend/internal/websocket"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var slideshowTestCounter int64

func uniqueSlideshowUsername(base string) string {
	id := atomic.AddInt64(&slideshowTestCounter, 1)
	return fmt.Sprintf("%s_slideshow_%d_%d", base, time.Now().UnixNano(), id)
}

func setupSlideshowHandlerTest(t *testing.T) (*SlideshowHandler, *database.Database, int, int, int, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	// Create test users
	userRepo := models.NewUserRepository(db.Pool)
	user1 := &models.User{
		Username:     uniqueSlideshowUsername("user1"),
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, user1)
	require.NoError(t, err)

	user2 := &models.User{
		Username:     uniqueSlideshowUsername("user2"),
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, user2)
	require.NoError(t, err)

	// Create conversation
	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, user1.ID, user2.ID)
	require.NoError(t, err)

	// Create handler with hub (don't run it in tests to avoid blocking)
	slideshowRepo := models.NewSlideshowRepository(db.Pool)
	hub := websocket.NewHub()
	handler := NewSlideshowHandler(db.Pool, slideshowRepo, convRepo, hub)

	cleanup := func() {
		db.Close()
	}

	return handler, db, user1.ID, user2.ID, conv.ID, cleanup
}

func TestStartSlideshow_Reddit(t *testing.T) {
	handler, _, userID, _, convID, cleanup := setupSlideshowHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.POST("/conversations/:id/slideshow", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.StartSlideshow(c)
	})

	body := map[string]interface{}{
		"slideshow_type":        "reddit",
		"subreddit":             "pics",
		"reddit_sort":           "hot",
		"auto_advance":          true,
		"auto_advance_interval": 5,
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", fmt.Sprintf("/conversations/%d/slideshow", convID), bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "Response body: %s", w.Body.String())

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "reddit", response["slideshow_type"])
	assert.Equal(t, "pics", response["subreddit"])
	assert.Equal(t, float64(userID), response["controller_user_id"])
	assert.Equal(t, true, response["auto_advance"])
	assert.Equal(t, float64(5), response["auto_advance_interval"])
}

func TestStartSlideshow_AlreadyActive(t *testing.T) {
	handler, db, userID, _, convID, cleanup := setupSlideshowHandlerTest(t)
	defer cleanup()

	// Create existing slideshow
	ctx := context.Background()
	slideshowRepo := models.NewSlideshowRepository(db.Pool)
	session := &models.SlideshowSession{
		ConversationID:      convID,
		SlideshowType:       "reddit",
		Subreddit:           strPtr("pics"),
		CurrentIndex:        0,
		TotalItems:          10,
		ControllerUserID:    userID,
		AutoAdvance:         false,
		AutoAdvanceInterval: 5,
	}
	err := slideshowRepo.CreateSession(ctx, session)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/conversations/:id/slideshow", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.StartSlideshow(c)
	})

	body := map[string]interface{}{
		"slideshow_type": "reddit",
		"subreddit":      "earthporn",
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", fmt.Sprintf("/conversations/%d/slideshow", convID), bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusConflict, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "already active")
}

func TestGetSlideshow(t *testing.T) {
	handler, db, userID, _, convID, cleanup := setupSlideshowHandlerTest(t)
	defer cleanup()

	// Create slideshow
	ctx := context.Background()
	slideshowRepo := models.NewSlideshowRepository(db.Pool)
	session := &models.SlideshowSession{
		ConversationID:      convID,
		SlideshowType:       "reddit",
		Subreddit:           strPtr("pics"),
		CurrentIndex:        5,
		TotalItems:          20,
		ControllerUserID:    userID,
		AutoAdvance:         true,
		AutoAdvanceInterval: 10,
	}
	err := slideshowRepo.CreateSession(ctx, session)
	require.NoError(t, err)

	router := gin.Default()
	router.GET("/conversations/:id/slideshow", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.GetSlideshow(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/slideshow", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "reddit", response["slideshow_type"])
	assert.Equal(t, "pics", response["subreddit"])
	assert.Equal(t, float64(5), response["current_index"])
	assert.Equal(t, float64(20), response["total_items"])
	assert.Equal(t, float64(userID), response["controller_user_id"])
	assert.Equal(t, true, response["auto_advance"])
	assert.Equal(t, float64(10), response["auto_advance_interval"])
}

func TestGetSlideshow_NotFound(t *testing.T) {
	handler, _, userID, _, convID, cleanup := setupSlideshowHandlerTest(t)
	defer cleanup()

	router := gin.Default()
	router.GET("/conversations/:id/slideshow", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.GetSlideshow(c)
	})

	req := httptest.NewRequest("GET", fmt.Sprintf("/conversations/%d/slideshow", convID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestNavigateSlideshow(t *testing.T) {
	handler, db, userID, _, convID, cleanup := setupSlideshowHandlerTest(t)
	defer cleanup()

	// Create slideshow
	ctx := context.Background()
	slideshowRepo := models.NewSlideshowRepository(db.Pool)
	session := &models.SlideshowSession{
		ConversationID:      convID,
		SlideshowType:       "reddit",
		Subreddit:           strPtr("pics"),
		CurrentIndex:        0,
		TotalItems:          20,
		ControllerUserID:    userID,
		AutoAdvance:         false,
		AutoAdvanceInterval: 5,
	}
	err := slideshowRepo.CreateSession(ctx, session)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/slideshows/:id/navigate", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.NavigateSlideshow(c)
	})

	body := map[string]interface{}{
		"index": 7,
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", fmt.Sprintf("/slideshows/%d/navigate", session.ID), bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "Response body: %s", w.Body.String())

	// Verify index was updated
	updatedSession, err := slideshowRepo.GetByID(ctx, session.ID)
	require.NoError(t, err)
	assert.Equal(t, 7, updatedSession.CurrentIndex)
}

func TestNavigateSlideshow_NotController(t *testing.T) {
	handler, db, userID, otherUserID, convID, cleanup := setupSlideshowHandlerTest(t)
	defer cleanup()

	// Create slideshow with userID as controller
	ctx := context.Background()
	slideshowRepo := models.NewSlideshowRepository(db.Pool)
	session := &models.SlideshowSession{
		ConversationID:      convID,
		SlideshowType:       "reddit",
		Subreddit:           strPtr("pics"),
		CurrentIndex:        0,
		TotalItems:          20,
		ControllerUserID:    userID,
		AutoAdvance:         false,
		AutoAdvanceInterval: 5,
	}
	err := slideshowRepo.CreateSession(ctx, session)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/slideshows/:id/navigate", func(c *gin.Context) {
		c.Set("user_id", otherUserID) // Different user trying to navigate
		handler.NavigateSlideshow(c)
	})

	body := map[string]interface{}{
		"index": 7,
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", fmt.Sprintf("/slideshows/%d/navigate", session.ID), bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestTransferControl(t *testing.T) {
	handler, db, userID, otherUserID, convID, cleanup := setupSlideshowHandlerTest(t)
	defer cleanup()

	// Create slideshow
	ctx := context.Background()
	slideshowRepo := models.NewSlideshowRepository(db.Pool)
	session := &models.SlideshowSession{
		ConversationID:      convID,
		SlideshowType:       "reddit",
		Subreddit:           strPtr("pics"),
		CurrentIndex:        0,
		TotalItems:          20,
		ControllerUserID:    userID,
		AutoAdvance:         false,
		AutoAdvanceInterval: 5,
	}
	err := slideshowRepo.CreateSession(ctx, session)
	require.NoError(t, err)

	router := gin.Default()
	router.POST("/slideshows/:id/transfer-control", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.TransferControl(c)
	})

	req := httptest.NewRequest("POST", fmt.Sprintf("/slideshows/%d/transfer-control", session.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "Response body: %s", w.Body.String())

	// Verify controller was transferred
	updatedSession, err := slideshowRepo.GetByID(ctx, session.ID)
	require.NoError(t, err)
	assert.Equal(t, otherUserID, updatedSession.ControllerUserID)
}

func TestUpdateAutoAdvance(t *testing.T) {
	handler, db, userID, _, convID, cleanup := setupSlideshowHandlerTest(t)
	defer cleanup()

	// Create slideshow
	ctx := context.Background()
	slideshowRepo := models.NewSlideshowRepository(db.Pool)
	session := &models.SlideshowSession{
		ConversationID:      convID,
		SlideshowType:       "reddit",
		Subreddit:           strPtr("pics"),
		CurrentIndex:        0,
		TotalItems:          20,
		ControllerUserID:    userID,
		AutoAdvance:         false,
		AutoAdvanceInterval: 5,
	}
	err := slideshowRepo.CreateSession(ctx, session)
	require.NoError(t, err)

	router := gin.Default()
	router.PUT("/slideshows/:id/auto-advance", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.UpdateAutoAdvance(c)
	})

	body := map[string]interface{}{
		"auto_advance":          true,
		"auto_advance_interval": 10,
	}
	bodyJSON, _ := json.Marshal(body)

	req := httptest.NewRequest("PUT", fmt.Sprintf("/slideshows/%d/auto-advance", session.ID), bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "Response body: %s", w.Body.String())

	// Verify auto-advance was updated
	updatedSession, err := slideshowRepo.GetByID(ctx, session.ID)
	require.NoError(t, err)
	assert.Equal(t, true, updatedSession.AutoAdvance)
	assert.Equal(t, 10, updatedSession.AutoAdvanceInterval)
}

func TestStopSlideshow(t *testing.T) {
	handler, db, userID, _, convID, cleanup := setupSlideshowHandlerTest(t)
	defer cleanup()

	// Create slideshow
	ctx := context.Background()
	slideshowRepo := models.NewSlideshowRepository(db.Pool)
	session := &models.SlideshowSession{
		ConversationID:      convID,
		SlideshowType:       "reddit",
		Subreddit:           strPtr("pics"),
		CurrentIndex:        0,
		TotalItems:          20,
		ControllerUserID:    userID,
		AutoAdvance:         false,
		AutoAdvanceInterval: 5,
	}
	err := slideshowRepo.CreateSession(ctx, session)
	require.NoError(t, err)

	router := gin.Default()
	router.DELETE("/slideshows/:id", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.StopSlideshow(c)
	})

	req := httptest.NewRequest("DELETE", fmt.Sprintf("/slideshows/%d", session.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Verify slideshow was deleted
	deletedSession, err := slideshowRepo.GetByID(ctx, session.ID)
	require.NoError(t, err)
	assert.Nil(t, deletedSession)
}

func strPtr(s string) *string {
	return &s
}
