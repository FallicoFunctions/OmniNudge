package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
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
	// PlayerID needs real collision resistance (it's the world server's map
	// key), so it keeps the uuid suffix. GuestName/PlayerName are cosmetic and
	// spec §10.1 wants the display form `GuestXXXX` (digits only, no hyphen).
	suffix := uuid.NewString()[:6]
	guestName := fmt.Sprintf("Guest%04d", randomGuestNumber())
	return &model.LaunchSession{
		GameSlug:    "omnirave",
		Mode:        model.LaunchModeGuest,
		LaunchToken: uuid.NewString(),
		PlayerID:    fmt.Sprintf("guest-%s", suffix),
		GuestName:   guestName,
		PlayerName:  guestName,
	}
}

// randomGuestNumber returns 0..9999. crypto/rand, not math/rand: this is a
// player-visible identity string, not just test fixture data.
func randomGuestNumber() int64 {
	n, err := rand.Int(rand.Reader, big.NewInt(10000))
	if err != nil {
		// Astronomically unlikely (crypto/rand backed by the OS CSPRNG); a
		// display-only fallback is fine, it never touches PlayerID identity.
		return 0
	}
	return n.Int64()
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
