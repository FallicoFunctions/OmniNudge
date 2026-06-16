package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupWallTest(t *testing.T) (*WallHandler, *models.UserSettingsRepository, *models.UserFriendshipRepository, *models.User, *models.User, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	friendRepo := models.NewUserFriendshipRepository(db.Pool)
	wallRepo := repository.NewPostgresWallPostRepository(db.Pool)

	owner := &models.User{
		Username:     fmt.Sprintf("wo_%d", time.Now().UnixNano()%1_000_000_000),
		PasswordHash: "test_hash",
	}
	friend := &models.User{
		Username:     fmt.Sprintf("wf_%d", time.Now().UnixNano()%1_000_000_000),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, owner))
	require.NoError(t, userRepo.Create(ctx, friend))
	require.NoError(t, friendRepo.UpsertAccepted(ctx, owner.ID, friend.ID))

	handler := NewWallHandler(db.Pool, wallRepo, userRepo, friendRepo, settingsRepo)

	cleanup := func() {
		db.Close()
	}
	return handler, settingsRepo, friendRepo, owner, friend, cleanup
}

func newWallRouter(handler *WallHandler) *gin.Engine {
	router := gin.Default()
	withViewer := func(c *gin.Context) {
		if header := c.GetHeader("X-Viewer-ID"); header != "" {
			if id, err := strconv.Atoi(header); err == nil {
				c.Set("user_id", id)
			}
		}
	}
	router.GET("/users/:username/wall", func(c *gin.Context) {
		withViewer(c)
		handler.GetWallPosts(c)
	})
	router.POST("/users/:username/wall", func(c *gin.Context) {
		withViewer(c)
		handler.CreateWallPost(c)
	})
	router.GET("/users/me/wall/pending", func(c *gin.Context) {
		withViewer(c)
		handler.GetPendingWallPosts(c)
	})
	router.POST("/wall-posts/:id/approve", func(c *gin.Context) {
		withViewer(c)
		handler.ApproveWallPost(c)
	})
	return router
}

func setProfileVisibilityAndWallPermission(t *testing.T, settingsRepo *models.UserSettingsRepository, userID int, visibility, wallPostPermission string) {
	t.Helper()
	ctx := context.Background()
	settings, err := settingsRepo.CreateDefault(ctx, userID)
	require.NoError(t, err)
	if visibility != "" {
		settings.ProfileVisibility = visibility
	}
	if wallPostPermission != "" {
		settings.WallPostPermission = wallPostPermission
	}
	_, err = settingsRepo.Update(ctx, settings)
	require.NoError(t, err)
}

func createWallPost(t *testing.T, router *gin.Engine, username string, viewerID int, body string) *httptest.ResponseRecorder {
	t.Helper()
	payload, err := json.Marshal(CreateWallPostRequest{Body: body})
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPost, "/users/"+username+"/wall", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Viewer-ID", strconv.Itoa(viewerID))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestCreateWallPost_AllFriends_AppearsImmediately(t *testing.T) {
	handler, _, _, owner, friend, cleanup := setupWallTest(t)
	defer cleanup()

	router := newWallRouter(handler)

	w := createWallPost(t, router, owner.Username, friend.ID, "hello from a friend")
	require.Equal(t, http.StatusCreated, w.Code, "response: %s", w.Body.String())

	var post models.WallPost
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &post))
	assert.Equal(t, "approved", post.Status)

	wallReq := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username+"/wall", nil)
	wallReq.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	wallW := httptest.NewRecorder()
	router.ServeHTTP(wallW, wallReq)
	require.Equal(t, http.StatusOK, wallW.Code)

	var resp WallPostsResponse
	require.NoError(t, json.Unmarshal(wallW.Body.Bytes(), &resp))
	require.Len(t, resp.Posts, 1)
	assert.Equal(t, "approved", resp.Posts[0].Status)
}

