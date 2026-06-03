package repository

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/omnigame/model"
)

type PostgresProfileRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresProfileRepository(pool *pgxpool.Pool) *PostgresProfileRepository {
	return &PostgresProfileRepository{pool: pool}
}

func (r *PostgresProfileRepository) UpsertProfile(ctx context.Context, profile model.OmniRaveProfile) error {
	loadoutJSON, err := json.Marshal(profile.Loadout)
	if err != nil {
		return err
	}

	var returnPointJSON []byte
	if profile.ReturnPoint != nil {
		returnPointJSON, err = json.Marshal(profile.ReturnPoint)
		if err != nil {
			return err
		}
	}

	_, err = r.pool.Exec(ctx, `
		INSERT INTO omnirave_profiles (user_id, loadout, return_point)
		VALUES ($1, $2::jsonb, $3::jsonb)
		ON CONFLICT (user_id) DO UPDATE
		SET loadout = EXCLUDED.loadout,
		    return_point = EXCLUDED.return_point,
		    updated_at = now()
	`, profile.UserID, string(loadoutJSON), nullableJSONB(returnPointJSON))
	return err
}

func (r *PostgresProfileRepository) GetProfile(ctx context.Context, userID int) (*model.OmniRaveProfile, error) {
	var loadoutJSON []byte
	var returnPointJSON []byte

	err := r.pool.QueryRow(ctx, `
		SELECT loadout, COALESCE(return_point::text, '')::bytea
		FROM omnirave_profiles
		WHERE user_id = $1
	`, userID).Scan(&loadoutJSON, &returnPointJSON)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	profile := &model.OmniRaveProfile{
		UserID:  userID,
		Loadout: map[string]string{},
	}
	if len(loadoutJSON) > 0 {
		if err := json.Unmarshal(loadoutJSON, &profile.Loadout); err != nil {
			return nil, err
		}
	}
	if len(returnPointJSON) > 0 {
		var point model.SavedPoint
		if err := json.Unmarshal(returnPointJSON, &point); err != nil {
			return nil, err
		}
		profile.ReturnPoint = &point
	}

	return profile, nil
}

func nullableJSONB(payload []byte) any {
	if len(payload) == 0 {
		return nil
	}
	return string(payload)
}
