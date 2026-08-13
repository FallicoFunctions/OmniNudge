package services

import (
	"context"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	omnigamemodel "github.com/omninudge/backend/internal/omnigame/model"
	"github.com/stretchr/testify/require"
)

// signWorldClaims mints a token the way a different issuer would, so these
// tests can present kinds this build's own issuer would never produce.
func signWorldClaims(t *testing.T, auth *AuthService, claims OmniRaveWorldJWTClaims) string {
	t.Helper()
	claims.Use = "omnirave_world"
	claims.RegisteredClaims = jwt.RegisteredClaims{
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
		Issuer:    "OmniNudge",
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(auth.jwtSecret)
	require.NoError(t, err)
	return signed
}

func TestOmniRaveWorldJWT_CarriesSubjectKind(t *testing.T) {
	auth := NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")
	userID := 42

	for _, tc := range []struct {
		name  string
		input OmniRaveWorldTokenInput
		want  omnigamemodel.SubjectKind
	}{
		{
			name:  "a signed-in player is an account",
			input: OmniRaveWorldTokenInput{UserID: &userID, Username: "alice", Mode: "account"},
			want:  omnigamemodel.SubjectKindAccount,
		},
		{
			name:  "a player with no user id is a guest",
			input: OmniRaveWorldTokenInput{Mode: "guest"},
			want:  omnigamemodel.SubjectKindGuest,
		},
		{
			// Nothing issues this yet. It is asserted so the field is known to
			// survive the round trip before anything depends on it doing so.
			name:  "a stated persona survives issue and validation",
			input: OmniRaveWorldTokenInput{SubjectKind: omnigamemodel.SubjectKindPersona, Mode: "account"},
			want:  omnigamemodel.SubjectKindPersona,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tc.input.PlayerID = "player-1"
			tc.input.PlayerName = "Player One"

			token, err := auth.GenerateOmniRaveWorldJWT(tc.input)
			require.NoError(t, err)

			claims, err := auth.ValidateOmniRaveWorldJWTContext(context.Background(), token)
			require.NoError(t, err)
			require.Equal(t, tc.want, claims.SubjectKind)
		})
	}
}

// The world must refuse a kind it does not recognise rather than picking one.
// Defaulting is how a newer issuer would get a subject admitted under rules
// this build never wrote -- the world deciding, silently, that the unfamiliar
// thing must be a guest.
func TestOmniRaveWorldJWT_RejectsUnrecognisedSubjectKind(t *testing.T) {
	auth := NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")

	for _, kind := range []omnigamemodel.SubjectKind{"resident", "admin", "Account", "npc"} {
		t.Run(string(kind), func(t *testing.T) {
			token := signWorldClaims(t, auth, OmniRaveWorldJWTClaims{
				SubjectKind: kind,
				PlayerID:    "player-1",
				PlayerName:  "Player One",
				Mode:        "guest",
			})

			_, err := auth.ValidateOmniRaveWorldJWTContext(context.Background(), token)
			require.Error(t, err, "a kind this build does not know must be refused, not defaulted")
			require.Contains(t, err.Error(), "subject kind")
		})
	}
}

// A token from an issuer older than the field carries no kind at all. That is
// not the same as an unrecognised one: it is filled in the way that issuer's
// tokens were always read, which can only produce account or guest. Omission
// therefore cannot introduce a kind nobody stated.
func TestOmniRaveWorldJWT_FillsAbsentSubjectKind(t *testing.T) {
	auth := NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")
	userID := 9

	for _, tc := range []struct {
		name   string
		userID *int
		want   omnigamemodel.SubjectKind
	}{
		{name: "with a user id", userID: &userID, want: omnigamemodel.SubjectKindAccount},
		{name: "without a user id", userID: nil, want: omnigamemodel.SubjectKindGuest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			token := signWorldClaims(t, auth, OmniRaveWorldJWTClaims{
				UserID:     tc.userID,
				PlayerID:   "player-1",
				PlayerName: "Player One",
				Mode:       "account",
			})

			claims, err := auth.ValidateOmniRaveWorldJWTContext(context.Background(), token)
			require.NoError(t, err, "a token predating the field must still be accepted")
			require.Equal(t, tc.want, claims.SubjectKind)
			require.NotEqual(t, omnigamemodel.SubjectKindPersona, claims.SubjectKind)
		})
	}
}
