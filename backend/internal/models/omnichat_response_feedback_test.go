package models_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestOmniChatResponseFeedbackRepositorySnapshotsOwnedAssistantContext(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "response_feedback_owner", PasswordHash: "hash", Role: "user"}
	other := &models.User{Username: "response_feedback_other", PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, owner))
	require.NoError(t, users.Create(ctx, other))

	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, category, system_prompt, visibility, source_format, is_active)
		VALUES ('response-feedback-test', 'Feedback Test', 'original', 'Stay in character.', 'public', 'native', TRUE)
		RETURNING id
	`).Scan(&personaID))
	conversation, err := models.NewBotConversationRepository(db.Pool).Create(ctx, owner.ID, personaID, nil, nil)
	require.NoError(t, err)
	messages := models.NewBotMessageRepository(db.Pool)
	userMessage, err := messages.Create(ctx, conversation.ID, models.BotMessageRoleUser, "Use my leg when it is your turn.", false)
	require.NoError(t, err)
	assistantMessage, err := messages.Create(ctx, conversation.ID, models.BotMessageRoleAssistant, "Your turn. My leg. Actually, your leg. My turn.", false)
	require.NoError(t, err)

	repo := models.NewOmniChatResponseFeedbackRepository(db.Pool)
	feedback, err := repo.CreateOwned(ctx, owner.ID, conversation.ID, assistantMessage.ID, models.OmniChatFeedbackRoleOwnership, "Swapped ownership.")
	require.NoError(t, err)
	require.Equal(t, assistantMessage.ID, feedback.MessageID)
	require.Equal(t, "Swapped ownership.", feedback.Note)

	var responseSnapshot, userSnapshot, responseHash string
	var storedUserMessageID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT response_snapshot, preceding_user_snapshot, response_hash, preceding_user_message_id
		FROM omnichat_response_feedback WHERE id = $1
	`, feedback.ID).Scan(&responseSnapshot, &userSnapshot, &responseHash, &storedUserMessageID))
	require.Equal(t, assistantMessage.Content, responseSnapshot)
	require.Equal(t, userMessage.Content, userSnapshot)
	require.Equal(t, userMessage.ID, storedUserMessageID)
	require.Len(t, responseHash, 64)

	repeated, err := repo.CreateOwned(ctx, owner.ID, conversation.ID, assistantMessage.ID, models.OmniChatFeedbackGrammarArtifact, "Also malformed.")
	require.NoError(t, err)
	require.Equal(t, feedback.ID, repeated.ID, "reporting the same response updates one immutable snapshot")
	require.Equal(t, models.OmniChatFeedbackGrammarArtifact, repeated.Reason)

	status := models.OmniChatFeedbackStatusNew
	reason := models.OmniChatFeedbackGrammarArtifact
	summaries, total, err := repo.ListForAdmin(ctx, &status, &reason, 25, 0)
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Len(t, summaries, 1)
	require.Equal(t, feedback.ID, summaries[0].ID)
	require.Equal(t, personaID, summaries[0].PersonaID)

	detail, err := repo.GetForAdmin(ctx, feedback.ID)
	require.NoError(t, err)
	require.Equal(t, assistantMessage.Content, detail.ResponseSnapshot)
	require.Equal(t, userMessage.Content, detail.PriorUserSnapshot)

	_, err = repo.TransitionStatusForAdmin(ctx, feedback.ID, models.OmniChatFeedbackStatusPromoted)
	require.ErrorIs(t, err, models.ErrOmniChatResponseFeedbackInvalidTransition)
	detail, err = repo.TransitionStatusForAdmin(ctx, feedback.ID, models.OmniChatFeedbackStatusReviewed)
	require.NoError(t, err)
	require.Equal(t, models.OmniChatFeedbackStatusReviewed, detail.Status)
	detail, err = repo.TransitionStatusForAdmin(ctx, feedback.ID, models.OmniChatFeedbackStatusPromoted)
	require.NoError(t, err)
	require.Equal(t, models.OmniChatFeedbackStatusPromoted, detail.Status)
	_, err = repo.TransitionStatusForAdmin(ctx, feedback.ID, models.OmniChatFeedbackStatusDismissed)
	require.ErrorIs(t, err, models.ErrOmniChatResponseFeedbackInvalidTransition)

	_, err = repo.CreateOwned(ctx, other.ID, conversation.ID, assistantMessage.ID, models.OmniChatFeedbackOther, "")
	require.ErrorIs(t, err, models.ErrOmniChatConversationNotOwned)
	_, err = repo.CreateOwned(ctx, owner.ID, conversation.ID, userMessage.ID, models.OmniChatFeedbackOther, "")
	require.ErrorIs(t, err, models.ErrOmniChatConversationNotOwned)
}
