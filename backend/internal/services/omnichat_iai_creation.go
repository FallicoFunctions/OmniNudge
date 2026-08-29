package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	zlog "github.com/rs/zerolog/log"

	"github.com/omninudge/backend/internal/models"
)

// Making an IAI from the answers (§34).
//
// Nine screens end here. What the form collected becomes a persona row with no
// instruction channels, a baseline, and how she starts out feeling about the
// person who made her -- and nothing else, because there is nothing else it is
// allowed to become.

// iaiInterest is one of the answers on §34's sixth screen, and how she would
// say it.
//
// One phrase each, never "X and Y". Three picks are joined into a sentence, so
// a reading with its own "and" in it makes the join unreadable: "drawn to
// games, films and shows and puzzles and mysteries" gives a reader no way to
// tell where one interest ends. Measured across all 9,880 three-pick
// combinations, five such readings garbled 360 of them.
//
// Plain nouns, and never a history. §35: she was made recently and has done
// almost none of what she knows about, so "has played since she was small" is a
// past she did not have. What she has is an inclination, and the line says only
// that.
//
// The caveat itself is not repeated here. The base prompt already tells her she
// knows a great deal and has done almost none of it, once, where it belongs;
// saying it again inside every interest made the sentence read "drawn to games,
// which she is drawn to".
type iaiInterest struct {
	Key   string
	Reads string
}

var iaiInterests = []iaiInterest{
	// Forty, grouped so a list this long can be read rather than scanned. The
	// form filters as somebody types; nine was too few to describe anybody, and
	// three slots out of nine is a third of the whole personality.
	//
	// Two are deliberately absent. "Going out" and "staying in" describe how
	// somebody likes to spend an evening rather than what they are interested
	// in, and each one cost a slot out of only three to say something a
	// character shows anyway.
	//
	// "Being physical" is gone as well. It meant exercise, or affection, or
	// sex, or fighting, or working with your hands, depending on who read it --
	// and for somebody with no body at all it meant less than that. Sport and
	// training are two of those things said plainly.

	// Watching, reading, playing.
	{Key: "games", Reads: "games"},
	{Key: "anime", Reads: "anime"},
	{Key: "comics", Reads: "comics"},
	{Key: "film", Reads: "films"},
	{Key: "music", Reads: "music"},
	{Key: "reading", Reads: "reading"},
	{Key: "horror", Reads: "frightening stories"},
	{Key: "true_crime", Reads: "true crime"},
	{Key: "mysteries", Reads: "mysteries"},
	{Key: "comedy", Reads: "comedy"},
	{Key: "theatre", Reads: "theatre"},

	// Making.
	{Key: "writing", Reads: "writing"},
	{Key: "poetry", Reads: "poetry"},
	{Key: "art", Reads: "art"},
	{Key: "photography", Reads: "photography"},
	{Key: "crafts", Reads: "making things by hand"},
	{Key: "fashion", Reads: "fashion"},
	{Key: "architecture", Reads: "buildings"},
	{Key: "cooking", Reads: "cooking"},
	{Key: "baking", Reads: "baking"},
	{Key: "coffee", Reads: "coffee"},

	// Moving.
	{Key: "sports", Reads: "sport"},
	{Key: "fitness", Reads: "training"},
	{Key: "martial_arts", Reads: "martial arts"},
	{Key: "dance", Reads: "dance"},
	{Key: "hiking", Reads: "being outdoors"},

	// Living things and places.
	{Key: "nature", Reads: "the natural world"},
	{Key: "animals", Reads: "animals"},
	{Key: "gardening", Reads: "growing things"},
	{Key: "travel", Reads: "other places"},
	{Key: "languages", Reads: "languages"},

	// Knowing.
	{Key: "history", Reads: "history"},
	{Key: "mythology", Reads: "myths"},
	{Key: "philosophy", Reads: "ideas about how to live"},
	{Key: "psychology", Reads: "why people do what they do"},
	{Key: "science", Reads: "how things work"},
	{Key: "space", Reads: "space"},
	{Key: "technology", Reads: "technology"},
	{Key: "cars", Reads: "cars"},
	{Key: "current_events", Reads: "what is going on in the world"},
}

