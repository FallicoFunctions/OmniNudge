package services

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// The case that forced this to exist: repeated live runs reopened a settled
// commitment and recorded it again in the same breath, which cannot coherently
// happen and would leave her holding the same promise twice, permanently.
func TestARestatedCommitmentIsNotRecordedAgain(t *testing.T) {
	held := []string{
		"he owes me a coffee for calling the match wrong",
		"I said I would tell him how the interview went",
	}

	require.True(t, restatesAHeldCommitment("the user owes me a coffee", held))
	require.True(t, restatesAHeldCommitment("he still owes me that coffee", held))
	require.True(t, restatesAHeldCommitment("tell him how the interview went", held))
}

// The guard must not eat genuinely new promises, which is the cost of getting
// it wrong in the other direction.
func TestAGenuinelyNewCommitmentSurvives(t *testing.T) {
	held := []string{"he owes me a coffee for calling the match wrong"}

	require.False(t, restatesAHeldCommitment("he is going to teach me that track on Friday", held))
	require.False(t, restatesAHeldCommitment("I said I would watch the film he recommended", held))
	require.False(t, restatesAHeldCommitment("he owes me nothing at all now", held),
		"a different claim about the same subject is still a different claim")
}

func TestRestatementNeedsSomethingToCompare(t *testing.T) {
	require.False(t, restatesAHeldCommitment("he owes me a rematch", nil))
	require.False(t, restatesAHeldCommitment("", []string{"he owes me a rematch"}))
	// All stop words on either side compares nothing, so it cannot match.
	require.False(t, restatesAHeldCommitment("he said he would", []string{"I will do it"}))
}
