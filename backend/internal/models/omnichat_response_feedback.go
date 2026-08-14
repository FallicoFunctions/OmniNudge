package models

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type OmniChatResponseFeedbackReason string

const (
	OmniChatFeedbackRoleOwnership     OmniChatResponseFeedbackReason = "role_ownership"
	OmniChatFeedbackUserAgency        OmniChatResponseFeedbackReason = "user_agency"
	OmniChatFeedbackNarrationFormat   OmniChatResponseFeedbackReason = "narration_format"
	OmniChatFeedbackRepetitionLength  OmniChatResponseFeedbackReason = "repetition_length"
	OmniChatFeedbackGrammarArtifact   OmniChatResponseFeedbackReason = "grammar_artifact"
	OmniChatFeedbackCharacterMismatch OmniChatResponseFeedbackReason = "character_mismatch"
	OmniChatFeedbackOther             OmniChatResponseFeedbackReason = "other"
)

const (
	omniChatFeedbackMaxNoteRunes        = 1000
	omniChatFeedbackMaxResponseRunes    = 20000
	omniChatFeedbackMaxUserContextRunes = 10000
)

type OmniChatResponseFeedback struct {
	ID             uuid.UUID                      `json:"id"`
	ConversationID int                            `json:"conversation_id"`
	MessageID      int                            `json:"message_id"`
	Reason         OmniChatResponseFeedbackReason `json:"reason"`
	Note           string                         `json:"note,omitempty"`
	CreatedAt      time.Time                      `json:"created_at"`
	UpdatedAt      time.Time                      `json:"updated_at"`
}

type OmniChatResponseFeedbackStatus string

const (
	OmniChatFeedbackStatusNew       OmniChatResponseFeedbackStatus = "new"
	OmniChatFeedbackStatusReviewed  OmniChatResponseFeedbackStatus = "reviewed"
	OmniChatFeedbackStatusPromoted  OmniChatResponseFeedbackStatus = "promoted"
	OmniChatFeedbackStatusDismissed OmniChatResponseFeedbackStatus = "dismissed"
)

// OmniChatResponseFeedbackAdminDetail contains only the deliberately captured
// review snapshots. It never joins persona prompts or provider configuration.
type OmniChatResponseFeedbackAdminDetail struct {
	ID                 uuid.UUID                      `json:"id"`
	ConversationID     int                            `json:"conversation_id"`
	MessageID          int                            `json:"message_id"`
	PersonaID          int                            `json:"persona_id"`
	Reason             OmniChatResponseFeedbackReason `json:"reason"`
	Status             OmniChatResponseFeedbackStatus `json:"status"`
	Note               string                         `json:"note,omitempty"`
	ResponseSnapshot   string                         `json:"response_snapshot"`
	PriorUserSnapshot  string                         `json:"prior_user_snapshot,omitempty"`
	SceneStateSnapshot json.RawMessage                `json:"scene_state_snapshot"`
	CreatedAt          time.Time                      `json:"created_at"`
	UpdatedAt          time.Time                      `json:"updated_at"`
}

// OmniChatResponseFeedbackAdminSummary is intentionally snapshot-free so list
// views do not bulk-export conversation material.
type OmniChatResponseFeedbackAdminSummary struct {
	ID             uuid.UUID                      `json:"id"`
	ConversationID int                            `json:"conversation_id"`
	MessageID      int                            `json:"message_id"`
	PersonaID      int                            `json:"persona_id"`
	Reason         OmniChatResponseFeedbackReason `json:"reason"`
	Status         OmniChatResponseFeedbackStatus `json:"status"`
	CreatedAt      time.Time                      `json:"created_at"`
	UpdatedAt      time.Time                      `json:"updated_at"`
}

type OmniChatResponseFeedbackRepository struct {
	pool *pgxpool.Pool
}

var ErrOmniChatResponseFeedbackInvalidTransition = errors.New("omnichat response feedback: invalid status transition")

func NewOmniChatResponseFeedbackRepository(pool *pgxpool.Pool) *OmniChatResponseFeedbackRepository {
	return &OmniChatResponseFeedbackRepository{pool: pool}
}

func ValidOmniChatResponseFeedbackReason(reason OmniChatResponseFeedbackReason) bool {
	switch reason {
	case OmniChatFeedbackRoleOwnership,
		OmniChatFeedbackUserAgency,
		OmniChatFeedbackNarrationFormat,
		OmniChatFeedbackRepetitionLength,
		OmniChatFeedbackGrammarArtifact,
		OmniChatFeedbackCharacterMismatch,
		OmniChatFeedbackOther:
		return true
	default:
		return false
	}
}

func ValidOmniChatResponseFeedbackStatus(status OmniChatResponseFeedbackStatus) bool {
	return status == OmniChatFeedbackStatusNew || status == OmniChatFeedbackStatusReviewed || status == OmniChatFeedbackStatusPromoted || status == OmniChatFeedbackStatusDismissed
}

