package services

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
	"unicode"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

type stubTraitLoader struct {
	baseline models.OmniChatDispositionBaseline
	byOwner  map[int]models.OmniChatCharacterTraits
	err      error
	asked    []int
}

// The stub serves the two tiers the same way the repository's one query does,
// and records exactly which owners it was asked to match, so a read that ever
// widened past the self tier and this conversation's own user would show up.
func (s *stubTraitLoader) LoadForConversation(_ context.Context, _, userID int) (models.OmniChatDispositionBaseline, models.OmniChatCharacterTraits, models.OmniChatCharacterTraits, error) {
	s.asked = append(s.asked, models.OmniChatMemoryTierSelf, userID)
	if s.err != nil {
		return models.OmniChatDispositionBaseline{}, models.OmniChatCharacterTraits{}, models.OmniChatCharacterTraits{}, s.err
	}
	return s.baseline, s.byOwner[models.OmniChatMemoryTierSelf], s.byOwner[userID], nil
}

func testPersona() *models.BotPersona {
	return &models.BotPersona{ID: 7, Name: "Sadie", SystemPrompt: "You are Sadie."}
}

func TestRenderCharacterDispositionSaysNothingAtRest(t *testing.T) {
	for _, disposition := range []models.OmniChatDisposition{
		{},
		{Mood: 0.19, Trust: -0.19, Warmth: 0.1},
	} {
		require.Empty(t, renderCharacterDisposition(disposition),
			"a character at rest must not be described at all")
	}
}

// The deadband is only worth anything if it means the prompt is unchanged, byte
// for byte, from what it was before dispositions existed.
func TestNeutralDispositionLeavesThePromptByteIdentical(t *testing.T) {
	persona := testPersona()
	before := buildConversationSystemPromptWithMemory(persona, nil, nil, nil, nil)
	after := buildConversationSystemPromptWithDisposition(persona, nil, nil, nil, promptRecall{},
		models.OmniChatDisposition{Mood: 0.1, Trust: -0.15, Warmth: 0.05})
	require.Equal(t, before, after)
	require.NotContains(t, after, "[How You Are Right Now]")
}

func TestRenderCharacterDispositionDistinguishesGuardedFromWarm(t *testing.T) {
	guarded := renderCharacterDisposition(models.OmniChatDisposition{Mood: -0.7, Trust: -0.35})
	warm := renderCharacterDisposition(models.OmniChatDisposition{Mood: 0.4, Trust: 0.3, Warmth: 0.8})

	require.Contains(t, guarded, "guarded")
	require.Contains(t, guarded, "low")
	require.NotContains(t, warm, "guarded")
	require.Contains(t, warm, "fond of them")
	require.NotEqual(t, guarded, warm)

	// Strong is strong, not operatic: -0.7 is a bad week, not a ruined life.
	require.NotContains(t, strings.ToLower(guarded), "devastated")
	require.LessOrEqual(t, strings.Count(strings.TrimSpace(guarded), "\n"), 3,
		"a note, not a character study: a header, its framing, and at most two lines of state")
}

func TestRenderCharacterDispositionNeverWritesANumber(t *testing.T) {
	for _, value := range []float64{-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1} {
		block := renderCharacterDisposition(models.OmniChatDisposition{Mood: value, Trust: value, Warmth: -value})
		require.False(t, strings.IndexFunc(block, unicode.IsDigit) >= 0,
			"a rendered disposition must never contain a digit: %q", block)
	}
}

func TestComposeDispositionAddsBothTiersAndClamps(t *testing.T) {
	now := time.Now()
	self := models.OmniChatCharacterTraits{Mood: -0.4, MoodUpdatedAt: now, Trust: -0.8, Warmth: 0.3}
	relationship := models.OmniChatCharacterTraits{Mood: -0.3, MoodUpdatedAt: now, Trust: -0.5, Warmth: 0.2}

	composed := models.ComposeOmniChatDisposition(models.OmniChatDispositionBaseline{}, self, relationship, now)

	require.InDelta(t, -0.7, composed.Mood, 1e-9)
	require.InDelta(t, -1, composed.Trust, 1e-9, "the sum must clamp to the scale the wording can express")
	require.InDelta(t, 0.5, composed.Warmth, 1e-9)
}

