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

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrOmniChatRequestConflict   = errors.New("omnichat: request id conflicts with a prior request")
	ErrOmniChatRequestInProgress = errors.New("omnichat: request is already in progress")
	ErrOmniChatConversationBusy  = errors.New("omnichat: conversation already has an active turn")
)

const omniChatRequestPendingLease = 2 * time.Minute

type OmniChatRequestClaim struct {
	Replay   bool
	Response json.RawMessage
}

// OmniChatRequestIdempotencyRepository owns durable, owner-scoped request
// mappings for paid or quota-limited OmniChat operations. The request UUID is
// globally unique per user, which deliberately prevents accidental reuse of a
// key against another conversation, message, or generation target.
type OmniChatRequestIdempotencyRepository struct {
	pool *pgxpool.Pool
	now  func() time.Time
}

func NewOmniChatRequestIdempotencyRepository(pool *pgxpool.Pool) *OmniChatRequestIdempotencyRepository {
	return &OmniChatRequestIdempotencyRepository{pool: pool, now: time.Now}
}

func OmniChatRequestPayloadHash(payload []byte) string {
	digest := sha256.Sum256(payload)
	return hex.EncodeToString(digest[:])
}

// Begin claims a client request. An identical completed request returns its
// stored public response; an active one never starts duplicate provider work.
func (r *OmniChatRequestIdempotencyRepository) Begin(ctx context.Context, userID int, requestID uuid.UUID, scope, resource, payloadHash string) (*OmniChatRequestClaim, error) {
	scope = strings.TrimSpace(scope)
	resource = strings.TrimSpace(resource)
	payloadHash = strings.TrimSpace(payloadHash)
	if r == nil || r.pool == nil || userID <= 0 || requestID == uuid.Nil || scope == "" || resource == "" || payloadHash == "" {
		return nil, errors.New("omnichat: invalid idempotency request")
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("omnichat: begin request idempotency: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Serialize same owner/key claims across application instances. hashtext
	// collisions can only over-serialize unrelated requests, never merge them.
	lockKey := fmt.Sprintf("%d:%s", userID, requestID.String())
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(68424, hashtext($1))`, lockKey); err != nil {
		return nil, fmt.Errorf("omnichat: lock request idempotency: %w", err)
	}
	if scope == "chat_send" || scope == "chat_regenerate" {
		conversationLock := fmt.Sprintf("%d:%s", userID, resource)
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(68425, hashtext($1))`, conversationLock); err != nil {
			return nil, fmt.Errorf("omnichat: lock conversation turn: %w", err)
		}
	}

	var storedScope, storedResource, storedHash, status string
	var response []byte
	var updatedAt time.Time
	err = tx.QueryRow(ctx, `
        SELECT scope,resource_key,payload_hash,status,response_json,updated_at
        FROM omnichat_request_idempotency
        WHERE user_id=$1 AND client_request_id=$2
        FOR UPDATE
	`, userID, requestID).Scan(&storedScope, &storedResource, &storedHash, &status, &response, &updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		if scope == "chat_send" || scope == "chat_regenerate" {
			var active bool
			if err := tx.QueryRow(ctx, `
				SELECT EXISTS(
					SELECT 1 FROM omnichat_request_idempotency
					WHERE user_id=$1 AND resource_key=$2
					  AND scope IN ('chat_send','chat_regenerate')
					  AND status='pending' AND updated_at>$3
				)
			`, userID, resource, r.now().Add(-omniChatRequestPendingLease)).Scan(&active); err != nil {
				return nil, fmt.Errorf("omnichat: inspect active conversation turn: %w", err)
			}
			if active {
				return nil, ErrOmniChatConversationBusy
			}
		}
		_, err = tx.Exec(ctx, `
            INSERT INTO omnichat_request_idempotency(
                user_id,client_request_id,scope,resource_key,payload_hash,status
            ) VALUES($1,$2,$3,$4,$5,'pending')
        `, userID, requestID, scope, resource, payloadHash)
		if err != nil {
			return nil, fmt.Errorf("omnichat: persist request idempotency: %w", err)
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, fmt.Errorf("omnichat: commit request idempotency: %w", err)
		}
		return &OmniChatRequestClaim{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("omnichat: load request idempotency: %w", err)
	}
	if storedScope != scope || storedResource != resource || storedHash != payloadHash {
		return nil, ErrOmniChatRequestConflict
	}
	switch status {
	case "completed":
		if len(response) == 0 || !json.Valid(response) {
			return nil, errors.New("omnichat: completed request is missing a valid response")
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, fmt.Errorf("omnichat: commit idempotent replay: %w", err)
		}
		return &OmniChatRequestClaim{Replay: true, Response: append(json.RawMessage(nil), response...)}, nil
	case "pending":
		if updatedAt.After(r.now().Add(-omniChatRequestPendingLease)) {
			return nil, ErrOmniChatRequestInProgress
		}
		_, err = tx.Exec(ctx, `
            UPDATE omnichat_request_idempotency
            SET updated_at=NOW(), status='pending', response_json=NULL
            WHERE user_id=$1 AND client_request_id=$2
        `, userID, requestID)
		if err != nil {
			return nil, fmt.Errorf("omnichat: reclaim stale request: %w", err)
		}
	case "failed":
		_, err = tx.Exec(ctx, `
            UPDATE omnichat_request_idempotency
            SET updated_at=NOW(), status='pending', response_json=NULL
            WHERE user_id=$1 AND client_request_id=$2
        `, userID, requestID)
		if err != nil {
			return nil, fmt.Errorf("omnichat: retry failed request: %w", err)
		}
	default:
		return nil, errors.New("omnichat: request idempotency status is invalid")
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("omnichat: commit request claim: %w", err)
	}
	return &OmniChatRequestClaim{}, nil
}

func (r *OmniChatRequestIdempotencyRepository) Complete(ctx context.Context, userID int, requestID uuid.UUID, response json.RawMessage) error {
	if r == nil || r.pool == nil || userID <= 0 || requestID == uuid.Nil || len(response) == 0 || !json.Valid(response) {
		return errors.New("omnichat: invalid completed idempotency response")
	}
	tag, err := r.pool.Exec(ctx, `
        UPDATE omnichat_request_idempotency
        SET status='completed', response_json=$3, updated_at=NOW()
        WHERE user_id=$1 AND client_request_id=$2 AND status='pending'
    `, userID, requestID, []byte(response))
	if err != nil {
		return fmt.Errorf("omnichat: complete request idempotency: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return errors.New("omnichat: request idempotency completion was not accepted")
	}
	return nil
}

func (r *OmniChatRequestIdempotencyRepository) Fail(ctx context.Context, userID int, requestID uuid.UUID) error {
	if r == nil || r.pool == nil || userID <= 0 || requestID == uuid.Nil {
		return errors.New("omnichat: invalid failed idempotency request")
	}
	_, err := r.pool.Exec(ctx, `
        UPDATE omnichat_request_idempotency
        SET status='failed', response_json=NULL, updated_at=NOW()
        WHERE user_id=$1 AND client_request_id=$2 AND status='pending'
    `, userID, requestID)
	if err != nil {
		return fmt.Errorf("omnichat: fail request idempotency: %w", err)
	}
	return nil
}
