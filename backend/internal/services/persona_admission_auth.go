package services

import (
	"crypto/subtle"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// PersonaAdmitTokenUse is the only purpose this credential is good for. It is
// carried in the token and checked on every validation, so a token minted with
// the admission secret for some other purpose cannot be spent here.
const PersonaAdmitTokenUse = "persona_admit"

// personaAdmitMaxTTL bounds how long an admission credential this service
// mints can live. The spec keeps world tokens short and renews them rather
// than issuing long-lived ones; the credential used to obtain them should not
// outlive them by much.
//
// This cap binds the issuer only. What binds every presenter is that Validate
// requires an exp at all -- see the parse options there.
const personaAdmitMaxTTL = 5 * time.Minute

// personaAdmitIssuer is stamped on every credential and required on every
// validation, matching the issuer the site tokens use.
const personaAdmitIssuer = "OmniNudge"

// personaAdmitMinSecretLen is enforced at construction. A short secret on an
// endpoint that can admit an identity is worth failing the process over.
const personaAdmitMinSecretLen = 32

var (
	ErrPersonaAdmitSecretMissing = errors.New("persona admission secret is not configured")
	ErrPersonaAdmitSecretWeak    = fmt.Errorf("persona admission secret must be at least %d bytes", personaAdmitMinSecretLen)
	ErrPersonaAdmitSecretShared  = errors.New("persona admission secret must differ from the site JWT secret")
)

// PersonaAdmitClaims is what the agent runtime presents to admit a persona.
//
// It deliberately has no user id, no session and no role. The endpoint that
// accepts it is proving that the caller is the agent runtime, not that some
// user is signed in, and giving this credential a user-shaped field would
// invite exactly the confusion the separation exists to prevent.
type PersonaAdmitClaims struct {
	PersonaID int64  `json:"persona_id"`
	Use       string `json:"use"`
	jwt.RegisteredClaims
}

// PersonaAdmissionAuth mints and checks the credential the agent runtime uses
// to admit a persona to a world.
//
// It holds its own secret, separate from the one that signs site sessions.
// That separation is the whole point: it makes "a valid user session is not
// sufficient" a property of the signatures rather than a rule somebody has to
// remember to enforce. A stolen site cookie, a world token, and an API token
// are all signed with a different key and are simply not valid here -- no
// check has to notice they are the wrong kind, because they do not verify.
type PersonaAdmissionAuth struct {
	secret []byte
}

// NewPersonaAdmissionAuth fails rather than degrading. A service that starts
// with admission quietly disabled, or with a secret shared with the site, is
// worse than one that refuses to start: the first is discovered when a persona
// cannot be admitted, and the second is discovered by whoever exploits it.
func NewPersonaAdmissionAuth(secret string, siteJWTSecret string) (*PersonaAdmissionAuth, error) {
	if secret == "" {
		return nil, ErrPersonaAdmitSecretMissing
	}
	if len(secret) < personaAdmitMinSecretLen {
		return nil, ErrPersonaAdmitSecretWeak
	}
	// Constant time because this runs at startup with operator-supplied values;
	// it costs nothing and avoids making the comparison itself a signal.
	if siteJWTSecret != "" && subtle.ConstantTimeCompare([]byte(secret), []byte(siteJWTSecret)) == 1 {
		return nil, ErrPersonaAdmitSecretShared
	}
	return &PersonaAdmissionAuth{secret: []byte(secret)}, nil
}

// Mint issues a credential for admitting one persona. The token names the
// persona it is good for, so a credential obtained for one character cannot be
// replayed to admit another.
func (a *PersonaAdmissionAuth) Mint(personaID int64, ttl time.Duration) (string, error) {
	if a == nil {
		return "", ErrPersonaAdmitSecretMissing
	}
	if personaID <= 0 {
		return "", errors.New("persona admission: persona id is required")
	}
	if ttl <= 0 || ttl > personaAdmitMaxTTL {
		ttl = personaAdmitMaxTTL
	}

	now := time.Now()
	claims := PersonaAdmitClaims{
		PersonaID: personaID,
		Use:       PersonaAdmitTokenUse,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    personaAdmitIssuer,
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(a.secret)
}

// Validate accepts only a credential this service minted, for this purpose,
// that carries an expiry and has not reached it.
//
// The expiry has to be demanded rather than merely checked when present.
// jwt/v5 treats a missing exp as "no expiry to fail", so without
// WithExpirationRequired a token forged with this secret and no exp claim at
// all would be honoured forever, and the TTL cap above -- which lives in Mint
// -- would bind only the honest issuer.
func (a *PersonaAdmissionAuth) Validate(tokenString string) (*PersonaAdmitClaims, error) {
	if a == nil {
		return nil, ErrPersonaAdmitSecretMissing
	}

	token, err := jwt.ParseWithClaims(
		tokenString,
		&PersonaAdmitClaims{},
		func(token *jwt.Token) (interface{}, error) {
			// Pinning the family rejects an "alg: none" token and stops a
			// caller choosing a scheme where the public part of some other
			// key would verify.
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return a.secret, nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
		jwt.WithIssuer(personaAdmitIssuer),
	)
	if err != nil {
		return nil, fmt.Errorf("persona admission: %w", err)
	}

	claims, ok := token.Claims.(*PersonaAdmitClaims)
	if !ok || !token.Valid {
		return nil, errors.New("persona admission: invalid token")
	}
	if claims.Use != PersonaAdmitTokenUse {
		return nil, fmt.Errorf("persona admission: token is not for admission (use=%q)", claims.Use)
	}
	if claims.PersonaID <= 0 {
		return nil, errors.New("persona admission: token names no persona")
	}

	return claims, nil
}
