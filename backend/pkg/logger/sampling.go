package logger

import (
	"sync"
	"sync/atomic"

	"github.com/rs/zerolog"
)

// Sampler decides whether a given log event should be emitted.
// Errors and warnings are never sampled (always logged).
// Path-specific sample rates can be configured; the default rate applies to all
// other paths.
//
// Sampling is counter-based: for a rate of N%, every (100/N)-th call is accepted.
// This is thread-safe via atomic counters.
type Sampler struct {
	mu          sync.RWMutex
	pathRates   map[string]int // path → percentage (0–100)
	defaultRate int            // percentage (0–100)
	counters    sync.Map       // path → *atomic.Int64
}

// NewSampler creates a Sampler with the given default sample rate (0–100%).
// A rate of 100 means "always log"; 0 means "never log".
func NewSampler(defaultRatePercent int) *Sampler {
	return &Sampler{
		pathRates:   make(map[string]int),
		defaultRate: clamp(defaultRatePercent, 0, 100),
	}
}

// SetPathRate overrides the sample rate for a specific path prefix.
func (s *Sampler) SetPathRate(path string, ratePercent int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pathRates[path] = clamp(ratePercent, 0, 100)
}

// ShouldSample returns true if this event should be logged.
// Errors and warnings are always logged. For info-level events the configured
// rate is applied using an atomic counter so there is no lock contention on the
// hot path.
func (s *Sampler) ShouldSample(level zerolog.Level, path string) bool {
	// Never skip errors or warnings.
	if level >= zerolog.WarnLevel {
		return true
	}

	rate := s.rateForPath(path)
	if rate == 0 {
		return false
	}
	if rate >= 100 {
		return true
	}

	// Atomically increment the counter for this path.
	v, _ := s.counters.LoadOrStore(path, new(atomic.Int64))
	ctr := v.(*atomic.Int64)
	n := ctr.Add(1)

	// Accept if n mod (100/rate) == 0.
	every := int64(100 / rate)
	return n%every == 0
}

func (s *Sampler) rateForPath(path string) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for prefix, rate := range s.pathRates {
		if len(path) >= len(prefix) && path[:len(prefix)] == prefix {
			return rate
		}
	}
	return s.defaultRate
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
