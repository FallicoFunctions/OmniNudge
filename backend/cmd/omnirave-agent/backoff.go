package main

import "time"

// A world session is short by design -- the world token expires in five
// minutes and the world ends the connection when it does -- so this process
// reconnects constantly and in the ordinary case that is not an error. What it
// must never do is turn a persistent failure into a hot loop against the
// admission endpoint: a character that has been sanctioned or withdrawn is
// refused every time, forever, and hammering the refusal is how one broken
// agent becomes an outage for everything else sharing that API.
type backoff struct {
	base    time.Duration
	max     time.Duration
	attempt int
	// jitter returns a value in [0,1). It is a field so tests can pin it;
	// production passes the runtime's own source.
	jitter func() float64
}

func newBackoff(base, max time.Duration, jitter func() float64) *backoff {
	return &backoff{base: base, max: max, jitter: jitter}
}

// next returns how long to wait before the next attempt and advances the
// sequence: base, 2*base, 4*base... capped at max, with the delay spread over
// the lower half of the range so that several agents failing at once do not
// all retry on the same beat.
func (b *backoff) next() time.Duration {
	delay := b.base
	for i := 0; i < b.attempt; i++ {
		delay *= 2
		if delay >= b.max {
			delay = b.max
			break
		}
	}
	if delay > b.max {
		delay = b.max
	}
	b.attempt++

	// Half fixed, half jittered: never longer than the cap, never zero, and
	// never the exact same instant for two agents.
	return delay/2 + time.Duration(b.jitter()*float64(delay/2))
}

// reset returns the sequence to its base. It is called after a session that
// actually worked, so a character that has lived in the world for an hour does
// not carry an hour-old failure's penalty into its next reconnect.
func (b *backoff) reset() {
	b.attempt = 0
}
