package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newUsersProfileUpdateRouter(handler *UsersHandler) *gin.Engine {
	router := gin.Default()
	withUser := func(c *gin.Context) {
		if header := c.GetHeader("X-Viewer-ID"); header != "" {
			if id, err := strconv.Atoi(header); err == nil {
				c.Set("user_id", id)
			}
		}
	}

	router.PUT("/users/me/profile", func(c *gin.Context) {
		withUser(c)
		handler.UpdateProfile(c)
	})
	router.PUT("/users/profile", func(c *gin.Context) {
		withUser(c)
		handler.UpdateProfile(c)
	})
	router.GET("/users/:username", func(c *gin.Context) {
		withUser(c)
		handler.GetUserProfile(c)
	})
	router.GET("/users/me/profile", func(c *gin.Context) {
		withUser(c)
		handler.GetMyProfile(c)
	})
	router.POST("/users/me/ping", func(c *gin.Context) {
		withUser(c)
		handler.Ping(c)
	})
	return router
}

func TestUpdateProfileViaMeProfile_UpdatesBioAndAvatar(t *testing.T) {
	userRepo, settingsRepo, owner, _, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	handler := NewUsersHandler(userRepo, settingsRepo, nil, nil, nil, nil, nil)
	router := newUsersProfileUpdateRouter(handler)

	body := map[string]any{
		"bio":        "Updated bio",
		"avatar_url": "https://example.com/avatar.png",
	}
	payload, err := json.Marshal(body)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPut, "/users/me/profile", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, "response: %s", w.Body.String())
	assert.Contains(t, w.Body.String(), "Updated bio")
	assert.Contains(t, w.Body.String(), "https://example.com/avatar.png")

	updated, err := userRepo.GetByID(context.Background(), owner.ID)
	require.NoError(t, err)
	require.NotNil(t, updated)
	require.NotNil(t, updated.Bio)
	require.NotNil(t, updated.AvatarURL)
	assert.Equal(t, "Updated bio", *updated.Bio)
	assert.Equal(t, "https://example.com/avatar.png", *updated.AvatarURL)
}

func TestUpdateProfileViaLegacyAlias_UpdatesBioAndAvatar(t *testing.T) {
	userRepo, settingsRepo, owner, _, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	handler := NewUsersHandler(userRepo, settingsRepo, nil, nil, nil, nil, nil)
	router := newUsersProfileUpdateRouter(handler)

	body := map[string]any{
		"bio":        "Legacy update bio",
		"avatar_url": "https://example.com/legacy-avatar.png",
	}
	payload, err := json.Marshal(body)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPut, "/users/profile", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, "response: %s", w.Body.String())
	assert.Contains(t, w.Body.String(), "Legacy update bio")
	assert.Contains(t, w.Body.String(), "https://example.com/legacy-avatar.png")
}

func TestUpdateProfile_RejectsInvalidAvatarURL(t *testing.T) {
	userRepo, settingsRepo, owner, _, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	handler := NewUsersHandler(userRepo, settingsRepo, nil, nil, nil, nil, nil)
	router := newUsersProfileUpdateRouter(handler)

	body := map[string]any{
		"avatar_url": "ftp://invalid.example.com/avatar.png",
	}
	payload, err := json.Marshal(body)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPut, "/users/me/profile", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Avatar URL must be a valid HTTP(S) URL")
}

func TestUpdateProfile_RejectsTooLongBio(t *testing.T) {
	userRepo, settingsRepo, owner, _, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	handler := NewUsersHandler(userRepo, settingsRepo, nil, nil, nil, nil, nil)
	router := newUsersProfileUpdateRouter(handler)

	body := map[string]any{
		"bio": strings.Repeat("a", 501),
	}
	payload, err := json.Marshal(body)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPut, "/users/me/profile", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Bio must be 500 characters or less")
}

