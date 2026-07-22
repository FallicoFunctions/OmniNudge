package services

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
)

const (
	AccessTokenCookieName  = "omni_access"
	RefreshTokenCookieName = "omni_refresh"
	CSRFTokenCookieName    = "omni_csrf"
	AccessTokenTTL         = 15 * time.Minute
	DefaultSessionTTL      = 24 * time.Hour
	PersistentSessionTTL   = 30 * 24 * time.Hour
)

var ErrInvalidAuthSession = errors.New("invalid authentication session")

// BrowserSessionCredentials are written to cookies by HTTP handlers. Refresh
// and CSRF secrets are opaque random values; only SHA-256 digests are stored.
type BrowserSessionCredentials struct {
	SessionID      uuid.UUID
	AccessToken    string
	RefreshToken   string
	CSRFToken      string
	RefreshExpires time.Time
	Persistent     bool
}

type AuthSessionSummary struct {
	ID         uuid.UUID `json:"id"`
	UserAgent  string    `json:"user_agent"`
	IPAddress  *string   `json:"ip_address,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
	LastUsedAt time.Time `json:"last_used_at"`
	ExpiresAt  time.Time `json:"expires_at"`
}

type AuthSessionService struct {
	db   *pgxpool.Pool
	auth *AuthService
}

func NewAuthSessionService(db *pgxpool.Pool, auth *AuthService) *AuthSessionService {
	return &AuthSessionService{db: db, auth: auth}
}

func (s *AuthSessionService) Create(
	ctx context.Context,
	user *models.User,
	persistent bool,
	userAgent string,
	ipAddress string,
) (*BrowserSessionCredentials, error) {
	if s == nil || s.db == nil || s.auth == nil || user == nil || user.ID <= 0 {
		return nil, errors.New("authentication sessions are unavailable")
	}

	ttl := DefaultSessionTTL
	if persistent {
		ttl = PersistentSessionTTL
	}
	expiresAt := time.Now().UTC().Add(ttl)
	sessionID := uuid.New()
	refreshSecret, err := randomSessionSecret()
	if err != nil {
		return nil, err
	}
	csrfSecret, err := randomSessionSecret()
	if err != nil {
		return nil, err
	}

	var parsedIP any
	if ip := net.ParseIP(strings.TrimSpace(ipAddress)); ip != nil {
		parsedIP = ip.String()
	}
	if len(userAgent) > 512 {
		userAgent = userAgent[:512]
	}

	_, err = s.db.Exec(ctx, `
		INSERT INTO auth_sessions (
			id, user_id, refresh_token_hash, csrf_token_hash, token_version,
			user_agent, ip_address, expires_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, sessionID, user.ID, digestSessionSecret(refreshSecret), digestSessionSecret(csrfSecret),
		user.TokenVersion, userAgent, parsedIP, expiresAt)
	if err != nil {
		return nil, fmt.Errorf("create authentication session: %w", err)
	}

	accessToken, err := s.auth.GenerateJWTForSession(
		user.ID, user.Username, user.Role, user.TokenVersion, sessionID.String(), AccessTokenTTL,
	)
	if err != nil {
		_, _ = s.db.Exec(ctx, `DELETE FROM auth_sessions WHERE id=$1`, sessionID)
		return nil, err
	}

	return &BrowserSessionCredentials{
		SessionID:      sessionID,
		AccessToken:    accessToken,
		RefreshToken:   encodeRefreshToken(sessionID, refreshSecret),
		CSRFToken:      csrfSecret,
		RefreshExpires: expiresAt,
		Persistent:     persistent,
	}, nil
}

