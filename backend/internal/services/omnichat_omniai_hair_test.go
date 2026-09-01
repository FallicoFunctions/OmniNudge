package services

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestHairIsThreeAnswersThatCompose(t *testing.T) {
	// The point of the split. One list made curly and ponytail compete, so
	// saying one meant giving up the other. Now they are one description.
	normalised, err := normaliseOmniAIAppearance(OmniAIAppearance{
		Style: "realistic", Gender: "woman", HairLength: "long", HairTexture: "curly", HairStyle: "high_ponytail",
	})

	require.NoError(t, err)
	require.Equal(t, "long", normalised.HairLength)
	require.Equal(t, "curly", normalised.HairTexture)
	require.Equal(t, "high_ponytail", normalised.HairStyle)
}

func TestLengthDoesNotDecideWhichStylesExist(t *testing.T) {
	// The correction that matters. A bun on a buzz cut is an ordinary haircut:
	// buzzed sides, long top. So is an undercut and so is a fade. A first draft
	// had styles declare the lengths they needed and refused all three.
	buzzed := OmniAIHairStyles("realistic", "man", "straight")
	require.Contains(t, buzzed, "man_bun")
	require.Contains(t, buzzed, "undercut")
	require.Contains(t, buzzed, "fade")

	tied, err := normaliseOmniAIAppearance(OmniAIAppearance{
		Style: "realistic", Gender: "man", HairLength: "buzzed", HairTexture: "straight", HairStyle: "man_bun",
	})
	require.NoError(t, err)
	require.Equal(t, "buzzed", tied.HairLength)
	require.Equal(t, "man_bun", tied.HairStyle, "a buzz cut and a bun at the same time")

	// Every length offers the same shapes, because one length field cannot say
	// which part of the head it is describing.
	for _, length := range omniAIHairLengths {
		shaped, err := normaliseOmniAIAppearance(OmniAIAppearance{
			Style: "realistic", Gender: "woman", HairLength: length, HairTexture: "wavy", HairStyle: "bun",
		})
		require.NoError(t, err)
		require.Equal(t, "bun", shaped.HairStyle, "a bun should survive %s hair", length)
	}
}

func TestTheStyleSetsAreTheOnlyGenderedPartOfHair(t *testing.T) {
	// Length and texture describe the same hair on anybody. Only the shapes
	// people actually ask for differ.
	require.Contains(t, OmniAIHairStyles("realistic", "woman", "wavy"), "bob")
	require.NotContains(t, OmniAIHairStyles("realistic", "man", "wavy"), "bob")
	require.Contains(t, OmniAIHairStyles("realistic", "man", "straight"), "crew_cut")
	require.NotContains(t, OmniAIHairStyles("realistic", "woman", "straight"), "crew_cut")

	// Braids, cornrows and locs are nobody's exclusively.
	for _, shared := range []string{"braids", "cornrows", "locs"} {
		require.Contains(t, OmniAIHairStyles("realistic", "woman", "coily"), shared)
		require.Contains(t, OmniAIHairStyles("realistic", "man", "coily"), shared)
	}

	wrong, err := normaliseOmniAIAppearance(OmniAIAppearance{
		Style: "realistic", Gender: "man", HairTexture: "wavy", HairStyle: "pigtails",
	})
	require.NoError(t, err)
	require.Empty(t, wrong.HairStyle)
}

func TestTheOneShapeThatIsAlsoATexture(t *testing.T) {
	// An afro is not achievable on straight hair, where a bun above a buzz cut
	// plainly is. This is the only physical impossibility left in the table.
	require.Contains(t, OmniAIHairStyles("realistic", "woman", "coily"), "afro")
	require.Contains(t, OmniAIHairStyles("realistic", "man", "curly"), "afro")
	require.NotContains(t, OmniAIHairStyles("realistic", "woman", "straight"), "afro")

	impossible, err := normaliseOmniAIAppearance(OmniAIAppearance{
		Style: "realistic", Gender: "woman", HairLength: "long", HairTexture: "straight", HairStyle: "afro",
	})
	require.NoError(t, err)
	require.Empty(t, impossible.HairStyle)
	require.Equal(t, "long", impossible.HairLength,
		"and the hair itself survives -- one detail is lost, not the character")
}

func TestADrawingIsNotClaimingToBeAPhotograph(t *testing.T) {
	// The same line we drew for eye colour. An afro needs curly or coily hair on
	// a character drawn as a person. On anime it does not, because nothing there
	// is asserting what a person's hair can do.
	require.NotContains(t, OmniAIHairStyles("realistic", "woman", "straight"), "afro")
	require.Contains(t, OmniAIHairStyles("anime", "woman", "straight"), "afro")

	drawn, err := normaliseOmniAIAppearance(OmniAIAppearance{
		Style: "anime", Gender: "woman", HairTexture: "straight", HairStyle: "afro",
	})
	require.NoError(t, err)
	require.Equal(t, "afro", drawn.HairStyle)

	photographic, err := normaliseOmniAIAppearance(OmniAIAppearance{
		Style: "realistic", Gender: "woman", HairTexture: "straight", HairStyle: "afro",
	})
	require.NoError(t, err)
	require.Empty(t, photographic.HairStyle)

	// A blank drawing style did not come from the form, which answers it two
	// screens earlier. Unanswered reads as the stricter of the two.
	unstated, err := normaliseOmniAIAppearance(OmniAIAppearance{
		Gender: "woman", HairTexture: "straight", HairStyle: "afro",
	})
	require.NoError(t, err)
	require.Empty(t, unstated.HairStyle)

	// The gendered sets are not physical claims, so anime does not relax them.
	require.NotContains(t, OmniAIHairStyles("anime", "man", "straight"), "pigtails")
}

func TestEveryStyleIsReachableBySomeCombination(t *testing.T) {
	// A style no combination can offer is a row nobody can ever pick, which is
	// worse than not listing it: it looks supported and never appears.
	reachable := map[string]bool{}
	for _, gender := range omniAIGenders {
		for _, texture := range omniAIHairTextures {
			for _, style := range OmniAIHairStyles("realistic", gender, texture) {
				reachable[style] = true
			}
		}
	}
	for _, style := range omniAIHairStyles {
		require.True(t, reachable[style.Key], "%s can never be offered", style.Key)
	}
}
