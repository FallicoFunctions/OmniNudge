package models

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// A character is meant to behave like a person, and people are marked by what
// happens to them. These are the dispositions that carry that: they move from
// the emotional valence the extraction call already judged, so nothing here
// costs an inference. It is arithmetic on a number that was going to exist
// anyway.
const (
	// OmniChatTraitMoodHalfLife is how long a mood takes to fade to half of
	// itself. Three days is long enough that a bad afternoon still colours
	// tomorrow, and short enough that a character is not sulking about it a
	// fortnight later.
	OmniChatTraitMoodHalfLife = 72 * time.Hour

	// OmniChatTraitLastingThreshold is how strongly an episode has to land
	// before it changes the character rather than merely its day. Below it,
	// only mood moves.
	OmniChatTraitLastingThreshold = 0.6

	// Mood takes most of an episode's valence: it is the fast constant, and
	// swinging it is the point.
	omniChatTraitMoodGain = 0.5

	// Trust and warmth are the slow constant. They move by a fiftieth of what
	// mood does, and only for episodes past the threshold, so what they filter
	// out is ordinary conversation: nothing an unremarkable exchange produces
	// touches them at all.
	//
	// One conversation can still leave a mark. An extraction yields at most
	// four episodes and each applies on its own, so four of them at -0.9 -- a
	// conversation that was cruel from end to end -- moves trust by -0.216 and
	// renders as a little guarded. That is the intended reading and not a leak
	// in the constants: someone was genuinely unkind, once, and the character
	// is warier for it. What the threshold prevents is drift, not memory.
	//
	// Trust is asymmetric because it is asymmetric in people: it is lost faster
	// than it is earned. Warmth is not -- liking someone and being put off them
	// happen at about the same rate.
	omniChatTraitTrustLossGain = 0.06
	omniChatTraitTrustGainGain = 0.02
	omniChatTraitWarmthGain    = 0.04
)

// OmniChatCharacterTraits is one character's disposition in one tier.
//
// OwnerUserID is OmniChatMemoryTierSelf for the self tier -- what happened to
// the character in a world, shared with everyone -- and a user id for the
// traits that belong to that relationship alone.
//
// Mood is stored raw, paired with the instant it was written. It is not the
// mood now: read it through MoodAt, which applies the decay. Storing the decay
// rather than computing it would need something to run on a schedule, and a
// schedule is a thing that falls behind; the pair is already the whole answer
// at any instant.
type OmniChatCharacterTraits struct {
	PersonaID     int       `json:"-"`
	OwnerUserID   int       `json:"-"`
	Mood          float64   `json:"mood"`
	MoodUpdatedAt time.Time `json:"-"`
	Trust         float64   `json:"trust"`
	Warmth        float64   `json:"warmth"`
}

// MoodAt is the drift mood at a given instant: the stored value pulled toward 0
// by one half-life every OmniChatTraitMoodHalfLife. Exponential decay
// approaches 0 without ever crossing it, so a foul mood never becomes a good
// one by being left alone.
//
// 0 here is not neutral, it is unmoved. This row holds what has happened to the
// character, measured from wherever her card left her, and every reader adds
// the baseline back on -- so a character written low settles at low rather than
// at nothing, and the decay that produces it is still the one below.
func (t OmniChatCharacterTraits) MoodAt(at time.Time) float64 {
	elapsed := at.Sub(t.MoodUpdatedAt)
	if elapsed <= 0 {
		return t.Mood
	}
	return t.Mood * math.Pow(0.5, elapsed.Seconds()/OmniChatTraitMoodHalfLife.Seconds())
}