func TestUpdateProfile_EmptyStringsClearFields(t *testing.T) {
	userRepo, settingsRepo, owner, _, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	handler := NewUsersHandler(userRepo, settingsRepo, nil, nil, nil, nil, nil)
	router := newUsersProfileUpdateRouter(handler)

	seedBody := map[string]any{
		"bio":        "Seeded bio",
		"avatar_url": "https://example.com/seeded-avatar.png",
	}
	seedPayload, err := json.Marshal(seedBody)
	require.NoError(t, err)

	seedReq := httptest.NewRequest(http.MethodPut, "/users/me/profile", bytes.NewReader(seedPayload))
	seedReq.Header.Set("Content-Type", "application/json")
	seedReq.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	seedW := httptest.NewRecorder()
	router.ServeHTTP(seedW, seedReq)
	require.Equal(t, http.StatusOK, seedW.Code, "seed response: %s", seedW.Body.String())

	clearBody := map[string]any{
		"bio":        "",
		"avatar_url": "",
	}
	clearPayload, err := json.Marshal(clearBody)
	require.NoError(t, err)

	clearReq := httptest.NewRequest(http.MethodPut, "/users/me/profile", bytes.NewReader(clearPayload))
	clearReq.Header.Set("Content-Type", "application/json")
	clearReq.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	clearW := httptest.NewRecorder()
	router.ServeHTTP(clearW, clearReq)
	require.Equal(t, http.StatusOK, clearW.Code, "clear response: %s", clearW.Body.String())

	updated, err := userRepo.GetByID(context.Background(), owner.ID)
	require.NoError(t, err)
	require.NotNil(t, updated)
	assert.Nil(t, updated.Bio)
	assert.Nil(t, updated.AvatarURL)
}

func TestUpdateProfile_InvalidatesCachedPublicProfile(t *testing.T) {
	userRepo, settingsRepo, owner, _, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	initialBio := "before cache"
	require.NoError(t, userRepo.UpdateProfile(context.Background(), owner.ID, &initialBio, nil))

	handler := NewUsersHandler(userRepo, settingsRepo, nil, nil, nil, nil, services.NewMemoryCache())
	router := newUsersProfileUpdateRouter(handler)

	firstGetReq := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
	firstGetW := httptest.NewRecorder()
	router.ServeHTTP(firstGetW, firstGetReq)
	require.Equal(t, http.StatusOK, firstGetW.Code)
	assert.Contains(t, firstGetW.Body.String(), initialBio)

	updateBody := map[string]any{"bio": "after update"}
	updatePayload, err := json.Marshal(updateBody)
	require.NoError(t, err)

	updateReq := httptest.NewRequest(http.MethodPut, "/users/me/profile", bytes.NewReader(updatePayload))
	updateReq.Header.Set("Content-Type", "application/json")
	updateReq.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	updateW := httptest.NewRecorder()
	router.ServeHTTP(updateW, updateReq)
	require.Equal(t, http.StatusOK, updateW.Code, "response: %s", updateW.Body.String())

	secondGetReq := httptest.NewRequest(http.MethodGet, "/users/"+owner.Username, nil)
	secondGetW := httptest.NewRecorder()
	router.ServeHTTP(secondGetW, secondGetReq)
	require.Equal(t, http.StatusOK, secondGetW.Code)
	assert.Contains(t, secondGetW.Body.String(), "after update")
	assert.NotContains(t, secondGetW.Body.String(), initialBio)
}

func TestPing_InvalidatesCachedOwnerProfileLastSeen(t *testing.T) {
	userRepo, settingsRepo, owner, _, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	handler := NewUsersHandler(userRepo, settingsRepo, nil, nil, nil, nil, services.NewMemoryCache())
	router := newUsersProfileUpdateRouter(handler)

	firstReq := httptest.NewRequest(http.MethodGet, "/users/me/profile", nil)
	firstReq.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	firstW := httptest.NewRecorder()
	router.ServeHTTP(firstW, firstReq)
	require.Equal(t, http.StatusOK, firstW.Code)

	var firstPayload map[string]any
	require.NoError(t, json.Unmarshal(firstW.Body.Bytes(), &firstPayload))
	firstLastSeen, ok := firstPayload["last_seen"].(string)
	require.True(t, ok)
	require.NotEmpty(t, firstLastSeen)

	time.Sleep(1100 * time.Millisecond)

	pingReq := httptest.NewRequest(http.MethodPost, "/users/me/ping", nil)
	pingReq.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	pingW := httptest.NewRecorder()
	router.ServeHTTP(pingW, pingReq)
	require.Equal(t, http.StatusOK, pingW.Code)

	secondReq := httptest.NewRequest(http.MethodGet, "/users/me/profile", nil)
	secondReq.Header.Set("X-Viewer-ID", strconv.Itoa(owner.ID))
	secondW := httptest.NewRecorder()
	router.ServeHTTP(secondW, secondReq)
	require.Equal(t, http.StatusOK, secondW.Code)

	var secondPayload map[string]any
	require.NoError(t, json.Unmarshal(secondW.Body.Bytes(), &secondPayload))
	secondLastSeen, ok := secondPayload["last_seen"].(string)
	require.True(t, ok)
	require.NotEmpty(t, secondLastSeen)
	assert.NotEqual(t, firstLastSeen, secondLastSeen)
}
