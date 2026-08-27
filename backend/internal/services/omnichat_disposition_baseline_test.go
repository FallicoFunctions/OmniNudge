package services

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
)

type stubBaselineClient struct {
	response string
	err      error
	calls    int
	prompt   string
	card     string
}

func (c *stubBaselineClient) Generate(_ context.Context, messages []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
	c.calls++
	for _, message := range messages {
		switch message.Role {
		case openrouter.RoleSystem:
			c.prompt = message.Content
		case openrouter.RoleUser:
			c.card = message.Content
		}
	}
	return c.response, c.err
}

func guardedCard() *models.BotPersona {
	description := "Clever, cool under pressure, hard to read."
	return &models.BotPersona{
		ID:           7,
		Slug:         "scarlett-voss",
		Name:         "Scarlett Voss",
		Description:  &description,
		Personality:  "Flirtatious only when it has been earned. Trusts nobody quickly.",
		SystemPrompt: "You are Scarlett Voss.",
	}
}

func TestDeriveBaselineReadsTheCardAndBoundsTheResult(t *testing.T) {
	client := &stubBaselineClient{response: `{"mood": -0.2, "trust": -0.55, "warmth": -0.1, "firmness": 0.7}`}

	baseline, err := NewOmniChatDispositionBaselineDeriver(client).Derive(context.Background(), guardedCard())

	require.NoError(t, err)
	require.True(t, baseline.Derived)
	require.InDelta(t, -0.2, baseline.Mood, 1e-9)
	require.InDelta(t, -0.55, baseline.Trust, 1e-9)
	require.InDelta(t, -0.1, baseline.Warmth, 1e-9)
	require.InDelta(t, 0.7, baseline.Firmness, 1e-9)
	require.Equal(t, 1, client.calls)
	require.Contains(t, client.card, "Scarlett Voss")
	require.Contains(t, client.card, "Trusts nobody quickly")
}

// The rubric is the feature. A prompt that stopped asking for restraint would
// produce a cast where everyone is extraordinary, which says nothing about
// anyone.
func TestBaselineDerivationPromptAsksForRestraintAndDefinesEachAxis(t *testing.T) {
	prompt := omniChatBaselineDerivationSystemPrompt
	require.Contains(t, prompt, "resting spirits")
	require.Contains(t, prompt, "take a person at their word")
	require.Contains(t, prompt, "fondness and openness")
	require.Contains(t, strings.ToLower(prompt), "restrained")
	require.Contains(t, prompt, "-0.4 and 0.4")
}

func TestDeriveBaselineRefusesWhatItCannotTrust(t *testing.T) {
	for name, response := range map[string]string{
		"out of range high":  `{"mood": 0.1, "trust": 3.2, "warmth": 0.0}`,
		"out of range low":   `{"mood": -4, "trust": 0.0, "warmth": 0.0}`,
		"not json":           "she seems guarded to me",
		"unknown field":      `{"mood": 0.1, "trust": 0.1, "warmth": 0.1, "confidence": 0.8}`,
		"trailing document":  `{"mood": 0.1, "trust": 0.1, "warmth": 0.1} {"mood": 0.9}`,
		"prose after object": `{"mood": 0.1, "trust": 0.1, "warmth": 0.1} hope that helps`,
	} {
		t.Run(name, func(t *testing.T) {
			client := &stubBaselineClient{response: response}
			baseline, err := NewOmniChatDispositionBaselineDeriver(client).Derive(context.Background(), guardedCard())
			require.Error(t, err)
			require.Equal(t, models.OmniChatDispositionBaseline{}, baseline,
				"a refused derivation must carry nothing back to be stored")
			require.False(t, baseline.Derived)
		})
	}
}

func TestDeriveBaselineSurfacesTheModelFailure(t *testing.T) {
	client := &stubBaselineClient{err: errors.New("rate limited")}
	_, err := NewOmniChatDispositionBaselineDeriver(client).Derive(context.Background(), guardedCard())
	require.ErrorContains(t, err, "rate limited")
}

func TestDeriveBaselineNeedsAClientAndACard(t *testing.T) {
	_, err := NewOmniChatDispositionBaselineDeriver(nil).Derive(context.Background(), guardedCard())
	require.Error(t, err)
	_, err = NewOmniChatDispositionBaselineDeriver(&stubBaselineClient{}).Derive(context.Background(), nil)
	require.Error(t, err)
}

// A card that is enormous everywhere still has to fit in one call.
func TestDeriveBaselineBoundsAHugeCard(t *testing.T) {
	huge := strings.Repeat("a", 50000)
	description := huge
	persona := &models.BotPersona{
		Name: "Sprawl", Description: &description, Personality: huge,
		Scenario: huge, SystemPrompt: huge, FirstMessage: huge,
		ExampleDialogue: huge, CreatorNotes: huge,
	}
	// Any readable answer will do; this test is about what goes up, not what
	// comes back. All-zero would trip the echo guard for reasons unrelated to
	// the size of the card.
	client := &stubBaselineClient{response: `{"mood": 0, "trust": 0, "warmth": 0, "firmness": 0.4}`}
	_, err := NewOmniChatDispositionBaselineDeriver(client).Derive(context.Background(), persona)
	require.NoError(t, err)
	require.Less(t, len([]rune(client.card)), omniChatBaselineCardMaxRunes+2000,
		"the card sent to the model is bounded, headroom for the JSON envelope aside")
}

