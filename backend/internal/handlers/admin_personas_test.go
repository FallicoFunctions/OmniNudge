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
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupAdminPersonaTestEnv(t *testing.T) (*gin.Engine, *models.UserRepository, *models.BotPersonaRepository, *pgxpool.Pool, func()) {
	gin.SetMode(gin.TestMode)

	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	personaRepo := models.NewBotPersonaRepository(db.Pool)
	handler := NewAdminPersonaHandler(personaRepo)

	router := gin.New()
	router.Use(func(c *gin.Context) {
		if userID := c.GetHeader("X-Test-User-ID"); userID != "" {
			if id, err := strconv.Atoi(userID); err == nil {
				c.Set("user_id", id)
			}
		}
		if role := c.GetHeader("X-Test-Role"); role != "" {
			c.Set("role", role)
		}
		c.Next()
	})

	adminRoutes := router.Group("/api/v1/admin/omnichat")
	adminRoutes.Use(middleware.RequireRole("admin"))
	{
		adminRoutes.GET("/personas", handler.ListPersonas)
		adminRoutes.PUT("/personas/:id", handler.UpdatePersonaMedia)
	}

	cleanup := func() {
		_ = database.ResetTestData(ctx, db)
	}

	return router, userRepo, personaRepo, db.Pool, cleanup
}

func createAdminPersonaTestUser(t *testing.T, repo *models.UserRepository, username, role string) *models.User {
	ctx := context.Background()
	user := &models.User{
		Username:     username,
		PasswordHash: "test-hash",
		Role:         role,
	}
	err := repo.Create(ctx, user)
	require.NoError(t, err)
	return user
}

func setAdminPersonaTestHeaders(req *http.Request, userID int, role string) {
	req.Header.Set("X-Test-User-ID", strconv.Itoa(userID))
	req.Header.Set("X-Test-Role", role)
}

func seedAdminPersona(t *testing.T, pool *pgxpool.Pool, repo *models.BotPersonaRepository) *models.BotPersona {
	ctx := context.Background()
	slug := fmt.Sprintf("admin-persona-%d", time.Now().UnixNano())
	var personaID int
	err := pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, description, category, system_prompt, is_nsfw, is_active)
		VALUES ($1, $2, $3, $4, $5, false, true)
		RETURNING id
	`, slug, "Admin Persona", "desc", models.PersonaCategoryRoleplay, "prompt").Scan(&personaID)
	require.NoError(t, err)

	persona, err := repo.GetByID(ctx, personaID)
	require.NoError(t, err)
	require.NotNil(t, persona)
	return persona
}

func TestAdminPersonaHandlerListPersonas(t *testing.T) {
	router, userRepo, personaRepo, pool, cleanup := setupAdminPersonaTestEnv(t)
	defer cleanup()

	admin := createAdminPersonaTestUser(t, userRepo, "persona_admin_list", "admin")
	persona := seedAdminPersona(t, pool, personaRepo)
	videoURL := "/uploads/persona-preview.mp4"
	gallery := []string{}
	_, err := personaRepo.UpdateMedia(context.Background(), persona.ID, persona.AvatarURL, &videoURL, &gallery)
	require.NoError(t, err)

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/omnichat/personas", nil)
	setAdminPersonaTestHeaders(req, admin.ID, "admin")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response struct {
		Personas []*models.BotPersona `json:"personas"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.NotEmpty(t, response.Personas)

	var found *models.BotPersona
	for _, candidate := range response.Personas {
		if candidate.ID == persona.ID {
			found = candidate
			break
		}
	}
	require.NotNil(t, found)
	require.NotNil(t, found.PreviewVideoURL)
	assert.Equal(t, videoURL, *found.PreviewVideoURL)
}

