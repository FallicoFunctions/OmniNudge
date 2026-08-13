package services

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
)

const (
	testAdmitSecret = "persona-admission-secret-that-is-long-enough"
	testSiteSecret  = "site-jwt-secret-that-is-also-long-enough-ok"
)

func newTestAdmissionAuth(t *testing.T) *PersonaAdmissionAuth {
	t.Helper()
	auth, err := NewPersonaAdmissionAuth(testAdmitSecret, testSiteSecret)
	require.NoError(t, err)
	return auth
}

func TestPersonaAdmissionAuth_RoundTrip(t *testing.T) {
	auth := newTestAdmissionAuth(t)

	token, err := auth.Mint(77, time.Minute)
	require.NoError(t, err)

	claims, err := auth.Validate(token)
	require.NoError(t, err)
	require.Equal(t, int64(77), claims.PersonaID)
	require.Equal(t, PersonaAdmitTokenUse, claims.Use)
}

// The invariant the whole separation exists for: a valid user session must not
// be sufficient to admit a persona. If it were, any signed-in user could make
// the world believe they are a character, and persona identity would become an
// impersonation primitive.
//
// This is enforced by the signatures rather than by a check remembering to
// look: site credentials are signed with a different key, so they do not
// verify here at all.
func TestPersonaAdmissionAuth_RejectsSiteCredentials(t *testing.T) {
	admission := newTestAdmissionAuth(t)
	site := NewAuthService(testSiteSecret, "OmniNudge", "")

	userID := 42
	siteAccess, err := site.GenerateJWT(userID, "alice", "user")
	require.NoError(t, err)

	worldToken, err := site.GenerateOmniRaveWorldJWT(OmniRaveWorldTokenInput{
		UserID:     &userID,
		Username:   "alice",
		PlayerID:   "user-42",
		PlayerName: "Alice",
		Mode:       "account",
	})
	require.NoError(t, err)

	for _, tc := range []struct {
		name  string
		token string
	}{
		{name: "a site access token", token: siteAccess},
		{name: "a world session token", token: worldToken},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := admission.Validate(tc.token)
			require.Error(t, err, "a site credential must never admit a persona")
		})
	}
}

// A token minted with the admission secret but for some other purpose is also
// refused. The key separation stops outsiders; the use claim stops this
// credential being repurposed from inside.
func TestPersonaAdmissionAuth_RejectsWrongUse(t *testing.T) {
	auth := newTestAdmissionAuth(t)

	for _, use := range []string{"", "api", "ws", "game", "omnirave_world", "persona_admit_v2"} {
		t.Run("use="+use, func(t *testing.T) {
			claims := PersonaAdmitClaims{
				PersonaID: 5,
				Use:       use,
				RegisteredClaims: jwt.RegisteredClaims{
					ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute)),
					IssuedAt:  jwt.NewNumericDate(time.Now()),
				},
			}
			signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testAdmitSecret))
			require.NoError(t, err)

			_, err = auth.Validate(signed)
			require.Error(t, err)
		})
	}
}

func TestPersonaAdmissionAuth_RejectsExpired(t *testing.T) {
	auth := newTestAdmissionAuth(t)

	claims := PersonaAdmitClaims{
		PersonaID: 5,
		Use:       PersonaAdmitTokenUse,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Second)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-time.Hour)),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testAdmitSecret))
	require.NoError(t, err)

	_, err = auth.Validate(signed)
	require.Error(t, err, "an expired credential must not be honoured")
}

// An unsigned token must not be accepted by claiming there is no algorithm.
func TestPersonaAdmissionAuth_RejectsUnsignedToken(t *testing.T) {
	auth := newTestAdmissionAuth(t)

	claims := PersonaAdmitClaims{
		PersonaID: 5,
		Use:       PersonaAdmitTokenUse,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute)),
		},
	}
	unsigned, err := jwt.NewWithClaims(jwt.SigningMethodNone, claims).SignedString(jwt.UnsafeAllowNoneSignatureType)
	require.NoError(t, err)

	_, err = auth.Validate(unsigned)
	require.Error(t, err, "alg=none must be refused")
}

// A credential names the persona it admits, so one obtained for a character
// cannot be spent on another.
func TestPersonaAdmissionAuth_TokenNamesItsPersona(t *testing.T) {
	auth := newTestAdmissionAuth(t)

	token, err := auth.Mint(101, time.Minute)
	require.NoError(t, err)

	claims, err := auth.Validate(token)
	require.NoError(t, err)
	require.Equal(t, int64(101), claims.PersonaID)
	require.NotEqual(t, int64(102), claims.PersonaID)

	_, err = auth.Mint(0, time.Minute)
	require.Error(t, err, "a credential that names no persona is meaningless")
}

// Configuration fails loudly. A service that starts with admission quietly
// disabled is discovered when a persona cannot be admitted; one sharing the
// site secret is discovered by whoever exploits it.
func TestNewPersonaAdmissionAuth_RefusesBadConfiguration(t *testing.T) {
	for _, tc := range []struct {
		name   string
		secret string
		site   string
		want   error
	}{
		{name: "missing", secret: "", site: testSiteSecret, want: ErrPersonaAdmitSecretMissing},
		{name: "too short", secret: "short", site: testSiteSecret, want: ErrPersonaAdmitSecretWeak},
		{name: "shared with the site", secret: testSiteSecret, site: testSiteSecret, want: ErrPersonaAdmitSecretShared},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := NewPersonaAdmissionAuth(tc.secret, tc.site)
			require.ErrorIs(t, err, tc.want)
		})
	}

	auth, err := NewPersonaAdmissionAuth(testAdmitSecret, testSiteSecret)
	require.NoError(t, err)
	require.NotNil(t, auth)
}

// The credential is short-lived by construction: a caller asking for a longer
// life gets the cap, not what it asked for.
func TestPersonaAdmissionAuth_CapsTokenLifetime(t *testing.T) {
	auth := newTestAdmissionAuth(t)

	token, err := auth.Mint(5, 24*time.Hour)
	require.NoError(t, err)

	claims, err := auth.Validate(token)
	require.NoError(t, err)
	require.WithinDuration(t, time.Now().Add(personaAdmitMaxTTL), claims.ExpiresAt.Time, time.Minute)
}
