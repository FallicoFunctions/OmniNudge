package services

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/utils"
)

// The app derives a login key from the password with PBKDF2-SHA256 and these
// settings. MinKDFIterations matches the users_auth_scheme_check constraint.
const (
	MinKDFIterations = 600000
	maxKDFIterations = 10000000
	loginKeyBytes    = 32
	minKDFSaltBytes  = 16
	maxKDFSaltBytes  = 64
)

var (
	// ErrAlreadyOnLoginKey is returned when an account that already signs in
	// with a login key is asked to move to one.
	ErrAlreadyOnLoginKey = errors.New("account already signs in with a login key")
	// ErrInvalidLoginKey wraps every refusal of the login key, salt or rounds.
	ErrInvalidLoginKey = errors.New("invalid login key settings")
	// ErrCurrentPasswordIncorrect is returned when the move's password proof fails.
	ErrCurrentPasswordIncorrect = errors.New("current password is incorrect")
	// ErrWrongSecret is returned when what was sent does not prove the account.
	ErrWrongSecret = errors.New("invalid credentials")
)

// CheckAccountSecret checks what a person sent to prove an account. A scheme 2
// account accepts only its login key, and refuses a password even beside the
// key, so the password never keeps travelling to the server; any other account
// accepts only its password. Sign-in and every re-authentication use it.
func CheckAccountSecret(passwordHash string, authScheme int, password, loginKey string) error {
	secret := password
	if authScheme == 2 {
		if password != "" {
			return ErrWrongSecret
		}
		secret = loginKey
	}
	if secret == "" || utils.CheckPassword(passwordHash, secret) != nil {
		return ErrWrongSecret
	}
	return nil
}

// PreLoginResponse tells the app how to prove a password to the server.
type PreLoginResponse struct {
	Scheme        int    `json:"scheme"`
	KDFSalt       string `json:"kdf_salt,omitempty"`
	KDFIterations int    `json:"kdf_iterations,omitempty"`
}

// LoginKeyUpgradeRequest moves a signed-in scheme 1 account to a login key.
// CurrentPassword proves the account once more: the last time the server sees
// the password. EncryptedPrivateKey is the private key rewrapped with the key
// the app derived beside the login key; it replaces the copy wrapped with the
// password, and is empty when the account has no key yet.
type LoginKeyUpgradeRequest struct {
	CurrentPassword     string `json:"current_password"`
	LoginKey            string `json:"login_key"`
	KDFSalt             string `json:"kdf_salt"`
	KDFIterations       int    `json:"kdf_iterations"`
	EncryptedPrivateKey string `json:"encrypted_private_key"`
}

type registrationSecret struct {
	secret        string
	scheme        int
	kdfSalt       *string
	kdfIterations *int
}

// registrationCredentials picks what a new account signs in with: the login
// key the app derived, or the password until every client derives one.
func registrationCredentials(req *RegisterRequest) (registrationSecret, error) {
	if req.LoginKey == "" {
		// The password rule applies here only; with a login key the password
		// never reaches the server, so the app enforces it.
		if len(req.Password) < 8 {
			return registrationSecret{}, errors.New("password must be at least 8 characters")
		}
		return registrationSecret{secret: req.Password, scheme: 1}, nil
	}
	if req.Password != "" {
		return registrationSecret{}, errors.New("send a login key or a password, not both")
	}
	if err := validateLoginKey(req.LoginKey, req.KDFSalt, req.KDFIterations); err != nil {
		return registrationSecret{}, err
	}
	salt, iterations := req.KDFSalt, req.KDFIterations
	return registrationSecret{secret: req.LoginKey, scheme: 2, kdfSalt: &salt, kdfIterations: &iterations}, nil
}

func validateLoginKey(loginKey, kdfSalt string, kdfIterations int) error {
	if key, err := base64.StdEncoding.DecodeString(loginKey); err != nil || len(key) != loginKeyBytes {
		return fmt.Errorf("%w: login key must be %d bytes, base64", ErrInvalidLoginKey, loginKeyBytes)
	}
	if salt, err := base64.StdEncoding.DecodeString(kdfSalt); err != nil || len(salt) < minKDFSaltBytes || len(salt) > maxKDFSaltBytes {
		return fmt.Errorf("%w: kdf salt must be %d to %d bytes, base64", ErrInvalidLoginKey, minKDFSaltBytes, maxKDFSaltBytes)
	}
	if kdfIterations < MinKDFIterations || kdfIterations > maxKDFIterations {
		return fmt.Errorf("%w: kdf iterations must be between %d and %d", ErrInvalidLoginKey, MinKDFIterations, maxKDFIterations)
	}
	return nil
}

// PreLogin answers for a username before sign-in: scheme 1 accounts still send
// their password, scheme 2 accounts need their salt and rounds to derive the
// login key. A name with no usable account gets a salt made from the server
// secret, the same every time for that name, so the answer does not tell a
// real scheme 2 account from a missing one.
func (s *AuthService) PreLogin(ctx context.Context, userRepo ports.UserRepository, username string) (*PreLoginResponse, error) {
	username = strings.TrimSpace(username)
	user, err := userRepo.GetByUsername(ctx, username)
	if err != nil {
		return nil, err
	}
	if user == nil || user.Banned || user.Deleted {
		return &PreLoginResponse{Scheme: 2, KDFSalt: s.placeholderSalt(username), KDFIterations: MinKDFIterations}, nil
	}
	if user.AuthScheme == 2 && user.KDFSalt != nil && user.KDFIterations != nil {
		return &PreLoginResponse{Scheme: 2, KDFSalt: *user.KDFSalt, KDFIterations: *user.KDFIterations}, nil
	}
	return &PreLoginResponse{Scheme: 1}, nil
}

func (s *AuthService) placeholderSalt(username string) string {
	mac := hmac.New(sha256.New, s.jwtSecret)
	mac.Write([]byte("prelogin-salt:" + strings.ToLower(username)))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil)[:minKDFSaltBytes])
}

// MoveToLoginKey moves a scheme 1 account to the login key the app derived from
// the same password.
func (s *AuthService) MoveToLoginKey(ctx context.Context, userRepo ports.UserRepository, userID int, req *LoginKeyUpgradeRequest) error {
	if err := validateLoginKey(req.LoginKey, req.KDFSalt, req.KDFIterations); err != nil {
		return err
	}
	user, err := userRepo.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("account unavailable")
	}
	if user.AuthScheme == 2 {
		return ErrAlreadyOnLoginKey
	}
	if err := utils.CheckPassword(user.PasswordHash, req.CurrentPassword); err != nil {
		return ErrCurrentPasswordIncorrect
	}
	hash, err := utils.HashPassword(req.LoginKey)
	if err != nil {
		return fmt.Errorf("hash login key: %w", err)
	}
	if err := userRepo.UpgradeToLoginKey(ctx, userID, hash, req.KDFSalt, req.KDFIterations, req.EncryptedPrivateKey); err != nil {
		if errors.Is(err, models.ErrLoginKeyAlreadySet) {
			return ErrAlreadyOnLoginKey
		}
		return err
	}
	return nil
}
