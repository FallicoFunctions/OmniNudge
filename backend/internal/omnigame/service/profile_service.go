package service

import (
	"context"

	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omnigame/repository"
)

type ProfileService struct {
	repo repository.ProfileRepository
}

func NewProfileService(repo repository.ProfileRepository) *ProfileService {
	return &ProfileService{repo: repo}
}

func (s *ProfileService) SaveLoadout(ctx context.Context, userID int, loadout map[string]string) error {
	profile, err := s.repo.GetProfile(ctx, userID)
	if err != nil {
		return err
	}

	next := model.OmniRaveProfile{
		UserID:  userID,
		Loadout: loadout,
	}
	if profile != nil {
		next.ReturnPoint = profile.ReturnPoint
	}

	return s.repo.UpsertProfile(ctx, next)
}

func (s *ProfileService) SaveReturnPoint(ctx context.Context, userID int, point *model.SavedPoint) error {
	profile, err := s.repo.GetProfile(ctx, userID)
	if err != nil {
		return err
	}

	next := model.OmniRaveProfile{
		UserID:      userID,
		Loadout:     map[string]string{},
		ReturnPoint: point,
	}
	if profile != nil {
		next.Loadout = profile.Loadout
	}

	return s.repo.UpsertProfile(ctx, next)
}

func (s *ProfileService) GetProfile(ctx context.Context, userID int) (*model.OmniRaveProfile, error) {
	return s.repo.GetProfile(ctx, userID)
}
