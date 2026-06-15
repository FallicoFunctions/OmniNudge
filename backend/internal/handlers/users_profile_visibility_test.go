package handlers

import (
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
	"github.com/omninudge/backend/internal/monitoring"
	"github.com/omninudge/backend/internal/services"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupUsersVisibilityTest(t *testing.T) (*models.UserRepository, *models.UserSettingsRepository, *models.User, *models.User, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	settingsRepo := models.NewUserSettingsRepository(db.Pool)

	owner := &models.User{
		Username:     fmt.Sprintf("po_%d", time.Now().UnixNano()%1_000_000_000),
		PasswordHash: "test_hash",
	}
	viewer := &models.User{
		Username:     fmt.Sprintf("pv_%d", time.Now().UnixNano()%1_000_000_000),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, owner))
	require.NoError(t, userRepo.Create(ctx, viewer))

	cleanup := func() {
		db.Close()
	}
	return userRepo, settingsRepo, owner, viewer, cleanup
}

func newUsersVisibilityRouter(handler *UsersHandler) *gin.Engine {
	router := gin.Default()
	router.GET("/users/:username", func(c *gin.Context) {
		if header := c.GetHeader("X-Viewer-ID"); header != "" {
			if id, err := strconv.Atoi(header); err == nil {
				c.Set("user_id", id)
			}
		}
		handler.GetUserProfile(c)
	})
	router.GET("/users/id/:id/profile", func(c *gin.Context) {
		if header := c.GetHeader("X-Viewer-ID"); header != "" {
			if id, err := strconv.Atoi(header); err == nil {
				c.Set("user_id", id)
			}
		}
		handler.GetUserProfileByID(c)
	})
	router.GET("/users/me/profile", func(c *gin.Context) {
		if header := c.GetHeader("X-Viewer-ID"); header != "" {
			if id, err := strconv.Atoi(header); err == nil {
				c.Set("user_id", id)
			}
		}
		handler.GetMyProfile(c)
	})
	router.GET("/users/:username/posts", func(c *gin.Context) {
		if header := c.GetHeader("X-Viewer-ID"); header != "" {
			if id, err := strconv.Atoi(header); err == nil {
				c.Set("user_id", id)
			}
		}
		handler.GetUserPosts(c)
	})
	router.GET("/users/:username/comments", func(c *gin.Context) {
		if header := c.GetHeader("X-Viewer-ID"); header != "" {
			if id, err := strconv.Atoi(header); err == nil {
				c.Set("user_id", id)
			}
		}
		handler.GetUserComments(c)
	})
	return router
}

func TestGetUserProfile_PrivateVisibility_HidesFromOthers(t *testing.T) {
	userRepo, settingsRepo, owner, viewer, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	ctx := context.Background()
	settings, err := settingsRepo.CreateDefault(ctx, owner.ID)
	require.NoError(t, err)
	settings.ProfileVisibility = "private"
	_, err = settingsRepo.Update(ctx, settings)
	require.NoError(t, err)

	handler := NewUsersHandler(userRepo, nil, nil, settingsRepo, nil, nil, nil, nil, nil, nil, nil)
	router := newUsersVisibilityRouter(handler)

	req := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
	req.Header.Set("X-Viewer-ID", strconv.Itoa(viewer.ID))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)

	reqSelf := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
	reqSelf.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	wSelf := httptest.NewRecorder()
	router.ServeHTTP(wSelf, reqSelf)
	assert.Equal(t, http.StatusOK, wSelf.Code)
}

func TestGetUserProfile_FriendsOnlyVisibility_HidesFromOthers(t *testing.T) {
	userRepo, settingsRepo, owner, viewer, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	ctx := context.Background()
	settings, err := settingsRepo.CreateDefault(ctx, owner.ID)
	require.NoError(t, err)
	settings.ProfileVisibility = "friends_only"
	_, err = settingsRepo.Update(ctx, settings)
	require.NoError(t, err)

	handler := NewUsersHandler(userRepo, nil, nil, settingsRepo, nil, nil, nil, nil, nil, nil, nil)
	router := newUsersVisibilityRouter(handler)

	req := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
	req.Header.Set("X-Viewer-ID", strconv.Itoa(viewer.ID))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestGetUserProfile_FriendsOnlyVisibility_ShowsToAcceptedFriend(t *testing.T) {
	userRepo, settingsRepo, owner, viewer, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	ctx := context.Background()
	settings, err := settingsRepo.CreateDefault(ctx, owner.ID)
	require.NoError(t, err)
	settings.ProfileVisibility = "friends_only"
	_, err = settingsRepo.Update(ctx, settings)
	require.NoError(t, err)

	friendRepo := models.NewUserFriendshipRepository(userRepo.GetPool())
	require.NoError(t, friendRepo.UpsertAccepted(ctx, owner.ID, viewer.ID))

	handler := NewUsersHandler(userRepo, nil, friendRepo, settingsRepo, nil, nil, nil, nil, nil, nil, nil)
	router := newUsersVisibilityRouter(handler)

	req := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
	req.Header.Set("X-Viewer-ID", strconv.Itoa(viewer.ID))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestGetUserProfileByID_PublicVisibility_ReturnsProfile(t *testing.T) {
	userRepo, settingsRepo, owner, _, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	handler := NewUsersHandler(userRepo, nil, nil, settingsRepo, nil, nil, nil, nil, nil, nil, nil)
	router := newUsersVisibilityRouter(handler)

	req := httptest.NewRequest(http.MethodGet, "/users/id/"+strconv.Itoa(owner.ID)+"/profile", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), owner.Username)
}

func TestGetMyProfile_ReturnsAuthenticatedUserProfile(t *testing.T) {
	userRepo, settingsRepo, owner, _, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	handler := NewUsersHandler(userRepo, nil, nil, settingsRepo, nil, nil, nil, nil, nil, nil, nil)
	router := newUsersVisibilityRouter(handler)

	req := httptest.NewRequest(http.MethodGet, "/users/me/profile", nil)
	req.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), owner.Username)
}

