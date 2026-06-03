package repository

import (
	"context"
	"sync"

	"github.com/omninudge/backend/internal/omnigame/model"
)

type ProfileRepository interface {
	UpsertProfile(ctx context.Context, profile model.OmniRaveProfile) error
	GetProfile(ctx context.Context, userID int) (*model.OmniRaveProfile, error)
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
	r.profiles[profile.UserID] = profile
	return nil
}

func (r *InMemoryProfileRepository) GetProfile(_ context.Context, userID int) (*model.OmniRaveProfile, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	profile, ok := r.profiles[userID]
	if !ok {
		return nil, nil
	}
	copyProfile := profile
	return &copyProfile, nil
}
