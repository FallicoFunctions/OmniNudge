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
	for _, key := range OmniAIReferenceVariantKeys() {
		prompt := BuildOmniAIReferencePrompt(profile, key)
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
	require.Contains(t, BuildOmniAIReferencePrompt(profile, "portrait_neutral"), "neutral expression")
	require.Contains(t, BuildOmniAIReferencePrompt(profile, "portrait_smiling"), "a small natural smile")
}

func TestEveryReferenceSaysWhoSheIsRatherThanRelyingOnThePicture(t *testing.T) {
	// The adapter carries identity weakly and the words carry it exactly, which
	// is the whole reason the description is written at creation. A reference
	// generated from her own picture still has to say who she is.
	profile := referenceProfile()
	for _, key := range OmniAIReferenceVariantKeys() {
		prompt := BuildOmniAIReferencePrompt(profile, key)
		require.Contains(t, prompt, "27-year-old East Asian woman", key)
	}
}

func TestAReferenceStatesTheMediumTheSameWayEverythingElseDoes(t *testing.T) {
	anime := referenceProfile()
	anime.RenderStyle = models.OmniChatRenderStyleAnime
	prompt := BuildOmniAIReferencePrompt(anime, "portrait_neutral")
	require.Contains(t, prompt, "anime artwork")
	require.NotContains(t, prompt, "photorealistically")

	// And the words come from the one place that decides it, so a third medium
	// is a row in that function rather than another string here.
	require.Contains(t, prompt, models.RenderMediumSentence(models.OmniChatRenderStyleAnime))
}

func TestACharacterNobodyDescribedStillGetsReferences(t *testing.T) {
	prompt := BuildOmniAIReferencePrompt(models.OmniChatMediaIdentityProfile{}, "portrait_neutral")
	require.Contains(t, prompt, "An adult.")
}

func TestAnUnknownVariantIsNothingRatherThanAGuess(t *testing.T) {
	// A caller asking for a framing this table does not have should get no
	// render at all, not one that quietly falls back to somebody else's pose.
	require.Empty(t, BuildOmniAIReferencePrompt(referenceProfile(), "underwater"))
	require.Empty(t, BuildOmniAIReferencePrompt(referenceProfile(), ""))
}

func TestAFaceIsNotRenderedInTheFrameBuiltForABody(t *testing.T) {
	// The anchor takes the tallest frame available, which is right for a
	// standing figure head to feet. Reusing it for a head-and-shoulders
	// portrait puts a face in a narrow band with the rest of the picture empty,
	// and reading the assembled payload is what showed it: every reference came
	// back 9:16 because they went through the likeness normaliser.
	for _, key := range OmniAIReferenceVariantKeys() {
		aspect, found := OmniAIReferenceVariantAspect(key)
		require.True(t, found, key)

		prompt := BuildOmniAIReferencePrompt(referenceProfile(), key)
		if strings.Contains(prompt, "Head and shoulders") {
			require.Equal(t, "3:4", aspect, "%s is a face", key)
			continue
		}
		require.Equal(t, "9:16", aspect, "%s is a body", key)
	}
}

func TestAReferenceRequestTakesItsFrameFromItsVariant(t *testing.T) {
	request, err := NormalizeOmniChatReferenceRequest(models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, PersonaID: 1, Prompt: "a face",
		AspectRatio: "16:9",
	}, "portrait_neutral")
	require.NoError(t, err)
	require.Equal(t, "3:4", request.AspectRatio, "the caller does not choose the frame")

	// And it keeps everything the likeness owns: still, no billing, SFW.
	require.Equal(t, models.OmniChatMediaKindImage, request.Kind)
	// Its own mode: this is what tells the completion it becomes one of the six
	// the adapter is conditioned on rather than one of four somebody picks from.
	require.Equal(t, models.OmniChatGenerationModeLikenessReference, request.Mode)
	require.False(t, request.AllowNSFW)
	require.NotNil(t, request.BillingRequired)
	require.False(t, *request.BillingRequired)
}

