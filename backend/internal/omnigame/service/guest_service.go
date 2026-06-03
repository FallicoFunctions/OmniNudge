package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omnigame/repository"
)

var ErrSanctionedGuest = errors.New("sanctioned guest bootstrap")

type GuestService struct {
	sanctions      repository.SanctionRepository
	worldSocketURL string
}

func NewGuestService(sanctions repository.SanctionRepository, worldSocketURL string) *GuestService {
	return &GuestService{
		sanctions:      sanctions,
		worldSocketURL: worldSocketURL,
	}
}

func (s *GuestService) CreateGuestLaunchSession() *model.LaunchSession {
	suffix := uuid.NewString()[:6]
	guestName := fmt.Sprintf("Guest-%s", suffix)
	return &model.LaunchSession{
		GameSlug:    "omnirave",
		Mode:        model.LaunchModeGuest,
		LaunchToken: uuid.NewString(),
		PlayerID:    fmt.Sprintf("guest-%s", suffix),
		GuestName:   guestName,
		PlayerName:  guestName,
	}
}

func (s *GuestService) ExchangeBootstrap(ctx context.Context, token, remoteIP string) (*model.SessionExchangeResponse, error) {
	networkHash := hashGuestNetwork(remoteIP)
	if blocked, err := s.sanctions.IsBootstrapBlocked(ctx, token, networkHash); err != nil {
		return nil, err
	} else if blocked {
		return nil, ErrSanctionedGuest
	}

	return &model.SessionExchangeResponse{
		WorldSocketURL: s.worldSocketURL,
		Mode:           model.LaunchModeGuest,
		ActiveZone:     "main_stage",
		Loadout:        map[string]string{},
	}, nil
}

func hashGuestNetwork(remoteIP string) string {
	remoteIP = strings.TrimSpace(remoteIP)
	if remoteIP == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(remoteIP))
	return hex.EncodeToString(sum[:])
}
