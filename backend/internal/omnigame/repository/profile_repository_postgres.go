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
	profile = model.NormalizeOmniRaveProfile(profile)

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

	settingsJSON, err := json.Marshal(profile.Settings)
	if err != nil {
		return err
	}

	_, err = r.pool.Exec(ctx, `
		INSERT INTO omnirave_profiles (user_id, loadout, return_point, settings, last_venue)
		VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5)
		ON CONFLICT (user_id) DO UPDATE
		SET loadout = EXCLUDED.loadout,
		    return_point = EXCLUDED.return_point,
		    settings = EXCLUDED.settings,
		    last_venue = EXCLUDED.last_venue,
		    updated_at = now()
	`, profile.UserID, string(loadoutJSON), nullableJSONB(returnPointJSON), string(settingsJSON), profile.LastVenue)
	return err
}

func (r *PostgresProfileRepository) GetProfile(ctx context.Context, userID int) (*model.OmniRaveProfile, error) {
	var loadoutJSON []byte
	var returnPointJSON []byte
	var settingsJSON []byte
	var lastVenue string

	err := r.pool.QueryRow(ctx, `
		SELECT loadout, COALESCE(return_point::text, '')::bytea, settings, last_venue
		FROM omnirave_profiles
		WHERE user_id = $1
	`, userID).Scan(&loadoutJSON, &returnPointJSON, &settingsJSON, &lastVenue)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	profile := model.DefaultOmniRaveProfile(userID)
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
	if len(settingsJSON) > 0 {
		var settings model.OmniRaveSettings
		if err := json.Unmarshal(settingsJSON, &settings); err != nil {
			return nil, err
		}
		if settings != (model.OmniRaveSettings{}) {
			profile.Settings = settings
		}
	}
	if lastVenue != "" {
		profile.LastVenue = lastVenue
	}

	normalized := model.NormalizeOmniRaveProfile(profile)
	return &normalized, nil
}

func nullableJSONB(payload []byte) any {
	if len(payload) == 0 {
		return nil
	}
	return string(payload)
}
