package services

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func ffmpegOrSkip(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg is not installed")
	}
}

// What a browser actually records: webm/opus, which the transcription API does
// not accept. Made here rather than committed, because a binary fixture in this
// repository is the accident that once needed a history rewrite.
func recordingLike(t *testing.T, source string) []byte {
	t.Helper()
	ffmpegOrSkip(t)
	path := filepath.Join(t.TempDir(), "utterance.webm")
	require.NoError(t, exec.Command("ffmpeg", "-nostdin", "-loglevel", "error",
		"-f", "lavfi", "-i", source, "-c:a", "libopus", "-f", "webm", "-y", path).Run())
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	return data
}

// Silence must never reach the model.
//
// A model handed silence does not return nothing -- it invents. Two seconds of
// digital silence came back as "The quick brown fox jumps over the lazy dog",
// and that would have been sent to her as something the caller said.
func TestSilenceNeverBecomesWords(t *testing.T) {
	silence := recordingLike(t, "anullsrc=r=48000:cl=mono:d=2")

	_, err := toSpeechWAV(context.Background(), silence)

	require.ErrorIs(t, err, ErrNoSpeechHeard)
}

// Sound of any kind is passed through. The gate is for silence, not for
// quietness, and refusing a soft speaker would be worse than the defect.
func TestAudibleAudioIsPassedThrough(t *testing.T) {
	audible := recordingLike(t, "sine=frequency=440:duration=2")

	wav, err := toSpeechWAV(context.Background(), audible)

	require.NoError(t, err)
	require.Greater(t, len(wav), 1024)
	require.Equal(t, []byte("RIFF"), wav[:4], "the provider is sent a WAV whatever the browser recorded")
}

// A bad upload is not an outage, and the two must not read the same way.
func TestAFileThatIsNotAudioIsRefusedAsContent(t *testing.T) {
	ffmpegOrSkip(t)

	_, err := toSpeechWAV(context.Background(), []byte("this is not audio at all"))

	require.Error(t, err)
	require.NotErrorIs(t, err, ErrNoSpeechHeard)
	require.Contains(t, err.Error(), "could not be read")
}

// The measurement is read out of ffmpeg's own report, and a report it cannot
// read must not be treated as silence -- refusing audio because a log line
// changed shape would be worse than sending it.
func TestSilenceIsReadFromTheReportRatherThanAssumed(t *testing.T) {
	require.True(t, isSilent("[Parsed_volumedetect_0 @ 0x1] max_volume: -91.0 dB"))
	require.False(t, isSilent("[Parsed_volumedetect_0 @ 0x1] max_volume: -12.3 dB"))
	require.False(t, isSilent("[Parsed_volumedetect_0 @ 0x1] max_volume: not a number dB"))
	require.False(t, isSilent("ffmpeg said something else entirely"))
	require.False(t, isSilent(""))
}

// An unconfigured deployment says so instead of pretending to listen.
func TestTranscriptionSaysWhenItIsNotConfigured(t *testing.T) {
	require.False(t, (&OmniChatCallTranscription{}).Configured())
	require.False(t, NewOmniChatCallTranscription(nil, "a/model").Configured())

	// Unconfigured is its own answer, and it is not "you said nothing": the
	// caller spoke, and the server had no ear.
	_, err := (&OmniChatCallTranscription{}).Transcribe(context.Background(), []byte("x"))
	require.ErrorContains(t, err, "not configured")
}
