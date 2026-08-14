package services

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
)

const testWorldEventSecret = "world-event-secret-that-is-long-enough-ok"

func newTestWorldEventAuth(t *testing.T) *WorldEventAuth {
	t.Helper()
	auth, err := NewWorldEventAuth(testWorldEventSecret, testSiteSecret)
	require.NoError(t, err)
	return auth
}

func TestWorldEventAuth_RoundTrip(t *testing.T) {
	auth := newTestWorldEventAuth(t)

	token, err := auth.Mint(77, time.Minute)
	require.NoError(t, err)

	claims, err := auth.Validate(token)
	require.NoError(t, err)
	require.Equal(t, int64(77), claims.PersonaID)
	require.Equal(t, WorldEventTokenUse, claims.Use)
}

// The two service credentials must not be interchangeable, and this is the
// case that would be missed by relying on the secrets alone: both directions
// are tried with the *same* secret, so the signature verifies and only the use
// claim is left to refuse it.
//
// Key confusion is worth pinning here because the powers differ. Admission is
// refusable and leaves nothing behind; a world event writes into the character's
// own memory, which every person who talks to it reads. A runtime holding one
// must not find it also opens the other.
func TestWorldEventAuth_IsNotInterchangeableWithAdmission(t *testing.T) {
	sharedSecret := "a-secret-both-were-misconfigured-with-ok"

	worldEvents, err := NewWorldEventAuth(sharedSecret, testSiteSecret)
	require.NoError(t, err)
	admission, err := NewPersonaAdmissionAuth(sharedSecret, testSiteSecret)
	require.NoError(t, err)

	admitToken, err := admission.Mint(7, time.Minute)
	require.NoError(t, err)
	worldEventToken, err := worldEvents.Mint(7, time.Minute)
	require.NoError(t, err)

	_, err = worldEvents.Validate(admitToken)
	require.Error(t, err, "an admission credential must not record a world event")

	_, err = admission.Validate(worldEventToken)
	require.Error(t, err, "a world-event credential must not admit a persona")
}

// With the secrets configured as they should be -- separately -- the refusal
// happens at the signature and never reaches the use check at all.
func TestWorldEventAuth_RejectsCredentialsSignedWithAnotherKey(t *testing.T) {
	worldEvents := newTestWorldEventAuth(t)

	admission, err := NewPersonaAdmissionAuth(testAdmitSecret, testSiteSecret)
	require.NoError(t, err)
	admitToken, err := admission.Mint(7, time.Minute)
	require.NoError(t, err)

	_, err = worldEvents.Validate(admitToken)
	require.Error(t, err)
}

// A user session must never be able to write to a character's own memory. If
// it could, any signed-in user could put words into a character that everyone
// else then reads back.
func TestWorldEventAuth_RejectsSiteCredentials(t *testing.T) {
	worldEvents := newTestWorldEventAuth(t)
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
			_, err := worldEvents.Validate(tc.token)
			require.Error(t, err, "a site credential must never write self-tier memory")
		})
	}
}

func TestWorldEventAuth_RejectsWrongUse(t *testing.T) {
	auth := newTestWorldEventAuth(t)

	for _, use := range []string{"", "api", "ws", "game", "omnirave_world", PersonaAdmitTokenUse, "world_event_v2"} {
		t.Run("use="+use, func(t *testing.T) {
			claims := WorldEventClaims{
				PersonaID: 5,
				Use:       use,
				RegisteredClaims: jwt.RegisteredClaims{
					ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute)),
					IssuedAt:  jwt.NewNumericDate(time.Now()),
					Issuer:    serviceCredentialIssuer,
				},
			}
			signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testWorldEventSecret))
			require.NoError(t, err)

			_, err = auth.Validate(signed)
			require.Error(t, err)
		})
	}
}

func TestWorldEventAuth_RejectsExpired(t *testing.T) {
	auth := newTestWorldEventAuth(t)

	claims := WorldEventClaims{
		PersonaID: 5,
		Use:       WorldEventTokenUse,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Second)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-time.Hour)),
			Issuer:    serviceCredentialIssuer,
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testWorldEventSecret))
	require.NoError(t, err)

	_, err = auth.Validate(signed)
	require.Error(t, err, "an expired credential must not be honoured")
}

