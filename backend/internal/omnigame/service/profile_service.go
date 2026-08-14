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

	next := model.DefaultOmniRaveProfile(userID)
	next.Loadout = loadout
	if profile != nil {
		next.ReturnPoint = profile.ReturnPoint
		next.LastVenue = profile.LastVenue
		next.Settings = profile.Settings
	}

	return s.repo.UpsertProfile(ctx, next)
}

func (s *ProfileService) SaveReturnPoint(ctx context.Context, userID int, point *model.SavedPoint) error {
	profile, err := s.repo.GetProfile(ctx, userID)
	if err != nil {
		return err
	}

	next := model.DefaultOmniRaveProfile(userID)
	next.ReturnPoint = point
	if profile != nil {
		next.Loadout = profile.Loadout
		next.LastVenue = profile.LastVenue
		next.Settings = profile.Settings
	}

	return s.repo.UpsertProfile(ctx, next)
}

func (s *ProfileService) SaveSettings(ctx context.Context, userID int, settings model.OmniRaveSettings) error {
	profile, err := s.repo.GetProfile(ctx, userID)
	if err != nil {
		return err
	}

	next := model.DefaultOmniRaveProfile(userID)
	next.Settings = settings
	if profile != nil {
		next.Loadout = profile.Loadout
		next.ReturnPoint = profile.ReturnPoint
		next.LastVenue = profile.LastVenue
	}

	return s.repo.UpsertProfile(ctx, next)
}

func (s *ProfileService) SaveLastVenue(ctx context.Context, userID int, venue string) error {
	profile, err := s.repo.GetProfile(ctx, userID)
	if err != nil {
		return err
	}

	next := model.DefaultOmniRaveProfile(userID)
	next.LastVenue = venue
	if profile != nil {
		next.Loadout = profile.Loadout
		next.ReturnPoint = profile.ReturnPoint
		next.Settings = profile.Settings
	}

	return s.repo.UpsertProfile(ctx, next)
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