func (s *AuthSessionService) Refresh(
	ctx context.Context,
	encodedRefreshToken string,
	csrfToken string,
) (*models.User, *BrowserSessionCredentials, error) {
	sessionID, refreshSecret, err := parseRefreshToken(encodedRefreshToken)
	if err != nil || csrfToken == "" {
		return nil, nil, ErrInvalidAuthSession
	}

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, nil, fmt.Errorf("begin session refresh: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var (
		storedRefreshHash []byte
		storedCSRFHash    []byte
		sessionVersion    int
		expiresAt         time.Time
		revokedAt         *time.Time
		user              models.User
	)
	err = tx.QueryRow(ctx, `
		SELECT s.refresh_token_hash, s.csrf_token_hash, s.token_version,
		       s.expires_at, s.revoked_at,
		       u.id, u.username, u.role, u.token_version, u.banned, u.deleted_at IS NOT NULL
		FROM auth_sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.id = $1
		FOR UPDATE OF s
	`, sessionID).Scan(
		&storedRefreshHash, &storedCSRFHash, &sessionVersion, &expiresAt, &revokedAt,
		&user.ID, &user.Username, &user.Role, &user.TokenVersion, &user.Banned, &user.Deleted,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, ErrInvalidAuthSession
	}
	if err != nil {
		return nil, nil, fmt.Errorf("load authentication session: %w", err)
	}

	refreshMatches := equalSessionDigest(storedRefreshHash, refreshSecret)
	csrfMatches := equalSessionDigest(storedCSRFHash, csrfToken)
	active := revokedAt == nil && time.Now().UTC().Before(expiresAt) &&
		sessionVersion == user.TokenVersion && !user.Banned && !user.Deleted
	if !refreshMatches {
		// A token with a valid session identifier but stale/incorrect secret is a
		// likely replay of a rotated credential. Revoke that device session.
		_, _ = tx.Exec(ctx, `UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at, NOW()) WHERE id=$1`, sessionID)
		_ = tx.Commit(ctx)
		return nil, nil, ErrInvalidAuthSession
	}
	if !csrfMatches || !active {
		return nil, nil, ErrInvalidAuthSession
	}

	newRefreshSecret, err := randomSessionSecret()
	if err != nil {
		return nil, nil, err
	}
	newCSRFSecret, err := randomSessionSecret()
	if err != nil {
		return nil, nil, err
	}
	_, err = tx.Exec(ctx, `
		UPDATE auth_sessions
		SET refresh_token_hash=$2, csrf_token_hash=$3, last_used_at=NOW()
		WHERE id=$1
	`, sessionID, digestSessionSecret(newRefreshSecret), digestSessionSecret(newCSRFSecret))
	if err != nil {
		return nil, nil, fmt.Errorf("rotate authentication session: %w", err)
	}

	accessToken, err := s.auth.GenerateJWTForSession(
		user.ID, user.Username, user.Role, user.TokenVersion, sessionID.String(), AccessTokenTTL,
	)
	if err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, nil, fmt.Errorf("commit authentication session rotation: %w", err)
	}

	persistent := expiresAt.Sub(time.Now().UTC()) > DefaultSessionTTL
	return &user, &BrowserSessionCredentials{
		SessionID:      sessionID,
		AccessToken:    accessToken,
		RefreshToken:   encodeRefreshToken(sessionID, newRefreshSecret),
		CSRFToken:      newCSRFSecret,
		RefreshExpires: expiresAt,
		Persistent:     persistent,
	}, nil
}

func (s *AuthSessionService) Validate(ctx context.Context, sessionID string, userID, tokenVersion int, role string) error {
	id, err := uuid.Parse(sessionID)
	if err != nil {
		return ErrInvalidAuthSession
	}
	var active bool
	err = s.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM auth_sessions s
			JOIN users u ON u.id=s.user_id
			WHERE s.id=$1 AND s.user_id=$2 AND s.token_version=$3
			  AND u.token_version=$3 AND u.role=$4 AND NOT u.banned AND u.deleted_at IS NULL
			  AND s.revoked_at IS NULL AND s.expires_at > NOW()
		)
	`, id, userID, tokenVersion, role).Scan(&active)
	if err != nil {
		return fmt.Errorf("validate authentication session: %w", err)
	}
	if !active {
		return ErrInvalidAuthSession
	}
	return nil
}

func (s *AuthSessionService) ValidateCSRF(ctx context.Context, sessionID, csrfToken string) error {
	id, err := uuid.Parse(sessionID)
	if err != nil || csrfToken == "" {
		return ErrInvalidAuthSession
	}
	var storedHash []byte
	err = s.db.QueryRow(ctx, `
		SELECT csrf_token_hash FROM auth_sessions
		WHERE id=$1 AND revoked_at IS NULL AND expires_at > NOW()
	`, id).Scan(&storedHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidAuthSession
	}
	if err != nil {
		return fmt.Errorf("validate CSRF token: %w", err)
	}
	if !equalSessionDigest(storedHash, csrfToken) {
		return ErrInvalidAuthSession
	}
	return nil
}

func (s *AuthSessionService) Revoke(ctx context.Context, sessionID string, userID int) error {
	id, err := uuid.Parse(sessionID)
	if err != nil {
		return ErrInvalidAuthSession
	}
	tag, err := s.db.Exec(ctx, `
		UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at, NOW())
		WHERE id=$1 AND user_id=$2
	`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInvalidAuthSession
	}
	return nil
}

func (s *AuthSessionService) List(ctx context.Context, userID int) ([]AuthSessionSummary, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, user_agent, host(ip_address), created_at, last_used_at, expires_at
		FROM auth_sessions
		WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > NOW()
		ORDER BY last_used_at DESC, created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := make([]AuthSessionSummary, 0)
	for rows.Next() {
		var item AuthSessionSummary
		if err := rows.Scan(&item.ID, &item.UserAgent, &item.IPAddress, &item.CreatedAt, &item.LastUsedAt, &item.ExpiresAt); err != nil {
			return nil, err
		}
		sessions = append(sessions, item)
	}
	return sessions, rows.Err()
}

func randomSessionSecret() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate session secret: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func digestSessionSecret(secret string) []byte {
	digest := sha256.Sum256([]byte(secret))
	return digest[:]
}

func equalSessionDigest(stored []byte, secret string) bool {
	candidate := digestSessionSecret(secret)
	return len(stored) == len(candidate) && subtle.ConstantTimeCompare(stored, candidate) == 1
}

func encodeRefreshToken(sessionID uuid.UUID, secret string) string {
	return sessionID.String() + "." + secret
}

func parseRefreshToken(token string) (uuid.UUID, string, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 || parts[1] == "" {
		return uuid.Nil, "", ErrInvalidAuthSession
	}
	id, err := uuid.Parse(parts[0])
	if err != nil {
		return uuid.Nil, "", ErrInvalidAuthSession
	}
	return id, parts[1], nil
}