// IAIInterestKeys lists what the form may offer, in the order §34 gives.
func IAIInterestKeys() []string {
	keys := make([]string, 0, len(iaiInterests))
	for _, interest := range iaiInterests {
		keys = append(keys, interest.Key)
	}
	return keys
}

// omniChatIAIInterestPicks matches §34's "up to three".
const omniChatIAIInterestPicks = 3

// IAIInterestPicks matches §34's "up to three", exposed so the form applies
// the same number rather than a copy of it.
func IAIInterestPicks() int { return omniChatIAIInterestPicks }

// IAIAnswers is what nine screens collect. Every field is a choice off a list
// except the name, which is the one screen §34 lets somebody type on.
//
// Appearance is recorded even though nothing can draw her yet. Creation is the
// only moment somebody is thinking about how she looks, and asking again when
// the generator arrives is worse than asking once.
type IAIAnswers struct {
	Name         string
	Temperaments []string
	Interests    []string
	Feeling      string

	// What the two of them are to each other: friend, situationship, partner,
	// spouse. Attraction is read off this rather than asked for its own sake,
	// because asking somebody making a friend how drawn to them she is asks a
	// question they did not come here for.
	Relationship string

	Appearance IAIAppearance
}

var iaiSlugUnsafe = regexp.MustCompile(`[^a-z0-9]+`)

// ErrIAICreationNotEntitled is refused access rather than a failure. §19: free
// and lowest-tier accounts do not get IAI at all, which is what gives the
// creator payout pool a clean source.
// Named so a caller can tell whose fault a refusal is. A handler answering 400
// to a database outage sends somebody off to fix a form that was fine.
var (
	ErrIAINameRequired = errors.New("omnichat iai: she needs a name")
	ErrIAINameTooLong  = fmt.Errorf("omnichat iai: a name over %d characters is a paragraph", omniChatIAINameRunes)
)

var ErrIAICreationNotEntitled = errors.New("omnichat iai: this account cannot create independent characters")

// omniChatIAIRequiredTier is the plan an independent character needs.
//
// Higher than a written one, which needs only a paid plan. She is the expensive
// half of the product -- she remembers, she drifts, she answers on her own time
// -- and one of her is worth more than a shelf of parts somebody scripted.
const omniChatIAIRequiredTier = OmniChatModelTierPremium

// OmniChatIAIRequiredPlan names that tier for the interface, so the creation
// flow can say who this is for before somebody spends nine screens finding out.
// entitled() below compares against the same constant, so the sentence shown and
// the rule enforced cannot drift apart.
func OmniChatIAIRequiredPlan() string { return models.PlanPremium }

// OmniChatIAICreator makes independent characters.
type OmniChatIAICreator struct {
	personas *models.BotPersonaRepository
	users    OmniChatUserReader
}

func NewOmniChatIAICreator(personas *models.BotPersonaRepository, users OmniChatUserReader) *OmniChatIAICreator {
	return &OmniChatIAICreator{personas: personas, users: users}
}

// entitled reports whether this account may make one.
//
// The check lives here rather than in the handler so that every route, job or
// admin tool that ever calls this gets it. Every failure path denies: an unset
// reader, a missing account or a lookup outage must never hand somebody a
// character they are not entitled to, and denying costs them a refusal rather
// than anything they had.

