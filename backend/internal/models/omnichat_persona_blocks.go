package models

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	zlog "github.com/rs/zerolog/log"
)

// The ladder, as data. Tuning how long a rung lasts is editing this table and
// nothing else -- the durations are passed to the insert as an array indexed by
// rung, so the SQL never names one. A nil duration is the indefinite rung, a
// pointer rather than a sentinel like zero because zero is a duration somebody
// could mean.
//
// Adding a rung is not only a row: the schema pins the top rung (it is the one
// forbidden an expiry, and the tier range is checked), so a fifth would need a
// migration alongside it.
var omniChatBlockLadder = []struct {
	Tier     int16
	Duration *time.Duration
}{
	{Tier: 1, Duration: durationPtr(10 * time.Minute)},
	{Tier: 2, Duration: durationPtr(2 * time.Hour)},
	{Tier: 3, Duration: durationPtr(24 * time.Hour)},
	{Tier: 4, Duration: nil},
}

func durationPtr(d time.Duration) *time.Duration { return &d }

// OmniChatTopBlockTier is the indefinite rung, read off the ladder rather than
// declared beside it -- two places saying "4" is one place to forget. Escalation
// stops here rather than wrapping or erroring: someone already blocked
// indefinitely who does it again is still blocked indefinitely.
var OmniChatTopBlockTier = omniChatBlockLadder[len(omniChatBlockLadder)-1].Tier

// omniChatBlockRungSeconds is the ladder as the insert consumes it: one entry
// per timed rung, indexed by tier. The indefinite rung has no entry, and is
// never indexed for.
func omniChatBlockRungSeconds() []int32 {
	seconds := make([]int32, 0, len(omniChatBlockLadder))
	for _, rung := range omniChatBlockLadder {
		if rung.Duration == nil {
			continue
		}
		seconds = append(seconds, int32(rung.Duration.Seconds()))
	}
	return seconds
}

var ErrOmniChatBlockNotFound = errors.New("omnichat block: not found")

