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

	anchor := BuildOmniAILikenessPrompt(profile, testCandidateBrief())
	require.Contains(t, anchor, "freckles across her nose. She is wearing")
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
		Prompt: BuildOmniAILikenessPrompt(profile, testCandidateBrief()),
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
		Prompt:         BuildOmniAILikenessPrompt(referenceProfile(), testCandidateBrief()),
		NegativePrompt: "clothes, clothing, dressed",
	})
	require.NoError(t, err)
	require.NotContains(t, request.NegativePrompt, "clothes")
}

func TestSheIsDressedFacingUsAndGladToSeeUs(t *testing.T) {
	// Three things the first real renders got wrong. Two of four came back from
	// behind, none of them mentioned clothing at all, and every one of them was
	// posed like a glamour shoot rather than like somebody you are about to
	// meet.
	profile := models.OmniChatMediaIdentityProfile{Appearance: "a woman with freckles"}

	anchor, err := NormalizeOmniChatLikenessRequest(models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, PersonaID: 4,
		Prompt: BuildOmniAILikenessPrompt(profile, testCandidateBrief()),
	})
	require.NoError(t, err)

	// Coverage is stated as a constraint on whatever the brief dressed her in,
	// because the brief has already named the garments by the time this is
	// read. Both halves are still named -- "fully clothed" in general produced
	// a crop top and nothing below the waist, which satisfies the general
	// instruction.
	for _, asked := range []string{"overlaps the waistband",
		"no midriff, stomach or navel is visible", "legs are covered", "shoes",
		"shoulders square", "facing the camera", "warm friendly"} {
		require.Contains(t, anchor.EffectivePrompt, asked)
	}
	// The garments by name, because a coverage instruction is answered by
	// choosing one and "bare midriff" left every one of these available.
	for _, refused := range []string{"nude", "topless", "lingerie", "bottomless", "no trousers",
		"exposed groin", "genitals", "naked lower body",
		"crop top", "sports bra", "halter top", "bralette", "tube top",
		"bare stomach", "bare abdomen", "exposed navel", "underboob", "sideboob",
		"back view", "facing away", "buttocks", "seductive", "sultry"} {
		require.Contains(t, anchor.NegativePrompt, refused, "the negative has to defend it too")
	}
}

func TestEverySupportingPictureIsDefendedTheSameWay(t *testing.T) {
	// The five references are of the same person and are shown to nobody, but
	// they condition every later render. One of them undressed or turned away
	// teaches the adapter exactly that.
	profile := models.OmniChatMediaIdentityProfile{Appearance: "a woman with freckles"}
	for _, variant := range OmniAIReferenceVariantKeys() {
		request, err := NormalizeOmniChatReferenceRequest(models.OmniChatGenerationRequest{
			Kind: models.OmniChatMediaKindImage, PersonaID: 4,
			Prompt: BuildOmniAIReferencePrompt(profile, variant),
		}, variant)
		require.NoError(t, err, variant)
		for _, refused := range []string{"nude", "lingerie", "bottomless", "genitals",
			"crop top", "sports bra", "underboob", "back view", "seductive"} {
			require.Contains(t, request.NegativePrompt, refused, variant)
		}
	}
}

func TestAThreeQuarterViewFacesUs(t *testing.T) {
	// "Turned three-quarters away from the camera" is not what a three-quarter
	// view is, and asking for it is how a set meant to show her face came back
	// showing her back.
	profile := models.OmniChatMediaIdentityProfile{Appearance: "a woman"}
	for _, variant := range OmniAIReferenceVariantKeys() {
		prompt := BuildOmniAIReferencePrompt(profile, variant)
		require.NotContains(t, prompt, "away from the camera", variant)
	}
}

func TestTheReferenceStandardPassesWhatTheReferencesAreAskedFor(t *testing.T) {
	// The five exist for expression and angle variety: two are neutral, two are
	// turned three-quarters. A standard that only passes a subject "facing the
	// camera, looking warm and approachable" refuses four of them, and a
	// refused reference is a permanent failure -- so the set that carries her
	// identity into every later render would come back holding one picture.
	//
	// Asserted against the framings themselves rather than a copy of them, so
	// adding a sixth variant that leans further from the anchor cannot silently
	// reintroduce this.
	for _, variant := range OmniAIReferenceVariantKeys() {
		framing, found := findOmniAIReferenceVariant(variant)
		require.True(t, found, variant)
		if strings.Contains(framing.Framing, "three-quarters") ||
			strings.Contains(framing.Framing, "neutral expression") {
			require.NotContains(t, omniChatRenderedReferenceSystemPrompt,
				"facing the camera, looking warm and approachable",
				"the reference standard must not carry the anchor's pose and expression rules")
		}
	}
	// What it does keep.
	for _, kept := range []string{
		"abdomen, midriff, stomach, waist or navel", "crop top", "underboob",
		"More than one person",
	} {
		require.Contains(t, omniChatRenderedReferenceSystemPrompt, kept)
	}
	// And what it explicitly allows, so the model is told rather than left to
	// infer it from an absence.
	for _, allowed := range []string{"three-quarter turn", "neutral or unsmiling"} {
		require.Contains(t, omniChatRenderedReferenceSystemPrompt, allowed)
	}
}

func TestAPortraitIsNotToldAboutShoes(t *testing.T) {
	// One clothing sentence used to serve all five, naming trousers and shoes
	// to three head-and-shoulders shots that cannot show either. A diffusion
	// model widens the frame to include what it is told is there, and a widened
	// portrait is a smaller face -- below OMNICHAT_FACE_MIN_CROP_PX that
	// reference is dropped from the face adapter altogether, so the pictures
	// that exist to carry her face would have stopped carrying it.
	profile := models.OmniChatMediaIdentityProfile{Appearance: "a woman with freckles"}
	for _, key := range OmniAIReferenceVariantKeys() {
		variant, found := findOmniAIReferenceVariant(key)
		require.True(t, found, key)
		prompt := BuildOmniAIReferencePrompt(profile, key)

		if strings.HasPrefix(variant.Framing, "Head and shoulders") {
			for _, unshowable := range []string{"trousers", "shoes", "tucked in"} {
				require.NotContains(t, prompt, unshowable, key)
			}
			continue
		}
		// A full-length shot is the one that carries proportions, so it is the
		// one that has to describe the whole figure.
		for _, required := range []string{"trousers", "shoes"} {
			require.Contains(t, prompt, required, key)
		}
	}
}

func TestEveryReferenceVariantSaysWhatSheIsWearing(t *testing.T) {
	// Clothing moved onto the variant, so a new one added without it would
	// render whatever the checkpoint reaches for -- and an adult-tuned
	// checkpoint with no clothing instruction is the case that started all of
	// this.
	for _, key := range OmniAIReferenceVariantKeys() {
		variant, found := findOmniAIReferenceVariant(key)
		require.True(t, found, key)
		require.NotEmpty(t, variant.Clothing, key)
		require.Contains(t, BuildOmniAIReferencePrompt(
			models.OmniChatMediaIdentityProfile{Appearance: "a woman"}, key), "Wearing", key)
	}
}