func TestCreateWallPost_RequiresApproval_QueuesPendingPost(t *testing.T) {
	handler, settingsRepo, _, owner, friend, cleanup := setupWallTest(t)
	defer cleanup()

	setProfileVisibilityAndWallPermission(t, settingsRepo, owner.ID, "", "requires_approval")

	router := newWallRouter(handler)

	w := createWallPost(t, router, owner.Username, friend.ID, "pending post from friend")
	require.Equal(t, http.StatusCreated, w.Code, "response: %s", w.Body.String())

	var post models.WallPost
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &post))
	assert.Equal(t, "pending", post.Status)

	// Pending post should not appear in the public wall feed or stats.
	wallReq := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username+"/wall", nil)
	wallReq.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	wallW := httptest.NewRecorder()
	router.ServeHTTP(wallW, wallReq)
	require.Equal(t, http.StatusOK, wallW.Code)

	var wallResp WallPostsResponse
	require.NoError(t, json.Unmarshal(wallW.Body.Bytes(), &wallResp))
	assert.Empty(t, wallResp.Posts)
	assert.Equal(t, 0, wallResp.OwnPostCount)
	assert.Equal(t, 0, wallResp.ReplyCount)

	// It should appear in the owner's pending queue.
	pendingReq := httptest.NewRequest(http.MethodGet, "/users/me/wall/pending", nil)
	pendingReq.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	pendingW := httptest.NewRecorder()
	router.ServeHTTP(pendingW, pendingReq)
	require.Equal(t, http.StatusOK, pendingW.Code)

	var pendingResp PendingWallPostsResponse
	require.NoError(t, json.Unmarshal(pendingW.Body.Bytes(), &pendingResp))
	require.Len(t, pendingResp.Posts, 1)
	assert.Equal(t, post.ID, pendingResp.Posts[0].ID)

	// Approving the post moves it into the public feed.
	approveReq := httptest.NewRequest(http.MethodPost, "/wall-posts/"+strconv.Itoa(post.ID)+"/approve", nil)
	approveReq.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	approveW := httptest.NewRecorder()
	router.ServeHTTP(approveW, approveReq)
	require.Equal(t, http.StatusOK, approveW.Code, "response: %s", approveW.Body.String())

	wallW2 := httptest.NewRecorder()
	router.ServeHTTP(wallW2, wallReq)
	require.Equal(t, http.StatusOK, wallW2.Code)

	var wallResp2 WallPostsResponse
	require.NoError(t, json.Unmarshal(wallW2.Body.Bytes(), &wallResp2))
	require.Len(t, wallResp2.Posts, 1)
	assert.Equal(t, "approved", wallResp2.Posts[0].Status)
	assert.Equal(t, 1, wallResp2.ReplyCount)
}

func TestCreateWallPost_NoOne_ForbidsFriendButAllowsOwner(t *testing.T) {
	handler, settingsRepo, _, owner, friend, cleanup := setupWallTest(t)
	defer cleanup()

	setProfileVisibilityAndWallPermission(t, settingsRepo, owner.ID, "", "no_one")

	router := newWallRouter(handler)

	w := createWallPost(t, router, owner.Username, friend.ID, "should be forbidden")
	assert.Equal(t, http.StatusForbidden, w.Code)

	// can_post should be false for the friend.
	wallReq := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username+"/wall", nil)
	wallReq.Header.Set("X-Viewer-ID", strconv.Itoa(friend.ID))
	wallW := httptest.NewRecorder()
	router.ServeHTTP(wallW, wallReq)
	require.Equal(t, http.StatusOK, wallW.Code)

	var resp WallPostsResponse
	require.NoError(t, json.Unmarshal(wallW.Body.Bytes(), &resp))
	assert.False(t, resp.CanPost)

	// The owner can still post on their own wall.
	ownerW := createWallPost(t, router, owner.Username, owner.ID, "owner can always post")
	require.Equal(t, http.StatusCreated, ownerW.Code, "response: %s", ownerW.Body.String())

	var ownerPost models.WallPost
	require.NoError(t, json.Unmarshal(ownerW.Body.Bytes(), &ownerPost))
	assert.Equal(t, "approved", ownerPost.Status)
}

func TestApproveWallPost_RejectsNonOwnerAndAlreadyApproved(t *testing.T) {
	handler, settingsRepo, _, owner, friend, cleanup := setupWallTest(t)
	defer cleanup()

	setProfileVisibilityAndWallPermission(t, settingsRepo, owner.ID, "", "requires_approval")

	router := newWallRouter(handler)

	w := createWallPost(t, router, owner.Username, friend.ID, "pending post")
	require.Equal(t, http.StatusCreated, w.Code, "response: %s", w.Body.String())

	var post models.WallPost
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &post))

	// The author (a non-owner) cannot approve the post.
	approveReq := httptest.NewRequest(http.MethodPost, "/wall-posts/"+strconv.Itoa(post.ID)+"/approve", nil)
	approveReq.Header.Set("X-Viewer-ID", strconv.Itoa(friend.ID))
	approveW := httptest.NewRecorder()
	router.ServeHTTP(approveW, approveReq)
	assert.Equal(t, http.StatusForbidden, approveW.Code)

	// The owner approves it successfully.
	ownerApproveReq := httptest.NewRequest(http.MethodPost, "/wall-posts/"+strconv.Itoa(post.ID)+"/approve", nil)
	ownerApproveReq.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	ownerApproveW := httptest.NewRecorder()
	router.ServeHTTP(ownerApproveW, ownerApproveReq)
	require.Equal(t, http.StatusOK, ownerApproveW.Code, "response: %s", ownerApproveW.Body.String())

	// Approving an already-approved post fails.
	secondApproveW := httptest.NewRecorder()
	router.ServeHTTP(secondApproveW, ownerApproveReq)
	assert.Equal(t, http.StatusBadRequest, secondApproveW.Code)
}
