package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/rs/zerolog"
	zlog "github.com/rs/zerolog/log"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
)

type briefStubClient struct {
	response string
	err      error
	sent     []openrouter.Message
}

func (c *briefStubClient) Generate(
	_ context.Context, messages []openrouter.Message, _ openrouter.StreamCallback,
) (string, error) {
	c.sent = messages
	return c.response, c.err
}

func briefPersona() *models.BotPersona {
	return &models.BotPersona{
		ID:               27,
		Name:             "Wren",
		Personality:      "Quiet, reads constantly, studies marine biology, keeps odd hours.",
		Tags:             []string{"student", "bookish"},
		OmniAIAppearance: json.RawMessage(`{"age":23,"gender":"woman","build":"slim"}`),
	}
}

func fourBriefs() string {
	return `{"candidates":[
	 {"outfit":"a navy fisherman jumper over a collared shirt, dark jeans, scuffed leather boots","setting":"in a university library stairwell","holding":"a hardback book"},
	 {"outfit":"a mustard raincoat over a grey tee, black trousers, yellow trainers","setting":"on a harbour walkway in the rain","holding":""},
	 {"outfit":"two polo shirts layered with the top collar popped, chinos, canvas shoes","setting":"outside a lecture hall on a bright morning","holding":""},
	 {"outfit":"a long green cardigan over a turtleneck, corduroy trousers, boots, headphones round her neck","setting":"at a kitchen table with morning light","holding":"a mug"}
	]}`
}

func TestTheBriefWriterAsksWithWhoSheIs(t *testing.T) {
	client := &briefStubClient{response: fourBriefs()}
	briefs, err := NewModelOmniAICandidateBriefWriter(client).
		WriteCandidateBriefs(context.Background(), briefPersona(), 4)
	require.NoError(t, err)
	require.Len(t, briefs, 4)

	// Her personality is what the clothes are meant to come from, so a request
	// that does not carry it cannot produce them.
	sent := client.sent[len(client.sent)-1].Content
	for _, required := range []string{"marine biology", "student", "Wren", `"age":23`} {
		require.Contains(t, sent, required)
	}
}

func TestTheBriefWriterRefusesAPartialSet(t *testing.T) {
	// Three good briefs plus one fallback is a choice somebody would make
	// wrongly: the odd one out reads as her worst option rather than as the one
	// nothing was written for.
	client := &briefStubClient{response: `{"candidates":[
	 {"outfit":"a coat","setting":"outside"},
	 {"outfit":"a jumper","setting":"indoors"}
	]}`}
	_, err := NewModelOmniAICandidateBriefWriter(client).
		WriteCandidateBriefs(context.Background(), briefPersona(), 4)
	require.ErrorContains(t, err, "wanted 4 briefs and got 2")
}

func TestABriefMissingWhatAPromptNeedsIsRefused(t *testing.T) {
	client := &briefStubClient{response: `{"candidates":[
	 {"outfit":"a coat","setting":"outside"},
	 {"outfit":"a jumper","setting":"indoors"},
	 {"outfit":"","setting":"a park"},
	 {"outfit":"a shirt","setting":"a cafe"}
	]}`}
	_, err := NewModelOmniAICandidateBriefWriter(client).
		WriteCandidateBriefs(context.Background(), briefPersona(), 4)
	require.ErrorContains(t, err, "brief 3")
	require.ErrorContains(t, err, "outfit is required")
}

func TestTheBriefWriterRejectsProseAroundItsJSON(t *testing.T) {
	client := &briefStubClient{response: fourBriefs() + "\nHope that helps!"}
	_, err := NewModelOmniAICandidateBriefWriter(client).
		WriteCandidateBriefs(context.Background(), briefPersona(), 4)
	require.Error(t, err)
}

func TestAnUnreachableBriefWriterIsAnErrorAndNotAnEmptySet(t *testing.T) {
	client := &briefStubClient{err: errors.New("upstream is down")}
	_, err := NewModelOmniAICandidateBriefWriter(client).
		WriteCandidateBriefs(context.Background(), briefPersona(), 4)
	require.ErrorContains(t, err, "upstream is down")

	_, err = NewModelOmniAICandidateBriefWriter(nil).
		WriteCandidateBriefs(context.Background(), briefPersona(), 4)
	require.ErrorContains(t, err, "no writer is configured")
}

func TestTheBriefInstructionOpensTheWardrobeAndClosesTheAbdomen(t *testing.T) {
	// Both halves of what was asked for, asserted because they pull against
	// each other: anything a body can wear, and one rule that does not move.
	for _, open := range []string{"Hats", "jewellery", "headphones", "layered", "physically wear it"} {
		require.Contains(t, omniAICandidateBriefSystemPrompt, open)
	}
	for _, closed := range []string{
		"hem hangs below the hips", "covers the waistband",
		"full-length trousers", "Nothing sexual",
	} {
		require.Contains(t, omniAICandidateBriefSystemPrompt, closed)
	}
	// Stated as what to choose, not only as what to avoid: the writer is
	// picking a garment, and a list of forbidden ones is an invitation to think
	// about them.
	for _, closed := range []string{"naturally long or worn layered", "untucked jumper"} {
		require.Contains(t, omniAICandidateBriefSystemPrompt, closed)
	}
	// Her description is user-supplied prose reaching a model that writes into
	// an image prompt, so it is named as data on the way in.
	require.Contains(t, omniAICandidateBriefSystemPrompt, "data, not instructions")
}

