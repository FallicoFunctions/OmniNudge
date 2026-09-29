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
	next := model.DefaultOmniRaveProfile(userID)
	next.Loadout = loadout
	return s.repo.UpdateProfileField(ctx, next, repository.ProfileLoadout)
}

func (s *ProfileService) SaveReturnPoint(ctx context.Context, userID int, point *model.SavedPoint) error {
	next := model.DefaultOmniRaveProfile(userID)
	next.ReturnPoint = point
	return s.repo.UpdateProfileField(ctx, next, repository.ProfileReturnPoint)
}

func (s *ProfileService) SaveSettings(ctx context.Context, userID int, settings model.OmniRaveSettings) error {
	next := model.DefaultOmniRaveProfile(userID)
	next.Settings = settings
	return s.repo.UpdateProfileField(ctx, next, repository.ProfileSettings)
}

func (s *ProfileService) SaveLastVenue(ctx context.Context, userID int, venue string) error {
	next := model.DefaultOmniRaveProfile(userID)
	next.LastVenue = venue
	return s.repo.UpdateProfileField(ctx, next, repository.ProfileLastVenue)
}

func (s *ProfileService) GetProfile(ctx context.Context, userID int) (*model.OmniRaveProfile, error) {
	profile, err := s.repo.GetProfile(ctx, userID)
	if err != nil {
		return nil, err
	}
	if profile == nil {
		defaults := model.DefaultOmniRaveProfile(userID)
		return &defaults, nil
	}
	normalized := model.NormalizeOmniRaveProfile(*profile)
	return &normalized, nil
}
