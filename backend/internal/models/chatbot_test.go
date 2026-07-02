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
