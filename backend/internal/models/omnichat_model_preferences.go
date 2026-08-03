package models

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrOmniChatConversationNotOwned = errors.New("omnichat conversation not found")

type OmniChatModelPreferenceRepository struct {
	pool *pgxpool.Pool
}

func NewOmniChatModelPreferenceRepository(pool *pgxpool.Pool) *OmniChatModelPreferenceRepository {
	return &OmniChatModelPreferenceRepository{pool: pool}
}

func (r *OmniChatModelPreferenceRepository) GetModelSelection(ctx context.Context, userID, conversationID int) (string, *string, error) {
	var defaultKey string
	var overrideKey *string
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(p.default_model_key, 'standard'), c.model_override_key
		FROM bot_conversations c
		LEFT JOIN omnichat_model_preferences p ON p.user_id = c.user_id
		WHERE c.id = $1 AND c.user_id = $2 AND c.archived_at IS NULL
	`, conversationID, userID).Scan(&defaultKey, &overrideKey)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, ErrOmniChatConversationNotOwned
	}
	return defaultKey, overrideKey, err
}

func (r *OmniChatModelPreferenceRepository) GetEffectiveModelKey(ctx context.Context, userID, conversationID int) (string, error) {
	defaultKey, overrideKey, err := r.GetModelSelection(ctx, userID, conversationID)
	if err != nil {
		return "", err
	}
	if overrideKey != nil {
		return *overrideKey, nil
	}
	return defaultKey, nil
}

func (r *OmniChatModelPreferenceRepository) SetConversationModel(ctx context.Context, userID, conversationID int, key string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE bot_conversations SET model_override_key = $1
		WHERE id = $2 AND user_id = $3 AND archived_at IS NULL
	`, key, conversationID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrOmniChatConversationNotOwned
	}
	return nil
}

func (r *OmniChatModelPreferenceRepository) SetAllChatsModel(ctx context.Context, userID int, key string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err = tx.Exec(ctx, `
		INSERT INTO omnichat_model_preferences (user_id, default_model_key, updated_at)
		VALUES ($1, $2, CURRENT_TIMESTAMP)
		ON CONFLICT (user_id) DO UPDATE
		SET default_model_key = EXCLUDED.default_model_key, updated_at = CURRENT_TIMESTAMP
	`, userID, key); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `
		UPDATE bot_conversations SET model_override_key = NULL
		WHERE user_id = $1 AND archived_at IS NULL
	`, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