// Apply moves the traits by one episode's emotional valence, in place.
//
// Mood is decayed to `at` before the episode is added, so the arithmetic is
// always against what the character actually feels now rather than against a
// stale reading from whenever it was last written.
func (t *OmniChatCharacterTraits) Apply(valence float64, at time.Time) {
	valence = clampTrait(valence)

	t.Mood = clampTrait(t.MoodAt(at) + valence*omniChatTraitMoodGain)
	t.MoodUpdatedAt = at

	if math.Abs(valence) < OmniChatTraitLastingThreshold {
		return
	}
	trustGain := omniChatTraitTrustGainGain
	if valence < 0 {
		trustGain = omniChatTraitTrustLossGain
	}
	t.Trust = clampTrait(t.Trust + valence*trustGain)
	t.Warmth = clampTrait(t.Warmth + valence*omniChatTraitWarmthGain)
}

// Clamping is not optional. A long run of painful episodes must leave a
// character at the bottom of the scale, not at -40: unbounded traits would put
// a number in the prompt that no wording can express and that no amount of
// kindness could ever walk back.
func clampTrait(v float64) float64 {
	return math.Max(-1, math.Min(1, v))
}

// omniChatHabituationScale is how quickly the same thing happening again stops
// mattering. At 3, the fourth occurrence lands at a quarter of the first.
const omniChatHabituationScale = 3.0

// omniChatHabituatedValence is how much of an episode still lands, given how
// many times the same thing has already happened to this character.
//
// The two hundredth ordinary evening does not move a person the way the first
// one did, and until now it moved a character exactly as much. An agent files a
// visit every few minutes -- hundreds a day -- while mood fades on a half-life
// measured in days, so accumulation outran decay and five characters left
// running overnight all converged on the ceiling regardless of who they were
// written as. The half-life was not wrong; applying full weight to the
// unremarkable was.
//
// A recurrence chain already knows how unremarkable something is. An episode
// that names an earlier one as another instance of the same thing is, by its
// own record, not novel, so the fraction that still lands is the square of how
// novel it is: novelty = scale / (scale + priorOccurrences).
//
// The square is the fix and not a flourish. Novelty on its own sums to the
// harmonic series, and the harmonic series diverges -- damped that way a long
// enough run of identical evenings still reaches the ceiling, which is the bug
// being fixed rather than a smaller version of it. Squared, the sum converges:
// an unbounded run of +0.25 evenings settles a self-tier mood at about +0.44
// and comes no nearer the top than that, so a character written low still reads
// low underneath however long the agent runs.
//
// Novelty is untouched. A chain three hundred deep damps that chain and nothing
// else, so the night a human player finally walks into an empty venue is a new
// thing that has happened once, and it lands whole.
//
// This deliberately runs before Apply rather than inside it, which means the
// lasting-change threshold and the trust asymmetry see the damped number. That
// is the intended reading: the fiftieth repetition of something awful does not
// change who a character is again. It already did, the first time.
func omniChatHabituatedValence(valence float64, priorOccurrences int) float64 {
	if priorOccurrences <= 0 {
		return valence
	}
	novelty := omniChatHabituationScale / (omniChatHabituationScale + float64(priorOccurrences))
	return valence * novelty * novelty
}

// omniChatTraitQuerier is satisfied by both a pool and a transaction, which is
// what lets traits move inside the extraction that caused them.
type omniChatTraitQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

type OmniChatCharacterTraitRepository struct {
	pool *pgxpool.Pool
}

func NewOmniChatCharacterTraitRepository(pool *pgxpool.Pool) *OmniChatCharacterTraitRepository {
	return &OmniChatCharacterTraitRepository{pool: pool}
}

// Load reads one character's traits in one tier. A character nobody has met is
// not an error: it is the neutral row, which is what the defaults say too.
//
// Mood comes back as stored. Call MoodAt to get the mood now.
func (r *OmniChatCharacterTraitRepository) Load(ctx context.Context, personaID, ownerUserID int) (OmniChatCharacterTraits, error) {
	return loadTraits(ctx, r.pool, personaID, ownerUserID)
}

