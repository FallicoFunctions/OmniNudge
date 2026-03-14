package services

import (
	"errors"
	"sync"
	"time"

	zlog "github.com/rs/zerolog/log"
)

// ErrCircuitOpen is returned when the circuit breaker is open and rejecting calls.
var ErrCircuitOpen = errors.New("circuit breaker open")

type cbState int

const (
	cbClosed   cbState = iota // Normal operation — requests pass through.
	cbOpen                    // Failure threshold exceeded — requests rejected.
	cbHalfOpen                // Cooldown elapsed — testing if service recovered.
)

// CircuitBreaker implements a simple three-state (closed → open → half-open)
// circuit breaker using only the standard library. It is safe for concurrent
// use from multiple goroutines.
//
// State transitions:
//   - Closed → Open:     failures >= threshold
//   - Open → Half-Open:  time.Since(lastFailure) > timeout
//   - Half-Open → Closed: successes >= successThresh
//   - Half-Open → Open:   any failure
type CircuitBreaker struct {
	mu               sync.Mutex
	name             string
	state            cbState
	failures         int
	successes        int
	lastFailure      time.Time
	threshold        int           // consecutive failures before opening
	successThresh    int           // consecutive successes needed to close from half-open
	timeout          time.Duration // duration to wait in open state before half-open retry
	halfOpenInFlight bool          // true while a single probe request is in-flight in half-open
}

// NewCircuitBreaker creates a new CircuitBreaker with the given name, failure
// threshold, and open-state timeout. Two consecutive successes are required to
// transition from half-open back to closed.
// threshold must be >= 1; values < 1 are clamped to 1 to prevent the circuit
// from opening immediately on the very first recorded failure.
func NewCircuitBreaker(name string, threshold int, timeout time.Duration) *CircuitBreaker {
	if threshold < 1 {
		threshold = 1
	}
	return &CircuitBreaker{
		name:          name,
		threshold:     threshold,
		successThresh: 2,
		timeout:       timeout,
	}
}

// Allow returns true if the request should be allowed to proceed.
// In the open state it returns false unless the timeout has elapsed, in which
// case the breaker transitions to half-open and allows exactly ONE probe
// request through. Subsequent concurrent callers see cbHalfOpen and are
// rejected until that probe records a result via RecordSuccess/RecordFailure.
func (cb *CircuitBreaker) Allow() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	switch cb.state {
	case cbOpen:
		if time.Since(cb.lastFailure) > cb.timeout {
			cb.state = cbHalfOpen
			cb.successes = 0
			cb.halfOpenInFlight = true
			zlog.Info().Str("circuit", cb.name).Msg("circuit breaker half-open: testing service recovery")
			return true
		}
		return false
	case cbHalfOpen:
		// Only one probe request is allowed through at a time.
		// If a probe is already in-flight, reject additional requests.
		if cb.halfOpenInFlight {
			return false
		}
		// Previous probe completed (via RecordSuccess/RecordFailure) but the
		// circuit is still half-open (not enough successes yet). Allow one more.
		cb.halfOpenInFlight = true
		return true
	default:
		return true
	}
}

// RecordSuccess records a successful call. In the half-open state, enough
// successes will close the circuit.
func (cb *CircuitBreaker) RecordSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.failures = 0
	cb.halfOpenInFlight = false
	if cb.state == cbHalfOpen {
		cb.successes++
		if cb.successes >= cb.successThresh {
			cb.state = cbClosed
			zlog.Info().Str("circuit", cb.name).Msg("circuit breaker closed: service recovered")
		}
	}
}

// RecordFailure records a failed call. Once failures reaches the threshold
// the circuit opens. Any failure in the half-open state immediately re-opens.
// successes is reset to 0 on any failure so partial half-open progress is
// discarded when the circuit re-opens.
func (cb *CircuitBreaker) RecordFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.failures++
	cb.successes = 0
	cb.halfOpenInFlight = false
	cb.lastFailure = time.Now()
	if cb.failures >= cb.threshold || cb.state == cbHalfOpen {
		if cb.state != cbOpen {
			zlog.Warn().
				Str("circuit", cb.name).
				Int("failures", cb.failures).
				Msg("circuit breaker opened: failure threshold reached")
		}
		cb.state = cbOpen
	}
}

// Do executes fn under circuit-breaker protection. If the circuit is open it
// returns ErrCircuitOpen without calling fn. Otherwise it calls fn; on
// success it records success, on error it records failure.
// If fn panics, the failure is recorded before the panic is re-raised so the
// circuit state stays consistent and the half-open probe slot is released.
func (cb *CircuitBreaker) Do(fn func() error) (retErr error) {
	if !cb.Allow() {
		return ErrCircuitOpen
	}
	// Use a named return and deferred recover so that a panic inside fn()
	// still counts as a failure against the circuit.
	panicked := true
	defer func() {
		if panicked {
			cb.RecordFailure()
			// Re-raise the panic after recording so callers see the original panic.
			if r := recover(); r != nil {
				panic(r)
			}
		}
	}()
	retErr = fn()
	panicked = false
	if retErr != nil {
		cb.RecordFailure()
		return retErr
	}
	cb.RecordSuccess()
	return nil
}

// State returns a human-readable string of the current state (useful for health checks).
func (cb *CircuitBreaker) State() string {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	switch cb.state {
	case cbOpen:
		return "open"
	case cbHalfOpen:
		return "half-open"
	default:
		return "closed"
	}
}