// A credential with no expiry at all must be refused, not treated as one that
// cannot expire. The cap lives in Mint, so it binds only this service; what
// binds anyone holding the secret is that validation demands an exp. This is
// the bug the admission credential shipped with, and sharing one implementation
// is what stops it being reintroduced here.
func TestWorldEventAuth_RejectsTokenWithoutExpiry(t *testing.T) {
	auth := newTestWorldEventAuth(t)

	claims := WorldEventClaims{
		PersonaID: 5,
		Use:       WorldEventTokenUse,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer: serviceCredentialIssuer,
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testWorldEventSecret))
	require.NoError(t, err)

	_, err = auth.Validate(signed)
	require.Error(t, err, "a credential with no expiry must not be honoured forever")
}

func TestWorldEventAuth_RejectsForeignIssuer(t *testing.T) {
	auth := newTestWorldEventAuth(t)

	claims := WorldEventClaims{
		PersonaID: 5,
		Use:       WorldEventTokenUse,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute)),
			Issuer:    "somebody-else",
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testWorldEventSecret))
	require.NoError(t, err)

	_, err = auth.Validate(signed)
	require.Error(t, err)
}

func TestWorldEventAuth_RejectsUnsignedToken(t *testing.T) {
	auth := newTestWorldEventAuth(t)

	claims := WorldEventClaims{
		PersonaID: 5,
		Use:       WorldEventTokenUse,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute)),
			Issuer:    serviceCredentialIssuer,
		},
	}
	unsigned, err := jwt.NewWithClaims(jwt.SigningMethodNone, claims).SignedString(jwt.UnsafeAllowNoneSignatureType)
	require.NoError(t, err)

	_, err = auth.Validate(unsigned)
	require.Error(t, err, "alg=none must be refused")
}

// A credential names the character it may write memories for, so one obtained
// for a character cannot be spent putting memories into another.
func TestWorldEventAuth_TokenNamesItsPersona(t *testing.T) {
	auth := newTestWorldEventAuth(t)

	token, err := auth.Mint(101, time.Minute)
	require.NoError(t, err)

	claims, err := auth.Validate(token)
	require.NoError(t, err)
	require.Equal(t, int64(101), claims.PersonaID)

	_, err = auth.Mint(0, time.Minute)
	require.Error(t, err, "a credential that names no character is meaningless")
}

func TestNewWorldEventAuth_RefusesBadConfiguration(t *testing.T) {
	for _, tc := range []struct {
		name   string
		secret string
		site   string
		want   error
		// notWant is the admission credential's value for the same kind of
		// failure. Naming it here is the point of the table: while the two
		// credentials aliased one set of values, every row below asserted
		// something equally true of the credential it is not about.
		notWant error
	}{
		{name: "missing", secret: "", site: testSiteSecret,
			want: ErrWorldEventSecretMissing, notWant: ErrPersonaAdmitSecretMissing},
		{name: "too short", secret: "short", site: testSiteSecret,
			want: ErrWorldEventSecretWeak, notWant: ErrPersonaAdmitSecretWeak},
		{name: "shared with the site", secret: testSiteSecret, site: testSiteSecret,
			want: ErrWorldEventSecretShared, notWant: ErrPersonaAdmitSecretShared},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := NewWorldEventAuth(tc.secret, tc.site)
			require.ErrorIs(t, err, tc.want)
			require.NotErrorIs(t, err, tc.notWant,
				"which credential failed must be something errors.Is can answer")
			require.Contains(t, err.Error(), worldEventLabel,
				"a startup failure must say which credential it was about")
		})
	}
}

// Which kind of failure it was is a separate question from which credential
// had it, and both have to keep working: an operator wants to know a secret is
// missing, and a caller wants to know which one.
func TestServiceCredentialErrorsAnswerBothQuestions(t *testing.T) {
	require.ErrorIs(t, ErrWorldEventSecretMissing, ErrServiceCredentialSecretMissing)
	require.ErrorIs(t, ErrPersonaAdmitSecretMissing, ErrServiceCredentialSecretMissing)
	require.NotErrorIs(t, ErrWorldEventSecretMissing, ErrPersonaAdmitSecretMissing)
	require.NotErrorIs(t, ErrPersonaAdmitSecretWeak, ErrWorldEventSecretWeak)
	require.NotErrorIs(t, ErrPersonaAdmitSecretShared, ErrWorldEventSecretShared)
}

func TestWorldEventAuth_CapsTokenLifetime(t *testing.T) {
	auth := newTestWorldEventAuth(t)

	token, err := auth.Mint(5, 24*time.Hour)
	require.NoError(t, err)

	claims, err := auth.Validate(token)
	require.NoError(t, err)
	require.WithinDuration(t, time.Now().Add(worldEventMaxTTL), claims.ExpiresAt.Time, time.Minute)
}
