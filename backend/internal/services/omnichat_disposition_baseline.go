package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
)

const (
	// One card, one small JSON object. The timeout is generous because this
	// runs offline in a command and never in front of a person waiting for a
	// reply; the token ceiling is tight because three numbers is all that may
	// come back.
	omniChatBaselineDerivationTimeout   = 30 * time.Second
	omniChatBaselineDerivationMaxTokens = 200

	// Cards run from a paragraph to a novella. The whole point is the authored
	// voice, so the generous fields are kept generously and the ones that
	// repeat themselves are trimmed hardest.
	omniChatBaselineCardFieldRunes = 4000
	omniChatBaselineCardMaxRunes   = 12000
)

// The prompt is written to fight the failure this feature would otherwise
// have: a model asked to rate a character on three axes will happily hand back
// a cast where everyone is extraordinary. A baseline is a resting state, and
// most people's resting state is unremarkable -- so the rubric spends most of
// its words on what the middle of the scale means and why it is the right
// answer most of the time.
const omniChatBaselineDerivationSystemPrompt = `You are reading a fictional character's definition and reporting the disposition it implies. This is the character's resting state -- who she is on an ordinary day, before anything in particular has happened to her.

Report three numbers, each between -1 and 1.

mood: her resting spirits. Negative is someone who wakes up flat, heavy or bleak; positive is someone who wakes up bright. This is her baseline weather, not a reaction to anything.

trust: her readiness to take a person at their word. Negative is guarded, suspicious, slow to believe what she is told; positive is open, credulous, inclined to assume good faith.

warmth: her fondness and openness toward people. Negative is cold, aloof, keeps distance; positive is affectionate, quick to like people, glad of company.

firmness: how hard she is to move once she has said no. Negative is someone who folds under pressure, talks herself out of her own position, agrees to keep the peace and resents it after; positive is someone a no from whom is the end of it, however long anybody leans. This is not confidence, aggression, or strength of opinion. A shy character can be immovable and a loud one can cave at the first push. Ask what happens when somebody she likes keeps asking after she has already declined.

Read what the card actually says about her, not what her genre usually implies. A character described as flirtatious is not automatically warm -- flirtation can be a tool used at a distance. A character with a painful history is not automatically low; some people carry it lightly. Wit is not warmth. Confidence is not trust. Agreeableness is not softness: a character written as accommodating may still be immovable about the few things she actually minds.

Be restrained. These numbers are added to whatever later happens to her, so an extreme baseline leaves no room for her life to move her, and a cast where everyone sits at the ends of the scale says nothing about anyone: if all of them are guarded and bleak, none of them is. Most characters belong between -0.4 and 0.4 on any axis. Go past 0.6 only when the card is emphatic and consistent about that trait -- when it is the first thing anyone would say about her. Use 0 freely; a card that says nothing about an axis must get 0 on it, not a guess.

Return only this JSON object, with no other text:

{"mood": 0.0, "trust": 0.0, "warmth": 0.0, "firmness": 0.0}`

type omniChatBaselineDerivationCard struct {
	Name            string   `json:"name"`
	Description     string   `json:"description,omitempty"`
	Personality     string   `json:"personality,omitempty"`
	Scenario        string   `json:"scenario,omitempty"`
	FirstMessage    string   `json:"first_message,omitempty"`
	ExampleDialogue string   `json:"example_dialogue,omitempty"`
	CreatorNotes    string   `json:"creator_notes,omitempty"`
	SystemPrompt    string   `json:"system_prompt,omitempty"`
	Tags            []string `json:"tags,omitempty"`
}

type omniChatBaselineDerivationOutput struct {
	Mood     float64 `json:"mood"`
	Trust    float64 `json:"trust"`
	Warmth   float64 `json:"warmth"`
	Firmness float64 `json:"firmness"`
}

// OmniChatDispositionBaselineDeriver reads a character's card and reports the
// resting disposition it implies.
//
// It is deliberately not reachable from a request path. One character is read
// once, ever, by a command; a baseline that moved with traffic would be a
// second drift mechanism wearing the word "authored".
type OmniChatDispositionBaselineDeriver struct {
	client chatCompletionClient
}

func NewOmniChatDispositionBaselineDeriver(client chatCompletionClient) *OmniChatDispositionBaselineDeriver {
	return &OmniChatDispositionBaselineDeriver{client: client}
}

