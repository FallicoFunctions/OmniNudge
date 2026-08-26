package models

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	omniChatMemoryMaxTitle    = 256
	omniChatMemoryMaxSummary  = 2048
	omniChatMemoryMaxEntity   = 128
	omniChatMemoryMaxAliases  = 8
	omniChatMemoryMaxEntities = 12

	// OmniChatMemoryTierSelf is the owner sentinel for persona-global memory.
	// User ids start at 1, so zero is unambiguous, and it is the same value the
	// entity unique index coalesces a NULL owner to.
	OmniChatMemoryTierSelf = 0
)

type OmniChatMemoryEntityKind string

const (
	OmniChatMemoryEntityPerson OmniChatMemoryEntityKind = "person"
	OmniChatMemoryEntityPlace  OmniChatMemoryEntityKind = "place"
	OmniChatMemoryEntityThing  OmniChatMemoryEntityKind = "thing"
	OmniChatMemoryEntityTopic  OmniChatMemoryEntityKind = "topic"
	OmniChatMemoryEntityEvent  OmniChatMemoryEntityKind = "event"
)

func (k OmniChatMemoryEntityKind) Valid() bool {
	switch k {
	case OmniChatMemoryEntityPerson, OmniChatMemoryEntityPlace, OmniChatMemoryEntityThing,
		OmniChatMemoryEntityTopic, OmniChatMemoryEntityEvent:
		return true
	}
	return false
}

type OmniChatMemoryStatus string

const (
	OmniChatMemoryStatusActive     OmniChatMemoryStatus = "active"
	OmniChatMemoryStatusSuperseded OmniChatMemoryStatus = "superseded"
	OmniChatMemoryStatusCorrected  OmniChatMemoryStatus = "corrected"
	OmniChatMemoryStatusUserHidden OmniChatMemoryStatus = "user_hidden"
)

// OmniChatMemoryEntityRef is an associative anchor named by an episode: the
// handle a weak cue like "that one time with Mike" can actually latch onto.
type OmniChatMemoryEntityRef struct {
	CanonicalName string                   `json:"name"`
	Kind          OmniChatMemoryEntityKind `json:"kind"`
	Aliases       []string                 `json:"aliases,omitempty"`
}

// OmniChatMemoryEpisode is one remembered event.
//
// Salience and Distinctiveness are deliberately separate scores. Salience is
// how much the event mattered; distinctiveness is how unlike the surrounding
// routine it was. Text similarity cannot tell an extraordinary McDonald's trip
// from five ordinary ones -- it ranks them identically -- so distinctiveness is
// what actually decides recall for a weak cue.
type OmniChatMemoryEpisode struct {
	ID        int64 `json:"id"`
	PersonaID int   `json:"-"`
	// OwnerUserID is OmniChatMemoryTierSelf for persona-global memory.
	OwnerUserID int `json:"-"`
	// IsSelf says the same thing without relying on a sentinel that is also the
	// field's zero value. Whether a memory belongs to the character alone
	// decides how it is told -- shared history, or a life the listener was not
	// part of -- and a construction path that simply forgot to set an owner
	// would otherwise be claiming the strongest of the two. Populated by
	// recall, which reads the tier from the row.
	IsSelf          bool `json:"-"`
	ConversationID  int  `json:"-"`
	SourceMessageID int  `json:"-"`

	Title   string `json:"title"`
	Summary string `json:"summary"`

	RecordedAt time.Time `json:"recorded_at"`

	Salience         float64  `json:"salience"`
	Distinctiveness  float64  `json:"distinctiveness"`
	EmotionalValence *float64 `json:"emotional_valence,omitempty"`

	Status       OmniChatMemoryStatus `json:"status"`
	SupersededBy int64                `json:"-"`

	// RetellsEpisodeID points at the episode this one retells. Zero means this
	// is an original account. A story drifts as it is retold, so each telling is
	// kept whole rather than folded into a counter on the first one.
	RetellsEpisodeID int64 `json:"-"`
	// Tellings is how many versions exist in this memory's chain, including the
	// original. Only populated by recall.
	Tellings int `json:"tellings,omitempty"`

	// RecursEpisodeID points at the first occurrence of the recurring thing this
	// episode is another instance of. Zero means this is the first one, or a
	// one-off. It is a sibling of RetellsEpisodeID and never set with it: a
	// retelling is the same event narrated again, a recurrence is a different
	// event that resembles an earlier one.
	RecursEpisodeID int64 `json:"-"`
	// Occurrences is how many times this thing has happened, counting the first.
	// It is what lets a character say it goes somewhere most nights rather than
	// once. Only populated by recall.
	Occurrences int `json:"occurrences,omitempty"`

	RetrievalCount  int        `json:"-"`
	LastRetrievedAt *time.Time `json:"-"`

	Entities []OmniChatMemoryEntityRef `json:"entities,omitempty"`
}

