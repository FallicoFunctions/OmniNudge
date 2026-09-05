package queue

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// The token is an account credential, not a signed URL. A provider names the
// host its result lives on, so anything but an exact match must get nothing --
// a result URL pointing somewhere else would otherwise hand the key away.
func TestMediaBearerOnlyAuthorisesItsOwnHost(t *testing.T) {
	bearer := &mediaBearer{Host: "openrouter.ai", Token: "sk-secret"}

	header, ok := bearer.headerFor("https://openrouter.ai/api/v1/videos/abc/content?index=0")
	require.True(t, ok)
	require.Equal(t, "Bearer sk-secret", header)

	for _, other := range []string{
		"https://evil.test/steal",
		"https://openrouter.ai.evil.test/steal",
		"https://sub.openrouter.ai/content",
		"https://notopenrouter.ai/content",
		"https://storage.googleapis.com/output.mp4",
	} {
		_, ok := bearer.headerFor(other)
		require.Falsef(t, ok, "the credential must not be sent to %s", other)
	}
}

// A trailing dot is the same host to DNS and a different string to a naive
// comparison, and case is not significant in a hostname.
func TestMediaBearerNormalisesTheHost(t *testing.T) {
	bearer := &mediaBearer{Host: "OpenRouter.AI", Token: "sk-secret"}

	for _, url := range []string{
		"https://openrouter.ai/x",
		"https://OPENROUTER.AI/x",
		"https://openrouter.ai./x",
	} {
		_, ok := bearer.headerFor(url)
		require.Truef(t, ok, "%s is the same host", url)
	}
}

// Nil and half-configured must both mean "send nothing" rather than panic or
// send an empty Bearer, which reads to a server as a malformed credential.
func TestMediaBearerIsSafeWhenAbsent(t *testing.T) {
	var missing *mediaBearer
	_, ok := missing.headerFor("https://openrouter.ai/x")
	require.False(t, ok)

	for _, bearer := range []*mediaBearer{
		{Host: "", Token: "sk"},
		{Host: "openrouter.ai", Token: ""},
		{Host: "  ", Token: "  "},
	} {
		_, ok := bearer.headerFor("https://openrouter.ai/x")
		require.False(t, ok)
	}
}

func TestMediaBearerRejectsAnUnparseableURL(t *testing.T) {
	bearer := &mediaBearer{Host: "openrouter.ai", Token: "sk"}

	_, ok := bearer.headerFor("://not a url")

	require.False(t, ok)
}

// SetMediaBearer must refuse a half-configuration rather than store one. A
// bearer with an empty token would attach nothing while looking configured.
func TestSetMediaBearerIgnoresIncompleteInput(t *testing.T) {
	handler := &OmniChatGenerationHandler{}

	handler.SetMediaBearer("", "sk")
	require.Nil(t, handler.mediaBearer)

	handler.SetMediaBearer("openrouter.ai", "")
	require.Nil(t, handler.mediaBearer)

	handler.SetMediaBearer("openrouter.ai", "sk")
	require.NotNil(t, handler.mediaBearer)
	require.Equal(t, "openrouter.ai", handler.mediaBearer.Host)
}