// Derive reads one card. It returns an error rather than a guess for anything
// it cannot fully validate: a refused derivation leaves the character NULL,
// which is the neutral behaviour that already works, and a stored bad number
// would quietly mis-colour every conversation she ever has.
func (d *OmniChatDispositionBaselineDeriver) Derive(ctx context.Context, persona *models.BotPersona) (models.OmniChatDispositionBaseline, error) {
	if d == nil || d.client == nil {
		return models.OmniChatDispositionBaseline{}, errors.New("omnichat baseline: derivation client is unavailable")
	}
	if persona == nil {
		return models.OmniChatDispositionBaseline{}, errors.New("omnichat baseline: a persona is required")
	}
	card := buildBaselineDerivationCard(persona)
	payload, err := json.Marshal(card)
	if err != nil {
		return models.OmniChatDispositionBaseline{}, fmt.Errorf("omnichat baseline: encode card: %w", err)
	}
	request := []openrouter.Message{
		{Role: openrouter.RoleSystem, Content: omniChatBaselineDerivationSystemPrompt},
		{Role: openrouter.RoleUser, Content: string(payload)},
	}

	callCtx, cancel := context.WithTimeout(ctx, omniChatBaselineDerivationTimeout)
	defer cancel()

	var response string
	if optioned, ok := d.client.(generationOptionsClient); ok {
		response, err = optioned.GenerateWithOptions(callCtx, request, func(string) {}, openrouter.GenerationOptions{
			MaxTokens:      omniChatBaselineDerivationMaxTokens,
			ResponseFormat: "json_object",
		})
	} else {
		response, err = d.client.Generate(callCtx, request, func(string) {})
	}
	if err != nil {
		return models.OmniChatDispositionBaseline{}, fmt.Errorf("omnichat baseline: derive %q: %w", persona.Name, err)
	}

	var output omniChatBaselineDerivationOutput
	decoder := json.NewDecoder(strings.NewReader(strings.TrimSpace(response)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&output); err != nil {
		return models.OmniChatDispositionBaseline{}, fmt.Errorf("omnichat baseline: decode derivation for %q: %w", persona.Name, err)
	}
	if err := ensureJSONDocumentEnded(decoder); err != nil {
		return models.OmniChatDispositionBaseline{}, fmt.Errorf("omnichat baseline: derivation for %q: %w", persona.Name, err)
	}

	// Out of range is refused, never clamped. A model that answered 3.2 did not
	// read the scale it was given, and the rest of that answer has not earned
	// the benefit of the doubt either.
	for name, value := range map[string]float64{
		"mood": output.Mood, "trust": output.Trust,
		"warmth": output.Warmth, "firmness": output.Firmness,
	} {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < -1 || value > 1 {
			return models.OmniChatDispositionBaseline{}, fmt.Errorf("omnichat baseline: derivation for %q returned %s=%v, outside -1..1", persona.Name, name, value)
		}
	}
	return models.OmniChatDispositionBaseline{
		Mood:     output.Mood,
		Trust:    output.Trust,
		Warmth:   output.Warmth,
		Firmness: output.Firmness,
		Derived:  true,
	}, nil
}

// buildBaselineDerivationCard assembles what the model reads, bounded twice:
// per field, so no single runaway field crowds the others out, and in total, so
// a card that is long everywhere still fits in one call.
func buildBaselineDerivationCard(persona *models.BotPersona) omniChatBaselineDerivationCard {
	card := omniChatBaselineDerivationCard{
		Name: strings.TrimSpace(persona.Name),
		Tags: persona.Tags,
	}
	remaining := omniChatBaselineCardMaxRunes
	take := func(value string) string {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" || remaining <= 0 {
			return ""
		}
		limit := omniChatBaselineCardFieldRunes
		if remaining < limit {
			limit = remaining
		}
		trimmed = truncateMemoryText(trimmed, limit)
		remaining -= len([]rune(trimmed))
		return trimmed
	}
	// Ordered by how much each field says about who she is, because the budget
	// runs out from the bottom.
	if persona.Description != nil {
		card.Description = take(*persona.Description)
	}
	card.Personality = take(persona.Personality)
	card.Scenario = take(persona.Scenario)
	card.SystemPrompt = take(persona.SystemPrompt)
	card.FirstMessage = take(persona.FirstMessage)
	card.ExampleDialogue = take(persona.ExampleDialogue)
	card.CreatorNotes = take(persona.CreatorNotes)
	return card
}
