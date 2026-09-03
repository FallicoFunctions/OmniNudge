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
