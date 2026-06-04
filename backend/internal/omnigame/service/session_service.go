package service

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omnigame/repository"
	omniraveworld "github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
)

type SessionService struct {
	runtimeURL     string
	worldSocketURL string
	guestService   *GuestService
	mediaState     *omniraveworld.MediaState
	profileService *ProfileService
	tokenIssuer    GameSessionTokenIssuer
	now            func() time.Time
	mu             sync.Mutex
	launches       map[string]*model.LaunchSession
}

type GameSessionTokenIssuer interface {
	GenerateGameSessionJWTWithVersion(userID int, username string, tokenVersion int) (string, error)
	GenerateOmniRaveWorldJWT(input services.OmniRaveWorldTokenInput) (string, error)
}

func NewSessionService(runtimeURL, worldSocketURL string) *SessionService {
	return NewSessionServiceWithMediaState(
		runtimeURL,
		worldSocketURL,
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
		nil,
		nil,
	)
}

func NewSessionServiceWithRepositories(
	runtimeURL, worldSocketURL string,
	profiles repository.ProfileRepository,
	sanctions repository.SanctionRepository,
) *SessionService {
	return NewSessionServiceWithMediaState(runtimeURL, worldSocketURL, profiles, sanctions, nil, nil)
}

func NewSessionServiceWithMediaState(
	runtimeURL, worldSocketURL string,
	profiles repository.ProfileRepository,
	sanctions repository.SanctionRepository,
	mediaState *omniraveworld.MediaState,
	tokenIssuer GameSessionTokenIssuer,
) *SessionService {
	if mediaState == nil {
		mediaState = omniraveworld.NewMediaState()
	}

	return &SessionService{
		runtimeURL:     runtimeURL,
		worldSocketURL: worldSocketURL,
		guestService:   NewGuestService(sanctions, worldSocketURL),
		mediaState:     mediaState,
		profileService: NewProfileService(profiles),
		tokenIssuer:    tokenIssuer,
		now:            func() time.Time { return time.Now().UTC() },
		launches:       make(map[string]*model.LaunchSession),
	}
}

func NewSessionServiceWithDependencies(
	runtimeURL, worldSocketURL string,
	profiles repository.ProfileRepository,
	sanctions repository.SanctionRepository,
	tokenIssuer GameSessionTokenIssuer,
) *SessionService {
	return NewSessionServiceWithMediaState(runtimeURL, worldSocketURL, profiles, sanctions, nil, tokenIssuer)
}

func (s *SessionService) CreateLaunchSession(_ context.Context, req model.LaunchRequest, identity model.PlayerIdentity) (*model.LaunchSession, error) {
	switch req.Mode {
	case model.LaunchModeAccount:
		if identity.UserID == nil || strings.TrimSpace(identity.Username) == "" {
			return nil, fmt.Errorf("signed-in launch requires authenticated user")
		}
		session := &model.LaunchSession{
			GameSlug:     "omnirave",
			Mode:         model.LaunchModeAccount,
			LaunchToken:  uuid.NewString(),
			PlayerID:     fmt.Sprintf("user-%d", *identity.UserID),
			PlayerName:   identity.Username,
			UserID:       identity.UserID,
			TokenVersion: identity.TokenVersion,
		}
		s.storeLaunch(session)
		return session, nil
	case model.LaunchModeGuest:
		session := s.guestService.CreateGuestLaunchSession()
		s.storeLaunch(session)
		return session, nil
	default:
		return nil, fmt.Errorf("unsupported launch mode: %s", req.Mode)
	}
}

func (s *SessionService) BuildLaunchURL(session *model.LaunchSession) (string, error) {
	base, err := url.Parse(s.runtimeURL)
	if err != nil {
		return "", fmt.Errorf("parse runtime url: %w", err)
	}

	query := base.Query()
	query.Set("mode", string(session.Mode))
	query.Set("handoff", session.LaunchToken)
	base.RawQuery = query.Encode()

	return base.String(), nil
}

func (s *SessionService) ExchangeLaunchSession(ctx context.Context, req model.SessionExchangeRequest) (*model.SessionExchangeResponse, error) {
	if req.Handoff == "" {
		return nil, fmt.Errorf("missing handoff")
	}

	s.mu.Lock()
	session, ok := s.launches[req.Handoff]
	if ok {
		delete(s.launches, req.Handoff)
	}
	s.mu.Unlock()

	if !ok {
		return nil, fmt.Errorf("launch handoff not found")
	}
	if session.Mode != req.Mode {
		return nil, fmt.Errorf("launch mode mismatch")
	}

	if session.Mode == model.LaunchModeGuest {
		bootstrap, err := s.guestService.ExchangeBootstrap(ctx, req.Handoff, req.RemoteIP)
		if err != nil {
			return nil, err
		}
		return s.hydrateGuestRuntimeResponse(session, bootstrap, "main_stage"), nil
	}

	if session.Mode == model.LaunchModeAccount && session.UserID != nil {
		return s.buildAccountRuntimeResponse(ctx, model.PlayerIdentity{
			UserID:       session.UserID,
			Username:     session.PlayerName,
			TokenVersion: session.TokenVersion,
		}, "main_stage")
	}

	return nil, fmt.Errorf("unsupported launch session")
}

