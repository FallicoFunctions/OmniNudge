package services

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// maxLoginFailures is the number of failed attempts within lockoutWindowMinutes
	// that triggers an account lock.
	maxLoginFailures = 5

	// lockoutWindowMinutes is the sliding window (in minutes) over which failed
	// login attempts are counted.
	lockoutWindowMinutes = 15
)

// AccountLockoutService prevents brute-force login attacks by tracking failed
// login attempts and temporarily locking accounts after too many failures.
//
// Lock threshold: 5 failures within a 15-minute sliding window.
type AccountLockoutService struct {
	pool *pgxpool.Pool
}

// NewAccountLockoutService creates a new AccountLockoutService.
func NewAccountLockoutService(pool *pgxpool.Pool) *AccountLockoutService {
	return &AccountLockoutService{pool: pool}
}

// RecordFailure records a failed login attempt for the given identifier
// (typically a username or email address) and the originating IP address.
func (s *AccountLockoutService) RecordFailure(ctx context.Context, identifier, ipAddress string) error {
	const q = `
		INSERT INTO failed_login_attempts (identifier, ip_address)
		VALUES ($1, $2)`

	var ipArg *string
	if ipAddress != "" {
		ipArg = &ipAddress
	}

	if _, err := s.pool.Exec(ctx, q, identifier, ipArg); err != nil {
		return fmt.Errorf("account_lockout: record failure: %w", err)
	}
	return nil
}

// IsLocked returns true if the identifier has accumulated maxLoginFailures or
// more failed login attempts within the last lockoutWindowMinutes minutes.
// It also checks whether the originating IP address (when non-empty) has
// exceeded the threshold independently, allowing IP-based lockout even when
// different usernames are tried from the same source.
//
// Fix 3: The identifier and IP checks are performed as separate queries to
// avoid the problematic ($2 <> '' AND ip_address = $2::inet) pattern that
// causes a PostgreSQL ::inet cast error when ipAddress is an empty string.
func (s *AccountLockoutService) IsLocked(ctx context.Context, identifier string, ipAddress string) (bool, error) {
	// Count identifier-based failures first.
	const qIdentifier = `
		SELECT COUNT(*) FROM failed_login_attempts
		WHERE identifier = $1
		  AND attempted_at > NOW() - make_interval(secs => $2)`
	var count int
	err := s.pool.QueryRow(ctx, qIdentifier, identifier, float64(lockoutWindowMinutes*60)).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("account_lockout IsLocked identifier query: %w", err)
	}
	if count >= maxLoginFailures {
		return true, nil
	}
	// If IP provided, also check IP-based failures.
	if ipAddress != "" {
		const qIP = `
			SELECT COUNT(*) FROM failed_login_attempts
			WHERE ip_address = $1::inet
			  AND attempted_at > NOW() - make_interval(secs => $2)`
		err = s.pool.QueryRow(ctx, qIP, ipAddress, float64(lockoutWindowMinutes*60)).Scan(&count)
		if err != nil {
			return false, fmt.Errorf("account_lockout IsLocked IP query: %w", err)
		}
		if count >= maxLoginFailures {
			return true, nil
		}
	}
	return false, nil
}

// Reset clears the active-window failures for the given identifier.  Only
// failures within the current lockout window are removed; older historical
// rows are preserved for audit purposes.
// Call this after a successful login so that a user is not locked out due to
// previous failures.
func (s *AccountLockoutService) Reset(ctx context.Context, identifier string) error {
	const q = `
		DELETE FROM failed_login_attempts
		WHERE identifier = $1
		  AND attempted_at > NOW() - make_interval(secs => $2)`

	if _, err := s.pool.Exec(ctx, q, identifier, float64(lockoutWindowMinutes*60)); err != nil {
		return fmt.Errorf("account_lockout: reset: %w", err)
	}
	return nil
}

// ResetIP clears failed login attempts for the given IP address within the
// lockout window. Called after successful login to unblock legitimate users
// who triggered IP-based lockout by failing multiple accounts from the same IP.
func (s *AccountLockoutService) ResetIP(ctx context.Context, ipAddress string) error {
	if ipAddress == "" {
		return nil
	}
	const q = `DELETE FROM failed_login_attempts
		WHERE ip_address = $1::inet
		  AND attempted_at > NOW() - make_interval(secs => $2)`
	_, err := s.pool.Exec(ctx, q, ipAddress, float64(lockoutWindowMinutes*60))
	if err != nil {
		return fmt.Errorf("account_lockout: reset ip: %w", err)
	}
	return nil
}
