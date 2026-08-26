package openrouter

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

// An unmarked message keeps the plain string form every provider accepts.
// Sending everything as an array would be equivalent for well-behaved providers
// and is not worth the risk with the rest.
func TestUnmarkedMessagesKeepThePlainForm(t *testing.T) {
	encoded, err := json.Marshal(Message{Role: RoleUser, Content: "hello"})
	require.NoError(t, err)
	require.JSONEq(t, `{"role":"user","content":"hello"}`, string(encoded))
}

func TestACacheBreakpointCarriesTheControl(t *testing.T) {
	encoded, err := json.Marshal(Message{
		Role: RoleSystem, Content: "you are someone", CacheBreakpoint: true,
	})
	require.NoError(t, err)
	require.JSONEq(t, `{
		"role": "system",
		"content": [{
			"type": "text",
			"text": "you are someone",
			"cache_control": {"type": "ephemeral"}
		}]
	}`, string(encoded))
}

// The flag is a wire detail and must never leak into the body as a field of its
// own, which a provider would reject as unknown.
func TestTheBreakpointFlagIsNeverSentAsAField(t *testing.T) {
	for _, message := range []Message{
		{Role: RoleUser, Content: "x"},
		{Role: RoleSystem, Content: "x", CacheBreakpoint: true},
	} {
		encoded, err := json.Marshal(message)
		require.NoError(t, err)
		require.NotContains(t, string(encoded), "CacheBreakpoint")
		require.NotContains(t, string(encoded), "cache_breakpoint")
	}
}
