package services

import (
	"context"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	omnigamemodel "github.com/omninudge/backend/internal/omnigame/model"
	"github.com/stretchr/testify/require"
)

func TestAuthService_GenerateAndValidateOmniRaveWorldJWT(t *testing.T) {
	authService := NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")
	userID := 42

	token, err := authService.GenerateOmniRaveWorldJWT(OmniRaveWorldTokenInput{
		UserID:       &userID,
		Username:     "alice",
		TokenVersion: 7,
		PlayerID:     "user-42",
		PlayerName:   "Alice",
		Mode:         "account",
		Loadout: map[string]string{
			"hair": "buzz",
			"top":  "black_mesh",
		},
		ReturnPoint: &omnigamemodel.SavedPoint{X: 12, Y: 0, Z: 8},
	})
	require.NoError(t, err)

	claims, err := authService.ValidateOmniRaveWorldJWTContext(context.Background(), token)
	require.NoError(t, err)
	require.NotNil(t, claims.UserID)
	require.Equal(t, userID, *claims.UserID)
	require.Equal(t, "alice", claims.Username)
	require.Equal(t, 7, claims.TokenVersion)
	require.Equal(t, "user-42", claims.PlayerID)
	require.Equal(t, "Alice", claims.PlayerName)
	require.Equal(t, "account", claims.Mode)
	require.Equal(t, "buzz", claims.Loadout["hair"])
	require.NotNil(t, claims.ReturnPoint)
	require.Equal(t, 12.0, claims.ReturnPoint.X)
}

// OmniGame mints its own session token for runtime profile writes, and it is
// not session-bound. Validation rejects any non-session token whose use is not
// on a known list, so dropping "game" from that list silently rejects every
// OmniGame profile write. Both branches were correct in isolation and only
// disagreed once merged, which is exactly the kind of thing nothing was
// checking.
func TestAuthService_AcceptsGameSessionTokenWithoutASession(t *testing.T) {
	authService := NewAuthService("dev-secret", "OmniGame/1.0", "")

	token, err := authService.GenerateGameSessionJWTWithVersion(42, "alice", 3)
	require.NoError(t, err)

	claims, err := authService.ValidateJWTContext(context.Background(), token)
	require.NoError(t, err, "a game token carries no session id and must still validate")
	require.Equal(t, "game", claims.Use)
	require.Equal(t, 42, claims.UserID)
	require.Empty(t, claims.SessionID)
}

// The allowlist is still an allowlist: an unrecognised use is refused rather
// than trusted because it happens to be signed.
func TestAuthService_RejectsUnknownTokenUseWithoutASession(t *testing.T) {
	authService := NewAuthService("dev-secret", "OmniGame/1.0", "")

	token, err := authService.generateJWT(42, "alice", "user", 0, 30*time.Minute, "not-a-real-use")
	require.NoError(t, err)

	_, err = authService.ValidateJWTContext(context.Background(), token)
	require.Error(t, err)
	require.Contains(t, err.Error(), "token use is not permitted")
}

// A world token with no exp at all must be refused rather than honoured
// forever. jwt/v5 reads a missing exp as "no expiry to fail", and the world
// now ends a live session at its token's expiry -- so a token without one
// would be a session with no end, which is exactly the property that bound was
// added to remove.
func TestAuthService_RejectsOmniRaveWorldTokenWithoutAnExpiry(t *testing.T) {
	authService := NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")

	claims := OmniRaveWorldJWTClaims{
		Use:        "omnirave_world",
		PlayerID:   "guest-1",
		PlayerName: "Guest-1",
		Mode:       "guest",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt: jwt.NewNumericDate(time.Now()),
			Issuer:   "OmniNudge",
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte("dev-secret"))
	require.NoError(t, err)

	_, err = authService.ValidateOmniRaveWorldJWTContext(context.Background(), token)
	require.Error(t, err, "a world token with no expiry must not validate")
}

// The tokens the world actually issues carry one, and the world reads it to
// decide when the session ends.
func TestAuthService_OmniRaveWorldTokenCarriesItsFiveMinuteExpiry(t *testing.T) {
	authService := NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")

	token, err := authService.GenerateOmniRaveWorldJWT(OmniRaveWorldTokenInput{
		PlayerID:   "guest-1",
		PlayerName: "Guest-1",
		Mode:       "guest",
	})
	require.NoError(t, err)

	claims, err := authService.ValidateOmniRaveWorldJWTContext(context.Background(), token)
	require.NoError(t, err)
	require.NotNil(t, claims.ExpiresAt, "the world reads this to end the session")
	require.WithinDuration(t, time.Now().Add(5*time.Minute), claims.ExpiresAt.Time, time.Minute)
}