// allowance answers both questions from one lookup: may this account make one,
// and how many may it keep.
//
// They were two functions and the second was a constant, so an admin could pass
// the entitlement and still be refused by a cap that never asked who they were.
func (c *OmniChatIAICreator) allowance(ctx context.Context, userID int) (bool, int) {
	if c == nil || c.users == nil || userID <= 0 {
		return false, 0
	}
	user, err := c.users.GetByID(ctx, userID)
	if err != nil {
		zlog.Warn().Err(err).Int("user_id", userID).
			Msg("omnichat iai: entitlement lookup failed; refusing creation")
		return false, 0
	}
	if user == nil {
		return false, 0
	}
	if strings.EqualFold(strings.TrimSpace(user.Role), "admin") {
		return true, OmniChatIAIAdminLimit
	}
	// A lapsed subscription is not a subscription, and §19 excludes free and
	// the lowest paid tier both.
	if user.PlanExpiresAt != nil && !user.PlanExpiresAt.After(time.Now()) {
		return false, 0
	}
	if modelTierForStoredPlan(user.Plan) != omniChatIAIRequiredTier {
		return false, 0
	}
	return true, OmniChatIAILimit
}

// Create turns the answers into somebody.
func (c *OmniChatIAICreator) Create(ctx context.Context, creatorUserID int, answers IAIAnswers) (*models.BotPersona, error) {
	if c == nil || c.personas == nil {
		return nil, errors.New("omnichat iai: creation is unavailable")
	}
	entitled, limit := c.allowance(ctx, creatorUserID)
	if !entitled {
		return nil, ErrIAICreationNotEntitled
	}
	name := strings.TrimSpace(answers.Name)
	if name == "" {
		return nil, ErrIAINameRequired
	}
	if len([]rune(name)) > omniChatIAINameRunes {
		return nil, ErrIAINameTooLong
	}

	appearance, err := normaliseIAIAppearance(answers.Appearance)
	if err != nil {
		return nil, err
	}
	var encoded []byte
	if appearance.described() {
		// Left NULL when nobody answered, rather than stored as an empty object
		// that would read later as "asked and declined".
		if encoded, err = json.Marshal(appearance); err != nil {
			return nil, fmt.Errorf("omnichat iai: encode appearance: %w", err)
		}
	}

	seed := SeedIAI(answers.Temperaments, answers.Feeling, answers.Relationship)
	seed.Relationship.Kind = seed.Kind
	return c.personas.CreateIAI(ctx, creatorUserID, models.IAIPersona{
		SlugBase:    iaiSlugBase(name),
		Name:        name,
		Personality: renderIAIInterests(answers.Interests),
		Appearance:  encoded,
		Baseline:    seed.Baseline,
	}, seed.Relationship, limit)
}

// omniChatIAINameRunes bounds the one field somebody types into.
const omniChatIAINameRunes = 40

// iaiSlugBase is the readable half of her identity. It is deliberately not
// unique: the repository appends her id, because two characters named Sam is
// something one person will do inside a minute.
func iaiSlugBase(name string) string {
	slug := iaiSlugUnsafe.ReplaceAllString(strings.ToLower(strings.TrimSpace(name)), "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		// A name in a script with no ASCII at all still needs a slug.
		slug = "iai"
	}
	if len(slug) > 48 {
		slug = strings.Trim(slug[:48], "-")
	}
	return slug
}

// renderIAIInterests turns the picks into a line about what she is drawn to.
//
// Composed here rather than typed anywhere. §13 removed the channels a creator
// could bind her with, and structure is what keeps this from being one: a person
// choosing from a list cannot smuggle an instruction into it.
func renderIAIInterests(picks []string) string {
	reads := make([]string, 0, omniChatIAIInterestPicks)
	seen := make(map[string]struct{}, len(picks))
	for _, pick := range picks {
		if len(reads) >= omniChatIAIInterestPicks {
			break
		}
		key := strings.TrimSpace(strings.ToLower(pick))
		if _, repeated := seen[key]; repeated {
			continue
		}
		for _, interest := range iaiInterests {
			if interest.Key == key {
				seen[key] = struct{}{}
				reads = append(reads, interest.Reads)
				break
			}
		}
	}
	if len(reads) == 0 {
		return ""
	}
	return "Drawn to " + joinWithAnd(reads) + "."
}

func joinWithAnd(values []string) string {
	switch len(values) {
	case 0:
		return ""
	case 1:
		return values[0]
	case 2:
		return values[0] + " and " + values[1]
	default:
		return strings.Join(values[:len(values)-1], ", ") + " and " + values[len(values)-1]
	}
}
