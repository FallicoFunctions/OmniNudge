package services

import (
	"context"
	"strings"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/stretchr/testify/require"
)

// stubExtractionClient captures what the extractor was asked, so a test can
// assert on the prompt rather than only on what came back.
type stubExtractionClient struct {
	response string
	prompt   string
}

func (c *stubExtractionClient) Generate(_ context.Context, messages []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
	for _, message := range messages {
		if message.Role == openrouter.RoleUser {
			c.prompt = message.Content
		}
	}
	return c.response, nil
}

func outstanding(direction, summary string) *models.OmniChatCommitment {
	return &models.OmniChatCommitment{Direction: direction, Summary: summary}
}

// The two directions mean opposite things, and a character who confuses them is
// worse than one who mentions neither: being chased for something you are owed
// is a specific and memorable kind of infuriating.
func TestOutstandingCommitmentsAreSplitByWhoOwesWhom(t *testing.T) {
	block := renderOutstandingCommitments([]*models.OmniChatCommitment{
		outstanding(models.OmniChatCommitmentHers, "tell him how the interview went"),
		outstanding(models.OmniChatCommitmentTheirs, "post the thing he lost the bet on"),
	})

	require.Contains(t, block, "[Still Outstanding]")

	hersAt := strings.Index(block, "tell him how the interview went")
	theirsAt := strings.Index(block, "post the thing he lost the bet on")
	require.Positive(t, hersAt)
	require.Positive(t, theirsAt)

	require.Less(t, strings.Index(block, "You said you would"), hersAt)
	require.Less(t, strings.Index(block, "They said they would"), theirsAt)
	require.Less(t, hersAt, strings.Index(block, "They said they would"),
		"what she owes must not appear under what they owe")
}

// It says what is unsettled, not what to do about it. A person carrying an
// unkept promise does not raise it every time they speak, and a character told
// to would do nothing else.
func TestOutstandingCommitmentsDoNotInstructHerToRaiseThem(t *testing.T) {
	block := renderOutstandingCommitments([]*models.OmniChatCommitment{
		outstanding(models.OmniChatCommitmentTheirs, "he owes me a rematch"),
	})

	require.Contains(t, block, "not instructions")
	require.Contains(t, block, "only if it would come up naturally")
	require.NotContains(t, strings.ToLower(block), "remind them")
	require.NotContains(t, strings.ToLower(block), "bring it up")
}

func TestOutstandingCommitmentsAreAbsentAndBounded(t *testing.T) {
	require.Empty(t, renderOutstandingCommitments(nil))
	require.Empty(t, renderOutstandingCommitments([]*models.OmniChatCommitment{}))
	require.Empty(t, renderOutstandingCommitments([]*models.OmniChatCommitment{
		outstanding(models.OmniChatCommitmentHers, "   "),
	}), "a blank promise is not something she is carrying")

	long := make([]*models.OmniChatCommitment, 0, 20)
	for i := 0; i < 20; i++ {
		long = append(long, outstanding(models.OmniChatCommitmentTheirs, strings.Repeat("owed ", 60)))
	}
	require.LessOrEqual(t, len([]rune(renderOutstandingCommitments(long))),
		omniChatCommitmentsMaxRunes+400)
}

// A resolution for a commitment the model was never shown is one it invented,
// and settling an unoffered id would close a promise made to somebody else.
func TestResolutionsAreRefusedForCommitmentsThatWereNotOffered(t *testing.T) {
	extractor := NewModelOmniChatMemoryExtractor(&stubExtractionClient{
		response: `{"episodes":[],"commitments":[],"resolutions":[
			{"id": 7, "status": "kept"},
			{"id": 99, "status": "kept"},
			{"id": 7, "status": "invented"},
			{"id": 8, "status": "broken"}
		]}`,
	})

	result, err := extractor.Extract(
		t.Context(),
		&models.BotPersona{ID: 1, Name: "Eval"},
		OmniChatExtractionSubject{
			Outstanding: []*models.OmniChatCommitment{
				{ID: 7, Direction: models.OmniChatCommitmentTheirs, Summary: "he owes me a rematch"},
				{ID: 8, Direction: models.OmniChatCommitmentHers, Summary: "I said I would tell him"},
			},
		},
		[]*models.BotMessage{{ID: 1, Role: models.BotMessageRoleUser, Content: "done it"}},
		nil,
	)

	require.NoError(t, err)
	require.Len(t, result.Resolutions, 2, "only the offered ids with real endings survive")
	require.Equal(t, int64(7), result.Resolutions[0].CommitmentID)
	require.Equal(t, models.OmniChatCommitmentKept, result.Resolutions[0].Status)
	require.Equal(t, int64(8), result.Resolutions[1].CommitmentID)
	require.Equal(t, models.OmniChatCommitmentBroken, result.Resolutions[1].Status)
}

// What is open has to reach the model, or nothing can ever be closed.
func TestOutstandingCommitmentsAreOfferedToExtraction(t *testing.T) {
	client := &stubExtractionClient{response: `{"episodes":[],"commitments":[],"resolutions":[]}`}
	extractor := NewModelOmniChatMemoryExtractor(client)

	_, err := extractor.Extract(
		t.Context(),
		&models.BotPersona{ID: 1, Name: "Eval"},
		OmniChatExtractionSubject{
			Outstanding: []*models.OmniChatCommitment{
				{ID: 7, Direction: models.OmniChatCommitmentTheirs, Summary: "he owes me a rematch"},
				{ID: 0, Direction: models.OmniChatCommitmentHers, Summary: "unsaved, so unresolvable"},
			},
		},
		[]*models.BotMessage{{ID: 1, Role: models.BotMessageRoleUser, Content: "hello"}},
		nil,
	)

	require.NoError(t, err)
	require.Contains(t, client.prompt, "he owes me a rematch")
	require.Contains(t, client.prompt, "still_outstanding")
	require.NotContains(t, client.prompt, "unsaved, so unresolvable",
		"a commitment with no id cannot be resolved against and must not be offered")
}
