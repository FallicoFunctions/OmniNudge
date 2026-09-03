package services

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

// One rule lives in five places, and nothing here connects them.
//
// The chain is: the style writer says what she owns, the brief writer picks an
// outfit from it, the image prompt describes that outfit to a diffusion model,
// and two vision standards judge what came back. Each of those is prose written
// for a different reader, so they cannot share a constant -- but they are one
// rule, and a link that drops it fails in a way the others make invisible.
//
// Both directions have already happened today. A prompt that stopped asking for
// coverage rendered a bare midriff; and when the judge asked for something the
// prompt never requested, four renders in a row were refused and the pipeline
// looked broken. Neither showed up as a failing test, because every one of
// these strings has its own passing test asserting its own wording.
func TestEveryStageOfTheCoverageChainCarriesTheRule(t *testing.T) {
	for name, stage := range map[string]string{
		"style writer":       omniAIStyleSystemPrompt,
		"brief writer":       omniAICandidateBriefSystemPrompt,
		"image prompt":       omniAILikenessCoverage,
		"portrait standard":  omniChatRenderedPortraitSystemPrompt,
		"reference standard": omniChatRenderedReferenceSystemPrompt,
	} {
		require.Contains(t, strings.ToLower(stage), "waistband",
			"%s stopped naming the waistband, which is the one instruction with no crop-top reading", name)
	}

	// The rule reaches a real prompt, not only the constant it is written in.
	// The constant could keep its wording while nothing put it in a prompt.
	prompt := BuildOmniAILikenessPrompt(
		models.OmniChatMediaIdentityProfile{Appearance: "a woman with dark curly hair"},
		OmniAICandidateBrief{Outfit: "a green jacket", Setting: "a bookshop"},
	)
	require.Contains(t, prompt, "covers the waistband")
}

// The image prompt is the one stage that may not phrase the rule as a negation.
//
// CLIP does not encode negation, so "no midriff is visible" in a positive
// prompt does not subtract a midriff -- it mentions one. Four rounds of adding
// forbidden garments were fighting a clause that was working against them. The
// language-model stages are free to say "do not choose a cropped top", because
// they can read it; the diffusion model cannot, and every prohibition meant for
// it lives in the negative prompt instead.
func TestOnlyTheNegativePromptForbidsAnythingToTheImageModel(t *testing.T) {
	positive := BuildOmniAILikenessPrompt(
		models.OmniChatMediaIdentityProfile{Appearance: "a woman with dark curly hair"},
		OmniAICandidateBrief{Outfit: "a green jacket", Setting: "a bookshop"},
	)
	for _, negation := range []string{
		"no midriff", "not visible", "navel is visible", "no stomach", "without showing",
	} {
		require.NotContains(t, strings.ToLower(positive), negation)
	}

	// And the prohibitions still exist, in the one place a diffusion model
	// reads them. Dropping them from here is the other way this breaks.
	for _, forbidden := range []string{"crop top", "bare midriff", "exposed navel", "sports bra"} {
		require.Contains(t, OmniAIRenderNegativePrompt, forbidden)
	}
}
