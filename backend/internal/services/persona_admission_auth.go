package services

import (
	"time"
)

// PersonaAdmitTokenUse is the only purpose this credential is good for. It is
// carried in the token and checked on every validation, so a token minted with
// the admission secret for some other purpose cannot be spent here.
const PersonaAdmitTokenUse = "persona_admit"

// personaAdmitMaxTTL bounds how long an admission credential this service
// mints can live. The spec keeps world tokens short and renews them rather
// than issuing long-lived ones; the credential used to obtain them should not
// outlive them by much.
const personaAdmitMaxTTL = 5 * time.Minute

// personaAdmitLabel prefixes every error this credential reports.
const personaAdmitLabel = "persona admission"

// personaAdmitIssuer is stamped on every credential and required on every
// validation, matching the issuer the site tokens use.
const personaAdmitIssuer = serviceCredentialIssuer

// This credential's own configuration failures. They wrap the shared values,
// so errors.Is against ErrServiceCredentialSecretMissing still matches, but
// they are distinct values: a world-event failure is not an admission failure,
// and a caller can now say which one it got without reading the message.
var (
	ErrPersonaAdmitSecretMissing = personaAdmitCredentialErrors.missing
	ErrPersonaAdmitSecretWeak    = personaAdmitCredentialErrors.weak
	ErrPersonaAdmitSecretShared  = personaAdmitCredentialErrors.shared
)

var personaAdmitCredentialErrors = newServiceCredentialErrors(personaAdmitLabel)

// PersonaAdmitClaims is what the agent runtime presents to admit a persona.
type PersonaAdmitClaims = ServiceCredentialClaims

// PersonaAdmissionAuth mints and checks the credential the agent runtime uses
// to admit a persona to a world.
//
// The hardening lives in serviceCredential, which this and the world-event
// credential share: separate secrets, a required use claim, a required expiry
// and a required issuer. Sharing it is what stops the two credentials drifting
// apart -- a fix made for one is a fix made for both, and neither can be
// weakened without the other's tests noticing.
type PersonaAdmissionAuth struct {
	credential *serviceCredential
}

// NewPersonaAdmissionAuth fails rather than degrading: a service that starts
// with admission quietly disabled is discovered when a persona cannot be
// admitted, and one sharing the site secret is discovered by whoever exploits
// it.
func NewPersonaAdmissionAuth(secret string, siteJWTSecret string) (*PersonaAdmissionAuth, error) {
	credential, err := newServiceCredential(
		personaAdmitLabel, PersonaAdmitTokenUse, secret, siteJWTSecret, personaAdmitMaxTTL,
		personaAdmitCredentialErrors,
	)
	if err != nil {
		return nil, err
	}
	return &PersonaAdmissionAuth{credential: credential}, nil
}

// Mint issues a credential for admitting one persona. The token names the
// persona it is good for, so a credential obtained for one character cannot be
// replayed to admit another.
func (a *PersonaAdmissionAuth) Mint(personaID int64, ttl time.Duration) (string, error) {
	if a == nil {
		return "", ErrPersonaAdmitSecretMissing
	}
	return a.credential.mint(personaID, ttl)
}

// Validate accepts only a credential this service minted, for admission, that
// carries an expiry and has not reached it.
func (a *PersonaAdmissionAuth) Validate(tokenString string) (*PersonaAdmitClaims, error) {
	if a == nil {
		return nil, ErrPersonaAdmitSecretMissing
	}
	return a.credential.validate(tokenString)
}
