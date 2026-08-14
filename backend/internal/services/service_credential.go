package services

import (
	"crypto/subtle"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// serviceCredentialIssuer is stamped on every service credential and required
// on every validation, matching the issuer the site tokens use.
const serviceCredentialIssuer = "OmniNudge"

// serviceCredentialMinSecretLen is enforced at construction. A short secret on
// an endpoint that can act as a character is worth failing the process over.
const serviceCredentialMinSecretLen = 32

var (
	ErrServiceCredentialSecretMissing = errors.New("secret is not configured")
	ErrServiceCredentialSecretWeak    = fmt.Errorf("secret must be at least %d bytes", serviceCredentialMinSecretLen)
	ErrServiceCredentialSecretShared  = errors.New("secret must differ from the site JWT secret")
)

// ServiceCredentialClaims is what a server-side caller presents to act on a
// character's behalf.
//
// It deliberately has no user id, no session and no role. An endpoint that
// accepts one of these is proving that the caller is a particular service, not
// that some user is signed in, and giving the credential a user-shaped field
// would invite exactly the confusion the separation exists to prevent.
type ServiceCredentialClaims struct {
	PersonaID int64  `json:"persona_id"`
	Use       string `json:"use"`
	jwt.RegisteredClaims
}

// serviceCredential mints and checks one kind of service-to-service credential
// about one character.
//
// There is more than one such credential -- admitting a persona to a world and
// reporting what happened to it there are different powers, held by different
// callers -- and they must never be interchangeable. Two things keep them
// apart, and both live here rather than in each copy:
//
// Each holds its own secret, separate from the one that signs site sessions.
// That makes "a valid user session is not sufficient" a property of the
// signatures rather than a rule somebody has to remember to enforce. A stolen
// site cookie, a world token, and an API token are all signed with a different
// key and are simply not valid here -- no check has to notice they are the
// wrong kind, because they do not verify.
//
// Each also carries and demands its own use claim. That is what holds the line
// between the service credentials themselves, which the key separation cannot:
// it is checked on every validation, so a credential minted for admission is
// refused where a world event is expected even if the two were ever configured
// with the same secret.
type serviceCredential struct {
	// label prefixes every error this credential reports, so a startup failure
	// or a rejected token says which credential it was about.
	label  string
	use    string
	secret []byte
	// maxTTL bounds how long a credential this service mints can live. It
	// binds the issuer only; what binds every presenter is that validate
	// requires an exp at all -- see the parse options there.
	maxTTL time.Duration
}

// newServiceCredential fails rather than degrading. A service that starts with
// a privileged path quietly disabled, or with a secret shared with the site,
// is worse than one that refuses to start: the first is discovered when the
// path does not work, and the second is discovered by whoever exploits it.
func newServiceCredential(label, use, secret, siteJWTSecret string, maxTTL time.Duration) (*serviceCredential, error) {
	if secret == "" {
		return nil, fmt.Errorf("%s: %w", label, ErrServiceCredentialSecretMissing)
	}
	if len(secret) < serviceCredentialMinSecretLen {
		return nil, fmt.Errorf("%s: %w", label, ErrServiceCredentialSecretWeak)
	}
	// Constant time because this runs at startup with operator-supplied values;
	// it costs nothing and avoids making the comparison itself a signal.
	if siteJWTSecret != "" && subtle.ConstantTimeCompare([]byte(secret), []byte(siteJWTSecret)) == 1 {
		return nil, fmt.Errorf("%s: %w", label, ErrServiceCredentialSecretShared)
	}
	return &serviceCredential{label: label, use: use, secret: []byte(secret), maxTTL: maxTTL}, nil
}

// mint issues a credential about one persona. The token names the persona it
// is good for, so a credential obtained for one character cannot be replayed
// against another.
func (c *serviceCredential) mint(personaID int64, ttl time.Duration) (string, error) {
	if c == nil {
		return "", ErrServiceCredentialSecretMissing
	}
	if personaID <= 0 {
		return "", fmt.Errorf("%s: persona id is required", c.label)
	}
	if ttl <= 0 || ttl > c.maxTTL {
		ttl = c.maxTTL
	}

	now := time.Now()
	claims := ServiceCredentialClaims{
		PersonaID: personaID,
		Use:       c.use,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    serviceCredentialIssuer,
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(c.secret)
}

// validate accepts only a credential this service minted, for this credential's
// purpose, that carries an expiry and has not reached it.
//
// The expiry has to be demanded rather than merely checked when present.
// jwt/v5 treats a missing exp as "no expiry to fail", so without
// WithExpirationRequired a token forged with this secret and no exp claim at
// all would be honoured forever, and the TTL cap above -- which binds mint --
// would bind only the honest issuer.
func (c *serviceCredential) validate(tokenString string) (*ServiceCredentialClaims, error) {
	if c == nil {
		return nil, ErrServiceCredentialSecretMissing
	}

	token, err := jwt.ParseWithClaims(
		tokenString,
		&ServiceCredentialClaims{},
		func(token *jwt.Token) (interface{}, error) {
			// Pinning the family rejects an "alg: none" token and stops a
			// caller choosing a scheme where the public part of some other
			// key would verify.
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return c.secret, nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
		jwt.WithIssuer(serviceCredentialIssuer),
	)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", c.label, err)
	}

	claims, ok := token.Claims.(*ServiceCredentialClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("%s: invalid token", c.label)
	}
	if claims.Use != c.use {
		return nil, fmt.Errorf("%s: token is not for this purpose (use=%q)", c.label, claims.Use)
	}
	if claims.PersonaID <= 0 {
		return nil, fmt.Errorf("%s: token names no persona", c.label)
	}

	return claims, nil
}