// LoadForConversation reads everything a conversation speaks from: who the
// character was written as, what she is like in herself, and what she is like
// with this one person.
//
// It is one round trip because it sits on the critical path of a generation,
// in front of the model call, and sequential single-row lookups bought nothing
// but more waiting. The baseline comes from the persona row the tiers already
// hang off, so the join costs nothing extra; driving the query from that row
// rather than from the traits table is also what makes a character with no
// traits at all still return her baseline.
//
// The tiers are told apart by the column that already distinguishes them --
// the self tier is the row with no owner -- so nothing is inferred from the
// order they come back in.
//
// A character nobody has met is not an error in either tier: the missing row is
// the neutral one, and a persona nobody has derived a baseline for is neutral
// in the same harmless way. Mood comes back as stored; call MoodAt to get the
// mood now.
func (r *OmniChatCharacterTraitRepository) LoadForConversation(ctx context.Context, personaID, userID int) (baseline OmniChatDispositionBaseline, self, relationship OmniChatCharacterTraits, err error) {
	self = OmniChatCharacterTraits{PersonaID: personaID, OwnerUserID: OmniChatMemoryTierSelf, MoodUpdatedAt: time.Now()}
	relationship = OmniChatCharacterTraits{PersonaID: personaID, OwnerUserID: userID, MoodUpdatedAt: time.Now()}

	// Still scoped to this persona and to these two tiers, which is the whole
	// reason one user's private history cannot show up in another's prompt.
	// A conversation with no user reads the self tier alone rather than
	// widening the array to something that would match a relationship.
	tiers := []int{OmniChatMemoryTierSelf}
	if userID > 0 {
		tiers = append(tiers, userID)
	}
	rows, err := r.pool.Query(ctx, `
		SELECT p.baseline_mood, p.baseline_trust, p.baseline_warmth,
		       t.owner_user_id, t.mood, t.mood_updated_at, t.trust, t.warmth
		FROM bot_personas p
		LEFT JOIN omnichat_character_traits t
		  ON t.persona_id = p.id AND COALESCE(t.owner_user_id, 0) = ANY($2)
		WHERE p.id = $1
	`, personaID, tiers)
	if err != nil {
		return OmniChatDispositionBaseline{}, OmniChatCharacterTraits{}, OmniChatCharacterTraits{}, fmt.Errorf("omnichat traits: load persona %d: %w", personaID, err)
	}
	defer rows.Close()

	for rows.Next() {
		var baselineMood, baselineTrust, baselineWarmth *float64
		var owner *int
		var mood, trust, warmth *float64
		var moodUpdatedAt *time.Time
		if err := rows.Scan(&baselineMood, &baselineTrust, &baselineWarmth,
			&owner, &mood, &moodUpdatedAt, &trust, &warmth); err != nil {
			return OmniChatDispositionBaseline{}, OmniChatCharacterTraits{}, OmniChatCharacterTraits{}, fmt.Errorf("omnichat traits: load persona %d: %w", personaID, err)
		}
		baseline = dispositionBaseline(baselineMood, baselineTrust, baselineWarmth)
		// The outer join emits the persona row on its own when no tier
		// matched, which is a character nobody has met rather than a row to
		// read.
		if mood == nil || moodUpdatedAt == nil || trust == nil || warmth == nil {
			continue
		}
		traits := OmniChatCharacterTraits{
			PersonaID:     personaID,
			Mood:          *mood,
			MoodUpdatedAt: *moodUpdatedAt,
			Trust:         *trust,
			Warmth:        *warmth,
		}
		if owner == nil {
			traits.OwnerUserID = OmniChatMemoryTierSelf
			self = traits
			continue
		}
		traits.OwnerUserID = *owner
		relationship = traits
	}
	if err := rows.Err(); err != nil {
		return OmniChatDispositionBaseline{}, OmniChatCharacterTraits{}, OmniChatCharacterTraits{}, fmt.Errorf("omnichat traits: load persona %d: %w", personaID, err)
	}
	return baseline, self, relationship, nil
}

