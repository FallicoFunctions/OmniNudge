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
	OwnerUserID     int `json:"-"`
	ConversationID  int `json:"-"`
	SourceMessageID int `json:"-"`

	Title   string `json:"title"`
	Summary string `json:"summary"`

	RecordedAt time.Time `json:"recorded_at"`

	Salience         float64  `json:"salience"`
	Distinctiveness  float64  `json:"distinctiveness"`
	EmotionalValence *float64 `json:"emotional_valence,omitempty"`

	Status       OmniChatMemoryStatus `json:"status"`
	SupersededBy int64                `json:"-"`

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
	Text                float64
	EntityOverlap       float64
	Salience            float64
	Distinctiveness     float64
	Recency             float64
	PriorRecall         float64
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
				title, summary, salience, distinctiveness, emotional_valence
			) VALUES ($1, $2, $3, NULLIF($4, 0), $5, $6, $7, $8, $9)
			RETURNING id
		`,
			episode.PersonaID, ownerUserID, conversationID, episode.SourceMessageID,
			episode.Title, episode.Summary,
			episode.Salience, episode.Distinctiveness, episode.EmotionalValence,
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

// recallQuery ranks a persona's memories for one tier against a free-text cue.
//
// Candidates are episodes that either share an entity named in the cue or match
// it lexically; everything else is ignored so a long history stays bounded. The
// entity join is the associative half -- it is what turns "that one time with
// Mike" into the episodes Mike appears in -- and the score is what decides which
// of those the persona actually surfaces.
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
      AND e.owner_user_id IS NOT DISTINCT FROM $2::int
      AND position(lower(e.canonical_name) IN lower(p.cue)) > 0
    LIMIT 32
),
seed_count AS (SELECT GREATEST(count(*), 1)::real AS n FROM seed_entities),
scored AS (
    SELECT ep.id,
           ep.title,
           ep.summary,
           ep.recorded_at,
           ep.salience,
           ep.distinctiveness,
           ep.retrieval_count,
           count(DISTINCT se.id) AS matched_entities,
           COALESCE(ts_rank_cd(ep.search_vector, (SELECT tsq FROM cue_query)), 0) AS text_rank
    FROM omnichat_memory_episodes ep
    JOIN params p ON ep.persona_id = p.persona_id
    LEFT JOIN omnichat_memory_episode_entities ee ON ee.episode_id = ep.id
    LEFT JOIN seed_entities se ON se.id = ee.entity_id
    WHERE ep.owner_user_id IS NOT DISTINCT FROM $2::int
      AND ep.status = 'active'
    GROUP BY ep.id
    HAVING count(DISTINCT se.id) > 0
        OR ((SELECT tsq FROM cue_query) IS NOT NULL AND ep.search_vector @@ (SELECT tsq FROM cue_query))
)
SELECT s.id, s.title, s.summary, s.recorded_at, s.salience, s.distinctiveness,
       (
           $4::float8 * LEAST(s.text_rank, 1.0)
         + $5::float8 * (s.matched_entities::float8 / (SELECT n FROM seed_count))
         + $6::float8 * s.salience
         + $7::float8 * s.distinctiveness
         + $8::float8 * exp(-GREATEST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - s.recorded_at)), 0) / ($9::float8 * 86400))
         + $10::float8 * ln(1 + s.retrieval_count)
       ) AS score
FROM scored s
ORDER BY score DESC, s.recorded_at DESC
LIMIT $11
`

// Recall returns the episodes a persona should surface for a cue, most
// relevant first. Returning no rows is normal and means no memory block.
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
		limit,
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
			&episode.RecordedAt, &episode.Salience, &episode.Distinctiveness, &score,
		); err != nil {
			return nil, fmt.Errorf("omnichat memory: scan recalled episode: %w", err)
		}
		episode.PersonaID = personaID
		episode.OwnerUserID = ownerUserID
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
