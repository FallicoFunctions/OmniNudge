package models

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Which way a commitment runs. Both matter: one governs whether she is
// reliable, the other whether they are, and being let down lands as hard as
// letting somebody down.
const (
	OmniChatCommitmentHers   = "hers"
	OmniChatCommitmentTheirs = "theirs"
)

const (
	OmniChatCommitmentOpen = "open"
	OmniChatCommitmentKept = "kept"
	// Broken is somebody not doing what they said. Released is neither kept nor
	// broken -- the bet was called off, the favour stopped mattering, both of
	// them let it go on purpose -- and collapsing it into broken would have her
	// resenting things nobody minded about.
	OmniChatCommitmentBroken   = "broken"
	OmniChatCommitmentReleased = "released"
)

// How many outstanding commitments reach a prompt at once. Somebody who owes a
// character eleven things has a different problem, and listing all of them
// would crowd out the conversation they are actually having.
const OmniChatMaxOpenCommitments = 5

const maxOmniChatCommitmentSummaryRunes = 300

// OmniChatCommitment is something said in a conversation that constrains what
// should be true later.
type OmniChatCommitment struct {
	ID          int64      `json:"id"`
	PersonaID   int        `json:"persona_id"`
	OwnerUserID int        `json:"owner_user_id"`
	Direction   string     `json:"direction"`
	Summary     string     `json:"summary"`
	DueAt       *time.Time `json:"due_at,omitempty"`
	Status      string     `json:"status"`
	ResolvedAt  *time.Time `json:"resolved_at,omitempty"`

	ConversationID  *int `json:"conversation_id,omitempty"`
	SourceMessageID *int `json:"source_message_id,omitempty"`

	CreatedAt time.Time `json:"created_at"`
}

// IsHers reports whether she is the one who undertook it.
func (c OmniChatCommitment) IsHers() bool { return c.Direction == OmniChatCommitmentHers }

func ValidOmniChatCommitmentDirection(direction string) bool {
	return direction == OmniChatCommitmentHers || direction == OmniChatCommitmentTheirs
}

type OmniChatCommitmentRepository struct {
	pool *pgxpool.Pool
}

func NewOmniChatCommitmentRepository(pool *pgxpool.Pool) *OmniChatCommitmentRepository {
	return &OmniChatCommitmentRepository{pool: pool}
}

const omniChatCommitmentColumns = `id, persona_id, owner_user_id, direction, summary,
	due_at, status, resolved_at, conversation_id, source_message_id, created_at`

func scanOmniChatCommitments(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
}) ([]*OmniChatCommitment, error) {
	commitments := []*OmniChatCommitment{}
	for rows.Next() {
		var commitment OmniChatCommitment
		if err := rows.Scan(
			&commitment.ID, &commitment.PersonaID, &commitment.OwnerUserID,
			&commitment.Direction, &commitment.Summary, &commitment.DueAt,
			&commitment.Status, &commitment.ResolvedAt,
			&commitment.ConversationID, &commitment.SourceMessageID, &commitment.CreatedAt,
		); err != nil {
			return nil, err
		}
		commitments = append(commitments, &commitment)
	}
	return commitments, rows.Err()
}

// Record stores what an exchange committed either of them to.
//
// Duplicates are the thing to guard against rather than volume. Extraction runs
// over a sliding window, so the same promise is read more than once, and a
// character who believes she was promised the same thing four times is worse
// than one who missed it. An open commitment with the same direction and
// summary between the same two people is treated as already held.
func (r *OmniChatCommitmentRepository) Record(
	ctx context.Context, commitment OmniChatCommitment,
) (*OmniChatCommitment, bool, error) {
	if commitment.PersonaID < 1 || commitment.OwnerUserID < 1 {
		return nil, false, errors.New("omnichat commitment: persona and user are required")
	}
	if !ValidOmniChatCommitmentDirection(commitment.Direction) {
		return nil, false, fmt.Errorf("omnichat commitment: direction %q is not hers or theirs", commitment.Direction)
	}
	summary := strings.TrimSpace(commitment.Summary)
	if summary == "" {
		return nil, false, errors.New("omnichat commitment: a summary is required")
	}
	summary = truncateOmniChatCommitmentSummary(summary)

	var existingID int64
	err := r.pool.QueryRow(ctx, `
		SELECT id FROM omnichat_commitments
		WHERE persona_id = $1 AND owner_user_id = $2
		  AND direction = $3 AND status = 'open'
		  AND lower(summary) = lower($4)
		LIMIT 1
	`, commitment.PersonaID, commitment.OwnerUserID, commitment.Direction, summary).Scan(&existingID)
	if err == nil {
		return &OmniChatCommitment{ID: existingID}, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, false, fmt.Errorf("omnichat commitment: check existing: %w", err)
	}

	rows, queryErr := r.pool.Query(ctx, `
		INSERT INTO omnichat_commitments
			(persona_id, owner_user_id, direction, summary, due_at, conversation_id, source_message_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING `+omniChatCommitmentColumns,
		commitment.PersonaID, commitment.OwnerUserID, commitment.Direction, summary,
		commitment.DueAt, commitment.ConversationID, commitment.SourceMessageID)
	if queryErr != nil {
		return nil, false, fmt.Errorf("omnichat commitment: record: %w", queryErr)
	}
	defer rows.Close()

	stored, scanErr := scanOmniChatCommitments(rows)
	if scanErr != nil {
		return nil, false, fmt.Errorf("omnichat commitment: scan: %w", scanErr)
	}
	if len(stored) == 0 {
		return nil, false, errors.New("omnichat commitment: insert returned nothing")
	}
	return stored[0], true, nil
}

