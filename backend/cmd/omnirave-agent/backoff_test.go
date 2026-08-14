package main

import (
	"testing"
	"time"
)

func TestBackoffDoublesUpToItsCap(t *testing.T) {
	// Jitter pinned at its top so each delay is exactly the nominal one.
	b := newBackoff(time.Second, 8*time.Second, func() float64 { return 1 })

	want := []time.Duration{time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second, 8 * time.Second}
	for i, expected := range want {
		if got := b.next(); got != expected {
			t.Errorf("attempt %d: delay = %s, want %s", i, got, expected)
		}
	}
}

func TestBackoffNeverWaitsLessThanHalfOrMoreThanTheCap(t *testing.T) {
	b := newBackoff(time.Second, 4*time.Second, func() float64 { return 0 })

	for i := 0; i < 10; i++ {
		delay := b.next()
		if delay <= 0 {
			t.Fatalf("attempt %d: delay %s would be a hot loop", i, delay)
		}
		if delay > 4*time.Second {
			t.Fatalf("attempt %d: delay %s exceeds the cap", i, delay)
		}
	}
}

func TestBackoffResetsAfterASessionThatWorked(t *testing.T) {
	b := newBackoff(time.Second, time.Minute, func() float64 { return 1 })
	b.next()
	b.next()

	b.reset()
	if got := b.next(); got != time.Second {
		t.Errorf("delay after reset = %s, want the base %s", got, time.Second)
	}
}