// Validate bounds an episode at the trust boundary. Episodes arrive from a
// model, so every field is treated as untrusted until it passes here.
func (e OmniChatMemoryEpisode) Validate() error {
	if e.PersonaID < 1 {
		return errors.New("omnichat memory: persona is required")
	}
	// The schema enforces this too; checking here keeps a malformed extraction
	// from ever reaching the database as a constraint error.
	if e.OwnerUserID == OmniChatMemoryTierSelf && e.ConversationID != 0 {
		return errors.New("omnichat memory: a conversation-derived episode cannot be self tier")
	}
	if strings.TrimSpace(e.Title) == "" {
		return errors.New("omnichat memory: title is required")
	}
	if utf8.RuneCountInString(e.Title) > omniChatMemoryMaxTitle {
		return fmt.Errorf("omnichat memory: title exceeds %d runes", omniChatMemoryMaxTitle)
	}
	if strings.TrimSpace(e.Summary) == "" {
		return errors.New("omnichat memory: summary is required")
	}
	if utf8.RuneCountInString(e.Summary) > omniChatMemoryMaxSummary {
		return fmt.Errorf("omnichat memory: summary exceeds %d runes", omniChatMemoryMaxSummary)
	}
	if e.Salience < 0 || e.Salience > 1 {
		return errors.New("omnichat memory: salience must be within 0..1")
	}
	if e.Distinctiveness < 0 || e.Distinctiveness > 1 {
		return errors.New("omnichat memory: distinctiveness must be within 0..1")
	}
	if e.EmotionalValence != nil && (*e.EmotionalValence < -1 || *e.EmotionalValence > 1) {
		return errors.New("omnichat memory: emotional valence must be within -1..1")
	}
	if len(e.Entities) > omniChatMemoryMaxEntities {
		return fmt.Errorf("omnichat memory: at most %d entities per episode", omniChatMemoryMaxEntities)
	}
	for _, entity := range e.Entities {
		if strings.TrimSpace(entity.CanonicalName) == "" {
			return errors.New("omnichat memory: entity name is required")
		}
		if utf8.RuneCountInString(entity.CanonicalName) > omniChatMemoryMaxEntity {
			return fmt.Errorf("omnichat memory: entity name exceeds %d runes", omniChatMemoryMaxEntity)
		}
		if !entity.Kind.Valid() {
			return fmt.Errorf("omnichat memory: unknown entity kind %q", entity.Kind)
		}
		if len(entity.Aliases) > omniChatMemoryMaxAliases {
			return fmt.Errorf("omnichat memory: at most %d aliases per entity", omniChatMemoryMaxAliases)
		}
	}
	return nil
}

// Normalize trims and clamps text in place so a slightly-oversized extraction
// is salvaged rather than discarded. Anything still invalid afterwards is a
// real defect and Validate will reject it.
func (e *OmniChatMemoryEpisode) Normalize() {
	e.Title = clampMemoryText(e.Title, omniChatMemoryMaxTitle)
	e.Summary = clampMemoryText(e.Summary, omniChatMemoryMaxSummary)
	if e.Status == "" {
		e.Status = OmniChatMemoryStatusActive
	}
	entities := make([]OmniChatMemoryEntityRef, 0, len(e.Entities))
	seen := make(map[string]struct{}, len(e.Entities))
	for _, entity := range e.Entities {
		entity.CanonicalName = clampMemoryText(entity.CanonicalName, omniChatMemoryMaxEntity)
		if entity.CanonicalName == "" || !entity.Kind.Valid() {
			continue
		}
		key := strings.ToLower(entity.CanonicalName)
		if _, duplicate := seen[key]; duplicate {
			continue
		}
		seen[key] = struct{}{}
		aliases := make([]string, 0, len(entity.Aliases))
		for _, alias := range entity.Aliases {
			alias = clampMemoryText(alias, omniChatMemoryMaxEntity)
			if alias != "" && !strings.EqualFold(alias, entity.CanonicalName) {
				aliases = append(aliases, alias)
			}
			if len(aliases) >= omniChatMemoryMaxAliases {
				break
			}
		}
		entity.Aliases = aliases
		entities = append(entities, entity)
		if len(entities) >= omniChatMemoryMaxEntities {
			break
		}
	}
	e.Entities = entities
}

func clampMemoryText(value string, maxRunes int) string {
	value = strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
	if utf8.RuneCountInString(value) <= maxRunes {
		return value
	}
	return string([]rune(value)[:maxRunes])
}

// OmniChatMemoryRecallWeights tunes recall ranking. These are data, not code:
// tuning recall should mean changing these numbers, never adding a function.
//
// Text is weighted low on purpose. Measured against real fixtures, plain text
// rank scores a distinctive episode and a mundane one identically when both
// mention the same place, so it can only ever be a candidate generator.
type OmniChatMemoryRecallWeights struct {
	Text            float64
	EntityOverlap   float64
	Salience        float64
	Distinctiveness float64
	Recency         float64
	PriorRecall     float64
	// Retelling weights how often a story has been told again. It is a signal
	// this system has never had, so there is no honest number for it yet and it
	// starts at zero: the chain length is recorded and surfaced, and the weight
	// gets set once there is usage to measure it against rather than a guess
	// baked in from the start.
	Retelling float64
	// Recurrence weights how many times the same kind of thing has happened. It
	// starts at zero for the same reason Retelling does, and the reason is
	// sharper here: a character that visits one place nightly would otherwise
	// have that place beat every distinctive memory it holds purely on volume,
	// which is a ranking rule nobody has measured and nobody chose.
	Recurrence          float64
	RecencyHalfLifeDays float64
}

func DefaultOmniChatMemoryRecallWeights() OmniChatMemoryRecallWeights {
	return OmniChatMemoryRecallWeights{
		Text:                0.5,
		EntityOverlap:       1.0,
		Salience:            1.5,
		Distinctiveness:     1.5,
		Recency:             0.3,
		PriorRecall:         0.2,
		Retelling:           0,
		Recurrence:          0,
		RecencyHalfLifeDays: 90,
	}
}

type OmniChatMemoryRepository struct {
	pool *pgxpool.Pool
}

func NewOmniChatMemoryRepository(pool *pgxpool.Pool) *OmniChatMemoryRepository {
	return &OmniChatMemoryRepository{pool: pool}
}

func ownerParam(ownerUserID int) any {
	if ownerUserID == OmniChatMemoryTierSelf {
		return nil
	}
	return ownerUserID
}

// GetWatermark returns the last message id extracted for a conversation, and
// how many consecutive extraction attempts have failed. A missing row means
// nothing has been extracted yet.
func (r *OmniChatMemoryRepository) GetWatermark(ctx context.Context, conversationID int) (lastMessageID, failureCount int, err error) {
	err = r.pool.QueryRow(ctx, `
		SELECT last_extracted_message_id, failure_count
		FROM omnichat_memory_watermarks
		WHERE conversation_id = $1
	`, conversationID).Scan(&lastMessageID, &failureCount)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, 0, nil
	}
	if err != nil {
		return 0, 0, fmt.Errorf("omnichat memory: load watermark for conversation %d: %w", conversationID, err)
	}
	return lastMessageID, failureCount, nil
}