func (s *SessionService) BuildRuntimeAccountSession(ctx context.Context, input model.RuntimeAuthRequest, identity model.PlayerIdentity) (*model.SessionExchangeResponse, error) {
	if identity.UserID == nil || strings.TrimSpace(identity.Username) == "" {
		return nil, fmt.Errorf("runtime account bootstrap requires authenticated identity")
	}

	profile, err := s.profileService.GetProfile(ctx, *identity.UserID)
	if err != nil {
		return nil, err
	}

	nextVenue := input.CurrentVenue
	if strings.TrimSpace(nextVenue) == "" {
		nextVenue = "main_stage"
	}

	if len(profile.Loadout) == 0 && len(input.CurrentLoadout) > 0 {
		profile.Loadout = input.CurrentLoadout
		if err := s.profileService.SaveLoadout(ctx, *identity.UserID, profile.Loadout); err != nil {
			return nil, err
		}
	}

	if input.CurrentSettings != (model.OmniRaveSettings{}) && profile.Settings == model.DefaultOmniRaveSettings() {
		profile.Settings = input.CurrentSettings
		if err := s.profileService.SaveSettings(ctx, *identity.UserID, profile.Settings); err != nil {
			return nil, err
		}
	}

	if err := s.profileService.SaveLastVenue(ctx, *identity.UserID, nextVenue); err != nil {
		return nil, err
	}

	return s.buildAccountRuntimeResponse(ctx, identity, nextVenue)
}

func (s *SessionService) BuildRuntimeGuestLogout(ctx context.Context, currentVenue string) (*model.SessionExchangeResponse, error) {
	nextVenue := currentVenue
	if strings.TrimSpace(nextVenue) == "" {
		nextVenue = "main_stage"
	}

	return s.buildGuestRuntimeResponse(ctx, nextVenue, "")
}

func (s *SessionService) storeLaunch(session *model.LaunchSession) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.launches[session.LaunchToken] = session
}

func (s *SessionService) currentZoneMedia() []model.ZoneMediaState {
	snapshots := s.mediaState.Snapshots(s.now())
	zoneMedia := make([]model.ZoneMediaState, 0, len(snapshots))
	for _, snapshot := range snapshots {
		zoneMedia = append(zoneMedia, model.ZoneMediaState{
			ZoneID:          string(snapshot.ZoneID),
			VideoID:         snapshot.VideoID,
			PlaylistIndex:   snapshot.Index,
			PlayheadSeconds: int64(snapshot.Playhead / time.Second),
		})
	}
	return zoneMedia
}

func (s *SessionService) ProfileService() *ProfileService {
	return s.profileService
}

func (s *SessionService) buildAccountRuntimeResponse(ctx context.Context, identity model.PlayerIdentity, activeZone string) (*model.SessionExchangeResponse, error) {
	if identity.UserID == nil {
		return nil, fmt.Errorf("missing user identity")
	}

	profile, err := s.profileService.GetProfile(ctx, *identity.UserID)
	if err != nil {
		return nil, err
	}

	nextActiveZone := activeZone
	if strings.TrimSpace(nextActiveZone) == "" {
		nextActiveZone = "main_stage"
	}

	response := &model.SessionExchangeResponse{
		PlayerID:       fmt.Sprintf("user-%d", *identity.UserID),
		PlayerName:     identity.Username,
		WorldSocketURL: s.worldSocketURL,
		Mode:           model.LaunchModeAccount,
		ActiveZone:     nextActiveZone,
		Loadout:        profile.Loadout,
		LastVenue:      profile.LastVenue,
		Settings:       profile.Settings,
		ZoneMedia:      s.currentZoneMedia(),
		ReturnPoint:    profile.ReturnPoint,
	}

	if s.tokenIssuer != nil {
		sessionToken, err := s.tokenIssuer.GenerateGameSessionJWTWithVersion(*identity.UserID, identity.Username, identity.TokenVersion)
		if err != nil {
			return nil, err
		}
		response.SessionToken = sessionToken

		worldToken, err := s.tokenIssuer.GenerateOmniRaveWorldJWT(services.OmniRaveWorldTokenInput{
			UserID:       identity.UserID,
			Username:     identity.Username,
			TokenVersion: identity.TokenVersion,
			PlayerID:     response.PlayerID,
			PlayerName:   response.PlayerName,
			Mode:         string(response.Mode),
			Loadout:      response.Loadout,
			ReturnPoint:  response.ReturnPoint,
		})
		if err != nil {
			return nil, err
		}
		response.WorldSessionToken = worldToken
	}

	return response, nil
}

func (s *SessionService) buildGuestRuntimeResponse(ctx context.Context, activeZone, remoteIP string) (*model.SessionExchangeResponse, error) {
	guest := s.guestService.CreateGuestLaunchSession()
	bootstrap, err := s.guestService.ExchangeBootstrap(ctx, guest.LaunchToken, remoteIP)
	if err != nil {
		return nil, err
	}

	return s.hydrateGuestRuntimeResponse(guest, bootstrap, activeZone), nil
}

func (s *SessionService) hydrateGuestRuntimeResponse(session *model.LaunchSession, bootstrap *model.SessionExchangeResponse, activeZone string) *model.SessionExchangeResponse {
	nextActiveZone := activeZone
	if strings.TrimSpace(nextActiveZone) == "" {
		nextActiveZone = "main_stage"
	}

	defaultProfile := model.DefaultOmniRaveProfile(0)
	bootstrap.PlayerID = session.PlayerID
	bootstrap.PlayerName = session.PlayerName
	bootstrap.ActiveZone = nextActiveZone
	bootstrap.LastVenue = nextActiveZone
	bootstrap.Settings = defaultProfile.Settings
	bootstrap.ZoneMedia = s.currentZoneMedia()
	if bootstrap.Loadout == nil {
		bootstrap.Loadout = map[string]string{}
	}

	return bootstrap
}