func TestGetUserProfile_PendingDeletion_HidesFromOtherUsers(t *testing.T) {
	userRepo, settingsRepo, owner, viewer, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	_, err := userRepo.GetPool().Exec(context.Background(), `
		UPDATE users
		SET deleted_at = NOW(), permanent_deletion_at = NOW() + INTERVAL '30 days'
		WHERE id = $1
	`, owner.ID)
	require.NoError(t, err)

	handler := NewUsersHandler(userRepo, nil, nil, settingsRepo, nil, nil, nil, nil, nil, nil, nil)
	router := newUsersVisibilityRouter(handler)

	req := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
	req.Header.Set("X-Viewer-ID", strconv.Itoa(viewer.ID))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)

	reqSelf := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
	reqSelf.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	wSelf := httptest.NewRecorder()
	router.ServeHTTP(wSelf, reqSelf)
	assert.Equal(t, http.StatusOK, wSelf.Code)
}

func TestGetUserPostsAndComments_PendingDeletion_HideFromOtherUsers(t *testing.T) {
	userRepo, settingsRepo, owner, viewer, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	_, err := userRepo.GetPool().Exec(context.Background(), `
		UPDATE users
		SET deleted_at = NOW(), permanent_deletion_at = NOW() + INTERVAL '30 days'
		WHERE id = $1
	`, owner.ID)
	require.NoError(t, err)

	handler := NewUsersHandler(userRepo, nil, nil, settingsRepo, nil, nil, nil, nil, nil, nil, nil)
	router := newUsersVisibilityRouter(handler)

	reqPosts := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username+"/posts", nil)
	reqPosts.Header.Set("X-Viewer-ID", strconv.Itoa(viewer.ID))
	wPosts := httptest.NewRecorder()
	router.ServeHTTP(wPosts, reqPosts)
	assert.Equal(t, http.StatusNotFound, wPosts.Code)

	reqComments := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username+"/comments", nil)
	reqComments.Header.Set("X-Viewer-ID", strconv.Itoa(viewer.ID))
	wComments := httptest.NewRecorder()
	router.ServeHTTP(wComments, reqComments)
	assert.Equal(t, http.StatusNotFound, wComments.Code)
}

func TestGetUserProfile_UsesCachedResponseUntilTTLExpiry(t *testing.T) {
	userRepo, settingsRepo, owner, _, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	initialBio := "cached bio"
	require.NoError(t, userRepo.UpdateProfile(context.Background(), owner.ID, &initialBio, nil, nil))

	handler := NewUsersHandler(userRepo, nil, nil, settingsRepo, nil, nil, nil, nil, services.NewMemoryCache(), nil, nil)
	router := newUsersVisibilityRouter(handler)

	firstReq := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
	firstW := httptest.NewRecorder()
	router.ServeHTTP(firstW, firstReq)
	require.Equal(t, http.StatusOK, firstW.Code)
	assert.Contains(t, firstW.Body.String(), initialBio)

	updatedBio := "fresh bio"
	require.NoError(t, userRepo.UpdateProfile(context.Background(), owner.ID, &updatedBio, nil, nil))

	secondReq := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
	secondW := httptest.NewRecorder()
	router.ServeHTTP(secondW, secondReq)
	require.Equal(t, http.StatusOK, secondW.Code)
	assert.Contains(t, secondW.Body.String(), initialBio)
	assert.NotContains(t, secondW.Body.String(), updatedBio)
}