func TestAdminPersonaHandlerUpdatePersonaMedia(t *testing.T) {
	router, userRepo, personaRepo, pool, cleanup := setupAdminPersonaTestEnv(t)
	defer cleanup()

	admin := createAdminPersonaTestUser(t, userRepo, "persona_admin_update", "admin")
	persona := seedAdminPersona(t, pool, personaRepo)

	payload := map[string]interface{}{
		"avatar_url":        "/uploads/persona-avatar.png",
		"preview_video_url": "/uploads/persona-preview.mp4",
		"gallery_urls":      []string{"/uploads/gallery-1.png", "/uploads/gallery-2.webp"},
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest(http.MethodPut, "/api/v1/admin/omnichat/personas/"+strconv.Itoa(persona.ID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	setAdminPersonaTestHeaders(req, admin.ID, "admin")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	updated, err := personaRepo.GetByID(context.Background(), persona.ID)
	require.NoError(t, err)
	require.NotNil(t, updated)
	require.NotNil(t, updated.AvatarURL)
	require.NotNil(t, updated.PreviewVideoURL)
	assert.Equal(t, "/uploads/persona-avatar.png", *updated.AvatarURL)
	assert.Equal(t, "/uploads/persona-preview.mp4", *updated.PreviewVideoURL)
	assert.Equal(t, []string{"/uploads/gallery-1.png", "/uploads/gallery-2.webp"}, updated.GalleryURLs)
}

func TestAdminPersonaHandlerUpdatePersonaMediaPreservesGalleryWhenOmitted(t *testing.T) {
	router, userRepo, personaRepo, pool, cleanup := setupAdminPersonaTestEnv(t)
	defer cleanup()

	admin := createAdminPersonaTestUser(t, userRepo, "persona_admin_preserve_gallery", "admin")
	persona := seedAdminPersona(t, pool, personaRepo)
	originalGallery := []string{"/uploads/original-gallery.png"}
	_, err := personaRepo.UpdateMedia(context.Background(), persona.ID, nil, nil, &originalGallery)
	require.NoError(t, err)

	payload := map[string]string{
		"avatar_url":        "/uploads/new-avatar.png",
		"preview_video_url": "/uploads/new-preview.mp4",
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest(http.MethodPut, "/api/v1/admin/omnichat/personas/"+strconv.Itoa(persona.ID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	setAdminPersonaTestHeaders(req, admin.ID, "admin")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	updated, err := personaRepo.GetByID(context.Background(), persona.ID)
	require.NoError(t, err)
	require.NotNil(t, updated)
	assert.Equal(t, originalGallery, updated.GalleryURLs)
}

func TestAdminPersonaHandlerRejectsInvalidPreviewVideoURL(t *testing.T) {
	router, userRepo, personaRepo, pool, cleanup := setupAdminPersonaTestEnv(t)
	defer cleanup()

	admin := createAdminPersonaTestUser(t, userRepo, "persona_admin_invalid", "admin")
	persona := seedAdminPersona(t, pool, personaRepo)

	payload := map[string]string{
		"avatar_url":        "/uploads/persona-avatar.png",
		"preview_video_url": "ftp://invalid.example.com/persona-preview.mp4",
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest(http.MethodPut, "/api/v1/admin/omnichat/personas/"+strconv.Itoa(persona.ID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	setAdminPersonaTestHeaders(req, admin.ID, "admin")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Preview video URL must be a valid uploaded video URL")
}

func TestAdminPersonaHandlerRejectsExternalMediaURL(t *testing.T) {
	router, userRepo, personaRepo, pool, cleanup := setupAdminPersonaTestEnv(t)
	defer cleanup()

	admin := createAdminPersonaTestUser(t, userRepo, "persona_admin_external", "admin")
	persona := seedAdminPersona(t, pool, personaRepo)

	payload := map[string]string{
		"avatar_url":        "https://example.com/persona-avatar.png",
		"preview_video_url": "/uploads/persona-preview.mp4",
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest(http.MethodPut, "/api/v1/admin/omnichat/personas/"+strconv.Itoa(persona.ID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	setAdminPersonaTestHeaders(req, admin.ID, "admin")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Avatar URL must be a valid uploaded image URL")
}

func TestAdminPersonaHandlerRequiresAdminRole(t *testing.T) {
	router, userRepo, personaRepo, pool, cleanup := setupAdminPersonaTestEnv(t)
	defer cleanup()

	user := createAdminPersonaTestUser(t, userRepo, "persona_admin_denied", "user")
	persona := seedAdminPersona(t, pool, personaRepo)

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/admin/omnichat/personas", nil)
	setAdminPersonaTestHeaders(req, user.ID, "user")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)

	payload := map[string]string{"avatar_url": "/uploads/persona-avatar.png"}
	body, _ := json.Marshal(payload)

	req, _ = http.NewRequest(http.MethodPut, "/api/v1/admin/omnichat/personas/"+strconv.Itoa(persona.ID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	setAdminPersonaTestHeaders(req, user.ID, "user")

	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}
