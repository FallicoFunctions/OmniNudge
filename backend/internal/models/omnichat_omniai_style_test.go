package models

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// The read path, not the write path. A profile arrives out of a jsonb column
// that a migration, an admin edit or a future writer could have put anything
// into, and every other text field on this struct is bounded here. A style that
// skipped it would be the one field able to grow a prompt without limit.
func TestAStyleReadBackFromTheBlobIsBounded(t *testing.T) {
	normalized := NormalizeOmniChatMediaIdentityProfile(OmniChatMediaIdentityProfile{
		Style: OmniAIStyleProfile{
			Taste:         strings.Repeat("navy ", 500),
			SignatureItem: strings.Repeat("hat ", 200),
			Note:          strings.Repeat("black ", 200),
		},
	})
	require.NoError(t, normalized.Style.Validate())
	require.NotEmpty(t, normalized.Style.Taste)
}

// And a style that is already inside its bounds is returned unchanged, or the
// bounding would be quietly rewriting everybody's clothes.
func TestABoundedStyleSurvivesNormalisation(t *testing.T) {
	style := OmniAIStyleProfile{
		Taste: "heavy knits in moss and rust", SignatureItem: "black over-ear headphones",
		Note: "nothing tight",
	}
	require.Equal(t, style,
		NormalizeOmniChatMediaIdentityProfile(OmniChatMediaIdentityProfile{Style: style}).Style)
}
