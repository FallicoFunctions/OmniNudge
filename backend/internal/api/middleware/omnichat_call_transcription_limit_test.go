package middleware

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// Transcription happens once per sentence; starting a call happens once per
// call. Sharing one budget gave a hands-free conversation ten sentences an
// hour and then spent the allowance that exists to let somebody start a call
// at all, so a minute of talking locked the phone for the next hour.
func TestTranscriptionHasItsOwnBudgetAndItsOwnKey(t *testing.T) {
	call := OmniChatCallRateLimiter(nil)
	transcription := OmniChatCallTranscriptionRateLimiter(nil)

	require.NotEqual(t, call.prefix, transcription.prefix,
		"one key means one budget, and these are counted per sentence and per call")
	require.Greater(t, transcription.limit, call.limit,
		"a conversation is many sentences and one call")
	require.NotEqual(t, call.window, transcription.window,
		"starting a call is bounded per minute against a runaway loop; sentences are bounded per hour against cost")
	require.GreaterOrEqual(t, transcription.limit, 100,
		"a long conversation must not run out of allowance mid-sentence")
}

// Bounded, though. Each request is a model call, so a runaway recorder must
// not be able to spend without limit.
func TestTranscriptionIsStillBounded(t *testing.T) {
	transcription := OmniChatCallTranscriptionRateLimiter(nil)

	require.LessOrEqual(t, transcription.limit, 1000)
	require.Equal(t, time.Hour, transcription.window)
	require.True(t, transcription.failClosed,
		"a limiter that cannot reach its store must refuse, not wave everything through")
}

// Starting a call is bounded against a runaway loop, not against cost.
//
// Billing charges credits when a call starts and then per minute, so a limiter
// counting ten an hour was policing a price that is already policed -- and it
// turned ordinary use into "the call could not be connected", which reads as a
// network fault.
func TestStartingACallIsBoundedPerMinuteRatherThanPerHour(t *testing.T) {
	call := OmniChatCallRateLimiter(nil)

	require.Equal(t, time.Minute, call.window)
	require.GreaterOrEqual(t, call.limit, 5, "redialling twice in a row is ordinary use")
	require.LessOrEqual(t, call.limit, 20, "still a bound, because a loop must hit something")
}
