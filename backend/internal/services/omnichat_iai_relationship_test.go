package services

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

func TestAFriendIsNeverGivenARomance(t *testing.T) {
	// The whole reason this question exists. The You screen asked how drawn to
	// you she is on the same screen as how she feels about you, so somebody
	// making a platonic friend was handed an attraction question and a scale
	// ending in devoted, with nothing anywhere saying it was not romantic.
	for _, feeling := range IAIFeelingKeys() {
		seed := SeedIAI(nil, feeling, "friend")
		require.Equal(t, 0.0, seed.Relationship.Attraction,
			"feeling %q must not make a friend attracted to anybody", feeling)

		disposition := models.OmniChatDisposition{
			Attachment: seed.Relationship.Attachment,
			Attraction: seed.Relationship.Attraction,
			Kind:       seed.Kind,
		}
		require.Empty(t, attractionPhrase(disposition.Attraction),
			"and nothing in the prompt may tell her she is drawn to them")
		require.Empty(t, relationshipPhrase(disposition.Kind),
			"friendship is the default, so it is not announced")
		require.Empty(t, relationshipPhraseToHer(disposition.Kind))
	}
}

func TestSheIsToldWhoTheyAreToHer(t *testing.T) {
	// Numbers alone gave a character who was very taken with somebody and had
	// no idea she had married them.
	for _, kind := range []string{"situationship", "partner", "spouse"} {
		require.NotEmpty(t, relationshipPhrase(kind), "%s, told about her", kind)
		require.NotEmpty(t, relationshipPhraseToHer(kind), "%s, told to her", kind)
	}

	// The block speaks to her in the second person. "This person is her
	// husband" inside a block that says "you are" is a third party in the room.
	require.Contains(t, relationshipPhraseToHer("spouse"), "your")
	require.Contains(t, relationshipPhrase("spouse"), "her")
}

func TestEveryOfferedRelationshipIsUnderstood(t *testing.T) {
	// The form offers what this table lists, so nothing it offers may fall
	// through to the default and quietly become a friendship.
	for _, key := range IAIRelationshipKeys() {
		require.Equal(t, key, NormaliseIAIRelationshipKind(key))
		require.Equal(t, key, SeedIAI(nil, "neutral", key).Kind)
	}
}
