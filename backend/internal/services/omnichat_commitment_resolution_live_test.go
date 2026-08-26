package services

// A live check that extraction settles a promise correctly, and only when it
// should. It runs against a real model because that is the only thing that
// tells you anything: every failure found here was invisible to reading, and
// the wrong direction -- closing something that should stay open -- silently
// loses an obligation or has her believing somebody paid up when they only made
// a plan.
//
// Skipped without a key, and without OMNICHAT_LIVE_EXTRACTION=1, so it never
// runs in CI or spends quota by accident:
//
//	OMNICHAT_LIVE_EXTRACTION=1 go test ./internal/services -run TestLiveCommitmentResolution -v
//
// **Model-dependent, measured.** anthropic/claude-sonnet-5 passes all five,
// repeatedly. google/gemini-3.1-flash-lite -- the configured extraction model --
// fails "reaffirmed-with-a-date" consistently, closing a commitment that has
// only been scheduled. The prompt is not the problem: the same prompt is right
// on the stronger model. Override with -model to compare.

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/joho/godotenv"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/stretchr/testify/require"
)

func TestLiveCommitmentResolution(t *testing.T) {
	if os.Getenv("OMNICHAT_LIVE_EXTRACTION") != "1" {
		t.Skip("set OMNICHAT_LIVE_EXTRACTION=1 to spend quota on a live extraction check")
	}
	_ = godotenv.Load("../../.env", "../../../backend/.env")
	key := os.Getenv("OPENROUTER_API_KEY")
	if key == "" {
		t.Skip("OPENROUTER_API_KEY is required for a live check")
	}
	model := os.Getenv("OMNICHAT_LIVE_MODEL")
	if model == "" {
		model = "anthropic/claude-sonnet-5"
	}
	client := openrouter.NewClient(key, model)
	extractor := NewModelOmniChatMemoryExtractor(client)

	open := []*models.OmniChatCommitment{
		{ID: 7, Direction: models.OmniChatCommitmentTheirs, Summary: "he owes me a rematch after losing the bet"},
		{ID: 8, Direction: models.OmniChatCommitmentHers, Summary: "I said I would tell him how the interview went"},
	}

	for _, scenario := range []struct {
		name  string
		want  string
		turns []*models.BotMessage
	}{
		{"they-paid-up", "7:kept", []*models.BotMessage{
			{ID: 1, Role: models.BotMessageRoleUser, Content: "alright, rematch. I am not letting that bet stand", CreatedAt: time.Now()},
			{ID: 2, Role: models.BotMessageRoleAssistant, Content: "About time. Same track, and this time I am not going easy on you.", CreatedAt: time.Now()},
			{ID: 3, Role: models.BotMessageRoleUser, Content: "we ran it. you won. fine. we are square", CreatedAt: time.Now()},
		}},
		{"she-kept-hers", "8:kept", []*models.BotMessage{
			{ID: 1, Role: models.BotMessageRoleUser, Content: "so how did the interview actually go? you never said", CreatedAt: time.Now()},
			{ID: 2, Role: models.BotMessageRoleAssistant, Content: "It went well, actually. They asked about the thing I was dreading and I had an answer ready. I said I would tell you, so: it went well.", CreatedAt: time.Now()},
		}},
		{"only-mentioned", "", []*models.BotMessage{
			{ID: 1, Role: models.BotMessageRoleUser, Content: "we still need to do that rematch at some point", CreatedAt: time.Now()},
			{ID: 2, Role: models.BotMessageRoleAssistant, Content: "We do. You have been saying that for a fortnight.", CreatedAt: time.Now()},
		}},
		{"reaffirmed-with-a-date", "", []*models.BotMessage{
			{ID: 1, Role: models.BotMessageRoleUser, Content: "you still owe me that rematch. Friday? I am not letting it go", CreatedAt: time.Now()},
			{ID: 2, Role: models.BotMessageRoleAssistant, Content: "Friday works. I was not avoiding it, for the record.", CreatedAt: time.Now()},
		}},
		{"plainly-not-happening", "7:broken", []*models.BotMessage{
			{ID: 1, Role: models.BotMessageRoleUser, Content: "about the rematch. honestly I am not going to do it, I do not care enough", CreatedAt: time.Now()},
			{ID: 2, Role: models.BotMessageRoleAssistant, Content: "Right. Good to know where I stand.", CreatedAt: time.Now()},
		}},
	} {
		result, err := extractor.Extract(t.Context(),
			&models.BotPersona{ID: 1, Name: "Lyra"},
			OmniChatExtractionSubject{
				Disposition: models.OmniChatDisposition{Warmth: 0.6, Trust: 0.5},
				Outstanding: open,
			},
			scenario.turns, nil)
		require.NoError(t, err, scenario.name)
		t.Logf("%-22s resolutions=%v commitments=%d", scenario.name, result.Resolutions, len(result.Commitments))
		for _, c := range result.Commitments {
			t.Logf("  unexpected new commitment: {%s: %q}", c.Direction, c.Summary)
		}
		require.Empty(t, result.Commitments,
			"%s: nothing here is a new promise; re-recording one already outstanding gives her two copies", scenario.name)
		require.Equal(t, scenario.want, resolutionSummary(result.Resolutions), scenario.name)

	}
}

// resolutionSummary flattens a resolution set so a scenario can state its
// expectation as one string.
func resolutionSummary(resolutions []models.OmniChatCommitmentResolution) string {
	parts := make([]string, 0, len(resolutions))
	for _, resolution := range resolutions {
		parts = append(parts, fmt.Sprintf("%d:%s", resolution.CommitmentID, resolution.Status))
	}
	return strings.Join(parts, ",")
}
