package services

import (
	"strings"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

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
