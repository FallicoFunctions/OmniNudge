package queue

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/google/uuid"

	"github.com/omninudge/backend/internal/models"
)

// Pass 2, B1: the review-time fixes are the least reviewed code here. Print the
// artifact they changed, once more, for the shapes that exercise them.
func TestZZB1B(t *testing.T) {
	cfg := hostedVideoConfig()
	for _, tc := range []struct {
		name string
		job  *models.OmniChatGenerationJob
	}{
		{"fallback path, male subject", &models.OmniChatGenerationJob{
			ID: uuid.MustParse("ffffffff-eeee-dddd-cccc-bbbbbbbbbbbb"),
			Kind: models.OmniChatMediaKindVideo, Mode: models.OmniChatGenerationModeContextual,
			Prompt: "boilerplate", DurationSeconds: 6}},
		{"motion with a comma and one speech clause", &models.OmniChatGenerationJob{
			ID: uuid.MustParse("11111111-2222-3333-4444-555555555555"),
			Kind: models.OmniChatMediaKindVideo, Mode: models.OmniChatGenerationModeImageToVideo,
			Prompt: "she holds a mug in both hands, talking to him, and leans on the counter",
			DurationSeconds: 6}},
	} {
		spec, err := BuildOpenRouterVideoSpec(cfg, tc.job, "https://signed.example.test/s.png")
		if err != nil {
			fmt.Printf("\n=== %s ===\nREFUSED: %v\n", tc.name, err)
			continue
		}
		body, _ := json.MarshalIndent(VideoRequestFromInput(spec.EndpointID, spec.Input), "", "  ")
		fmt.Printf("\n=== %s ===\n%s\n", tc.name, body)
	}
}