func (r *OmniChatResponseFeedbackRepository) ListForAdmin(ctx context.Context, status *OmniChatResponseFeedbackStatus, reason *OmniChatResponseFeedbackReason, limit, offset int) ([]*OmniChatResponseFeedbackAdminSummary, int, error) {
	if r == nil || r.pool == nil {
		return nil, 0, errors.New("omnichat response feedback: repository is unavailable")
	}
	if limit < 1 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	const listSelect = `SELECT id,conversation_id,message_id,persona_id,reason,status,created_at,updated_at FROM omnichat_response_feedback WHERE TRUE`
	query := listSelect
	args := []any{}
	if status != nil && *status != "" {
		if !ValidOmniChatResponseFeedbackStatus(*status) {
			return nil, 0, errors.New("omnichat response feedback: status is invalid")
		}
		args = append(args, *status)
		query += fmt.Sprintf(" AND status = $%d", len(args))
	}
	if reason != nil && *reason != "" {
		if !ValidOmniChatResponseFeedbackReason(*reason) {
			return nil, 0, errors.New("omnichat response feedback: reason is invalid")
		}
		args = append(args, *reason)
		query += fmt.Sprintf(" AND reason = $%d", len(args))
	}
	var total int
	if err := r.pool.QueryRow(ctx, "SELECT COUNT(*) FROM omnichat_response_feedback WHERE TRUE"+query[len(listSelect):], args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, limit, offset)
	query += fmt.Sprintf(" ORDER BY created_at DESC,id DESC LIMIT $%d OFFSET $%d", len(args)-1, len(args))
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := make([]*OmniChatResponseFeedbackAdminSummary, 0, limit)
	for rows.Next() {
		item, err := scanOmniChatResponseFeedbackAdminSummary(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	return items, total, rows.Err()
}

func scanOmniChatResponseFeedbackAdminSummary(scanner interface{ Scan(...any) error }) (*OmniChatResponseFeedbackAdminSummary, error) {
	item := &OmniChatResponseFeedbackAdminSummary{}
	err := scanner.Scan(&item.ID, &item.ConversationID, &item.MessageID, &item.PersonaID, &item.Reason, &item.Status, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}

func (r *OmniChatResponseFeedbackRepository) GetForAdmin(ctx context.Context, id uuid.UUID) (*OmniChatResponseFeedbackAdminDetail, error) {
	if r == nil || r.pool == nil {
		return nil, errors.New("omnichat response feedback: repository is unavailable")
	}
	item, err := scanOmniChatResponseFeedbackAdminDetail(r.pool.QueryRow(ctx, `SELECT id,conversation_id,message_id,persona_id,reason,status,note,response_snapshot,preceding_user_snapshot,scene_state_snapshot,created_at,updated_at FROM omnichat_response_feedback WHERE id=$1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return item, err
}

func (r *OmniChatResponseFeedbackRepository) TransitionStatusForAdmin(ctx context.Context, id uuid.UUID, status OmniChatResponseFeedbackStatus) (*OmniChatResponseFeedbackAdminDetail, error) {
	if r == nil || r.pool == nil {
		return nil, errors.New("omnichat response feedback: repository is unavailable")
	}
	if !ValidOmniChatResponseFeedbackStatus(status) || status == OmniChatFeedbackStatusNew {
		return nil, ErrOmniChatResponseFeedbackInvalidTransition
	}
	item, err := scanOmniChatResponseFeedbackAdminDetail(r.pool.QueryRow(ctx, `
		UPDATE omnichat_response_feedback SET status=$2,updated_at=CURRENT_TIMESTAMP
		WHERE id=$1 AND (status=$2 OR (status='new' AND $2 IN ('reviewed','dismissed')) OR (status='reviewed' AND $2 IN ('promoted','dismissed')))
		RETURNING id,conversation_id,message_id,persona_id,reason,status,note,response_snapshot,preceding_user_snapshot,scene_state_snapshot,created_at,updated_at`, id, status))
	if errors.Is(err, pgx.ErrNoRows) {
		var exists bool
		if checkErr := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM omnichat_response_feedback WHERE id=$1)`, id).Scan(&exists); checkErr != nil {
			return nil, checkErr
		}
		if exists {
			return nil, ErrOmniChatResponseFeedbackInvalidTransition
		}
		return nil, nil
	}
	return item, err
}

func scanOmniChatResponseFeedbackAdminDetail(scanner interface{ Scan(...any) error }) (*OmniChatResponseFeedbackAdminDetail, error) {
	item := &OmniChatResponseFeedbackAdminDetail{}
	err := scanner.Scan(&item.ID, &item.ConversationID, &item.MessageID, &item.PersonaID, &item.Reason, &item.Status, &item.Note, &item.ResponseSnapshot, &item.PriorUserSnapshot, &item.SceneStateSnapshot, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}

// CreateOwned snapshots server-derived context for a reported assistant reply.
// The browser supplies only the allowlisted reason and optional note. Ownership,
// message role, response text, prior user turn, persona, and scene state are all
// resolved within the transaction.
func (r *OmniChatResponseFeedbackRepository) CreateOwned(
	ctx context.Context,
	ownerUserID, conversationID, messageID int,
	reason OmniChatResponseFeedbackReason,
	note string,
) (*OmniChatResponseFeedback, error) {
	note = strings.TrimSpace(note)
	if ownerUserID < 1 || conversationID < 1 || messageID < 1 {
		return nil, errors.New("omnichat response feedback: owner, conversation, and message are required")
	}
	if !ValidOmniChatResponseFeedbackReason(reason) {
		return nil, errors.New("omnichat response feedback: reason is invalid")
	}
	if utf8.RuneCountInString(note) > omniChatFeedbackMaxNoteRunes {
		return nil, fmt.Errorf("omnichat response feedback: note must be at most %d characters", omniChatFeedbackMaxNoteRunes)
	}
	if r == nil || r.pool == nil {
		return nil, errors.New("omnichat response feedback: repository is unavailable")
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var personaID int
	var response string
	var precedingUserMessageID *int
	var precedingUser string
	var scenePayload []byte
	err = tx.QueryRow(ctx, `
		SELECT c.persona_id, m.content, previous.id, COALESCE(previous.content, ''),
		       COALESCE(checkpoint.state, '{}'::jsonb)
		FROM bot_messages m
		JOIN bot_conversations c ON c.id = m.conversation_id
		LEFT JOIN LATERAL (
			SELECT prior.id, prior.content
			FROM bot_messages prior
			WHERE prior.conversation_id = c.id
			  AND prior.role = 'user'
			  AND prior.id < m.id
			ORDER BY prior.id DESC
			LIMIT 1
		) previous ON TRUE
		LEFT JOIN LATERAL (
			SELECT cp.state
			FROM omnichat_conversation_scene_state_checkpoints cp
			WHERE cp.conversation_id = c.id
			  AND cp.owner_user_id = c.user_id
			  AND cp.message_id <= m.id
			ORDER BY cp.message_id DESC
			LIMIT 1
		) checkpoint ON TRUE
		WHERE c.id = $1
		  AND c.user_id = $2
		  AND c.archived_at IS NULL
		  AND m.id = $3
		  AND m.conversation_id = c.id
		  AND m.role = 'assistant'
		  AND m.failed = FALSE
		FOR SHARE OF c, m
	`, conversationID, ownerUserID, messageID).Scan(
		&personaID, &response, &precedingUserMessageID, &precedingUser, &scenePayload,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrOmniChatConversationNotOwned
	}
	if err != nil {
		return nil, err
	}

	responseHash := sha256.Sum256([]byte(response))
	response = truncateOmniChatFeedbackText(response, omniChatFeedbackMaxResponseRunes)
	precedingUser = truncateOmniChatFeedbackText(precedingUser, omniChatFeedbackMaxUserContextRunes)
	if len(scenePayload) == 0 || !json.Valid(scenePayload) {
		scenePayload = []byte(`{}`)
	}

	feedback := &OmniChatResponseFeedback{}
	err = tx.QueryRow(ctx, `
		INSERT INTO omnichat_response_feedback (
			id, owner_user_id, conversation_id, message_id, persona_id,
			preceding_user_message_id, reason, note, response_snapshot,
			preceding_user_snapshot, response_hash, scene_state_snapshot
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (owner_user_id, message_id, response_hash) DO UPDATE SET
			reason = EXCLUDED.reason,
			note = EXCLUDED.note,
			preceding_user_message_id = EXCLUDED.preceding_user_message_id,
			preceding_user_snapshot = EXCLUDED.preceding_user_snapshot,
			scene_state_snapshot = EXCLUDED.scene_state_snapshot,
			updated_at = CURRENT_TIMESTAMP
		RETURNING id, conversation_id, message_id, reason, note, created_at, updated_at
	`, uuid.New(), ownerUserID, conversationID, messageID, personaID,
		precedingUserMessageID, reason, note, response, precedingUser,
		hex.EncodeToString(responseHash[:]), scenePayload,
	).Scan(
		&feedback.ID, &feedback.ConversationID, &feedback.MessageID,
		&feedback.Reason, &feedback.Note, &feedback.CreatedAt, &feedback.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return feedback, nil
}

func truncateOmniChatFeedbackText(value string, maximum int) string {
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) <= maximum {
		return value
	}
	runes := []rune(value)
	return strings.TrimSpace(string(runes[:maximum]))
}