func TestComposeDispositionDecaysMoodToNow(t *testing.T) {
	now := time.Now()
	old := models.OmniChatCharacterTraits{Mood: -0.9, MoodUpdatedAt: now.Add(-30 * 24 * time.Hour)}

	fresh := models.ComposeOmniChatDisposition(models.OmniChatDispositionBaseline{}, old, models.OmniChatCharacterTraits{MoodUpdatedAt: now}, now)

	require.Less(t, fresh.Mood, 0.0)
	require.Greater(t, fresh.Mood, -omniChatDispositionDeadband,
		"a month-old bad mood must have decayed below the deadband")
	require.Empty(t, renderCharacterDisposition(fresh), "and so must say nothing")
}

func TestLoadDispositionReadsOnlyTheConversationsOwnUser(t *testing.T) {
	now := time.Now()
	loader := &stubTraitLoader{byOwner: map[int]models.OmniChatCharacterTraits{
		models.OmniChatMemoryTierSelf: {MoodUpdatedAt: now},
		41:                            {MoodUpdatedAt: now, Trust: -0.9},
		42:                            {MoodUpdatedAt: now, Warmth: 0.9},
	}}
	service := (&ChatbotService{}).SetCharacterTraits(loader)
	persona := testPersona()

	forB := renderCharacterDisposition(service.loadDisposition(context.Background(), persona, 42).Composed)

	require.Contains(t, forB, "fond of them")
	require.NotContains(t, forB, "guarded", "user A's history must never reach user B's prompt")
	require.Equal(t, []int{models.OmniChatMemoryTierSelf, 42}, loader.asked)
}

func TestLoadDispositionDegradesWhenTheRepositoryFails(t *testing.T) {
	service := (&ChatbotService{}).SetCharacterTraits(&stubTraitLoader{err: errors.New("database is down")})

	disposition := service.loadDisposition(context.Background(), testPersona(), 42)

	require.Equal(t, loadedDisposition{}, disposition)
	require.Empty(t, renderCharacterDisposition(disposition.Composed))
}

func TestLoadDispositionWithoutARepositoryIsNeutral(t *testing.T) {
	loaded := (&ChatbotService{}).loadDisposition(context.Background(), testPersona(), 42)

	// Neutral in every part, not only in the composition the prompt reads. The
	// blocking decision reads the other two, and a character nobody has any
	// traits for must not look to it like somebody who has been driven down.
	require.Equal(t, loadedDisposition{}, loaded)
	require.Equal(t, models.OmniChatDisposition{}, loaded.Composed)
	require.False(t, models.ShouldBlock(loaded.Baseline, loaded.Relationship))
}

func TestBuildConversationSystemPromptOrdersDispositionBlock(t *testing.T) {
	persona := testPersona()
	memories := []*models.OmniChatMemoryEpisode{
		{ID: 1, OwnerUserID: 2, Title: "The row", Summary: "It did not go well."},
	}
	sceneState := &models.OmniChatConversationSceneState{
		ConversationID:  1,
		OwnerUserID:     2,
		Actors:          []models.OmniChatSceneActor{{Key: "user", Kind: models.OmniChatSceneActorUser, Label: "User"}, {Key: "persona", Kind: models.OmniChatSceneActorPersona, Label: "Sadie"}},
		ActiveTurnActor: "persona",
		Event:           models.OmniChatSceneEvent{Subject: "persona", Action: "waits", Target: "user"},
		Status:          models.OmniChatSceneStatusCompleted,
		Location:        "unspecified",
		Revision:        1,
	}

	prompt := buildConversationSystemPromptWithDisposition(persona, nil, nil, sceneState, promptRecall{Memories: memories},
		models.OmniChatDisposition{Mood: -0.7, Trust: -0.4})

	trustIdx := strings.Index(prompt, "[Conversation Integrity]")
	memoryIdx := strings.Index(prompt, "[Recalled Memories]")
	dispositionIdx := strings.Index(prompt, "[How You Are Right Now]")
	sceneIdx := strings.Index(prompt, "[Server Scene Continuity State]")

	require.NotEqual(t, -1, dispositionIdx)
	require.Less(t, trustIdx, dispositionIdx, "traits move with an untrusted transcript")
	require.Less(t, memoryIdx, dispositionIdx, "the history, then what it left her feeling")
	require.Less(t, dispositionIdx, sceneIdx, "the scene still governs the present")
}