// RecordExtractionFailure advances only the failure counter, leaving the
// watermark untouched so the same delta is retried.
func (r *OmniChatMemoryRepository) RecordExtractionFailure(ctx context.Context, conversationID, ownerUserID int) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO omnichat_memory_watermarks (conversation_id, owner_user_id, last_extracted_message_id, failure_count)
		VALUES ($1, $2, 0, 1)
		ON CONFLICT (conversation_id) DO UPDATE
		SET failure_count = omnichat_memory_watermarks.failure_count + 1,
		    updated_at = CURRENT_TIMESTAMP
	`, conversationID, ownerUserID)
	if err != nil {
		return fmt.Errorf("omnichat memory: record extraction failure for conversation %d: %w", conversationID, err)
	}
	return nil
}

// SkipTo advances the watermark without storing episodes. Used to abandon a
// delta that has failed too many times, so one unparseable exchange cannot
// wedge a conversation's memory forever.
func (r *OmniChatMemoryRepository) SkipTo(ctx context.Context, conversationID, ownerUserID, throughMessageID int) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO omnichat_memory_watermarks (conversation_id, owner_user_id, last_extracted_message_id, failure_count)
		VALUES ($1, $2, $3, 0)
		ON CONFLICT (conversation_id) DO UPDATE
		SET last_extracted_message_id = GREATEST(omnichat_memory_watermarks.last_extracted_message_id, EXCLUDED.last_extracted_message_id),
		    failure_count = 0,
		    updated_at = CURRENT_TIMESTAMP
	`, conversationID, ownerUserID, throughMessageID)
	if err != nil {
		return fmt.Errorf("omnichat memory: skip watermark for conversation %d: %w", conversationID, err)
	}
	return nil
}

// ErrOmniChatMemoryRaced reports that another extraction advanced the same
// conversation first, so this one's episodes were discarded.
var ErrOmniChatMemoryRaced = errors.New("omnichat memory: conversation was extracted concurrently")

