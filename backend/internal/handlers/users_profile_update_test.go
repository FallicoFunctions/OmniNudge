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

	"github.com/gin-gonic/gin"
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
	return router
}

func TestUpdateProfileViaMeProfile_UpdatesBioAndAvatar(t *testing.T) {
	userRepo, settingsRepo, owner, _, cleanup := setupUsersVisibilityTest(t)
	defer cleanup()

	handler := NewUsersHandler(userRepo, settingsRepo, nil, nil, nil, nil)
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

	handler := NewUsersHandler(userRepo, settingsRepo, nil, nil, nil, nil)
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

	handler := NewUsersHandler(userRepo, settingsRepo, nil, nil, nil, nil)
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

	handler := NewUsersHandler(userRepo, settingsRepo, nil, nil, nil, nil)
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

	handler := NewUsersHandler(userRepo, settingsRepo, nil, nil, nil, nil)
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