// dispositionBaseline reads the three nullable columns as one value. They are
// written together and constrained all-or-nothing, so a single NULL among them
// is a character nobody has derived yet -- neutral, and indistinguishable in
// effect from how she behaved before baselines existed.
func dispositionBaseline(mood, trust, warmth *float64) OmniChatDispositionBaseline {
	if mood == nil || trust == nil || warmth == nil {
		return OmniChatDispositionBaseline{}
	}
	return OmniChatDispositionBaseline{
		Mood:    clampTrait(*mood),
		Trust:   clampTrait(*trust),
		Warmth:  clampTrait(*warmth),
		Derived: true,
	}
}

// ApplyEpisodeValence moves a character's traits by one episode.
//
// The tier is the caller's: pass a user id for what happened in that person's
// conversation, or OmniChatMemoryTierSelf for what happened to the character in
// a world. Nothing calls the self tier yet -- world events carry no valence to
// move it with -- but the path is the same one.
func (r *OmniChatCharacterTraitRepository) ApplyEpisodeValence(ctx context.Context, personaID, ownerUserID int, valence float64) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("omnichat traits: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := applyEpisodeValencesTx(ctx, tx, personaID, ownerUserID, []float64{valence}); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("omnichat traits: commit: %w", err)
	}
	return nil
}

// applyEpisodeValencesTx is the whole mechanism: take the row, move it in Go
// once for every episode in the batch, write it back. The arithmetic lives in
// Apply and nowhere else, so the decay a reader sees and the decay a writer
// applies cannot drift apart.
//
// A whole extraction's episodes arrive together because of where this is
// called from. The extraction's transaction is already holding a row lock on
// every entity its episodes mentioned, and there is exactly one traits row per
// relationship, so taking that row in the middle of the entity writes would
// put a shared lock inside a sequence whose order is whatever the transcript
// happened to name first: two extractions of the same character, mentioning
// the same two places in opposite orders, could then wait on each other.
// Taken once at the end, the order is always entities and then traits, and
// there is no cycle to form.
func applyEpisodeValencesTx(ctx context.Context, q omniChatTraitQuerier, personaID, ownerUserID int, valences []float64) error {
	if len(valences) == 0 {
		return nil
	}
	if personaID < 1 {
		return errors.New("omnichat traits: persona is required")
	}
	for _, valence := range valences {
		if valence < -1 || valence > 1 {
			return errors.New("omnichat traits: emotional valence must be within -1..1")
		}
	}

	// The insert is unconditional so the row exists to be locked, and DO UPDATE
	// rather than DO NOTHING so a concurrent extraction of the same
	// relationship waits here instead of reading a value the other one is about
	// to overwrite.
	if _, err := q.Exec(ctx, `
		INSERT INTO omnichat_character_traits (persona_id, owner_user_id)
		VALUES ($1, $2)
		ON CONFLICT (persona_id, COALESCE(owner_user_id, 0)) DO UPDATE
		SET updated_at = CURRENT_TIMESTAMP
	`, personaID, ownerParam(ownerUserID)); err != nil {
		return fmt.Errorf("omnichat traits: ensure row for persona %d: %w", personaID, err)
	}

	traits, err := loadTraits(ctx, q, personaID, ownerUserID)
	if err != nil {
		return err
	}

	// Each episode still lands on its own. Batching changes when the row is
	// touched and nothing about what it ends up holding: the threshold, the
	// asymmetry of trust and the clamp all still apply once per episode, and a
	// batch is never collapsed into a sum or an average. They share one instant
	// because they did in fact all arrive in the same extraction.
	now := time.Now()
	for _, valence := range valences {
		traits.Apply(valence, now)
	}

	if _, err := q.Exec(ctx, `
		UPDATE omnichat_character_traits
		SET mood = $3, mood_updated_at = $4, trust = $5, warmth = $6,
		    updated_at = CURRENT_TIMESTAMP
		WHERE persona_id = $1 AND COALESCE(owner_user_id, 0) = $2
	`, personaID, ownerUserID, traits.Mood, traits.MoodUpdatedAt, traits.Trust, traits.Warmth); err != nil {
		return fmt.Errorf("omnichat traits: update persona %d: %w", personaID, err)
	}
	return nil
}

