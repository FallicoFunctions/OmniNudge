package repository

import (
	"context"
	"errors"
	"sync"

	"github.com/omninudge/backend/internal/omnigame/model"
)

// ErrInvalidResidentRef rejects a subject before it reaches the database, where
// an empty kind would otherwise be written as a row nothing can address.
var ErrInvalidResidentRef = errors.New("omnigame: invalid resident reference")

type ProfileRepository interface {
	UpsertProfile(ctx context.Context, profile model.OmniRaveProfile) error
	GetProfile(ctx context.Context, userID int) (*model.OmniRaveProfile, error)
	GetProfileBySubject(ctx context.Context, subject model.ResidentRef) (*model.OmniRaveProfile, error)
	UpsertProfileBySubject(ctx context.Context, profile model.OmniRaveProfile) error
}

func accountSubject(userID int) model.ResidentRef {
	return model.ResidentRef{Kind: model.SubjectKindAccount, ID: int64(userID)}
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
	subject := profile.ResolvedSubject()
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
	r.profiles[subject] = stored
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
	copyProfile := model.NormalizeOmniRaveProfile(profile)
	return &copyProfile, nil
}
