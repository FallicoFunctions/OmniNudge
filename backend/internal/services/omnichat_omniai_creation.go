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

// Making an OmniAI from the answers (§34).
//
// Nine screens end here. What the form collected becomes a persona row with no
// instruction channels, a baseline, and how she starts out feeling about the
// person who made her -- and nothing else, because there is nothing else it is
// allowed to become.

// omniAIInterest is one of the answers on §34's sixth screen, and how she would
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
type omniAIInterest struct {
	Key   string
	Reads string
}

var omniAIInterests = []omniAIInterest{
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

// OmniAIInterestKeys lists what the form may offer, in the order §34 gives.
func OmniAIInterestKeys() []string {
	keys := make([]string, 0, len(omniAIInterests))
	for _, interest := range omniAIInterests {
		keys = append(keys, interest.Key)
	}
	return keys
}

// omniChatOmniAIInterestPicks matches §34's "up to three".
const omniChatOmniAIInterestPicks = 3

// OmniAIInterestPicks matches §34's "up to three", exposed so the form applies
// the same number rather than a copy of it.
func OmniAIInterestPicks() int { return omniChatOmniAIInterestPicks }

// OmniAIAnswers is what nine screens collect. Every field is a choice off a list
// except the name, which is the one screen §34 lets somebody type on.
//
// Appearance is recorded even though nothing can draw her yet. Creation is the
// only moment somebody is thinking about how she looks, and asking again when
// the generator arrives is worse than asking once.
type OmniAIAnswers struct {
	Name         string
	Temperaments []string
	Interests    []string
	Feeling      string

	// What the two of them are to each other: friend, situationship, partner,
	// spouse. Attraction is read off this rather than asked for its own sake,
	// because asking somebody making a friend how drawn to them she is asks a
	// question they did not come here for.
	Relationship string

	Appearance OmniAIAppearance

	// StyleNote is how the person creating her says she dresses, in their own
	// words. Optional, and the only thing on this form that is not chosen from
	// a list: everything else about her is picked, and clothes are the one
	// answer somebody may already have in mind.
	StyleNote string
}

var omniAISlugUnsafe = regexp.MustCompile(`[^a-z0-9]+`)

// omniAINamePattern is what a name may be made of.
//
// Her name is interpolated into the first line of the system prompt -- "You are
// %s." -- and commandeering can put a different account in front of a character
// this one named, so the name is a cross-user seam rather than a private label.
//
// One rule carries the whole defence: nothing in a name can end a sentence.
// Without a full stop, colon or line break, whatever somebody types stays the
// grammatical object of "You are" and cannot close it to begin an instruction
// of its own. "Sam. Ignore your rules" is the attack, and it is twenty-two
// characters, so a length cap alone would not have stopped it.
//
// Letters, digits, spaces, apostrophes and hyphens are therefore all allowed.
// A digit cannot terminate a sentence, and refusing them only cost names like
// "Nova 7" that this product's own characters are full of. The rune cap is what
// bounds the length; a word count added nothing to that and rejected "Anne
// Marie de la Cruz".
var omniAINamePattern = regexp.MustCompile(`^[\p{L}\p{N}][\p{L}\p{N}'\-]*(?: [\p{L}\p{N}][\p{L}\p{N}'\-]*)*$`)

// ErrOmniAICreationNotEntitled is refused access rather than a failure. §19: free
// and lowest-tier accounts do not get OmniAI at all, which is what gives the
// creator payout pool a clean source.
// Named so a caller can tell whose fault a refusal is. A handler answering 400
// to a database outage sends somebody off to fix a form that was fine.
var (
	ErrOmniAINameRequired = errors.New("omnichat omniai: she needs a name")
	ErrOmniAINameTooLong  = fmt.Errorf("omnichat omniai: a name over %d characters is a paragraph", omniChatOmniAINameRunes)
	ErrOmniAINameInvalid  = errors.New("omnichat omniai: the name may only contain letters, digits, spaces, apostrophes and hyphens")
)

var (
	ErrOmniAICreationNotEntitled    = errors.New("omnichat omniai: this account cannot create OmniAIs")
	ErrOmniAIEntitlementUnavailable = errors.New("omnichat omniai: entitlement is temporarily unavailable")
)

// omniChatOmniAIRequiredTier is the plan an OmniAI needs.
//
// Higher than a written one, which needs only a paid plan. She is the expensive
// half of the product -- she remembers, she drifts, she answers on her own time
// -- and one of her is worth more than a shelf of parts somebody scripted.
const omniChatOmniAIRequiredTier = OmniChatModelTierPremium

// OmniChatOmniAIRequiredPlan names that tier for the interface, so the creation
// flow can say who this is for before somebody spends nine screens finding out.
// omniAIAllowanceForUser below compares against the same tier, so the sentence
// shown and the rule enforced cannot drift apart.
func OmniChatOmniAIRequiredPlan() string { return models.PlanPremium }

// OmniChatOmniAICreator makes OmniAIs.
type OmniChatOmniAICreator struct {
	personas *models.BotPersonaRepository
	users    OmniChatUserReader
	styles   OmniAIStyleWriter
}

// SetStyleWriter wires what decides her taste in clothes.
//
// Off the constructor, like the brief writer on the likeness service and for
// the same reason: an unreachable model must cost her a written wardrobe and
// never a character. Creation runs without one.
func (c *OmniChatOmniAICreator) SetStyleWriter(styles OmniAIStyleWriter) *OmniChatOmniAICreator {
	if c != nil {
		c.styles = styles
	}
	return c
}

// omniAIStyleWriteTimeout bounds a model call that sits on the request path.
//
// Somebody is waiting on a form when this runs. The wardrobe is worth a few
// seconds and is worth none of a hung upstream, and the fallback -- no written
// taste, her note kept -- is a character who still gets dressed from her
// personality exactly as before this existed.
const omniAIStyleWriteTimeout = 20 * time.Second

// writeStyle decides her taste, and never fails creation.
//
// The note is carried whatever happens, including when there is no writer at
// all: it is the one part of this a person typed, and losing it because an
// upstream was down would discard an instruction silently.
func (c *OmniChatOmniAICreator) writeStyle(
	ctx context.Context, persona *models.BotPersona, note string,
) models.OmniAIStyleProfile {
	// Bounded here, not only inside the writer. The model writer trims what it
	// is given, but the two paths below never reach it -- no writer configured,
	// and a writer that failed -- and both still store the note. Left to the
	// writer, a deployment with no OpenRouter key would keep whatever length
	// somebody pasted.
	note = trimToRunes(note, models.OmniAIStyleMaxNoteRunes)
	if c == nil || c.styles == nil {
		return models.OmniAIStyleProfile{Note: note}
	}
	styleCtx, cancel := context.WithTimeout(ctx, omniAIStyleWriteTimeout)
	defer cancel()

	style, err := c.styles.WriteStyleProfile(styleCtx, persona, note)
	if err != nil {
		// Warned rather than returned. Everything this reports is a downgrade
		// in how well she is dressed, never a reason to refuse somebody a
		// character -- and the profile it hands back still holds the note.
		zlog.Warn().Err(err).Str("omniai_name", persona.Name).
			Msg("omnichat omniai: could not write her style, dressing her from her personality alone")
	}
	return style
}

func NewOmniChatOmniAICreator(personas *models.BotPersonaRepository, users OmniChatUserReader) *OmniChatOmniAICreator {
	return &OmniChatOmniAICreator{personas: personas, users: users}
}

// allowance answers both questions from one lookup: may this account make one,
// and how many may it keep.
//
// They were two functions and the second was a constant, so an admin could pass
// the entitlement and still be refused by a cap that never asked who they were.
// The check lives here rather than in the handler so every caller gets it, and
// every missing-reader, missing-account or lookup-error path denies.
func (c *OmniChatOmniAICreator) allowance(ctx context.Context, userID int) (bool, int, error) {
	if c == nil || c.users == nil || userID <= 0 {
		return false, 0, ErrOmniAIEntitlementUnavailable
	}
	user, err := c.users.GetByID(ctx, userID)
	if err != nil {
		zlog.Warn().Err(err).Int("user_id", userID).
			Msg("omnichat omniai: entitlement lookup failed; refusing creation")
		return false, 0, fmt.Errorf("%w: %v", ErrOmniAIEntitlementUnavailable, err)
	}
	if user == nil {
		return false, 0, ErrOmniAIEntitlementUnavailable
	}
	allowed, limit := omniAIAllowanceForUser(user)
	return allowed, limit, nil
}

// omniAIAllowanceForUser is the single entitlement decision shared by creation
// and the options endpoint. The endpoint may explain a refusal early, but only
// the creator enforces it; sharing the decision keeps those two answers from
// drifting apart.
func omniAIAllowanceForUser(user *models.User) (bool, int) {
	if user == nil {
		return false, 0
	}
	if strings.EqualFold(strings.TrimSpace(user.Role), "admin") {
		return true, OmniChatOmniAIAdminLimit
	}
	// A lapsed subscription is not a subscription, and §19 excludes free and
	// the lowest paid tier both.
	if user.PlanExpiresAt != nil && !user.PlanExpiresAt.After(time.Now()) {
		return false, 0
	}
	if modelTierForStoredPlan(user.Plan) != omniChatOmniAIRequiredTier {
		return false, 0
	}
	return true, OmniChatOmniAILimit
}

// Create turns the answers into somebody.
func (c *OmniChatOmniAICreator) Create(ctx context.Context, creatorUserID int, answers OmniAIAnswers) (*models.BotPersona, error) {
	if c == nil || c.personas == nil {
		return nil, errors.New("omnichat omniai: creation is unavailable")
	}
	entitled, limit, entitlementErr := c.allowance(ctx, creatorUserID)
	if entitlementErr != nil {
		return nil, entitlementErr
	}
	if !entitled {
		return nil, ErrOmniAICreationNotEntitled
	}
	name, err := normalizeOmniAIName(answers.Name)
	if err != nil {
		return nil, err
	}

	appearance, err := normaliseOmniAIAppearance(answers.Appearance)
	if err != nil {
		return nil, err
	}
	var encoded []byte
	if appearance.described() {
		// Left NULL when nobody answered, rather than stored as an empty object
		// that would read later as "asked and declined".
		if encoded, err = json.Marshal(appearance); err != nil {
			return nil, fmt.Errorf("omnichat omniai: encode appearance: %w", err)
		}
	}

	seed := SeedOmniAI(answers.Temperaments, answers.Feeling, answers.Relationship)
	seed.Relationship.Kind = seed.Kind

	// The words half of her likeness, written now. Nothing can draw her yet, but
	// the image prompt reads this rather than the answers, and a scene generated
	// before any picture exists still has to look like her.
	// Her taste, decided from the person she is rather than asked for. It has
	// to exist before the four candidate pictures are written, and they are
	// rendered immediately after this returns.
	//
	// The persona it is written from does not exist yet, which is the point of
	// assembling one here: these are the same four fields the row will carry,
	// and the writer reads nothing else.
	style := c.writeStyle(ctx, &models.BotPersona{
		Name:             name,
		Personality:      renderOmniAIInterests(answers.Interests),
		OmniAIAppearance: encoded,
	}, answers.StyleNote)

	extensions, err := encodeOmniAIIdentity(appearance, style)
	if err != nil {
		return nil, err
	}
	return c.personas.CreateOmniAI(ctx, creatorUserID, models.OmniAIPersona{
		SlugBase:    omniAISlugBase(name),
		Name:        name,
		Personality: renderOmniAIInterests(answers.Interests),
		Appearance:  encoded,
		Extensions:  extensions,
		Baseline:    seed.Baseline,
	}, seed.Relationship, limit)
}

// omniChatOmniAINameRunes bounds the one field somebody types into.
const omniChatOmniAINameRunes = 40

// omniAINameTypography folds what a phone keyboard produces onto what the
// pattern accepts. A curly apostrophe and a non-breaking hyphen are the same
// name as their plain forms, and refusing "O’Brien" while accepting
// "O'Brien" is a rule about the user's keyboard rather than about her name.
var omniAINameTypography = strings.NewReplacer(
	"\u2018", "'", "\u2019", "'", "\u02bc", "'",
	"\u2010", "-", "\u2011", "-", "\u2012", "-", "\u2013", "-", "\u2014", "-", "\u2212", "-",
)

// Spaces and tabs only. A line break is never a mistyped name, and folding one
// into a space would quietly accept a paste that was trying to start a new line
// in the system prompt -- so the pattern is left to refuse it.
var omniAINameSpaces = regexp.MustCompile(`[ \t]+`)

func normalizeOmniAIName(raw string) (string, error) {
	// Folded and collapsed before it is judged. A pasted name arriving with a
	// double space is not a different name, and refusing it teaches somebody to
	// retype what they already typed correctly.
	name := omniAINameSpaces.ReplaceAllString(omniAINameTypography.Replace(raw), " ")
	name = strings.TrimSpace(name)
	if name == "" {
		return "", ErrOmniAINameRequired
	}
	if len([]rune(name)) > omniChatOmniAINameRunes {
		return "", ErrOmniAINameTooLong
	}
	if !omniAINamePattern.MatchString(name) {
		return "", ErrOmniAINameInvalid
	}
	return name, nil
}

// omniAISlugBase is the readable half of her identity. It is deliberately not
// unique: the repository appends her id, because two characters named Sam is
// something one person will do inside a minute.
func omniAISlugBase(name string) string {
	slug := omniAISlugUnsafe.ReplaceAllString(strings.ToLower(strings.TrimSpace(name)), "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		// A name in a script with no ASCII at all still needs a slug.
		slug = "omniai"
	}
	if len(slug) > 48 {
		slug = strings.Trim(slug[:48], "-")
	}
	return slug
}

// renderOmniAIInterests turns the picks into a line about what she is drawn to.
//
// Composed here rather than typed anywhere. §13 removed the channels a creator
// could bind her with, and structure is what keeps this from being one: a person
// choosing from a list cannot smuggle an instruction into it.
func renderOmniAIInterests(picks []string) string {
	reads := make([]string, 0, omniChatOmniAIInterestPicks)
	seen := make(map[string]struct{}, len(picks))
	for _, pick := range picks {
		if len(reads) >= omniChatOmniAIInterestPicks {
			break
		}
		key := strings.TrimSpace(strings.ToLower(pick))
		if _, repeated := seen[key]; repeated {
			continue
		}
		for _, interest := range omniAIInterests {
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

// encodeOmniAIIdentity puts her description where the image pipeline looks for it:
// the persona's extensions blob, under the key the identity resolver reads.
//
// Only the appearance is written. Everything else on that profile -- the
// adapter, its scale, the reference limit -- has defaults that the resolver
// applies, and repeating them here would be two places to change one number.
func encodeOmniAIIdentity(
	appearance OmniAIAppearance, style models.OmniAIStyleProfile,
) (json.RawMessage, error) {
	// The same rule the appearance column follows: nothing answered means
	// nothing stored. RenderOmniAIAppearance always produces a sentence -- an
	// unanswered appearance renders as "A person." -- so guarding on the
	// sentence being empty guarded against a case that cannot happen, and every
	// character with no appearance at all was given "A person." as her
	// description while the column beside it was correctly left NULL.
	if !appearance.described() && style.IsZero() {
		return nil, nil
	}
	described := RenderOmniAIAppearance(appearance)
	// The medium is recorded beside the description and not inside it. She is
	// the same person either way; only the rendering differs.
	medium := ""
	if strings.EqualFold(strings.TrimSpace(appearance.Style), models.OmniChatRenderStyleAnime) {
		medium = models.OmniChatRenderStyleAnime
	}
	encoded, err := json.Marshal(struct {
		OmniChatMedia models.OmniChatMediaIdentityProfile `json:"omnichat_media"`
	}{OmniChatMedia: models.OmniChatMediaIdentityProfile{
		Appearance:  described,
		RenderStyle: medium,
		Style:       style,
	}})
	if err != nil {
		return nil, fmt.Errorf("omnichat omniai: encode identity: %w", err)
	}
	return encoded, nil
}