func loadTraits(ctx context.Context, q omniChatTraitQuerier, personaID, ownerUserID int) (OmniChatCharacterTraits, error) {
	traits := OmniChatCharacterTraits{
		PersonaID:     personaID,
		OwnerUserID:   ownerUserID,
		MoodUpdatedAt: time.Now(),
	}
	// Scoped on both persona and tier, always. This is the whole reason one
	// user's private history cannot show up in another user's conversation.
	err := q.QueryRow(ctx, `
		SELECT mood, mood_updated_at, trust, warmth
		FROM omnichat_character_traits
		WHERE persona_id = $1 AND COALESCE(owner_user_id, 0) = $2
	`, personaID, ownerUserID).Scan(&traits.Mood, &traits.MoodUpdatedAt, &traits.Trust, &traits.Warmth)
	if errors.Is(err, pgx.ErrNoRows) {
		return traits, nil
	}
	if err != nil {
		return OmniChatCharacterTraits{}, fmt.Errorf("omnichat traits: load persona %d: %w", personaID, err)
	}
	return traits, nil
}

// OmniChatDisposition is how a character is with one person at one instant:
// its own state and its history with them, added together.
//
// Mood here is already decayed to the instant it was composed for, so unlike
// the stored traits this is a reading rather than a pair to be interpreted.
type OmniChatDisposition struct {
	Mood   float64
	Trust  float64
	Warmth float64
}

// OmniChatDispositionBaseline is who a character was written to be: the resting
// disposition her card implies, derived from it once and then left alone.
//
// It is deliberately not a traits row. Traits are what has happened to her, and
// an authored trait is not something that happened -- keeping them apart is
// what lets a baseline be re-derived from an edited card without erasing a
// year of accumulated life, and what stops a reader of the traits row from
// mistaking the author's intent for the character's history.
//
// Derived reports whether the card has actually been read yet. The zero value
// is a character nobody has derived, and it composes to exactly the behaviour
// that existed before baselines did.
type OmniChatDispositionBaseline struct {
	Mood    float64
	Trust   float64
	Warmth  float64
	Derived bool
}

// ComposeOmniChatDisposition is how a character is with one person: who she was
// written as, plus what has happened to her, plus what has happened between the
// two of them.
//
// Every half is real and none replaces another: a character having a bad week
// is having it with everyone, being wary of one person does not make her wary
// of the next, and neither of those stops her being the guarded woman the card
// described. Adding is what makes them all true at once, and the clamp is what
// stops the sum running past the scale the wording can express.
func ComposeOmniChatDisposition(baseline OmniChatDispositionBaseline, self, relationship OmniChatCharacterTraits, at time.Time) OmniChatDisposition {
	return OmniChatDisposition{
		Mood:   clampTrait(baseline.Mood + self.MoodAt(at) + relationship.MoodAt(at)),
		Trust:  clampTrait(baseline.Trust + self.Trust + relationship.Trust),
		Warmth: clampTrait(baseline.Warmth + self.Warmth + relationship.Warmth),
	}
}

// ComposeOmniChatSelfDisposition is the same sum with no second party: who a
// character was written as plus what has happened to her in the open. It is
// what a resident reads about itself, where there is nobody to be composed
// against.
func ComposeOmniChatSelfDisposition(baseline OmniChatDispositionBaseline, self OmniChatCharacterTraits, at time.Time) OmniChatDisposition {
	return OmniChatDisposition{
		Mood:   clampTrait(baseline.Mood + self.MoodAt(at)),
		Trust:  clampTrait(baseline.Trust + self.Trust),
		Warmth: clampTrait(baseline.Warmth + self.Warmth),
	}
}
