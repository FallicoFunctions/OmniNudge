package services

import (
	"time"
)

// WorldEventTokenUse is the only purpose this credential is good for.
//
// It is what keeps the two service credentials from being interchangeable.
// Admitting a character to a world and writing to that character's own memory
// are different powers: the first is refusable and leaves no trace, the second
// puts something in a history every reader of that character shares. A caller
// holding one must not be able to spend it on the other, and because the use
// claim is checked on every validation, it cannot -- even in a deployment that
// mistakenly configured both with the same secret.
const WorldEventTokenUse = "world_event"

// worldEventMaxTTL bounds how long a world-event credential this service mints
// can live. A resident is present for hours, but each report of what it did is
// a separate call, so the credential is renewed like the world token rather
// than held open for a session.
const worldEventMaxTTL = 5 * time.Minute

// worldEventLabel prefixes every error this credential reports.
const worldEventLabel = "world event"

// These are the same values every service credential reports, kept under names
// that say which credential a caller is talking about.
var (
	ErrWorldEventSecretMissing = ErrServiceCredentialSecretMissing
	ErrWorldEventSecretWeak    = ErrServiceCredentialSecretWeak
	ErrWorldEventSecretShared  = ErrServiceCredentialSecretShared
)

// WorldEventClaims is what the world presents to record something that
// happened to a resident character.
type WorldEventClaims = ServiceCredentialClaims

// WorldEventAuth mints and checks the credential the world uses to report what
// a resident did there.
//
// Writing self-tier memory is privileged: it is the character's own life, and
// every person who talks to that character reads it. Only the world may do it,
// service to service, which is exactly what this credential establishes --
// nothing a browser can hold verifies here.
type WorldEventAuth struct {
	credential *serviceCredential
}

// NewWorldEventAuth fails rather than degrading, for the same reason admission
// does: a world-event secret shared with the site would let a site credential
// write to a character's own memory.
func NewWorldEventAuth(secret string, siteJWTSecret string) (*WorldEventAuth, error) {
	credential, err := newServiceCredential(
		worldEventLabel, WorldEventTokenUse, secret, siteJWTSecret, worldEventMaxTTL,
	)
	if err != nil {
		return nil, err
	}
	return &WorldEventAuth{credential: credential}, nil
}

// Mint issues a credential for recording events about one persona. The token
// names the character it is good for, so a credential obtained for one cannot
// be used to write memories into another.
func (a *WorldEventAuth) Mint(personaID int64, ttl time.Duration) (string, error) {
	if a == nil {
		return "", ErrWorldEventSecretMissing
	}
	return a.credential.mint(personaID, ttl)
}

// Validate accepts only a credential this service minted, for world events,
// that carries an expiry and has not reached it.
func (a *WorldEventAuth) Validate(tokenString string) (*WorldEventClaims, error) {
	if a == nil {
		return nil, ErrWorldEventSecretMissing
	}
	return a.credential.validate(tokenString)
}
