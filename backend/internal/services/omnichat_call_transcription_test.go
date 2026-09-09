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
//
// Media ffmpeg cannot parse and bytes that were never media fail differently
// on purpose: the first is a broken recording, the second never reached ffmpeg
// at all. Neither is "you said nothing".
func TestABadUploadIsRefusedAsContentRatherThanAsAnOutage(t *testing.T) {
	ffmpegOrSkip(t)

	notMedia, err := toSpeechWAV(context.Background(), []byte("this is not audio at all"))
	require.Error(t, err)
	require.Nil(t, notMedia)
	require.NotErrorIs(t, err, ErrNoSpeechHeard)
	// A sentinel, not a sentence: the handler tells these apart with errors.Is,
	// and matching wording across two files is a contract nothing holds.
	require.ErrorIs(t, err, ErrNotARecording)

	// A real container with a corrupt body: this one does reach ffmpeg, and
	// fails there.
	truncated := recordingLike(t, "sine=frequency=440:duration=1")[:64]
	_, err = toSpeechWAV(context.Background(), truncated)
	require.Error(t, err)
	require.NotErrorIs(t, err, ErrNoSpeechHeard)
	require.ErrorIs(t, err, ErrRecordingUnreadable)
	require.NotErrorIs(t, err, ErrNotARecording, "it was media; it just could not be decoded")
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

// Sniffed, never trusted from a header. The voice-message upload beside this
// one says the same thing, because a Content-Type is whatever the client typed
// -- and ffmpeg parsing arbitrary uploaded bytes is a wide surface to leave
// open on an authenticated route.
func TestOnlySomethingThatLooksLikeMediaReachesFFmpeg(t *testing.T) {
	ffmpegOrSkip(t)

	for name, payload := range map[string][]byte{
		"a script":     []byte("#!/bin/sh\nrm -rf /\n"),
		"html":         []byte("<!doctype html><html><body>hello</body></html>"),
		"a short blob": []byte("abc"),
		"nothing":      {},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := toSpeechWAV(context.Background(), payload)
			require.Error(t, err)
			require.ErrorIs(t, err, ErrNotARecording,
				"it must be refused before ffmpeg is asked to parse it")
		})
	}
}

// What browsers really record still gets through. A gate that refuses the real
// input is worse than no gate -- and this one did exactly that: it was written
// against files ffmpeg had produced and it refused what Safari records, so the
// hardening kept the feature out rather than an attacker.
func TestEveryContainerABrowserRecordsIsAccepted(t *testing.T) {
	for name, header := range map[string][]byte{
		// Chrome and Firefox.
		"webm": {0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81, 0x01, 0x42, 0xF7, 0x81},
		// Safari, and every ISO-BMFF brand rather than the few a stdlib
		// sniffer recognises.
		"mp4 brand isom": append([]byte{0, 0, 0, 0x18}, []byte("ftypisom....")...),
		"mp4 brand iso5": append([]byte{0, 0, 0, 0x18}, []byte("ftypiso5....")...),
		"mp4 brand mp42": append([]byte{0, 0, 0, 0x18}, []byte("ftypmp42....")...),
		"m4a brand M4A ": append([]byte{0, 0, 0, 0x18}, []byte("ftypM4A ....")...),
		"ogg":            []byte("OggS\x00\x02\x00\x00\x00\x00\x00\x00"),
		"wav":            append([]byte("RIFF\x24\x08\x00\x00"), []byte("WAVE")...),
		"caf":            []byte("caff\x00\x01\x00\x00\x00\x00\x00\x00"),
		"mp3 with a tag": []byte("ID3\x03\x00\x00\x00\x00\x00\x00\x00\x00"),
		"mp3 bare frame": {0xFF, 0xFB, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0},
	} {
		t.Run(name, func(t *testing.T) {
			require.True(t, looksLikeRecordedMedia(header), "% x", header[:12])
		})
	}
}

// And a real one, made the way a browser makes it rather than the way this
// repository's other fixtures are made.
func TestARealRecordingIsAcceptedByTheGate(t *testing.T) {
	require.True(t, looksLikeRecordedMedia(recordingLike(t, "sine=frequency=440:duration=1")))
}
