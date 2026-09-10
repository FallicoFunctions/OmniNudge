package openrouter

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

// The usage object, exactly as OpenRouter documents it.
//
// This fixture is the point of the test. Every field here is read by a name
// this repository chose to match, and a name that stops matching does not fail
// -- it decodes to zero, and a cost line reading zero looks like a cheap call
// rather than a broken decoder. Cost logging that silently reports nothing is
// worse than no cost logging, because it is believed.
const documentedUsage = `{
  "prompt_tokens": 194,
  "prompt_tokens_details": {
    "cached_tokens": 12,
    "cache_write_tokens": 100,
    "audio_tokens": 160
  },
  "completion_tokens": 2,
  "completion_tokens_details": {
    "reasoning_tokens": 7
  },
  "cost": 0.95,
  "cost_details": {
    "upstream_inference_cost": 19
  },
  "total_tokens": 196
}`

func TestUsageReportReadsEveryFieldItLogs(t *testing.T) {
	var usage usageReport
	require.NoError(t, json.Unmarshal([]byte(documentedUsage), &usage))

	require.Equal(t, int64(194), usage.PromptTokens)
	require.Equal(t, int64(2), usage.CompletionTokens)
	require.Equal(t, int64(12), usage.PromptDetails.CachedTokens)
	require.Equal(t, int64(160), usage.PromptDetails.AudioTokens)
	require.Equal(t, int64(7), usage.CompletionDetails.ReasoningTokens)
	require.NotNil(t, usage.Cost)
	require.InDelta(t, 0.95, *usage.Cost, 0.0001)
}

// A response with no usage at all must not be read as a free call.
//
// Cost is a pointer for this reason: zero and absent are different answers,
// and only one of them means the generation was free.
func TestAbsentCostIsNotZeroCost(t *testing.T) {
	var usage usageReport
	require.NoError(t, json.Unmarshal([]byte(`{"prompt_tokens":10,"completion_tokens":1}`), &usage))

	require.Equal(t, int64(10), usage.PromptTokens)
	require.Nil(t, usage.Cost, "no cost reported is not the same as a call that cost nothing")
}

// The streaming path reads usage off a chunk, and it must read the same shape
// the documented object has -- this is the seam where the two could drift.
func TestAStreamChunkCarriesTheSameUsageShape(t *testing.T) {
	var chunk streamChunk
	require.NoError(t, json.Unmarshal([]byte(`{"usage":`+documentedUsage+`}`), &chunk))

	require.NotNil(t, chunk.Usage)
	require.Equal(t, int64(194), chunk.Usage.PromptTokens)
	require.Equal(t, int64(12), chunk.Usage.PromptDetails.CachedTokens)
	require.NotNil(t, chunk.Usage.Cost)
}