// Outstanding is what is still open between these two, newest first.
func (r *OmniChatCommitmentRepository) Outstanding(
	ctx context.Context, personaID, ownerUserID, limit int,
) ([]*OmniChatCommitment, error) {
	if personaID < 1 || ownerUserID < 1 {
		return nil, nil
	}
	if limit < 1 || limit > 50 {
		limit = OmniChatMaxOpenCommitments
	}
	rows, err := r.pool.Query(ctx, `
		SELECT `+omniChatCommitmentColumns+`
		FROM omnichat_commitments
		WHERE persona_id = $1 AND owner_user_id = $2 AND status = 'open'
		ORDER BY created_at DESC, id DESC
		LIMIT $3
	`, personaID, ownerUserID, limit)
	if err != nil {
		return nil, fmt.Errorf("omnichat commitment: load outstanding: %w", err)
	}
	defer rows.Close()

	commitments, err := scanOmniChatCommitments(rows)
	if err != nil {
		return nil, fmt.Errorf("omnichat commitment: scan outstanding: %w", err)
	}
	return commitments, nil
}

// Resolve settles one commitment. Kept, broken, and released are all endings;
// only 'open' is not, and it is refused here because a commitment cannot be
// resolved back into being outstanding.
func (r *OmniChatCommitmentRepository) Resolve(
	ctx context.Context, commitmentID int64, status string,
) (*OmniChatCommitment, error) {
	switch status {
	case OmniChatCommitmentKept, OmniChatCommitmentBroken, OmniChatCommitmentReleased:
	default:
		return nil, fmt.Errorf("omnichat commitment: %q is not a resolution", status)
	}
	if commitmentID < 1 {
		return nil, errors.New("omnichat commitment: an id is required")
	}

	rows, err := r.pool.Query(ctx, `
		UPDATE omnichat_commitments
		SET status = $2, resolved_at = now()
		WHERE id = $1 AND status = 'open'
		RETURNING `+omniChatCommitmentColumns,
		commitmentID, status)
	if err != nil {
		return nil, fmt.Errorf("omnichat commitment: resolve: %w", err)
	}
	defer rows.Close()

	resolved, err := scanOmniChatCommitments(rows)
	if err != nil {
		return nil, fmt.Errorf("omnichat commitment: scan resolution: %w", err)
	}
	if len(resolved) == 0 {
		// Missing and already-settled answer alike: either way there is nothing
		// outstanding here to settle.
		return nil, ErrOmniChatCommitmentNotOpen
	}
	return resolved[0], nil
}

var ErrOmniChatCommitmentNotOpen = errors.New("omnichat commitment: nothing open to resolve")

func truncateOmniChatCommitmentSummary(summary string) string {
	runes := []rune(summary)
	if len(runes) <= maxOmniChatCommitmentSummaryRunes {
		return summary
	}
	return strings.TrimRight(string(runes[:maxOmniChatCommitmentSummaryRunes]), " ") + "…"
}

// OmniChatCommitmentResolution is one outstanding commitment being settled by a
// later exchange.
type OmniChatCommitmentResolution struct {
	CommitmentID int64
	Status       string
}

// ValidOmniChatCommitmentResolution reports whether a status is an ending.
// 'open' is not: a commitment cannot be resolved back into being outstanding.
func ValidOmniChatCommitmentResolution(status string) bool {
	switch status {
	case OmniChatCommitmentKept, OmniChatCommitmentBroken, OmniChatCommitmentReleased:
		return true
	}
	return false
}