// The baseline belongs to the character, so it colours what she is like in
// herself and what she is like with one person alike.
func TestBaselineAppliesToBothTiers(t *testing.T) {
	now := time.Now()
	baseline := models.OmniChatDispositionBaseline{Trust: -0.5, Warmth: -0.3, Derived: true}
	loader := &stubTraitLoader{
		baseline: baseline,
		byOwner: map[int]models.OmniChatCharacterTraits{
			models.OmniChatMemoryTierSelf: {MoodUpdatedAt: now},
			42:                            {MoodUpdatedAt: now, Trust: -0.2},
		},
	}
	service := (&ChatbotService{}).SetCharacterTraits(loader)

	withPerson := service.loadDisposition(context.Background(), testPersona(), 42)
	require.InDelta(t, -0.7, withPerson.Composed.Trust, 1e-9, "the authored guard plus what this person did")
	require.InDelta(t, -0.3, withPerson.Composed.Warmth, 1e-9)

	self := models.ComposeOmniChatSelfDisposition(baseline, models.OmniChatCharacterTraits{MoodUpdatedAt: now}, now)
	require.InDelta(t, -0.5, self.Trust, 1e-9, "and it is who she is with nobody in the room")
	require.InDelta(t, -0.3, self.Warmth, 1e-9)
}

// A character nobody has derived must behave exactly as she did before
// baselines existed -- byte for byte, all the way to the prompt.
func TestNoBaselineLeavesThePromptByteIdentical(t *testing.T) {
	now := time.Now()
	persona := testPersona()
	loader := &stubTraitLoader{byOwner: map[int]models.OmniChatCharacterTraits{
		models.OmniChatMemoryTierSelf: {MoodUpdatedAt: now},
		42:                            {MoodUpdatedAt: now, Trust: -0.1, Warmth: 0.15},
	}}
	service := (&ChatbotService{}).SetCharacterTraits(loader)

	disposition := service.loadDisposition(context.Background(), persona, 42)
	require.Empty(t, renderCharacterDisposition(disposition.Composed))

	before := buildConversationSystemPromptWithMemory(persona, nil, nil, nil, nil)
	after := buildConversationSystemPromptWithDisposition(persona, nil, nil, nil, promptRecall{}, disposition.Composed, time.Time{})
	require.Equal(t, before, after)
}

// A mild baseline is still inside the deadband, so it renders nothing: the
// wording only appears once a character is actually somewhere.
func TestMildBaselineAloneSaysNothing(t *testing.T) {
	now := time.Now()
	loader := &stubTraitLoader{
		baseline: models.OmniChatDispositionBaseline{Mood: -0.15, Trust: 0.1, Warmth: -0.19, Derived: true},
		byOwner: map[int]models.OmniChatCharacterTraits{
			models.OmniChatMemoryTierSelf: {MoodUpdatedAt: now},
			42:                            {MoodUpdatedAt: now},
		},
	}
	service := (&ChatbotService{}).SetCharacterTraits(loader)
	require.Empty(t, renderCharacterDisposition(service.loadDisposition(context.Background(), testPersona(), 42).Composed))
}

// The point of a resting state: a bad week fades, and what it fades back to is
// her, not neutral.
func TestSelfDispositionSettlesOnTheBaselineNotOnZero(t *testing.T) {
	baseline := models.OmniChatDispositionBaseline{Mood: -0.5, Trust: -0.4, Derived: true}
	store := &fakeMemoryStore{
		selfBaseline: baseline,
		selfTraits: models.OmniChatCharacterTraits{
			Mood:          -0.8,
			MoodUpdatedAt: time.Now().Add(-3 * models.OmniChatTraitMoodHalfLife),
		},
	}
	service := NewOmniChatMemoryService(store, nil, nil, nil, nil)

	disposition, err := service.SelfDisposition(context.Background(), 7)
	require.NoError(t, err)
	require.InDelta(t, -0.6, disposition.Mood, 0.01,
		"three half-lives of a -0.8 episode, settling toward a -0.5 resting state")
	require.InDelta(t, -0.4, disposition.Trust, 1e-9)
}

// The prompt used to end with a worked example of all zeros, and models returned
// it verbatim -- spacing included -- for cards that plainly had something to
// say. Three of the five characters in the nursery database still carry that
// echo, and nothing caught it, because a stored zero is indistinguishable from a
// character somebody read and found unremarkable.
func TestDeriveRefusesAnAllZeroReadingAsAnEcho(t *testing.T) {
	deriver := NewOmniChatDispositionBaselineDeriver(
		&stubBaselineClient{response: `{"mood": 0.0, "trust": 0.0, "warmth": 0.0, "firmness": 0.0}`},
	)

	_, err := deriver.Derive(context.Background(), guardedCard())

	require.ErrorIs(t, err, ErrOmniChatBaselineUnreadable)
}

// Zero on some axes is a real reading: a card can genuinely say nothing about
// mood while being emphatic about how immovable she is.
func TestDeriveAcceptsZeroOnSomeAxes(t *testing.T) {
	deriver := NewOmniChatDispositionBaselineDeriver(
		&stubBaselineClient{response: `{"mood": 0.0, "trust": 0.2, "warmth": 0.0, "firmness": 0.6}`},
	)

	baseline, err := deriver.Derive(context.Background(), guardedCard())

	require.NoError(t, err)
	require.True(t, baseline.Derived)
	require.InDelta(t, 0.6, baseline.Firmness, 0.001)
	require.Zero(t, baseline.Mood)
}
