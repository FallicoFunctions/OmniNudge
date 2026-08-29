package models

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestTheMediumIsDecidedInExactlyOnePlace(t *testing.T) {
	// It was written twice, in two packages, one sentence apart -- and the test
	// asserting it was "one decision in one place" was written the commit
	// before the second copy appeared. Both callers read this now.
	require.Contains(t, RenderMediumSentence(OmniChatRenderStyleAnime), "anime artwork")
	require.NotContains(t, RenderMediumSentence(OmniChatRenderStyleAnime), "photorealistically")

	require.Contains(t, RenderMediumSentence(""), "photorealistically")
	require.NotContains(t, RenderMediumSentence(""), "anime")

	// Anything the profile normaliser would have cleared reads as the default.
	require.Equal(t, RenderMediumSentence(""), RenderMediumSentence("claymation"))
}