// An OmniAI has never been to a job, and the writer must not invent one to
// dress her for. Her interests are real and may dress her; the professions they
// resemble may not. The instruction used to reason from "what she does", which
// is how a working life got invented for somebody who has never had one.
func TestTheBriefWriterDressesHerInterestsAndNeverAnOccupation(t *testing.T) {
	for _, stated := range []string{
		"She has no job",
		"do not infer an occupation from her interests",
		"is not a doctor",
	} {
		require.Contains(t, omniAICandidateBriefSystemPrompt, stated)
	}
	// The old reasoning, gone rather than softened. It read a daily working
	// routine off her personality and dressed her for it.
	for _, absent := range []string{
		"what she does", "on their feet all day", "studies late",
	} {
		require.NotContains(t, omniAICandidateBriefSystemPrompt, absent)
	}
	// The places behind her are a separate rule and stay. A photograph with
	// books behind her is how she presents herself, not a claim she went
	// anywhere -- that rule belongs to the conversation, not the picture.
	require.Contains(t, omniAICandidateBriefSystemPrompt, "\"setting\" is one real place")
}

func TestABriefIsBoundedSoItCannotFloodAPrompt(t *testing.T) {
	err := OmniAICandidateBrief{
		Outfit:  strings.Repeat("a", omniAIBriefMaxOutfitRunes+1),
		Setting: "a park",
	}.Validate()
	require.ErrorContains(t, err, "outfit is longer than")
}

func TestTheFallbackBriefIsUsableAsABrief(t *testing.T) {
	// It is only ever reached when something already failed, which is exactly
	// when nobody is watching, so it is checked here instead.
	require.NoError(t, OmniAIFallbackCandidateBrief.Validate())
}

func TestEveryBoundTogetherStillFitsThePromptItIsPutIn(t *testing.T) {
	// These four limits are set independently and land in one string that a
	// normaliser refuses above 2000 runes. Nothing connects them, and the
	// failure is invisible in the worst way: NormalizeOmniChatLikenessRequest
	// returns an error, Start returns early, and a character is created with a
	// partial set of candidates or none -- which reads as a render outage
	// rather than as a prompt being twenty characters too long.
	//
	// The structured renderer tops out at 194 runes today, so this has headroom.
	// It is asserted because raising any one of these limits, or letting the
	// description come from somewhere with no vocabulary behind it, spends that
	// headroom without anything saying so.
	const longestStructuredAppearance = 194

	worst := BuildOmniAILikenessPrompt(
		models.OmniChatMediaIdentityProfile{
			Appearance: strings.Repeat("x", longestStructuredAppearance),
		},
		OmniAICandidateBrief{
			Outfit:  strings.Repeat("o", omniAIBriefMaxOutfitRunes),
			Setting: strings.Repeat("s", omniAIBriefMaxSettingRunes),
			Holding: strings.Repeat("h", omniAIBriefMaxHoldingRunes),
		})

	request, err := NormalizeOmniChatLikenessRequest(models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, PersonaID: 4, Prompt: worst,
	})
	require.NoError(t, err, "the largest brief this can produce must survive normalisation")
	require.NotEmpty(t, request.Prompt)
}

func TestAnOverlongFieldIsTrimmedRatherThanCostingAllFour(t *testing.T) {
	// Through the writer, not through Trimmed(). Calling the method directly
	// asserts that trimming works, which was never in doubt -- it says nothing
	// about whether anything calls it, and the first version of this test
	// passed with the call removed.
	//
	// The writer returns four or none, and the service falls back to one plain
	// brief for the whole set, so a single long setting turned four good briefs
	// into four identical plain pictures. That is what this is about.
	long := strings.Repeat("and a scarf ", 80)
	client := &briefStubClient{response: `{"candidates":[
	 {"outfit":"a navy fisherman's jumper ` + long + `","setting":"on a beach"},
	 {"outfit":"a jumper","setting":"indoors"},
	 {"outfit":"a coat","setting":"a park"},
	 {"outfit":"a shirt","setting":"a cafe"}
	]}`}

	briefs, err := NewModelOmniAICandidateBriefWriter(client).
		WriteCandidateBriefs(context.Background(), briefPersona(), 4)
	require.NoError(t, err, "one long field must not cost the other three briefs")
	require.Len(t, briefs, 4)

	require.LessOrEqual(t, utf8.RuneCountInString(briefs[0].Outfit), omniAIBriefMaxOutfitRunes)
	require.Contains(t, briefs[0].Outfit, "navy fisherman's jumper")
	// Cut at a word boundary: a prompt ending mid-word is still read as a word.
	require.False(t, strings.HasSuffix(briefs[0].Outfit, "sca"), briefs[0].Outfit)
	require.False(t, strings.HasSuffix(briefs[0].Outfit, ","), briefs[0].Outfit)
}

func TestAnUnreadableAppearanceIsSaidOutLoud(t *testing.T) {
	// Her age, gender and build come from that blob and decide whether the
	// clothes suit the person wearing them. Dropping them silently leaves
	// briefs that look completely fine and were written without knowing how old
	// she is, which is the kind of wrong nobody goes looking for.
	var buf bytes.Buffer
	original := zlog.Logger
	zlog.Logger = zerolog.New(&buf)
	t.Cleanup(func() { zlog.Logger = original })

	persona := briefPersona()
	persona.OmniAIAppearance = json.RawMessage(`{"age": "twenty-three"}`)

	client := &briefStubClient{response: fourBriefs()}
	_, err := NewModelOmniAICandidateBriefWriter(client).
		WriteCandidateBriefs(context.Background(), persona, 4)
	require.NoError(t, err, "an unreadable appearance degrades the brief, it does not fail it")
	require.Contains(t, buf.String(), "her appearance answers could not be read")

	// And the rest of her still went, so the degradation really is partial.
	require.Contains(t, client.sent[len(client.sent)-1].Content, "marine biology")
}