func TestAnUnknownVariantCannotBeRendered(t *testing.T) {
	_, err := NormalizeOmniChatReferenceRequest(models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, PersonaID: 1, Prompt: "a face",
	}, "underwater")
	require.Error(t, err)
	require.Contains(t, err.Error(), "no such reference variant")
}

func TestADescriptionNeverRunsIntoTheFraming(t *testing.T) {
	// A model writes the appearance and ends it however it likes. Joined on a
	// space alone this read "...freckles across her nose Head and shoulders,
	// facing the camera" -- one clause instead of two instructions.
	profile := models.OmniChatMediaIdentityProfile{
		Appearance: "a woman with freckles across her nose",
	}
	for _, variant := range OmniAIReferenceVariantKeys() {
		prompt := BuildOmniAIReferencePrompt(profile, variant)
		require.Contains(t, prompt, "freckles across her nose. ",
			"the description has to end before the framing starts")
		require.NotContains(t, prompt, "nose Full")
		require.NotContains(t, prompt, "nose Head")
	}

	anchor := BuildOmniAILikenessPrompt(profile)
	require.Contains(t, anchor, "freckles across her nose. Full body from head to feet")
}

func TestADescriptionThatEndsItselfIsNotPunctuatedTwice(t *testing.T) {
	prompt := BuildOmniAIReferencePrompt(models.OmniChatMediaIdentityProfile{
		Appearance: "A woman with freckles.",
	}, "portrait_neutral")
	require.Contains(t, prompt, "freckles. Head and shoulders")
	require.NotContains(t, prompt, "..")
}

func TestAReferencePromptDoesNotClaimAReferenceItMayNotHave(t *testing.T) {
	// The worker states this itself, and only when one was actually supplied.
	// Saying it here too asserted a picture that a failed avatar lookup would
	// have left out of the render.
	for _, variant := range OmniAIReferenceVariantKeys() {
		require.NotContains(t,
			BuildOmniAIReferencePrompt(models.OmniChatMediaIdentityProfile{Appearance: "a woman"}, variant),
			"supplied reference")
	}
}

func TestNobodyElseIsInHerReferencePhotos(t *testing.T) {
	// The worker gates every "one person only" negative on contextual mode, and
	// these go as create. Without this they carried the defaults, which suppress
	// a doubled head but not a second person standing next to her -- in the one
	// picture that becomes her face, her 3D input, and the conditioning for
	// every render after it.
	profile := referenceProfile()

	anchor, err := NormalizeOmniChatLikenessRequest(models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, PersonaID: 4,
		Prompt: BuildOmniAILikenessPrompt(profile),
	})
	require.NoError(t, err)
	require.Contains(t, anchor.NegativePrompt, "second subject")
	require.Contains(t, anchor.NegativePrompt, "bystander")

	for _, variant := range OmniAIReferenceVariantKeys() {
		request, err := NormalizeOmniChatReferenceRequest(models.OmniChatGenerationRequest{
			Kind: models.OmniChatMediaKindImage, PersonaID: 4,
			Prompt: BuildOmniAIReferencePrompt(profile, variant),
		}, variant)
		require.NoError(t, err)
		require.Equal(t, anchor.NegativePrompt, request.NegativePrompt, variant)
	}
}

func TestACallerCannotSmuggleANegativePromptIntoHerLikeness(t *testing.T) {
	// The same reason the mode, the frame and the billing are decided here: a
	// server-owned render takes nothing from the caller but the character.
	request, err := NormalizeOmniChatLikenessRequest(models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, PersonaID: 4,
		Prompt:         BuildOmniAILikenessPrompt(referenceProfile()),
		NegativePrompt: "clothes, clothing, dressed",
	})
	require.NoError(t, err)
	require.NotContains(t, request.NegativePrompt, "clothes")
}