// OmniChatPersonaBlock is one character's decision to stop talking to one
// person. It records the judgment, never the reasoning behind it -- who decides
// is a separate problem, and every field here is written the same way whether
// the decision came from a model, an operator, or a test.
type OmniChatPersonaBlock struct {
	ID           int64      `json:"id"`
	PersonaID    int        `json:"persona_id"`
	UserID       int        `json:"user_id"`
	Tier         int16      `json:"tier"`
	ExpiresAt    *time.Time `json:"expires_at"`
	Reason       string     `json:"reason"`
	OverturnedAt *time.Time `json:"overturned_at,omitempty"`
	OverturnedBy *int       `json:"overturned_by,omitempty"`
	OverturnNote *string    `json:"overturn_note,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

// IsIndefinite reports whether this block has no lapse. Read the tier rather
// than the absence of an expiry: they agree, because the schema will not store
// a row where they do not, and the tier is the thing that was decided.
func (b *OmniChatPersonaBlock) IsIndefinite() bool {
	return b != nil && b.Tier >= OmniChatTopBlockTier
}

type OmniChatPersonaBlockRepository struct {
	pool *pgxpool.Pool
}

func NewOmniChatPersonaBlockRepository(pool *pgxpool.Pool) *OmniChatPersonaBlockRepository {
	return &OmniChatPersonaBlockRepository{pool: pool}
}

const omniChatBlockColumns = `id, persona_id, user_id, tier, expires_at, reason,
	overturned_at, overturned_by, overturn_note, created_at`

func scanOmniChatBlock(row pgx.Row) (*OmniChatPersonaBlock, error) {
	var block OmniChatPersonaBlock
	if err := row.Scan(
		&block.ID, &block.PersonaID, &block.UserID, &block.Tier, &block.ExpiresAt,
		&block.Reason, &block.OverturnedAt, &block.OverturnedBy, &block.OverturnNote,
		&block.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &block, nil
}

// OmniChatBlockTranscriptEntry is one message as the review will read it.
// Stored rather than joined, so it survives the messages being edited or the
// account being deleted.
type OmniChatBlockTranscriptEntry struct {
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// OmniChatBlockRequest is everything one block needs. A struct rather than six
// positional arguments, three of which would be easy to transpose.
type OmniChatBlockRequest struct {
	PersonaID int
	UserID    int
	Reason    string

	// What she could see when she decided. Bounded by the caller to her context
	// window: older than that provably did not influence her, and less than that
	// leaves the reviewer judging a fragment.
	Transcript []OmniChatBlockTranscriptEntry

	// Where the relationship should sit once the block is placed. Blocking
	// discharges the feeling, so a lapsed block does not re-fire on the next
	// message and walk the ladder to permanent unaided.
	DischargedWarmth float64
}

// Block puts someone one rung further up than they have already been, and
// returns what was recorded.
//
// **Someone already blocked is not escalated.** They cannot say anything new
// while they cannot be heard, so a second call during a standing block would be
// escalating on nothing -- and a retry, a redelivered job, or a loop in whatever
// makes these decisions would otherwise walk a person from ten minutes to
// permanent in four calls without them having done anything. The standing block
// is returned instead. Escalation happens across blocks: the rung goes up when
// someone comes back after one has lapsed and gives the character a fresh
// reason.
//
// The discharge shares the transaction with the insert deliberately. If the
// block landed and the discharge did not, she would sit at the floor for the
// whole duration, re-block on the first message after it lapsed, and climb the
// ladder to permanent -- the exact failure the recovery exists to prevent, made
// silently and only under partial failure.
func (r *OmniChatPersonaBlockRepository) Block(
	ctx context.Context, request OmniChatBlockRequest,
) (*OmniChatPersonaBlock, error) {
	if request.PersonaID < 1 || request.UserID < 1 {
		return nil, errors.New("omnichat block: persona and user are required")
	}
	if request.Reason == "" {
		// The admin review exists to judge whether the reason was fair. A block
		// with no reason cannot be reviewed, only guessed at.
		return nil, errors.New("omnichat block: a reason is required")
	}

	snapshot := []byte("null")
	if len(request.Transcript) > 0 {
		encoded, err := json.Marshal(request.Transcript)
		if err != nil {
			return nil, fmt.Errorf("omnichat block: encode transcript: %w", err)
		}
		snapshot = encoded
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("omnichat block: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var placed bool
	block, err := scanOmniChatBlockPlacement(tx.QueryRow(ctx, `
		WITH standing AS (
			SELECT `+omniChatBlockColumns+`
			FROM omnichat_persona_user_blocks
			WHERE persona_id = $1 AND user_id = $2
			  AND overturned_at IS NULL
			  AND (expires_at IS NULL OR expires_at > now())
			ORDER BY (expires_at IS NULL) DESC, expires_at DESC
			LIMIT 1
		), reached AS (
			-- Overturned blocks are excluded on purpose. A decision an admin
			-- judged unfair must not push the next one further up the ladder,
			-- or reversing it would only have postponed its effect.
			SELECT COALESCE(MAX(tier), 0) AS tier
			FROM omnichat_persona_user_blocks
			WHERE persona_id = $1 AND user_id = $2 AND overturned_at IS NULL
		), next AS (
			SELECT LEAST(reached.tier + 1, $4::smallint) AS tier FROM reached
		), placed AS (
			INSERT INTO omnichat_persona_user_blocks
				(persona_id, user_id, tier, expires_at, reason, transcript_snapshot)
			SELECT $1, $2, next.tier,
			       CASE
			           WHEN next.tier >= $4 THEN NULL
			           ELSE now() + make_interval(secs => ($5::int[])[next.tier])
			       END,
			       $3, $6::jsonb
			FROM next
			WHERE NOT EXISTS (SELECT 1 FROM standing)
			RETURNING `+omniChatBlockColumns+`
		)
		SELECT `+omniChatBlockColumns+`, true AS placed FROM placed
		UNION ALL
		SELECT `+omniChatBlockColumns+`, false AS placed FROM standing
	`,
		request.PersonaID, request.UserID, request.Reason, OmniChatTopBlockTier,
		omniChatBlockRungSeconds(), snapshot,
	), &placed)
	if err != nil {
		return nil, fmt.Errorf("omnichat block: record: %w", err)
	}

	// Only a block that was actually placed discharges anything. Returning a
	// standing block is not a fresh decision and must not top her back up.
	if placed {
		if _, err := tx.Exec(ctx, `
			INSERT INTO omnichat_character_traits (persona_id, owner_user_id, warmth)
			VALUES ($1, $2, $3)
			ON CONFLICT (persona_id, COALESCE(owner_user_id, 0)) DO UPDATE
			SET warmth = GREATEST(omnichat_character_traits.warmth, EXCLUDED.warmth),
			    updated_at = CURRENT_TIMESTAMP
		`, request.PersonaID, request.UserID, request.DischargedWarmth); err != nil {
			return nil, fmt.Errorf("omnichat block: discharge: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("omnichat block: commit: %w", err)
	}
	return block, nil
}

func scanOmniChatBlockPlacement(row pgx.Row, placed *bool) (*OmniChatPersonaBlock, error) {
	var block OmniChatPersonaBlock
	if err := row.Scan(
		&block.ID, &block.PersonaID, &block.UserID, &block.Tier, &block.ExpiresAt,
		&block.Reason, &block.OverturnedAt, &block.OverturnedBy, &block.OverturnNote,
		&block.CreatedAt, placed,
	); err != nil {
		return nil, err
	}
	return &block, nil
}

// ActiveBlock returns the block in force between this character and this
// person, or nil. Asked on every message, which is what the partial index on
// (persona_id, user_id, expires_at) is for.
//
// The strongest is returned rather than the newest: if more than one is
// somehow in force, the answer a caller needs is how long they are shut out
// for, and that is the longest of them.
func (r *OmniChatPersonaBlockRepository) ActiveBlock(
	ctx context.Context, personaID, userID int,
) (*OmniChatPersonaBlock, error) {
	if personaID < 1 || userID < 1 {
		return nil, nil
	}
	block, err := scanOmniChatBlock(r.pool.QueryRow(ctx, `
		SELECT `+omniChatBlockColumns+`
		FROM omnichat_persona_user_blocks
		WHERE persona_id = $1
		  AND user_id = $2
		  AND overturned_at IS NULL
		  AND (expires_at IS NULL OR expires_at > now())
		ORDER BY (expires_at IS NULL) DESC, expires_at DESC
		LIMIT 1
	`, personaID, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("omnichat block: load active: %w", err)
	}
	return block, nil
}

// Overturn reverses a block an admin judged unfair. The row is marked, never
// deleted: the history is what the review reads, and it is what tells anyone
// later that a decision was made and reversed rather than never made.
//
// Overturning also removes the block from the ladder, so the next one starts
// where it would have if this had never happened.
func (r *OmniChatPersonaBlockRepository) Overturn(
	ctx context.Context, blockID int64, adminUserID int, note string,
) (*OmniChatPersonaBlock, error) {
	if blockID < 1 || adminUserID < 1 {
		return nil, errors.New("omnichat block: block and admin are required")
	}
	var notePtr *string
	if note != "" {
		notePtr = &note
	}
	block, err := scanOmniChatBlock(r.pool.QueryRow(ctx, `
		UPDATE omnichat_persona_user_blocks
		SET overturned_at = now(), overturned_by = $2, overturn_note = $3
		WHERE id = $1 AND overturned_at IS NULL
		RETURNING `+omniChatBlockColumns,
		blockID, adminUserID, notePtr))
	if errors.Is(err, pgx.ErrNoRows) {
		// Either it does not exist or it is already overturned. Both mean the
		// same thing to a caller: there is nothing here to reverse.
		return nil, ErrOmniChatBlockNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("omnichat block: overturn: %w", err)
	}
	return block, nil
}

// OmniChatPersonaBlockAdminSummary is a block with enough context to judge it.
// The review asks whether this character was fair to this person, and neither
// half of that question can be answered from ids.
type OmniChatPersonaBlockAdminSummary struct {
	OmniChatPersonaBlock
	PersonaName string `json:"persona_name"`
	PersonaSlug string `json:"persona_slug"`
	Username    string `json:"username"`

	// The exchange she acted on. Without it the review has her one-line account
	// and nothing to check it against, which is the half that does not work
	// alone -- the question being asked is whether her account was fair.
	Transcript []OmniChatBlockTranscriptEntry `json:"transcript,omitempty"`

	// Computed by the database rather than from the row, so the answer uses the
	// same clock the block will be enforced against.
	InForce bool `json:"in_force"`
}

// ListForAdmin is the review queue. It returns blocks in every state -- in
// force, lapsed, and already overturned -- because a queue of live blocks would
// never once show a ten-minute one, and the shortest blocks are the ones most
// likely to have been unfair.
func (r *OmniChatPersonaBlockRepository) ListForAdmin(
	ctx context.Context, personaID *int, limit, offset int,
) ([]*OmniChatPersonaBlockAdminSummary, int, error) {
	if limit < 1 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	var total int
	if err := r.pool.QueryRow(ctx, `
		SELECT count(*) FROM omnichat_persona_user_blocks
		WHERE ($1::int IS NULL OR persona_id = $1)
	`, personaID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("omnichat block: count for admin: %w", err)
	}

	rows, err := r.pool.Query(ctx, `
		SELECT b.id, b.persona_id, b.user_id, b.tier, b.expires_at, b.reason,
		       b.overturned_at, b.overturned_by, b.overturn_note, b.created_at,
		       b.transcript_snapshot,
		       p.name, p.slug, u.username,
		       (b.overturned_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > now())) AS in_force
		FROM omnichat_persona_user_blocks b
		JOIN bot_personas p ON p.id = b.persona_id
		JOIN users u ON u.id = b.user_id
		WHERE ($1::int IS NULL OR b.persona_id = $1)
		ORDER BY b.created_at DESC, b.id DESC
		LIMIT $2 OFFSET $3
	`, personaID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("omnichat block: list for admin: %w", err)
	}
	defer rows.Close()

	summaries := make([]*OmniChatPersonaBlockAdminSummary, 0, limit)
	for rows.Next() {
		var summary OmniChatPersonaBlockAdminSummary
		var snapshot []byte
		if err := rows.Scan(
			&summary.ID, &summary.PersonaID, &summary.UserID, &summary.Tier,
			&summary.ExpiresAt, &summary.Reason, &summary.OverturnedAt,
			&summary.OverturnedBy, &summary.OverturnNote, &summary.CreatedAt,
			&snapshot,
			&summary.PersonaName, &summary.PersonaSlug, &summary.Username, &summary.InForce,
		); err != nil {
			return nil, 0, fmt.Errorf("omnichat block: scan admin row: %w", err)
		}
		// A block placed before snapshots existed, or by an operator with no
		// exchange to point at, has none. That is a card without a transcript,
		// not a row the review should refuse to show.
		if len(snapshot) > 0 {
			if err := json.Unmarshal(snapshot, &summary.Transcript); err != nil {
				zlog.Warn().Err(err).Int64("block_id", summary.ID).
					Msg("omnichat block: unreadable transcript snapshot")
			}
		}
		summaries = append(summaries, &summary)
	}
	return summaries, total, rows.Err()
}

// How far this person has to have pushed her before she stops talking to them,
// and how much of that is given back when she does.
const (
	// The floor is on the *relationship* traits, not the composed disposition.
	// A character written cold starts near the bottom of the composed scale and
	// would shut out everyone she met; what this asks instead is what this
	// person in particular has done to her, measured from wherever she began.
	omniChatBlockWarmthFloor = -0.6

	// Personality still moves the line, which is the whole reason it is not a
	// constant. A warm character carries further before she is done; a prickly
	// one has less to spend. Same code, different card.
	omniChatBlockPatienceSpan = 0.2

	// Firmness moves it the other way. Warmth is how much she will endure;
	// firmness is how willing she is to end it, and they are not the same
	// question -- somebody can be fond of a person and still be the sort who
	// says "we are done" the moment it stops being worth it.
	//
	// The two extremes are the interesting ones. Warm and yielding stays far
	// past the point anybody would advise, which is a recognisable kind of
	// person and not a bug. Cool and firm is gone almost immediately.
	omniChatBlockFirmnessSpan = 0.2

	// Blocking discharges the feeling. She has said her piece, and the block is
	// the consequence -- so the relationship comes back up to just above the
	// floor rather than sitting on it.
	//
	// Without this the duration would be decorative: a ten-minute block would
	// lapse with her still at the floor, the next message would re-block, and
	// the ladder would climb to permanent without the person having done
	// anything new. The rung they are on is the memory of it; the feeling is
	// not.
	omniChatBlockRecoveryMargin = 0.25
)

// OmniChatBlockThreshold is the relationship warmth at which this character
// stops talking to this person. Lower means more patience.
func OmniChatBlockThreshold(baseline OmniChatDispositionBaseline) float64 {
	return clampTrait(omniChatBlockWarmthFloor -
		baseline.Warmth*omniChatBlockPatienceSpan +
		baseline.Firmness*omniChatBlockFirmnessSpan)
}

// ShouldBlock reports whether this person has worn out their welcome.
//
// It reads warmth and not trust. Trust is whether she believes you, and
// somebody can be unreliable without being unpleasant -- a character who shuts
// out everyone who ever exaggerated is not protecting herself, she is just
// brittle. Warmth is how she feels about the person, which is the question
// actually being asked.
//
// Nothing here reads the conversation. The decision is a number that moved over
// many exchanges, which is what makes it un-arguable: a model asked to judge can
// be talked round, flattered, or prompt-injected into an opinion, and an
// accumulated trait cannot be talked into anything. What a model is for is
// saying *why*, afterwards, in her words.
func ShouldBlock(baseline OmniChatDispositionBaseline, relationship OmniChatCharacterTraits) bool {
	return relationship.Warmth <= OmniChatBlockThreshold(baseline)
}

// OmniChatDischargedWarmth is where a relationship sits once she has blocked:
// far enough above the threshold that the block has to be earned again.
func OmniChatDischargedWarmth(baseline OmniChatDispositionBaseline) float64 {
	return clampTrait(OmniChatBlockThreshold(baseline) + omniChatBlockRecoveryMargin)
}
