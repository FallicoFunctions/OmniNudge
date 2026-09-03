package services

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

type styleWriterStub struct {
	style  models.OmniAIStyleProfile
	err    error
	called *models.BotPersona
	note   string
}

func (s *styleWriterStub) WriteStyleProfile(
	_ context.Context, persona *models.BotPersona, note string,
) (models.OmniAIStyleProfile, error) {
	s.called, s.note = persona, note
	if s.err != nil {
		return models.OmniAIStyleProfile{Note: note}, s.err
	}
	style := s.style
	style.Note = note
	return style, nil
}

func styleAnswers() OmniAIAnswers {
	return OmniAIAnswers{
		Name:      "Wren",
		Interests: []string{"reading"},
		Appearance: OmniAIAppearance{
			Gender: "woman", Age: 23, Build: "slim", Eyes: "brown", Style: "realistic",
		},
		StyleNote: "nothing tight",
	}
}

// The writer is asked with the person she is about to be. The persona does not
// exist yet, so the creator assembles the fields the row will carry -- and if
// those go missing the wardrobe is written for nobody, which reads as a working
// feature producing bland clothes.
func TestHerStyleIsWrittenFromWhoSheIsAboutToBe(t *testing.T) {
	writer := &styleWriterStub{style: models.OmniAIStyleProfile{
		Taste: "heavy knits in moss and rust", SignatureItem: "black over-ear headphones",
	}}
	creator := (&OmniChatOmniAICreator{}).SetStyleWriter(writer)

	answers := styleAnswers()
	appearance, err := normaliseOmniAIAppearance(answers.Appearance)
	require.NoError(t, err)
	encoded, err := json.Marshal(appearance)
	require.NoError(t, err)

	style := creator.writeStyle(context.Background(), &models.BotPersona{
		Name:             answers.Name,
		Personality:      renderOmniAIInterests(answers.Interests),
		OmniAIAppearance: encoded,
	}, answers.StyleNote)

	require.Equal(t, "Wren", writer.called.Name)
	require.Contains(t, writer.called.Personality, "reading")
	require.Contains(t, string(writer.called.OmniAIAppearance), "23")
	require.Equal(t, "nothing tight", writer.note)
	require.Equal(t, "heavy knits in moss and rust", style.Taste)
	require.Equal(t, "nothing tight", style.Note)
}

// The writer reads her description off the identity blob, not off the answers.
//
// The creator assembled a persona without one, so that field was empty on every
// call ever made: the answers carry her age, gender and build, and none of her
// hair, her colouring or anything that decides what colours she would put on.
// Caught by running the real writer and reading the payload it was sent -- the
// wardrobe came back written for nobody, and said "She wears" about a man.
func TestTheStyleWriterIsToldWhatSheLooksLike(t *testing.T) {
	appearance, err := normaliseOmniAIAppearance(OmniAIAppearance{
		Gender: "man", Age: 31, Eyes: "brown", Style: "realistic",
	})
	require.NoError(t, err)
	encoded, err := json.Marshal(appearance)
	require.NoError(t, err)
	described, err := encodeOmniAIIdentity(appearance, models.OmniAIStyleProfile{})
	require.NoError(t, err)

	writer := &styleWriterStub{}
	(&OmniChatOmniAICreator{}).SetStyleWriter(writer).writeStyle(context.Background(),
		&models.BotPersona{
			Name: "Ade", Personality: "Drawn to music.",
			OmniAIAppearance: encoded, ExtensionsJSON: described,
		}, "")

	require.NotEmpty(t, ResolveOmniChatMediaIdentityProfile(writer.called).Appearance,
		"the persona handed to the style writer carries no description of her")
	require.Contains(t, ResolveOmniChatMediaIdentityProfile(writer.called).Appearance, "man")
}

