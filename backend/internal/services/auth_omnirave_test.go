package services

import (
	"context"
	"testing"

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
