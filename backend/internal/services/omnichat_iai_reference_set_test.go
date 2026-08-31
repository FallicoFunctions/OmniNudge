package services

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

func referenceProfile() models.OmniChatMediaIdentityProfile {
	return models.OmniChatMediaIdentityProfile{
		Appearance: `A 27-year-old East Asian woman, 5'6" tall, with long curly black hair in a high ponytail, brown eyes and an athletic build.`,
	}
}

func TestTheSetCarriesBothThingsSixReferencesAreFor(t *testing.T) {
	// The identity profile says why its limit is six: "separate close portraits
	// (which carry expression variety and facial detail) and full-length shots
	// (which carry proportions). Four total cannot hold both sets." Five are
	// made and the picked picture joins them, so the split has to hold here.
	profile := referenceProfile()

	var portraits, fullLength int
	for _, key := range IAIReferenceVariantKeys() {
		prompt := BuildIAIReferencePrompt(profile, key)
		require.NotEmpty(t, prompt, key)
		switch {
		case strings.Contains(prompt, "Head and shoulders"):
			portraits++
		case strings.Contains(prompt, "Full body from head to feet"):
			fullLength++
		default:
			t.Fatalf("%s is neither a portrait nor a full-length shot: %s", key, prompt)
		}
	}
	require.Equal(t, 5, portraits+fullLength)
	require.Equal(t, 3, portraits, "facial detail")
	require.Equal(t, 2, fullLength, "proportions, joined by the picked full body")
}

func TestExpressionVarietyIsHalfOfWhatThePortraitsAreFor(t *testing.T) {
	// A set that only ever shows one face teaches the adapter that face and
	// nothing about how she looks when she is not holding it.
	profile := referenceProfile()
	require.Contains(t, BuildIAIReferencePrompt(profile, "portrait_neutral"), "neutral expression")
	require.Contains(t, BuildIAIReferencePrompt(profile, "portrait_smiling"), "a small natural smile")
}

func TestEveryReferenceSaysWhoSheIsRatherThanRelyingOnThePicture(t *testing.T) {
	// The adapter carries identity weakly and the words carry it exactly, which
	// is the whole reason the description is written at creation. A reference
	// generated from her own picture still has to say who she is.
	profile := referenceProfile()
	for _, key := range IAIReferenceVariantKeys() {
		prompt := BuildIAIReferencePrompt(profile, key)
		require.Contains(t, prompt, "27-year-old East Asian woman", key)
		require.Contains(t, prompt, "the same person as the supplied reference", key)
	}
}

func TestAReferenceStatesTheMediumTheSameWayEverythingElseDoes(t *testing.T) {
	anime := referenceProfile()
	anime.RenderStyle = models.OmniChatRenderStyleAnime
	prompt := BuildIAIReferencePrompt(anime, "portrait_neutral")
	require.Contains(t, prompt, "anime artwork")
	require.NotContains(t, prompt, "photorealistically")

	// And the words come from the one place that decides it, so a third medium
	// is a row in that function rather than another string here.
	require.Contains(t, prompt, models.RenderMediumSentence(models.OmniChatRenderStyleAnime))
}

func TestACharacterNobodyDescribedStillGetsReferences(t *testing.T) {
	prompt := BuildIAIReferencePrompt(models.OmniChatMediaIdentityProfile{}, "portrait_neutral")
	require.Contains(t, prompt, "An adult.")
}

func TestAnUnknownVariantIsNothingRatherThanAGuess(t *testing.T) {
	// A caller asking for a framing this table does not have should get no
	// render at all, not one that quietly falls back to somebody else's pose.
	require.Empty(t, BuildIAIReferencePrompt(referenceProfile(), "underwater"))
	require.Empty(t, BuildIAIReferencePrompt(referenceProfile(), ""))
}
