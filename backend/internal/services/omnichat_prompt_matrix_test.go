package services

import (
	"fmt"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

// Every prompt this repository builds, rendered across the inputs it branches
// on, and checked for the faults that only show up on the branch nobody tried.
//
// The likeness prompt was printed five times across two reviews and read by
// hand each time. Every one of those printings used a woman, and every sentence
// after the subject line was hardcoded to "She is wearing" and "Her top" -- so
// a male character was described as a woman for as long as the feature existed,
// in an artifact a review had already read five times. B1 was not the wrong
// instrument; one input was the wrong way to apply it.
//
// The subject description is deliberately free of pronouns, so any pronoun in
// the output came from the builder rather than from the text handed to it.
const matrixAppearance = "An adult with dark curly hair, brown eyes and a few freckles."

type promptCase struct {
	name    string
	subject string
	build   func(models.OmniChatMediaIdentityProfile) string
}

func promptMatrix() []promptCase {
	// Capitalised, because that is how they arrive. A brief is written by a
	// model as a standalone phrase and every real one so far has begun "An
	// oversized navy blue jumper" or "A thick, dog-eared paperback". A matrix
	// built from lowercase fixtures passes whether or not the builder lowers
	// them, which is a test of nothing: the first version of this file did
	// exactly that and reported the splice check green while it was blind.
	brief := OmniAICandidateBrief{
		Outfit:    "A long green cardigan over a grey top, dark trousers and leather boots",
		Setting:   "A quiet room with daylight from a window",
		Signature: "A wide-brimmed felt hat",
		Holding:   "A thick paperback",
	}
	var cases []promptCase
	for _, subject := range []string{"man", "woman", "they", ""} {
		subject := subject
		cases = append(cases,
			promptCase{"likeness/" + orNone(subject), subject,
				func(p models.OmniChatMediaIdentityProfile) string {
					return BuildOmniAILikenessPrompt(p, brief)
				}},
			promptCase{"likeness-fallback-brief/" + orNone(subject), subject,
				func(p models.OmniChatMediaIdentityProfile) string {
					return BuildOmniAILikenessPrompt(p, OmniAIFallbackCandidateBrief)
				}},
		)
		for _, variant := range OmniAIReferenceVariantKeys() {
			variant := variant
			cases = append(cases, promptCase{"reference/" + variant + "/" + orNone(subject), subject,
				func(p models.OmniChatMediaIdentityProfile) string {
					return BuildOmniAIReferencePrompt(p, variant, matrixAppearance)
				}})
		}
	}
	return cases
}

func orNone(subject string) string {
	if subject == "" {
		return "unset"
	}
	return subject
}

// wordRE matches a whole word, so "the" does not count as "he" and "there" does
// not count as "her". Getting that wrong is how a check like this passes on
// everything and means nothing.
func wordRE(word string) *regexp.Regexp {
	return regexp.MustCompile(`(?i)\b` + word + `\b`)
}

var pronounsByGender = map[string][]string{
	"he":   {"he", "his", "him"},
	"she":  {"she", "her", "hers"},
	"they": {"they", "their", "them"},
}

// TestNoPromptContradictsItsOwnSubject is the pronoun bug, caught for every
// prompt this repository will ever add.
func TestNoPromptContradictsItsOwnSubject(t *testing.T) {
	for _, c := range promptMatrix() {
		t.Run(c.name, func(t *testing.T) {
			prompt := c.build(models.OmniChatMediaIdentityProfile{
				Appearance: matrixAppearance,
				Subject:    c.subject,
			})

			expected := "she"
			switch strings.ToLower(c.subject) {
			case "man", "he":
				expected = "he"
			case "they", "nonbinary", "non-binary":
				expected = "they"
			}

			for family, words := range pronounsByGender {
				if family == expected {
					continue
				}
				for _, word := range words {
					require.Falsef(t, wordRE(word).MatchString(prompt),
						"a prompt for subject %q contains %q.\n"+
							"Every sentence after the subject line has to agree with it, or the "+
							"prompt argues with itself and the model picks a winner.\n\n%s",
						orNone(c.subject), word, prompt)
				}
			}
		})
	}
}

// midSentenceCapital finds a capitalised word that does not open a sentence.
//
// The inputs in this matrix contain no proper nouns, so any capital that is not
// preceded by sentence-ending punctuation was spliced in by a builder.
// No [a-z] after the capital. That was here to avoid matching an acronym and
// it excluded the single most common case instead: "A long green cardigan"
// opens with a one-letter word, so the pattern could not see the exact splice
// it was written for. Mutation testing is the only thing that showed it -- the
// assertion passed on every real prompt and on the reverted fix alike.
//
// Nothing in this matrix is an acronym or a proper noun, so a bare capital is
// unambiguous here.
var midSentenceCapital = regexp.MustCompile(`[a-z,] +[A-Z]`)

// TestNoPromptSplicesAPhraseMidSentence catches the fault that shipped in every
// render made in one day: "She is wearing An oversized navy blue jumper".
//
// A brief is written by a model as a standalone phrase, so it arrives
// capitalised; spliced after "She is wearing" it is a run-on that the prompt
// builder already fixes at the other end of a sentence and did not fix here.
func TestNoPromptSplicesAPhraseMidSentence(t *testing.T) {
	for _, c := range promptMatrix() {
		t.Run(c.name, func(t *testing.T) {
			prompt := c.build(models.OmniChatMediaIdentityProfile{
				Appearance: matrixAppearance,
				Subject:    c.subject,
			})
			found := midSentenceCapital.FindString(prompt)
			require.Emptyf(t, found,
				"a capitalised word lands mid-sentence: %q\n"+
					"Nothing in this matrix is a proper noun, so a builder spliced a phrase "+
					"without lowering it.\n\n%s", strings.TrimSpace(found), prompt)
		})
	}
}

// TestEveryPromptIsWholeSentences catches the other end of the same fault: a
// phrase joined without terminating the one before it, which a diffusion model
// reads as a single run-on clause.
func TestEveryPromptIsWholeSentences(t *testing.T) {
	doubled := regexp.MustCompile(`\.\s*\.|\s+\.`)
	for _, c := range promptMatrix() {
		t.Run(c.name, func(t *testing.T) {
			prompt := c.build(models.OmniChatMediaIdentityProfile{
				Appearance: matrixAppearance,
				Subject:    c.subject,
			})
			require.True(t, strings.HasSuffix(strings.TrimSpace(prompt), "."),
				"a prompt that does not end in a full stop was joined from pieces that did not either")
			require.Emptyf(t, doubled.FindString(prompt),
				"doubled or orphaned full stop, from a piece that already ended in one:\n\n%s", prompt)
		})
	}
}

func TestThePromptMatrixCoversEveryBuilderAndSubject(t *testing.T) {
	// The matrix is only worth having if it is actually wide. A builder added
	// without a row here is a builder nothing checks.
	cases := promptMatrix()
	subjects := map[string]bool{}
	builders := map[string]bool{}
	for _, c := range cases {
		subjects[orNone(c.subject)] = true
		builders[strings.SplitN(c.name, "/", 2)[0]] = true
	}
	require.Len(t, subjects, 4, "man, woman, they and unset")
	require.GreaterOrEqual(t, len(builders), 3)
	require.GreaterOrEqual(t, len(cases), 4*(2+len(OmniAIReferenceVariantKeys())))
	fmt.Printf("prompt matrix: %d prompts, %d builders, %d subjects\n",
		len(cases), len(builders), len(subjects))
}

// The rule about her clothes may not name a garment the brief might not have
// chosen.
//
// It said "covers the waistband of her trousers", while the brief writer is
// told in the same breath that she may wear a skirt or a dress to the knee. A
// knee-length dress produced a prompt that named the dress and then asserted a
// waistband, in consecutive sentences.
//
// Asserted on the template rather than on a rendered prompt, because that is
// where the fault lives: a rendered prompt legitimately contains whatever
// garment the brief chose, so searching one for "dress" cannot tell the two
// apart.
func TestTheCoverageRuleNamesNoGarment(t *testing.T) {
	for _, garment := range []string{
		"trousers", "skirt", "dress", "shirt", "jumper", "top", "coat", "jeans",
	} {
		require.NotContainsf(t, strings.ToLower(omniAILikenessCoverageTemplate), garment,
			"the coverage rule names %q. It is a statement about the outfit the brief "+
				"already chose, so naming a garment asserts one she may not be wearing.", garment)
	}
	// And it still says the thing it exists to say.
	require.Contains(t, omniAILikenessCoverageTemplate, "below the hips")
	require.Contains(t, omniAILikenessCoverageTemplate, "covered to at least the")
}
