package repository

import (
	"context"
	"fmt"
	"maps"
	"sync"

	"github.com/omninudge/backend/internal/omnigame/model"
)

type ProfileRepository interface {
	UpsertProfile(ctx context.Context, profile model.OmniRaveProfile) error
	UpdateProfileField(ctx context.Context, profile model.OmniRaveProfile, field ProfileField) error
	GetProfile(ctx context.Context, userID int) (*model.OmniRaveProfile, error)
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
	profiles map[int]model.OmniRaveProfile
}

func NewInMemoryProfileRepository() *InMemoryProfileRepository {
	return &InMemoryProfileRepository{
		profiles: make(map[int]model.OmniRaveProfile),
	}
}

func (r *InMemoryProfileRepository) UpsertProfile(_ context.Context, profile model.OmniRaveProfile) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.profiles[profile.UserID] = cloneProfile(profile)
	return nil
}

func (r *InMemoryProfileRepository) UpdateProfileField(_ context.Context, update model.OmniRaveProfile, field ProfileField) error {
	if !validProfileField(field) {
		return fmt.Errorf("invalid profile field")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	profile, exists := r.profiles[update.UserID]
	if !exists {
		profile = model.DefaultOmniRaveProfile(update.UserID)
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
	r.profiles[update.UserID] = profile
	return nil
}

func (r *InMemoryProfileRepository) GetProfile(_ context.Context, userID int) (*model.OmniRaveProfile, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	profile, ok := r.profiles[userID]
	if !ok {
		return nil, nil
	}
	copyProfile := cloneProfile(profile)
	return &copyProfile, nil
}