// An unreachable model costs her a written wardrobe and never a character.
func TestAFailedStyleWriteStillMakesTheCharacter(t *testing.T) {
	creator := (&OmniChatOmniAICreator{}).SetStyleWriter(
		&styleWriterStub{err: errors.New("upstream is down")})
	style := creator.writeStyle(context.Background(), &models.BotPersona{Name: "Wren"}, "always in black")
	require.Empty(t, style.Taste)
	require.Equal(t, "always in black", style.Note)

	// And with no writer wired at all, which is what a deployment without an
	// OpenRouter key is.
	none := (&OmniChatOmniAICreator{}).writeStyle(
		context.Background(), &models.BotPersona{Name: "Wren"}, "always in black")
	require.Equal(t, "always in black", none.Note)
	require.True(t, models.OmniAIStyleProfile{Note: "always in black"} == none)
}

// It has to reach the blob the image pipeline reads, under the key the resolver
// looks for -- written but unstored is the same as never written.
func TestHerStyleIsStoredWhereEverythingThatDrawsHerLooks(t *testing.T) {
	appearance, err := normaliseOmniAIAppearance(styleAnswers().Appearance)
	require.NoError(t, err)

	extensions, err := encodeOmniAIIdentity(appearance, models.OmniAIStyleProfile{
		Taste: "heavy knits in moss and rust", SignatureItem: "black over-ear headphones",
		Note: "nothing tight",
	})
	require.NoError(t, err)

	profile := ResolveOmniChatMediaIdentityProfile(&models.BotPersona{ExtensionsJSON: extensions})
	require.Equal(t, "heavy knits in moss and rust", profile.Style.Taste)
	require.Equal(t, "black over-ear headphones", profile.Style.SignatureItem)
	require.Equal(t, "nothing tight", profile.Style.Note)
}

// The stored row says only what was decided about her.
//
// Every field omitted here has a default the resolver applies on read, and
// writing them anyway put "identity_adapter_scale":0 and "reference_limit":0
// into the blob -- invalid values that no reader uses and that read to somebody
// debugging a persona as a character configured to have no references at all.
func TestTheStoredIdentityBlobCarriesNoZeroedDefaults(t *testing.T) {
	appearance, err := normaliseOmniAIAppearance(styleAnswers().Appearance)
	require.NoError(t, err)
	blob, err := encodeOmniAIIdentity(appearance, models.OmniAIStyleProfile{Taste: "heavy knits"})
	require.NoError(t, err)

	for _, absent := range []string{
		"identity_adapter_scale", "reference_limit", "identity_mode", "identity_adapter",
	} {
		require.NotContains(t, string(blob), absent)
	}
	// And the defaults still arrive, because they come from the resolver.
	profile := ResolveOmniChatMediaIdentityProfile(&models.BotPersona{ExtensionsJSON: blob})
	require.Equal(t, 6, profile.ReferenceLimit)
	require.Equal(t, models.OmniChatMediaIdentityAdapterIPAdapter, profile.Adapter)
	require.Equal(t, "heavy knits", profile.Style.Taste)
}

// A creator who answered nothing about her looks but typed a style note has
// said something, and the blob must not be dropped for being half empty.
func TestANoteAloneIsStoredEvenWithNoAppearance(t *testing.T) {
	extensions, err := encodeOmniAIIdentity(OmniAIAppearance{},
		models.OmniAIStyleProfile{Note: "she dresses like a 90s skater"})
	require.NoError(t, err)
	require.NotNil(t, extensions)
	require.Contains(t, string(extensions), "90s skater")

	// And nothing at all is still stored as nothing, rather than as an empty
	// object that would read later as asked and declined.
	empty, err := encodeOmniAIIdentity(OmniAIAppearance{}, models.OmniAIStyleProfile{})
	require.NoError(t, err)
	require.Nil(t, empty)
}

// The note is trimmed and bounded on the way in like every other free text.
func TestAnOverlongNoteIsBoundedRatherThanRefused(t *testing.T) {
	writer := &styleWriterStub{}
	style := (&OmniChatOmniAICreator{}).SetStyleWriter(writer).writeStyle(
		context.Background(), &models.BotPersona{Name: "Wren"},
		"  "+strings.Repeat("black ", 200)+"  ")
	require.NoError(t, style.Validate())
}
