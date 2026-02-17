package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
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
		Username:     uniqueConversationsUsername("profile_owner"),
		PasswordHash: "test_hash",
	}
	viewer := &models.User{
		Username:     uniqueConversationsUsername("profile_viewer"),
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

	handler := NewUsersHandler(userRepo, settingsRepo, nil, nil, nil, nil)
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

	handler := NewUsersHandler(userRepo, settingsRepo, nil, nil, nil, nil)
	router := newUsersVisibilityRouter(handler)

	req := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
	req.Header.Set("X-Viewer-ID", strconv.Itoa(viewer.ID))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestGetUserProfileByID_PublicVisibility_ReturnsProfile(t *testing.T) {
	userRepo, settingsRepo, owner, _, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	handler := NewUsersHandler(userRepo, settingsRepo, nil, nil, nil, nil)
	router := newUsersVisibilityRouter(handler)

	req := httptest.NewRequest(http.MethodGet, "/users/id/"+strconv.Itoa(owner.ID)+"/profile", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), owner.Username)
}
