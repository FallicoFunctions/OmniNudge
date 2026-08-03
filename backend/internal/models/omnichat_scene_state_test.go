package models_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func validConversationSceneState(conversationID, ownerUserID int) models.OmniChatConversationSceneState {
	return models.OmniChatConversationSceneState{
		ConversationID: conversationID, OwnerUserID: ownerUserID,
		Actors:          []models.OmniChatSceneActor{{Key: "user", Kind: models.OmniChatSceneActorUser, Label: "You"}, {Key: "persona", Kind: models.OmniChatSceneActorPersona, Label: "Ari"}},
		ActiveTurnActor: "persona", Event: models.OmniChatSceneEvent{Subject: "persona", Action: "offers tea", Target: "user"},
		Status: models.OmniChatSceneStatusProposed, Location: "library", OwnershipFacts: []models.OmniChatSceneOwnershipFact{{Subject: "tea", Owner: "persona"}},
		BoundaryFacts: []models.OmniChatSceneBoundaryFact{{Subject: "user", Kind: models.OmniChatSceneBoundaryConsent, Value: models.OmniChatSceneBoundaryAllowed}},
	}
}

func TestOmniChatConversationSceneStateValidation(t *testing.T) {
	state := validConversationSceneState(9, 4)
	require.NoError(t, state.Validate())

	state.ActiveTurnActor = "unknown"
	require.ErrorContains(t, state.Validate(), "active turn actor")
	state = validConversationSceneState(9, 4)
	state.Status = "improvised"
	require.ErrorContains(t, state.Validate(), "status")
	state = validConversationSceneState(9, 4)
	state.Actors = append(state.Actors, state.Actors[0])
	require.ErrorContains(t, state.Validate(), "duplicate actor")
	state = validConversationSceneState(9, 4)
	state.BoundaryFacts[0].Value = "maybe"
	require.ErrorContains(t, state.Validate(), "boundary value")
	state = validConversationSceneState(9, 4)
	state.Actors = append(state.Actors, models.OmniChatSceneActor{Key: "npc:guard", Kind: models.OmniChatSceneActorNPC, Label: "Guard"})
	state.ActiveTurnActor = "npc:guard"
	require.NoError(t, state.Validate())
}

func TestOmniChatConversationSceneStateRepositoryIsOwnerScoped(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "scene_owner", PasswordHash: "hash", Role: "user"}
	other := &models.User{Username: "scene_other", PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, owner))
	require.NoError(t, users.Create(ctx, other))
	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `INSERT INTO bot_personas (slug,name,category,system_prompt,visibility,source_format,is_active) VALUES ('scene-state-test','Scene Test','original','Stay in character.','public','native',TRUE) RETURNING id`).Scan(&personaID))
	conversation, err := models.NewBotConversationRepository(db.Pool).Create(ctx, owner.ID, personaID, nil, nil)
	require.NoError(t, err)

	repo := models.NewOmniChatConversationSceneStateRepository(db.Pool)
	state := validConversationSceneState(conversation.ID, owner.ID)
	stored, err := repo.UpsertOwned(ctx, state)
	require.NoError(t, err)
	require.Equal(t, int64(1), stored.Revision)
	require.Equal(t, "library", stored.Location)
	firstMessage, err := models.NewBotMessageRepository(db.Pool).Create(ctx, conversation.ID, models.BotMessageRoleUser, "Offer tea", false)
	require.NoError(t, err)
	require.NoError(t, repo.SaveCheckpointOwned(ctx, *stored, firstMessage.ID))

	state = *stored
	state.Location, state.Status = "garden", models.OmniChatSceneStatusCompleted
	stored, err = repo.UpsertOwned(ctx, state)
	require.NoError(t, err)
	require.Equal(t, int64(2), stored.Revision)
	require.Equal(t, models.OmniChatSceneStatusCompleted, stored.Status)
	secondMessage, err := models.NewBotMessageRepository(db.Pool).Create(ctx, conversation.ID, models.BotMessageRoleUser, "Walk outside", false)
	require.NoError(t, err)
	require.NoError(t, repo.SaveCheckpointOwned(ctx, *stored, secondMessage.ID))
	regenerationState, err := repo.GetLatestCheckpointAtOrBeforeOwned(ctx, owner.ID, conversation.ID, firstMessage.ID)
	require.NoError(t, err)
	require.Equal(t, "library", regenerationState.Location, "regeneration uses state at the replaced reply's preceding user turn")
	require.Equal(t, firstMessage.ID, regenerationState.CheckpointMessageID)

	conversation.Persona = &models.BotPersona{Name: "Scene Test"}
	fork, err := models.NewBotConversationRepository(db.Pool).ForkConversation(ctx, owner.ID, conversation)
	require.NoError(t, err)
	require.NotNil(t, fork)
	forkMessages, err := models.NewBotMessageRepository(db.Pool).ListByConversationID(ctx, fork.ID, 10)
	require.NoError(t, err)
	require.Len(t, forkMessages, 2)
	forkState, err := repo.GetLatestCheckpointAtOrBeforeOwned(ctx, owner.ID, fork.ID, forkMessages[1].ID)
	require.NoError(t, err)
	require.NotNil(t, forkState)
	require.Equal(t, "garden", forkState.Location)
	require.Equal(t, forkMessages[1].ID, forkState.CheckpointMessageID)

	stale := state
	stale.Location = "stale overwrite"
	_, err = repo.UpsertOwned(ctx, stale)
	require.ErrorIs(t, err, models.ErrOmniChatSceneStateConflict)

	foreign, err := repo.GetOwned(ctx, other.ID, conversation.ID)
	require.NoError(t, err)
	require.Nil(t, foreign)

	state.OwnerUserID = other.ID
	_, err = repo.UpsertOwned(ctx, state)
	require.ErrorIs(t, err, models.ErrOmniChatConversationNotOwned)
}
