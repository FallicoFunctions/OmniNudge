package models

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/stretchr/testify/require"
)

func TestBotPersonaJSONOmitsSystemPrompt(t *testing.T) {
	persona := BotPersona{
		ID:           1,
		Slug:         "narrator",
		Name:         "Narrator",
		Category:     PersonaCategoryRoleplay,
		SystemPrompt: "top secret prompt",
		IsNSFW:       false,
		IsActive:     true,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	payload, err := json.Marshal(persona)
	require.NoError(t, err)
	require.NotContains(t, string(payload), "system_prompt")
	require.NotContains(t, string(payload), "top secret prompt")
}

func TestBotConversationRepositoryCreateWithMessagesRollsBackOnFailure(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := NewUserRepository(db.Pool)
	user := &User{
		Username:     fmt.Sprintf("omnichat_repo_%d", time.Now().UnixNano()),
		PasswordHash: "hash",
	}
	require.NoError(t, userRepo.Create(ctx, user))

	var personaID int
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, description, category, system_prompt, is_nsfw, is_active)
		VALUES ($1, $2, $3, $4, $5, false, true)
		RETURNING id
	`, fmt.Sprintf("omnichat-persona-%d", time.Now().UnixNano()), "Narrator", "desc", PersonaCategoryRoleplay, "prompt").
		Scan(&personaID)
	require.NoError(t, err)

	repo := NewBotConversationRepository(db.Pool)
	_, err = repo.CreateWithMessages(ctx, user.ID, personaID, nil, nil, []*BotMessage{
		{Role: "system", Content: "invalid role should abort transaction"},
	})
	require.Error(t, err)

	var conversationCount int
	err = db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM bot_conversations WHERE user_id = $1`, user.ID).
		Scan(&conversationCount)
	require.NoError(t, err)
	require.Zero(t, conversationCount)

	var messageCount int
	err = db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM bot_messages`).Scan(&messageCount)
	require.NoError(t, err)
	require.Zero(t, messageCount)
}

func TestBotPersonaRepositoryPersistsPreviewVideoURL(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	repo := NewBotPersonaRepository(db.Pool)
	avatarURL := "/uploads/test-avatar.png"
	previewVideoURL := "/uploads/test-preview.mp4"

	var personaID int
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, description, category, system_prompt, avatar_url, preview_video_url, is_nsfw, is_active)
		VALUES ($1, $2, $3, $4, $5, $6, $7, false, true)
		RETURNING id
	`, fmt.Sprintf("preview-persona-%d", time.Now().UnixNano()), "Preview Persona", "desc", PersonaCategoryRoleplay, "prompt", avatarURL, previewVideoURL).
		Scan(&personaID)
	require.NoError(t, err)

	persona, err := repo.GetByID(ctx, personaID)
	require.NoError(t, err)
	require.NotNil(t, persona)
	require.NotNil(t, persona.PreviewVideoURL)
	require.Equal(t, previewVideoURL, *persona.PreviewVideoURL)

	allPersonas, err := repo.ListAll(ctx)
	require.NoError(t, err)
	require.NotEmpty(t, allPersonas)

	var found *BotPersona
	for _, candidate := range allPersonas {
		if candidate.ID == personaID {
			found = candidate
			break
		}
	}
	require.NotNil(t, found)
	require.NotNil(t, found.PreviewVideoURL)
	require.Equal(t, previewVideoURL, *found.PreviewVideoURL)
}

func TestBotPersonaRepositoryUpdateMedia(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	repo := NewBotPersonaRepository(db.Pool)

	var personaID int
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, description, category, system_prompt, is_nsfw, is_active)
		VALUES ($1, $2, $3, $4, $5, false, true)
		RETURNING id
	`, fmt.Sprintf("persona-update-%d", time.Now().UnixNano()), "Updatable Persona", "desc", PersonaCategoryHelper, "prompt").
		Scan(&personaID)
	require.NoError(t, err)

	avatarURL := "/uploads/updated-avatar.png"
	previewVideoURL := "/uploads/updated-preview.mp4"
	updated, err := repo.UpdateMedia(ctx, personaID, &avatarURL, &previewVideoURL, []string{})
	require.NoError(t, err)
	require.NotNil(t, updated)
	require.NotNil(t, updated.AvatarURL)
	require.NotNil(t, updated.PreviewVideoURL)
	require.Equal(t, avatarURL, *updated.AvatarURL)
	require.Equal(t, previewVideoURL, *updated.PreviewVideoURL)

	cleared, err := repo.UpdateMedia(ctx, personaID, nil, nil, []string{})
	require.NoError(t, err)
	require.NotNil(t, cleared)
	require.Nil(t, cleared.AvatarURL)
	require.Nil(t, cleared.PreviewVideoURL)
}

func TestBotPersonaRepositoryGalleryURLs(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	repo := NewBotPersonaRepository(db.Pool)

	var personaID int
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, description, category, system_prompt, is_nsfw, is_active)
		VALUES ($1, $2, $3, $4, $5, false, true)
		RETURNING id
	`, fmt.Sprintf("persona-gallery-%d", time.Now().UnixNano()), "Gallery Persona", "desc", PersonaCategoryHelper, "prompt").
		Scan(&personaID)
	require.NoError(t, err)

	gallery := []string{"/uploads/g1.png", "https://example.com/g2.jpg", "/uploads/g3.webp"}
	updated, err := repo.UpdateMedia(ctx, personaID, nil, nil, gallery)
	require.NoError(t, err)
	require.NotNil(t, updated)
	require.Equal(t, 3, len(updated.GalleryURLs))
	require.Equal(t, gallery, updated.GalleryURLs)

	// Verify gallery persists through GetByID.
	fetched, err := repo.GetByID(ctx, personaID)
	require.NoError(t, err)
	require.NotNil(t, fetched)
	require.Equal(t, gallery, fetched.GalleryURLs)

	// Clear gallery.
	cleared, err := repo.UpdateMedia(ctx, personaID, nil, nil, []string{})
	require.NoError(t, err)
	require.NotNil(t, cleared)
	require.Equal(t, 0, len(cleared.GalleryURLs))
}
