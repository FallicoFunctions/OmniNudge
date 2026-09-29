package repository

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"sync"

	"github.com/omninudge/backend/internal/omnigame/model"
)

// ErrInvalidResidentRef rejects a subject before it reaches the database, where
// an empty kind would otherwise be written as a row nothing can address.
var ErrInvalidResidentRef = errors.New("omnigame: invalid resident reference")

type ProfileRepository interface {
	UpsertProfile(ctx context.Context, profile model.OmniRaveProfile) error
	UpdateProfileField(ctx context.Context, profile model.OmniRaveProfile, field ProfileField) error
	GetProfile(ctx context.Context, userID int) (*model.OmniRaveProfile, error)
	GetProfileBySubject(ctx context.Context, subject model.ResidentRef) (*model.OmniRaveProfile, error)
	UpsertProfileBySubject(ctx context.Context, profile model.OmniRaveProfile) error
}

func accountSubject(userID int) model.ResidentRef {
	return model.ResidentRef{Kind: model.SubjectKindAccount, ID: int64(userID)}
}

// Each runtime write owns one field. Concurrent settings/venue updates must
// not restore a stale copy of the avatar loadout (or vice versa).
type ProfileField string

const (
	ProfileLoadout     ProfileField = "loadout"
	ProfileReturnPoint ProfileField = "return_point"
	ProfileSettings    ProfileField = "settings"
	ProfileLastVenue   ProfileField = "last_venue"
)

func validProfileField(field ProfileField) bool {
	switch field {
	case ProfileLoadout, ProfileReturnPoint, ProfileSettings, ProfileLastVenue:
		return true
	default:
		return false
	}
}

func cloneProfile(profile model.OmniRaveProfile) model.OmniRaveProfile {
	profile = model.NormalizeOmniRaveProfile(profile)
	profile.Loadout = maps.Clone(profile.Loadout)
	if profile.ReturnPoint != nil {
		point := *profile.ReturnPoint
		profile.ReturnPoint = &point
	}
	return profile
}

type InMemoryProfileRepository struct {
	mu       sync.RWMutex
	profiles map[model.ResidentRef]model.OmniRaveProfile
}

func NewInMemoryProfileRepository() *InMemoryProfileRepository {
	return &InMemoryProfileRepository{
		profiles: make(map[model.ResidentRef]model.OmniRaveProfile),
	}
}

func (r *InMemoryProfileRepository) UpsertProfile(ctx context.Context, profile model.OmniRaveProfile) error {
	profile.Subject = accountSubject(profile.UserID)
	return r.UpsertProfileBySubject(ctx, profile)
}

func (r *InMemoryProfileRepository) GetProfile(ctx context.Context, userID int) (*model.OmniRaveProfile, error) {
	return r.GetProfileBySubject(ctx, accountSubject(userID))
}

func (r *InMemoryProfileRepository) UpsertProfileBySubject(_ context.Context, profile model.OmniRaveProfile) error {
	// The subject is read as given rather than through ResolvedSubject. That
	// fallback derives an account subject from UserID, which on a write turns a
	// malformed persona reference into somebody else's row; see the postgres
	// implementation for the full reasoning. Both must refuse identically or
	// the tests that use this one stop meaning anything.
	subject := profile.Subject
	if !subject.Valid() {
		return ErrInvalidResidentRef
	}

	stored := model.NormalizeOmniRaveProfile(profile)
	stored.Subject = subject
	if subject.Kind != model.SubjectKindAccount {
		stored.UserID = 0
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	r.profiles[subject] = cloneProfile(stored)
	return nil
}

func (r *InMemoryProfileRepository) UpdateProfileField(_ context.Context, update model.OmniRaveProfile, field ProfileField) error {
	if !validProfileField(field) {
		return fmt.Errorf("invalid profile field")
	}
	subject := accountSubject(update.UserID)
	if !subject.Valid() {
		return ErrInvalidResidentRef
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	profile, exists := r.profiles[subject]
	if !exists {
		profile = model.DefaultOmniRaveProfile(update.UserID)
		profile.Subject = subject
	}
	update = cloneProfile(update)
	switch field {
	case ProfileLoadout:
		profile.Loadout = update.Loadout
	case ProfileReturnPoint:
		profile.ReturnPoint = update.ReturnPoint
	case ProfileSettings:
		profile.Settings = update.Settings
	case ProfileLastVenue:
		profile.LastVenue = update.LastVenue
	}
	r.profiles[subject] = profile
	return nil
}

func (r *InMemoryProfileRepository) GetProfileBySubject(_ context.Context, subject model.ResidentRef) (*model.OmniRaveProfile, error) {
	if !subject.Valid() {
		return nil, ErrInvalidResidentRef
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	profile, ok := r.profiles[subject]
	if !ok {
		return nil, nil
	}
	copyProfile := cloneProfile(profile)
	return &copyProfile, nil
}
