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
