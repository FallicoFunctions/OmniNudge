package models

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The ladder, as data. Tuning how long a rung lasts is editing this table, and
// adding a rung is adding a row -- neither is a change to the logic that walks
// it. A nil duration is the indefinite rung, which is why it is a pointer
// rather than a sentinel like zero: zero is a duration somebody could mean.
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

// OmniChatTopBlockTier is the indefinite rung. Escalation stops here rather
// than wrapping or erroring: someone already blocked indefinitely who does it
// again is still blocked indefinitely.
const OmniChatTopBlockTier int16 = 4

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

// Block puts someone one rung further up than they have already been, and
// returns what was recorded.
//
// The whole operation is one statement so that two messages arriving together
// cannot both read the same history and both write the same rung. The ladder
// walk is a subquery rather than a read followed by a write for that reason.
func (r *OmniChatPersonaBlockRepository) Block(
	ctx context.Context, personaID, userID int, reason string,
) (*OmniChatPersonaBlock, error) {
	if personaID < 1 || userID < 1 {
		return nil, errors.New("omnichat block: persona and user are required")
	}
	if reason == "" {
		// The admin review exists to judge whether the reason was fair. A block
		// with no reason cannot be reviewed, only guessed at.
		return nil, errors.New("omnichat block: a reason is required")
	}

	block, err := scanOmniChatBlock(r.pool.QueryRow(ctx, `
		WITH reached AS (
			-- Overturned blocks are excluded on purpose. A decision an admin
			-- judged unfair must not push the next one further up the ladder,
			-- or reversing it would only have postponed its effect.
			SELECT COALESCE(MAX(tier), 0) AS tier
			FROM omnichat_persona_user_blocks
			WHERE persona_id = $1 AND user_id = $2 AND overturned_at IS NULL
		), next AS (
			SELECT LEAST(reached.tier + 1, $4::smallint) AS tier FROM reached
		)
		INSERT INTO omnichat_persona_user_blocks (persona_id, user_id, tier, expires_at, reason)
		SELECT $1, $2, next.tier,
		       CASE next.tier
		           WHEN 1 THEN now() + $5::interval
		           WHEN 2 THEN now() + $6::interval
		           WHEN 3 THEN now() + $7::interval
		           ELSE NULL
		       END,
		       $3
		FROM next
		RETURNING `+omniChatBlockColumns,
		personaID, userID, reason, OmniChatTopBlockTier,
		omniChatBlockLadder[0].Duration.String(),
		omniChatBlockLadder[1].Duration.String(),
		omniChatBlockLadder[2].Duration.String(),
	))
	if err != nil {
		return nil, fmt.Errorf("omnichat block: record: %w", err)
	}
	return block, nil
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

// RecentBlocks is the admin review queue: what characters have done lately,
// newest first, including blocks already lapsed or already overturned. A
// review that only showed blocks currently in force would hide every short one
// -- the ten-minute rung would be gone before anyone looked.
func (r *OmniChatPersonaBlockRepository) RecentBlocks(
	ctx context.Context, limit int,
) ([]*OmniChatPersonaBlock, error) {
	if limit < 1 || limit > 500 {
		limit = 100
	}
	rows, err := r.pool.Query(ctx, `
		SELECT `+omniChatBlockColumns+`
		FROM omnichat_persona_user_blocks
		ORDER BY created_at DESC, id DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("omnichat block: list: %w", err)
	}
	defer rows.Close()

	blocks := make([]*OmniChatPersonaBlock, 0, limit)
	for rows.Next() {
		block, err := scanOmniChatBlock(rows)
		if err != nil {
			return nil, fmt.Errorf("omnichat block: scan: %w", err)
		}
		blocks = append(blocks, block)
	}
	return blocks, rows.Err()
}
