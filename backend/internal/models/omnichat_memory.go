package models

import (
	"context"
	"errors"
	"fmt"
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
	Retelling           float64
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
			episode.PersonaID, ownerUserID, conversationID, episode.SourceMessageID,
			episode.Title, episode.Summary,
			episode.Salience, episode.Distinctiveness, episode.EmotionalValence,
			episode.RetellsEpisodeID,
		).Scan(&episodeID)
		if err != nil {
			return fmt.Errorf("omnichat memory: insert episode: %w", err)
		}

		for _, entity := range episode.Entities {
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
			`, episode.PersonaID, ownerUserID, entity.CanonicalName, string(entity.Kind), aliases).Scan(&entityID)
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
func (r *OmniChatMemoryRepository) RecordWorldEvent(ctx context.Context, event OmniChatWorldEvent) (int64, error) {
	// The world is a service, but its text still arrives over the wire, so it
	// is bounded exactly as an extracted episode is.
	episode := OmniChatMemoryEpisode{
		PersonaID:       event.PersonaID,
		OwnerUserID:     OmniChatMemoryTierSelf,
		Title:           event.Title,
		Summary:         event.Summary,
		Salience:        OmniChatWorldEventSalience,
		Distinctiveness: OmniChatWorldEventDistinctiveness,
	}
	episode.Normalize()
	if err := episode.Validate(); err != nil {
		return 0, err
	}

	var episodeID int64
	err := r.pool.QueryRow(ctx, `
		INSERT INTO omnichat_memory_episodes (
			persona_id, owner_user_id, conversation_id, source_message_id,
			title, summary, salience, distinctiveness
		)
		SELECT p.id, NULL, NULL, NULL, $2, $3, $4, $5
		FROM bot_personas p
		-- The same line admission draws, and now literally the same line: a
		-- resident is exactly a character that would be admitted. A character
		-- that belongs to a user is never a resident, so nothing ever writes it
		-- a self tier and it has none to read.
		WHERE `+AdmissiblePersonaPredicate+`
		RETURNING id
	`,
		episode.PersonaID, episode.Title, episode.Summary,
		episode.Salience, episode.Distinctiveness,
	).Scan(&episodeID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrOmniChatMemoryNotResident
	}
	if err != nil {
		return 0, fmt.Errorf("omnichat memory: record world event: %w", err)
	}
	return episodeID, nil
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
// Retellings are collapsed. A story told twenty times is twenty rows, and
// without grouping they would take every slot and read as one memory repeated.
// Matching happens per telling, because the cue may echo any version's wording,
// and the chain is then scored once and represented by its newest telling: that
// is the version currently in circulation between these two, drift included.
// The original stays untouched and readable elsewhere.
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
tellings AS (
    SELECT ep.id,
           COALESCE(ep.retells_episode_id, ep.id) AS root_id,
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
-- A chain is a candidate when any of its tellings matched the cue.
matched AS (
    SELECT root_id,
           max(matched_entities) AS matched_entities,
           max(text_rank) AS text_rank,
           count(*) AS telling_count
    FROM tellings
    GROUP BY root_id
    HAVING max(matched_entities) > 0 OR max(text_rank) > 0
),
current_telling AS (
    SELECT DISTINCT ON (t.root_id)
           t.root_id, t.id, t.recorded_at, t.salience, t.distinctiveness, t.retrieval_count, t.is_self
    FROM tellings t
    JOIN matched m ON m.root_id = t.root_id
    ORDER BY t.root_id, t.recorded_at DESC, t.id DESC
)
SELECT c.id, ep.title, ep.summary, c.recorded_at, c.salience, c.distinctiveness,
       m.telling_count, c.is_self,
       (
           $4::float8 * LEAST(m.text_rank, 1.0)
         + $5::float8 * (m.matched_entities::float8 / (SELECT n FROM seed_count))
         + $6::float8 * c.salience
         + $7::float8 * c.distinctiveness
         + $8::float8 * exp(-GREATEST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - c.recorded_at)), 0) / ($9::float8 * 86400))
         + $10::float8 * ln(1 + c.retrieval_count)
         + $11::float8 * ln(m.telling_count)
       ) AS score
FROM current_telling c
JOIN matched m ON m.root_id = c.root_id
JOIN omnichat_memory_episodes ep ON ep.id = c.id
ORDER BY score DESC, c.recorded_at DESC
LIMIT $12
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
		weights.Retelling, limit,
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
			&episode.Tellings, &episode.IsSelf, &score,
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

// ListForConversation returns the memories derived from one conversation that
// the character can still draw on, newest first, along with how many there are
// in total.
//
// Only active memories are returned. Filtering here rather than in the caller
// matters: the limit is applied by the database, so leaving hidden rows in the
// result would let a user who has forgotten a lot spend the whole page budget
// on memories that no longer do anything, pushing live ones out of the only
// surface for correcting them.
//
// The total counts every active memory, not just this page, so a caller can
// tell the difference between "that is all of them" and "that is the first
// hundred".
func (r *OmniChatMemoryRepository) ListForConversation(
	ctx context.Context,
	conversationID, ownerUserID, limit int,
) ([]*OmniChatMemoryEpisode, int, error) {
	if conversationID < 1 || ownerUserID < 1 || limit < 1 {
		return nil, 0, errors.New("omnichat memory: owned conversation and positive limit are required")
	}
	// count(*) OVER () is evaluated before LIMIT, so it reports the full match.
	rows, err := r.pool.Query(ctx, `
		SELECT id, persona_id, source_message_id, title, summary, recorded_at,
		       salience, distinctiveness, emotional_valence, count(*) OVER () AS total
		FROM omnichat_memory_episodes
		WHERE conversation_id = $1 AND owner_user_id = $2 AND status = 'active'
		ORDER BY recorded_at DESC
		LIMIT $3
	`, conversationID, ownerUserID, limit)
	if err != nil {
		return nil, 0, fmt.Errorf("omnichat memory: list conversation memories: %w", err)
	}
	defer rows.Close()

	episodes := make([]*OmniChatMemoryEpisode, 0, limit)
	total := 0
	for rows.Next() {
		var (
			episode         OmniChatMemoryEpisode
			sourceMessageID *int
		)
		if err := rows.Scan(
			&episode.ID, &episode.PersonaID, &sourceMessageID, &episode.Title, &episode.Summary,
			&episode.RecordedAt, &episode.Salience, &episode.Distinctiveness,
			&episode.EmotionalValence, &total,
		); err != nil {
			return nil, 0, fmt.Errorf("omnichat memory: scan conversation memory: %w", err)
		}
		if sourceMessageID != nil {
			episode.SourceMessageID = *sourceMessageID
		}
		episode.ConversationID = conversationID
		episode.OwnerUserID = ownerUserID
		episode.Status = OmniChatMemoryStatusActive
		episodes = append(episodes, &episode)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("omnichat memory: iterate conversation memories: %w", err)
	}
	return episodes, total, nil
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
// COALESCE instead of walking a tree.
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
