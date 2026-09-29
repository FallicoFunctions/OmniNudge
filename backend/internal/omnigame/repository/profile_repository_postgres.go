package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

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
	profile.Subject = accountSubject(profile.UserID)
	return r.UpsertProfileBySubject(ctx, profile)
}

func (r *PostgresProfileRepository) GetProfile(ctx context.Context, userID int) (*model.OmniRaveProfile, error) {
	return r.GetProfileBySubject(ctx, accountSubject(userID))
}

func (r *PostgresProfileRepository) UpsertProfileBySubject(ctx context.Context, profile model.OmniRaveProfile) error {
	return r.writeProfile(ctx, profile, "")
}

// UpdateProfileField writes one field of an account resident's profile.
func (r *PostgresProfileRepository) UpdateProfileField(ctx context.Context, profile model.OmniRaveProfile, field ProfileField) error {
	if !validProfileField(field) {
		return fmt.Errorf("invalid profile field")
	}
	profile.Subject = accountSubject(profile.UserID)
	return r.writeProfile(ctx, profile, field)
}

// writeProfile writes every field when field is empty, and only that field
// otherwise.
func (r *PostgresProfileRepository) writeProfile(ctx context.Context, profile model.OmniRaveProfile, field ProfileField) error {
	// Read as given, not through ResolvedSubject. That fallback derives an
	// account subject from UserID, which is a safe thing to do when reading a
	// profile written before the field existed and an unsafe one here: a
	// caller passing {persona, 0} alongside UserID 5 would have its write
	// silently redirected into user 5's row. A stated subject that does not
	// parse is an error, never an instruction to guess a different resident.
	subject := profile.Subject
	if !subject.Valid() {
		return ErrInvalidResidentRef
	}

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

	// Only an account resident has a user; the account_has_user check requires
	// the column on that kind, and the primary key forbids it on any other.
	var userID any
	if subject.Kind == model.SubjectKindAccount {
		userID = subject.ID
	}

	_, err = r.pool.Exec(ctx, `
		INSERT INTO omnirave_profiles (subject_kind, subject_id, user_id, loadout, return_point, settings, last_venue)
		VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7)
		ON CONFLICT (subject_kind, subject_id) DO UPDATE
		SET user_id = EXCLUDED.user_id,
		    loadout = CASE WHEN $8 IN ('', 'loadout') THEN EXCLUDED.loadout ELSE omnirave_profiles.loadout END,
		    return_point = CASE WHEN $8 IN ('', 'return_point') THEN EXCLUDED.return_point ELSE omnirave_profiles.return_point END,
		    settings = CASE WHEN $8 IN ('', 'settings') THEN EXCLUDED.settings ELSE omnirave_profiles.settings END,
		    last_venue = CASE WHEN $8 IN ('', 'last_venue') THEN EXCLUDED.last_venue ELSE omnirave_profiles.last_venue END,
		    updated_at = now()
	`, string(subject.Kind), subject.ID, userID, string(loadoutJSON), nullableJSONB(returnPointJSON), string(settingsJSON), profile.LastVenue, string(field))
	return err
}

func (r *PostgresProfileRepository) GetProfileBySubject(ctx context.Context, subject model.ResidentRef) (*model.OmniRaveProfile, error) {
	if !subject.Valid() {
		return nil, ErrInvalidResidentRef
	}

	var loadoutJSON []byte
	var returnPointJSON []byte
	var settingsJSON []byte
	var lastVenue string

	err := r.pool.QueryRow(ctx, `
		SELECT loadout, COALESCE(return_point::text, '')::bytea, settings, last_venue
		FROM omnirave_profiles
		WHERE subject_kind = $1 AND subject_id = $2
	`, string(subject.Kind), subject.ID).Scan(&loadoutJSON, &returnPointJSON, &settingsJSON, &lastVenue)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	accountUserID := 0
	if subject.Kind == model.SubjectKindAccount {
		accountUserID = int(subject.ID)
	}
	profile := model.DefaultOmniRaveProfile(accountUserID)
	profile.Subject = subject
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