func TestGetUserProfile_CacheScope_DoesNotLeakOwnerLastSeen(t *testing.T) {
	userRepo, settingsRepo, owner, viewer, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	ctx := context.Background()
	settings, err := settingsRepo.CreateDefault(ctx, owner.ID)
	require.NoError(t, err)
	settings.ShowLastSeen = false
	_, err = settingsRepo.Update(ctx, settings)
	require.NoError(t, err)

	handler := NewUsersHandler(userRepo, nil, nil, settingsRepo, nil, nil, nil, nil, services.NewMemoryCache(), nil, nil)
	router := newUsersVisibilityRouter(handler)

	// Owner request should include last_seen and populate owner-scoped cache.
	ownerReq := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
	ownerReq.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	ownerW := httptest.NewRecorder()
	router.ServeHTTP(ownerW, ownerReq)
	require.Equal(t, http.StatusOK, ownerW.Code)

	var ownerPayload map[string]any
	require.NoError(t, json.Unmarshal(ownerW.Body.Bytes(), &ownerPayload))
	ownerLastSeen, ownerHasLastSeen := ownerPayload["last_seen"]
	require.True(t, ownerHasLastSeen)
	require.NotEmpty(t, ownerLastSeen)

	// Public request should not include last_seen and must not reuse owner cache.
	publicReq := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
	publicReq.Header.Set("X-Viewer-ID", strconv.Itoa(viewer.ID))
	publicW := httptest.NewRecorder()
	router.ServeHTTP(publicW, publicReq)
	require.Equal(t, http.StatusOK, publicW.Code)

	var publicPayload map[string]any
	require.NoError(t, json.Unmarshal(publicW.Body.Bytes(), &publicPayload))
	_, publicHasLastSeen := publicPayload["last_seen"]
	assert.False(t, publicHasLastSeen, "public response should not include owner-only last_seen")
}

func TestGetUserProfile_UsesDedicatedUserProfilesData(t *testing.T) {
	userRepo, settingsRepo, owner, _, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	ctx := context.Background()
	profileRepo := models.NewUserProfileRepository(userRepo.GetPool())
	profileBio := "bio from user_profiles"
	profileAvatar := "https://example.com/user-profiles-avatar.png"
	require.NoError(t, profileRepo.Upsert(ctx, owner.ID, &profileBio, &profileAvatar, nil, nil, nil, nil))

	handler := NewUsersHandler(userRepo, profileRepo, nil, settingsRepo, nil, nil, nil, nil, nil, nil, nil)
	router := newUsersVisibilityRouter(handler)

	req := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), profileBio)
	assert.Contains(t, w.Body.String(), profileAvatar)
}

func TestGetUserProfile_CachedRead_Under200ms(t *testing.T) {
	userRepo, settingsRepo, owner, _, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	handler := NewUsersHandler(userRepo, nil, nil, settingsRepo, nil, nil, nil, nil, services.NewMemoryCache(), nil, nil)
	router := newUsersVisibilityRouter(handler)

	// Warm cache.
	warmReq := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
	warmW := httptest.NewRecorder()
	router.ServeHTTP(warmW, warmReq)
	require.Equal(t, http.StatusOK, warmW.Code)

	start := time.Now()
	cachedReq := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
	cachedW := httptest.NewRecorder()
	router.ServeHTTP(cachedW, cachedReq)
	duration := time.Since(start)

	require.Equal(t, http.StatusOK, cachedW.Code)
	assert.Less(t, duration, 200*time.Millisecond, "cached profile read should stay under 200ms")
}

func TestGetUserProfile_CacheHitRate_Exceeds80PercentOnWarmTraffic(t *testing.T) {
	userRepo, settingsRepo, owner, _, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	handler := NewUsersHandler(userRepo, nil, nil, settingsRepo, nil, nil, nil, nil, services.NewMemoryCache(), nil, nil)
	router := newUsersVisibilityRouter(handler)

	beforeHit := testutil.ToFloat64(monitoring.ProfileCacheAccessTotal.WithLabelValues("hit", "public"))
	beforeMiss := testutil.ToFloat64(monitoring.ProfileCacheAccessTotal.WithLabelValues("miss", "public"))

	for i := 0; i < 10; i++ {
		req := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		require.Equal(t, http.StatusOK, w.Code)
	}

	afterHit := testutil.ToFloat64(monitoring.ProfileCacheAccessTotal.WithLabelValues("hit", "public"))
	afterMiss := testutil.ToFloat64(monitoring.ProfileCacheAccessTotal.WithLabelValues("miss", "public"))

	hitDelta := afterHit - beforeHit
	missDelta := afterMiss - beforeMiss
	totalDelta := hitDelta + missDelta

	require.GreaterOrEqual(t, totalDelta, float64(10))
	require.Greater(t, hitDelta, float64(0))
	assert.GreaterOrEqual(t, hitDelta/totalDelta, 0.80)
}