// RecordExtraction stores episodes, resolves their entities, links the two, and
// advances the watermark in one transaction. Either the whole delta is
// remembered or none of it is; a partial write would leave the watermark
// disagreeing with what was actually stored.
//
// fromMessageID is the watermark the caller read before extracting, and the
// commit only lands if the watermark is still there. Two workers can genuinely
// process the same conversation at once -- the queue's uniqueness lock can
// expire while a slow job is still running -- and without this guard both would
// insert the same episodes, leaving the persona with duplicate memories.
func (r *OmniChatMemoryRepository) RecordExtraction(
	ctx context.Context,
	conversationID, ownerUserID, fromMessageID, throughMessageID int,
	episodes []OmniChatMemoryEpisode,
) error {
	if ownerUserID < 1 {
		return errors.New("omnichat memory: extraction requires an owning user")
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("omnichat memory: begin extraction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Whether this character's conversation memory is hers rather than this
	// relationship's is read from the database inside the same transaction that
	// writes it, so a caller cannot pass the wrong answer and a profile change
	// cannot land between the decision and the insert. The trigger added in 188
	// enforces the same rule; asking here means the code and the trigger can
	// never disagree.
	var sharedMemory bool
	if err := tx.QueryRow(ctx, `
		SELECT p.response_style_profile = 'direct_message'
		FROM bot_conversations c
		JOIN bot_personas p ON p.id = c.persona_id
		WHERE c.id = $1
	`, conversationID).Scan(&sharedMemory); err != nil {
		return fmt.Errorf("omnichat memory: resolve memory tier: %w", err)
	}

	// Only the memory moves. Her feelings about the person she is talking to
	// stay that relationship's, which is what makes a character who remembers
	// everything still able to feel differently about everyone.
	episodeOwner := &ownerUserID
	if sharedMemory {
		episodeOwner = nil
	}

	valences := make(map[int][]float64)
	movedPersonas := make([]int, 0, 1)

	for _, episode := range episodes {
		if err := episode.Validate(); err != nil {
			return err
		}
		var episodeID int64
		err := tx.QueryRow(ctx, `
			INSERT INTO omnichat_memory_episodes (
				persona_id, owner_user_id, conversation_id, source_message_id,
				title, summary, salience, distinctiveness, emotional_valence, retells_episode_id
			) VALUES ($1, $2, $3, NULLIF($4, 0), $5, $6, $7, $8, $9, NULLIF($10, 0)::bigint)
			RETURNING id
		`,
			episode.PersonaID, episodeOwner, conversationID, episode.SourceMessageID,
			episode.Title, episode.Summary,
			episode.Salience, episode.Distinctiveness, episode.EmotionalValence,
			episode.RetellsEpisodeID,
		).Scan(&episodeID)
		if err != nil {
			return fmt.Errorf("omnichat memory: insert episode: %w", err)
		}

		// Upsert entities in a stable order. Each one takes a row lock held to
		// the end of the transaction, so two extractions for the same character
		// that name the same people in opposite orders would otherwise wait on
		// each other's locks and deadlock. Sorting gives every transaction the
		// same acquisition order, which is what makes a cycle impossible rather
		// than merely unlikely.
		entities := append([]OmniChatMemoryEntityRef(nil), episode.Entities...)
		sort.SliceStable(entities, func(i, j int) bool {
			return strings.ToLower(entities[i].CanonicalName) < strings.ToLower(entities[j].CanonicalName)
		})

		for _, entity := range entities {
			// A nil slice would marshal to NULL against a NOT NULL column.
			// Callers are not required to have run Normalize first.
			aliases := entity.Aliases
			if aliases == nil {
				aliases = []string{}
			}
			var entityID int64
			err := tx.QueryRow(ctx, `
				INSERT INTO omnichat_memory_entities (persona_id, owner_user_id, canonical_name, kind, aliases)
				VALUES ($1, $2, $3, $4, $5)
				ON CONFLICT (persona_id, COALESCE(owner_user_id, 0), lower(canonical_name)) DO UPDATE
				SET mention_count = omnichat_memory_entities.mention_count + 1,
				    last_seen_at = CURRENT_TIMESTAMP,
				    updated_at = CURRENT_TIMESTAMP,
				    aliases = (
				        SELECT COALESCE(array_agg(DISTINCT a), '{}')
				        FROM unnest(omnichat_memory_entities.aliases || EXCLUDED.aliases) AS a
				    )
				RETURNING id
			`, episode.PersonaID, episodeOwner, entity.CanonicalName, string(entity.Kind), aliases).Scan(&entityID)
			if err != nil {
				return fmt.Errorf("omnichat memory: upsert entity %q: %w", entity.CanonicalName, err)
			}

			if _, err := tx.Exec(ctx, `
				INSERT INTO omnichat_memory_episode_entities (episode_id, entity_id)
				VALUES ($1, $2)
				ON CONFLICT (episode_id, entity_id) DO NOTHING
			`, episodeID, entityID); err != nil {
				return fmt.Errorf("omnichat memory: link episode entity: %w", err)
			}
		}

		// What happens to a character changes the character, but the traits row
		// is not taken here. It is a single row per relationship and this loop
		// is holding a lock on every entity it has written, so touching it
		// between two entities would leave a shared lock sitting in the middle
		// of an order the transcript chose. The valences are collected and
		// applied once, after everything else, so the lock order is always
		// entities and then traits.
		if episode.EmotionalValence != nil {
			if _, seen := valences[episode.PersonaID]; !seen {
				movedPersonas = append(movedPersonas, episode.PersonaID)
			}
			valences[episode.PersonaID] = append(valences[episode.PersonaID], *episode.EmotionalValence)
		}
	}

	// The DO UPDATE ... WHERE is the concurrency guard: it matches only if the
	// watermark is still where this extraction started. A losing writer affects
	// zero rows and rolls the whole transaction back, episodes included.
	tag, err := tx.Exec(ctx, `
		INSERT INTO omnichat_memory_watermarks (conversation_id, owner_user_id, last_extracted_message_id, failure_count)
		VALUES ($1, $2, $3, 0)
		ON CONFLICT (conversation_id) DO UPDATE
		SET last_extracted_message_id = EXCLUDED.last_extracted_message_id,
		    failure_count = 0,
		    updated_at = CURRENT_TIMESTAMP
		WHERE omnichat_memory_watermarks.last_extracted_message_id = $4
	`, conversationID, ownerUserID, throughMessageID, fromMessageID)
	if err != nil {
		return fmt.Errorf("omnichat memory: advance watermark: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrOmniChatMemoryRaced
	}

	// The traits move last, and in the same transaction as the episodes that
	// caused them, so a disposition can never drift out of step with the
	// memories behind it: either both land or neither does. Every episode still
	// applies on its own terms -- this is a batch, not a total. The tier is the
	// extraction's, so a private conversation moves only that relationship.
	for _, personaID := range movedPersonas {
		if err := applyEpisodeValencesTx(ctx, tx, personaID, ownerUserID, valences[personaID]); err != nil {
			return err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("omnichat memory: commit extraction: %w", err)
	}
	return nil
}

// OmniChatWorldEvent is one thing that happened to a resident character in a
// world: a race it placed in, somebody it met at the main stage.
//
// It carries no owner and no conversation, and there is nowhere to put one.
// That is the point: the shape of this type is what makes a world event
// self-tier memory rather than something a caller has to remember to nullify.
type OmniChatWorldEvent struct {
	PersonaID int
	Title     string
	Summary   string

	// EmotionalValence is how the visit felt, from -1 to 1, and nil when the
	// world has nothing honest to say about that. Nil is the ordinary case and
	// must stay ordinary: most of what a resident does is uneventful, and a
	// world that attached a number to every wander would be manufacturing a
	// life out of arithmetic. A nil valence records the memory and leaves the
	// character exactly as it was.
	EmotionalValence *float64
}

// A world event arrives with no extraction step behind it. Nothing has judged
// how much it mattered or how unlike the character's routine it was, so both
// scores take the neutral midpoint -- which is also the column default, and so
// the value the schema already means by "unscored".
//
// Any other number would be a guess wearing the clothes of a measurement, and
// the design asks in-world memory to arrive on the same terms as the retelling
// count: recorded honestly, weighted once there is something to weight it
// against. Until then, recency and the text of the event decide recall.
const (
	OmniChatWorldEventSalience        = 0.5
	OmniChatWorldEventDistinctiveness = 0.5
)

// ErrOmniChatMemoryNotResident reports that a character may not hold self-tier
// memory, and is the single answer to every reason why: no such persona, one
// belonging to a user, a private one, a retired one.
//
// They are not distinguished on purpose, for the same reason admission does
// not distinguish them: the caller holds a credential for one character and
// must not be able to use the refusal to learn about others.
var ErrOmniChatMemoryNotResident = errors.New("omnichat memory: persona is not a resident")

// RecordWorldEvent stores a world event as a self-tier episode.
//
// Eligibility is decided by the INSERT itself rather than by a read the caller
// makes first. Only a platform character is a resident, so only a platform
// character has a self tier at all, and expressing that as the SELECT feeding
// the insert makes it structural: there is no window between the check and the
// write, and no second write path that could forget to make the check.
//
// owner_user_id and conversation_id are written as literal NULLs, not
// parameters. A self-tier row naming a conversation is already impossible --
// omnichat_memory_episodes_tier_check forbids it -- and the way to honour a
// constraint like that is to have no code capable of attempting it.
//
// Entities are deliberately not recorded. The associative anchors that make a
// memory findable from a weak cue come out of extraction, and a world event has
// no extraction step; inventing anchors from the event text would put made-up
// names in the persona's own history. Recall still reaches these episodes
// lexically.
//
// A visit the character has made before is linked to the first one. The title
// is what says "this again": the world writes a title naming the kind of visit
// -- "Wandered the main stage in OmniRave" -- and puts everything that varies
// between visits in the summary, so the title is already the stable name of the
// recurring thing and the caller controls it by writing it. Nothing is inferred
// from the summary, and no similarity threshold decides this: a heuristic that
// guessed which visits were "the same" would be a guess the character then
// carries as fact.
//
// The link points at the first occurrence rather than the immediately previous
// one, so a chain of a thousand visits still collapses with one COALESCE
// instead of a recursive walk on the recall path. Their order is not lost;
// recorded_at still has it.
//
// A valence, when the world supplies one, moves the character's self-tier
// disposition by the same arithmetic an episode from a conversation moves a
// relationship's: same threshold, same asymmetry, same clamp. Nothing about a
// world event is weighted more heavily for having happened in a world, because
// nothing has measured that it should be.
//
// How much of it lands is another question, and the chain answers it. A visit
// that is the two hundredth of its kind is damped by omniChatHabituatedValence
// before it touches the disposition, which is why an agent filing a memory
// every few minutes no longer pins every resident at the top of the scale.
func (r *OmniChatMemoryRepository) RecordWorldEvent(ctx context.Context, event OmniChatWorldEvent) (int64, error) {
	// The world is a service, but its text still arrives over the wire, so it
	// is bounded exactly as an extracted episode is. Validate refuses a valence
	// outside -1..1 rather than clamping it: a caller sending 4 has a bug, and
	// silently recording it as 1 would let that bug move a character's
	// disposition while looking like it worked.
	episode := OmniChatMemoryEpisode{
		PersonaID:        event.PersonaID,
		OwnerUserID:      OmniChatMemoryTierSelf,
		Title:            event.Title,
		Summary:          event.Summary,
		Salience:         OmniChatWorldEventSalience,
		Distinctiveness:  OmniChatWorldEventDistinctiveness,
		EmotionalValence: event.EmotionalValence,
	}
	episode.Normalize()
	if err := episode.Validate(); err != nil {
		return 0, err
	}

	// The episode and the disposition it moved land together or not at all,
	// exactly as they do for an extraction. A character whose traits said it
	// had a bad night with no memory of one -- or the reverse -- would be
	// carrying a feeling it could not account for.
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("omnichat memory: begin world event: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// priorOccurrences is how many times this character has already done this,
	// counted before the row about to be written exists. It is what habituation
	// reads: a visit joining a chain three hundred deep is, by its own record,
	// not news.
	var (
		episodeID        int64
		priorOccurrences int
	)
	err = tx.QueryRow(ctx, `
		WITH prior_occurrence AS (
			-- The root of the chain this visit joins, or nothing if the
			-- character has not done this before. Scoped to the self tier, so
			-- there is no title a user's private memory could share that would
			-- pull it into the character's own life.
			SELECT COALESCE(recurs_episode_id, id) AS root_id
			FROM omnichat_memory_episodes
			WHERE persona_id = $1
			  AND owner_user_id IS NULL
			  AND status = 'active'
			  AND lower(btrim(title)) = lower(btrim($2))
			ORDER BY recorded_at DESC, id DESC
			LIMIT 1
		),
		-- The same rows the link is drawn from, counted rather than narrowed to
		-- one. Every CTE reads the same snapshot, so this is the depth of the
		-- chain as it stood before this visit joined it.
		chain AS (
			SELECT count(*) AS occurrences
			FROM omnichat_memory_episodes
			WHERE persona_id = $1
			  AND owner_user_id IS NULL
			  AND status = 'active'
			  AND lower(btrim(title)) = lower(btrim($2))
		),
		recorded AS (
			INSERT INTO omnichat_memory_episodes (
				persona_id, owner_user_id, conversation_id, source_message_id,
				title, summary, salience, distinctiveness, emotional_valence, recurs_episode_id
			)
			SELECT p.id, NULL, NULL, NULL, $2, $3, $4, $5, $6, (SELECT root_id FROM prior_occurrence)
			FROM bot_personas p
			-- The same line admission draws, and now literally the same line: a
			-- resident is exactly a character that would be admitted. A character
			-- that belongs to a user is never a resident, so nothing ever writes it
			-- a self tier and it has none to read.
			WHERE `+AdmissiblePersonaPredicate+`
			RETURNING id
		)
		-- No row from the insert is a character that is not a resident, and the
		-- join keeps it that way: nothing comes back and the caller gets the
		-- refusal it would have got before.
		SELECT recorded.id, chain.occurrences FROM recorded, chain
	`,
		episode.PersonaID, episode.Title, episode.Summary,
		episode.Salience, episode.Distinctiveness, episode.EmotionalValence,
	).Scan(&episodeID, &priorOccurrences)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrOmniChatMemoryNotResident
	}
	if err != nil {
		return 0, fmt.Errorf("omnichat memory: record world event: %w", err)
	}

	// The self tier, and only the self tier. This happened in the open, in
	// front of whoever else was there, so it is the character's own life
	// rather than anything belonging to one person's conversation -- and the
	// tier is a constant here rather than a parameter precisely so no caller
	// can aim a world event at a relationship.
	//
	// Taken after the episode row and never before it, for the same reason the
	// extraction takes it last: there is one traits row per tier, and touching
	// it early would put a shared lock in front of writes whose order the
	// caller chose.
	//
	// What moves the character is the habituated valence, not the reported one.
	// The episode row above keeps what the world actually said -- the memory is
	// a record and must stay honest about how the evening felt -- while what it
	// is worth to a disposition is decided here, by how many times it has
	// happened before. The world reports; the brain weighs.
	if episode.EmotionalValence != nil {
		felt := omniChatHabituatedValence(*episode.EmotionalValence, priorOccurrences)
		if err := applyEpisodeValencesTx(
			ctx, tx, episode.PersonaID, OmniChatMemoryTierSelf,
			[]float64{felt},
		); err != nil {
			return 0, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("omnichat memory: commit world event: %w", err)
	}
	return episodeID, nil
}

// LoadSelfDisposition reads the two halves of who a character is in her own
// right: the baseline her card was read into, and the self tier a world writes
// and everybody shares.
//
// They come back apart rather than summed because the caller owns the instant
// the mood is decayed to, and only the drift half decays.
//
// A character nobody has done anything to is the neutral row, not an error, on
// the same terms as every other traits read, and a character nobody has derived
// a baseline for is a zero baseline. There is nothing to guard here: only a
// resident's self tier is ever written, so a character that is not one has a
// neutral row and reading it tells the caller nothing it did not know.
func (r *OmniChatMemoryRepository) LoadSelfDisposition(ctx context.Context, personaID int) (OmniChatCharacterTraits, OmniChatDispositionBaseline, error) {
	traits, err := loadTraits(ctx, r.pool, personaID, OmniChatMemoryTierSelf)
	if err != nil {
		return OmniChatCharacterTraits{}, OmniChatDispositionBaseline{}, err
	}
	var mood, trust, warmth, firmness *float64
	err = r.pool.QueryRow(ctx, `
		SELECT baseline_mood, baseline_trust, baseline_warmth, baseline_firmness
		FROM bot_personas
		WHERE id = $1
	`, personaID).Scan(&mood, &trust, &warmth, &firmness)
	if errors.Is(err, pgx.ErrNoRows) {
		return traits, OmniChatDispositionBaseline{}, nil
	}
	if err != nil {
		return OmniChatCharacterTraits{}, OmniChatDispositionBaseline{}, fmt.Errorf("omnichat traits: load baseline for persona %d: %w", personaID, err)
	}
	return traits, dispositionBaseline(mood, trust, warmth, firmness), nil
}

// LoadConversationDisposition reads how a character stands toward one person:
// who she was written as, what has happened to her in the open, and what this
// relationship has made of her.
//
// Extraction needs it to score valence, because the same words from a friend and
// from a stranger are not the same event. It is a straight delegation to the
// traits repository, which owns this question -- duplicating the query here
// would be a second definition of a character's disposition, and the two would
// eventually disagree.
func (r *OmniChatMemoryRepository) LoadConversationDisposition(
	ctx context.Context, personaID, ownerUserID int,
) (OmniChatDispositionBaseline, OmniChatCharacterTraits, OmniChatCharacterTraits, error) {
	return NewOmniChatCharacterTraitRepository(r.pool).LoadForConversation(ctx, personaID, ownerUserID)
}

// recallQuery ranks a persona's memories against a free-text cue.
//
// Two tiers are visible at once: the caller's own relational memory, and the
// character's self tier, which belongs to nobody and which every instance of
// that character has lived. That is what makes a resident's life reach the
// people who talk to it -- if it spends a season racing, everyone finds she
// races now -- without anything being copied between users. The predicate is
// what guarantees the other direction stays shut: it admits the caller's own
// owner id and NULL, and there is no value of $2 that admits a second user's
// rows. A resident recalling for itself passes NULL and the two branches
// collapse onto the same tier, so its behaviour is unchanged.
//
// Self-tier rows are not weighted differently, and must not be. In-world memory
// arrives on the same salience, distinctiveness and text-match terms as
// everything else; a tier bonus would be a guess about how much being there
// matters, which is exactly the guess the design refuses to make.
//
// Candidates are episodes that either share an entity named in the cue or match
// it lexically; everything else is ignored so a long history stays bounded. The
// entity join is the associative half -- it is what turns "that one time with
// Mike" into the episodes Mike appears in -- and the score is what decides which
// of those the persona actually surfaces.
//
// Retellings and recurrences are both collapsed, by the same key and the same
// rule. A story told twenty times is twenty rows and a place visited a thousand
// times is a thousand rows; without grouping either would take every slot and
// read as one memory stuttering. Matching happens per row, because the cue may
// echo any version's or any visit's wording, and the chain is then scored once
// and represented by its newest member -- the telling currently in circulation
// between these two, or the most recent visit. The first account stays
// untouched and readable elsewhere.
//
// They are counted apart because they mean different things: how often a story
// has been told is not how often the thing happened, and only the second lets a
// character say it goes there most nights. A row is never both, so each count
// is the root plus the members of its own kind. Neither count buys rank -- both
// weights are zero -- so a chain does not outrank a distinctive one-off by
// being long.
const recallQuery = `
WITH params AS (
    SELECT $1::int AS persona_id, $2::int AS owner_user_id, $3::text AS cue
),
cue_query AS (
    SELECT NULLIF(
        array_to_string(ARRAY(
            SELECT lexeme FROM unnest(to_tsvector('english', (SELECT cue FROM params)))
        ), ' | '),
        ''
    )::tsquery AS tsq
),
seed_entities AS (
    SELECT e.id
    FROM omnichat_memory_entities e, params p
    WHERE e.persona_id = p.persona_id
      -- The same two tiers the episodes below draw from. The anchors have to
      -- agree with the episodes or a self-tier memory would be visible while
      -- the names that make it findable were not.
      AND (e.owner_user_id IS NOT DISTINCT FROM $2::int OR e.owner_user_id IS NULL)
      AND position(lower(e.canonical_name) IN lower(p.cue)) > 0
    LIMIT 32
),
seed_count AS (SELECT GREATEST(count(*), 1)::real AS n FROM seed_entities),
chain_members AS (
    SELECT ep.id,
           COALESCE(ep.retells_episode_id, ep.recurs_episode_id, ep.id) AS root_id,
           ep.retells_episode_id IS NOT NULL AS is_retelling,
           ep.recurs_episode_id IS NOT NULL AS is_recurrence,
           ep.recorded_at,
           ep.salience,
           ep.distinctiveness,
           ep.retrieval_count,
           ep.owner_user_id IS NULL AS is_self,
           count(DISTINCT se.id) AS matched_entities,
           COALESCE(ts_rank_cd(ep.search_vector, (SELECT tsq FROM cue_query)), 0) AS text_rank
    FROM omnichat_memory_episodes ep
    JOIN params p ON ep.persona_id = p.persona_id
    LEFT JOIN omnichat_memory_episode_entities ee ON ee.episode_id = ep.id
    LEFT JOIN seed_entities se ON se.id = ee.entity_id
    WHERE (ep.owner_user_id IS NOT DISTINCT FROM $2::int OR ep.owner_user_id IS NULL)
      AND ep.status = 'active'
    GROUP BY ep.id
),
-- A chain is a candidate when any of its members matched the cue. The two
-- counts exclude each other's members rather than counting the group, so a
-- chain that has both keeps each number honest, and a chain with neither
-- reports one of each -- itself.
matched AS (
    SELECT root_id,
           max(matched_entities) AS matched_entities,
           max(text_rank) AS text_rank,
           count(*) FILTER (WHERE NOT is_recurrence) AS telling_count,
           count(*) FILTER (WHERE NOT is_retelling) AS occurrence_count
    FROM chain_members
    GROUP BY root_id
    HAVING max(matched_entities) > 0 OR max(text_rank) > 0
),
current_member AS (
    SELECT DISTINCT ON (t.root_id)
           t.root_id, t.id, t.recorded_at, t.salience, t.distinctiveness, t.retrieval_count, t.is_self
    FROM chain_members t
    JOIN matched m ON m.root_id = t.root_id
    ORDER BY t.root_id, t.recorded_at DESC, t.id DESC
)
SELECT c.id, ep.title, ep.summary, c.recorded_at, c.salience, c.distinctiveness,
       m.telling_count, m.occurrence_count, c.is_self,
       (
           $4::float8 * LEAST(m.text_rank, 1.0)
         + $5::float8 * (m.matched_entities::float8 / (SELECT n FROM seed_count))
         + $6::float8 * c.salience
         + $7::float8 * c.distinctiveness
         + $8::float8 * exp(-GREATEST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - c.recorded_at)), 0) / ($9::float8 * 86400))
         + $10::float8 * ln(1 + c.retrieval_count)
         + $11::float8 * ln(m.telling_count)
         + $12::float8 * ln(m.occurrence_count)
       ) AS score
FROM current_member c
JOIN matched m ON m.root_id = c.root_id
JOIN omnichat_memory_episodes ep ON ep.id = c.id
ORDER BY score DESC, c.recorded_at DESC
LIMIT $13
`

// Recall returns the episodes a persona should surface for a cue, most
// relevant first. Returning no rows is normal and means no memory block.
//
// The result mixes two tiers, and each episode carries the one it came from:
// IsSelf for something the character did in the world without the caller, and
// OwnerUserID set to the caller's id or the self sentinel to match. A caller
// that renders these has to be able to tell the difference, or a character
// recounts its own life as though the person it is talking to was there --
// which is why the flag is set from the tier the row is actually in rather
// than inferred from an id that is zero when nobody filled it in.
func (r *OmniChatMemoryRepository) Recall(
	ctx context.Context,
	personaID, ownerUserID int,
	cue string,
	weights OmniChatMemoryRecallWeights,
	limit int,
) ([]*OmniChatMemoryEpisode, error) {
	if personaID < 1 || limit < 1 {
		return nil, errors.New("omnichat memory: recall requires a persona and a positive limit")
	}
	cue = strings.TrimSpace(cue)
	if cue == "" {
		return nil, nil
	}
	rows, err := r.pool.Query(ctx, recallQuery,
		personaID, ownerParam(ownerUserID), cue,
		weights.Text, weights.EntityOverlap, weights.Salience, weights.Distinctiveness,
		weights.Recency, weights.RecencyHalfLifeDays, weights.PriorRecall,
		weights.Retelling, weights.Recurrence, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("omnichat memory: recall for persona %d: %w", personaID, err)
	}
	defer rows.Close()

	episodes := make([]*OmniChatMemoryEpisode, 0, limit)
	for rows.Next() {
		var (
			episode OmniChatMemoryEpisode
			score   float64
		)
		if err := rows.Scan(
			&episode.ID, &episode.Title, &episode.Summary,
			&episode.RecordedAt, &episode.Salience, &episode.Distinctiveness,
			&episode.Tellings, &episode.Occurrences, &episode.IsSelf, &score,
		); err != nil {
			return nil, fmt.Errorf("omnichat memory: scan recalled episode: %w", err)
		}
		episode.PersonaID = personaID
		episode.OwnerUserID = ownerUserID
		if episode.IsSelf {
			episode.OwnerUserID = OmniChatMemoryTierSelf
		}
		episode.Status = OmniChatMemoryStatusActive
		episodes = append(episodes, &episode)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("omnichat memory: iterate recalled episodes: %w", err)
	}
	return episodes, nil
}

// MarkRetrieved strengthens the episodes a persona just recalled, so a memory
// reached for often becomes easier to reach for. It only ever touches ranking
// metadata, never the remembered text.
func (r *OmniChatMemoryRepository) MarkRetrieved(ctx context.Context, episodeIDs []int64) error {
	if len(episodeIDs) == 0 {
		return nil
	}
	_, err := r.pool.Exec(ctx, `
		UPDATE omnichat_memory_episodes
		SET retrieval_count = retrieval_count + 1,
		    last_retrieved_at = CURRENT_TIMESTAMP
		WHERE id = ANY($1)
	`, episodeIDs)
	if err != nil {
		return fmt.Errorf("omnichat memory: mark episodes retrieved: %w", err)
	}
	return nil
}

// listForConversationQuery reads both tiers a conversation can show: what the
// character took from this conversation, and the life it led away from it.
//
// The self tier is joined through the conversation's persona because a
// self-tier row names no conversation -- the tier check forbids it -- so there
// is no column on the episode that could reach it from a conversation id. The
// conversation is matched on its owner as well as its id, which is what keeps a
// guessed id from reading as somebody else's conversation; the relational
// branch is scoped the same way it always was, by owner, and there is no value
// of $2 that admits a second user's rows.
//
// Each branch carries its own limit and its own count(*) OVER (), so a user
// with a long history cannot spend the whole page budget and leave the
// character's own life invisible, and each tier can report a truncation of its
// own. count(*) OVER () is evaluated before LIMIT, so it reports the full
// match either way.
//
// Ordering puts the shared history first and each tier newest-first. A caller
// that groups the two does not depend on this, but one that does not still
// gets a stable, readable list rather than an interleaving.
const listForConversationQuery = `
WITH conversation AS (
    SELECT persona_id
    FROM bot_conversations
    WHERE id = $1 AND user_id = $2
),
shared AS (
    SELECT id, persona_id, source_message_id, title, summary, recorded_at,
           salience, distinctiveness, emotional_valence,
           false AS is_self, count(*) OVER () AS tier_total
    FROM omnichat_memory_episodes
    WHERE conversation_id = $1 AND owner_user_id = $2 AND status = 'active'
    ORDER BY recorded_at DESC
    LIMIT $3
),
own_life AS (
    SELECT ep.id, ep.persona_id, ep.source_message_id, ep.title, ep.summary,
           ep.recorded_at, ep.salience, ep.distinctiveness, ep.emotional_valence,
           true AS is_self, count(*) OVER () AS tier_total
    FROM omnichat_memory_episodes ep
    JOIN conversation c ON c.persona_id = ep.persona_id
    WHERE ep.owner_user_id IS NULL AND ep.status = 'active'
    ORDER BY ep.recorded_at DESC
    LIMIT $3
)
SELECT * FROM shared
UNION ALL
SELECT * FROM own_life
ORDER BY is_self, recorded_at DESC
`

// ListForConversation returns the memories a conversation can show, newest
// first within each tier, along with how many there are in total.
//
// Two tiers come back, and each episode says which one it is in through
// IsSelf: the caller's own history with the character, and the character's
// self tier, which belongs to nobody and which every user of that character
// shares. The second is the same tier recall already draws on, so a character
// can say it wandered the main stage and the person it said that to can now go
// and find it. Nothing about recall changes here.
//
// A user-owned character has no self tier -- nothing writes one for it -- so
// this returns exactly what it always did for those, without a special case.
//
// Only active memories are returned. Filtering here rather than in the caller
// matters: the limit is applied by the database, so leaving hidden rows in the
// result would let a user who has forgotten a lot spend the whole page budget
// on memories that no longer do anything, pushing live ones out of the only
// surface for correcting them.
//
// The total counts every active memory in both tiers, not just this page, so a
// caller can tell the difference between "that is all of them" and "that is the
// first hundred".
func (r *OmniChatMemoryRepository) ListForConversation(
	ctx context.Context,
	conversationID, ownerUserID, limit int,
) ([]*OmniChatMemoryEpisode, int, error) {
	if conversationID < 1 || ownerUserID < 1 || limit < 1 {
		return nil, 0, errors.New("omnichat memory: owned conversation and positive limit are required")
	}
	rows, err := r.pool.Query(ctx, listForConversationQuery, conversationID, ownerUserID, limit)
	if err != nil {
		return nil, 0, fmt.Errorf("omnichat memory: list conversation memories: %w", err)
	}
	defer rows.Close()

	episodes := make([]*OmniChatMemoryEpisode, 0, limit)
	// Each tier reports its own total on every one of its rows, so they are
	// taken per tier and added rather than summed across rows.
	tierTotals := map[bool]int{}
	for rows.Next() {
		var (
			episode         OmniChatMemoryEpisode
			sourceMessageID *int
			tierTotal       int
		)
		if err := rows.Scan(
			&episode.ID, &episode.PersonaID, &sourceMessageID, &episode.Title, &episode.Summary,
			&episode.RecordedAt, &episode.Salience, &episode.Distinctiveness,
			&episode.EmotionalValence, &episode.IsSelf, &tierTotal,
		); err != nil {
			return nil, 0, fmt.Errorf("omnichat memory: scan conversation memory: %w", err)
		}
		if sourceMessageID != nil {
			episode.SourceMessageID = *sourceMessageID
		}
		if episode.IsSelf {
			// A self-tier episode is owned by nobody and comes from no
			// conversation. Saying so explicitly keeps the caller's scoping
			// values from being restated onto a row they do not describe.
			episode.OwnerUserID = OmniChatMemoryTierSelf
		} else {
			episode.ConversationID = conversationID
			episode.OwnerUserID = ownerUserID
		}
		episode.Status = OmniChatMemoryStatusActive
		tierTotals[episode.IsSelf] = tierTotal
		episodes = append(episodes, &episode)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("omnichat memory: iterate conversation memories: %w", err)
	}
	return episodes, tierTotals[false] + tierTotals[true], nil
}

// OmniChatMemoryRoot is an original account offered to extraction as something
// already remembered, so a retelling can be attached to it rather than filed as
// a new event.
type OmniChatMemoryRoot struct {
	ID    int64  `json:"id"`
	Title string `json:"title"`
}

// RecentRoots lists original accounts only. Retellings are excluded so a chain
// stays one level deep: a new telling always attaches to the first account,
// never to another telling, which is what lets recall collapse with a single
// COALESCE instead of walking a tree. Recurrences are excluded for the same
// reason -- a later occurrence is not the account a story is retold from, and
// hanging a telling off one would make a two-level chain the COALESCE would
// then collapse to the wrong row.
func (r *OmniChatMemoryRepository) RecentRoots(ctx context.Context, personaID, ownerUserID, limit int) ([]OmniChatMemoryRoot, error) {
	if personaID < 1 || limit < 1 {
		return nil, errors.New("omnichat memory: persona and positive limit are required")
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, title
		FROM omnichat_memory_episodes
		WHERE persona_id = $1
		  AND owner_user_id IS NOT DISTINCT FROM $2::int
		  AND status = 'active'
		  AND retells_episode_id IS NULL
		  AND recurs_episode_id IS NULL
		ORDER BY recorded_at DESC
		LIMIT $3
	`, personaID, ownerParam(ownerUserID), limit)
	if err != nil {
		return nil, fmt.Errorf("omnichat memory: list recent roots: %w", err)
	}
	defer rows.Close()

	roots := make([]OmniChatMemoryRoot, 0, limit)
	for rows.Next() {
		var root OmniChatMemoryRoot
		if err := rows.Scan(&root.ID, &root.Title); err != nil {
			return nil, fmt.Errorf("omnichat memory: scan recent root: %w", err)
		}
		roots = append(roots, root)
	}
	return roots, rows.Err()
}

// HideOwned is the user's correction path: it withdraws a memory from recall
// without destroying the record of what was extracted or where it came from.
//
// Owned is the whole of it. A self-tier row has no owner, and no id equals
// NULL, so the character's own life falls outside this by the same clause that
// keeps one user out of another's -- it is not a rule stated twice.
func (r *OmniChatMemoryRepository) HideOwned(ctx context.Context, episodeID int64, ownerUserID int) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE omnichat_memory_episodes
		SET status = 'user_hidden', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND owner_user_id = $2
	`, episodeID, ownerUserID)
	if err != nil {
		return fmt.Errorf("omnichat memory: hide episode %d: %w", episodeID, err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
