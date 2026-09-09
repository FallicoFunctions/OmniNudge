package services

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/omninudge/backend/internal/services/openrouter"
)

// What a browser records is not what the provider accepts.
//
// Chrome and Firefox produce webm/opus, Safari produces mp4/aac, and the
// transcription API takes wav or mp3. No browser can be asked for either, and
// the choice is not ours to make -- MediaRecorder offers what the platform has.
//
// ffmpeg is already a dependency of this repository, so the server normalises
// whatever arrives instead of the client guessing. That also bounds the request:
// one channel at 16 kHz is what speech recognition wants anyway, and it is a
// twentieth of the bytes of a stereo 48 kHz recording.

// ErrNoSpeechHeard means the recording contained no words. Ordinary, not a
// fault: somebody pressed the button and did not speak, or spoke too quietly.
var ErrNoSpeechHeard = errors.New("no speech was heard in the recording")

// transcriptionSampleRate is what speech models are trained on. Sending more
// costs bytes and buys nothing.
const transcriptionSampleRate = "16000"

// maxCallRecordingSeconds bounds one utterance. Long enough for anybody to
// finish a thought, short enough that a stuck recorder cannot send a request
// that costs real money.
const maxCallRecordingSeconds = 120

// transcodeTimeout bounds the ffmpeg call itself.
const transcodeTimeout = 30 * time.Second

type callTranscriber interface {
	Transcribe(ctx context.Context, model string, audio []byte, format string) (string, error)
}

// OmniChatCallTranscription turns a recording from a call into words.
type OmniChatCallTranscription struct {
	client callTranscriber
	model  string
}

func NewOmniChatCallTranscription(client *openrouter.Client, model string) *OmniChatCallTranscription {
	transcription := &OmniChatCallTranscription{model: model}
	// A nil *Client stored in an interface is not a nil interface, so assigning
	// it unconditionally would make Configured() report an ear this has not
	// got, and the route would advertise transcription it cannot do.
	if client != nil {
		transcription.client = client
	}
	return transcription
}

// Configured reports whether transcription can run at all, so a call can say
// so up front rather than after somebody has spoken.
func (t *OmniChatCallTranscription) Configured() bool {
	return t != nil && t.client != nil && strings.TrimSpace(t.model) != ""
}

// Transcribe normalises a browser recording and returns the words in it.
func (t *OmniChatCallTranscription) Transcribe(ctx context.Context, recording []byte) (string, error) {
	if !t.Configured() {
		return "", errors.New("call transcription is not configured")
	}
	if len(recording) == 0 {
		return "", ErrNoSpeechHeard
	}
	wav, err := toSpeechWAV(ctx, recording)
	if err != nil {
		return "", err
	}
	text, err := t.client.Transcribe(ctx, t.model, wav, "wav")
	if errors.Is(err, openrouter.ErrTranscriptionEmpty) {
		return "", ErrNoSpeechHeard
	}
	if err != nil {
		return "", err
	}
	return text, nil
}

// toSpeechWAV converts any container the browser produced into the one shape
// the provider takes.
//
// The input format is deliberately not named: ffmpeg reads the container from
// the bytes, and trusting a client-supplied content type would be trusting a
// client to describe a file it uploaded.
func toSpeechWAV(ctx context.Context, recording []byte) ([]byte, error) {
	directory, err := os.MkdirTemp("", "omnichat-call-audio-")
	if err != nil {
		return nil, fmt.Errorf("prepare audio workspace: %w", err)
	}
	defer func() { _ = os.RemoveAll(directory) }()

	if !looksLikeRecordedMedia(recording) {
		// Sniffed, never trusted from a header: the voice-message upload beside
		// this one says the same thing, because a Content-Type is whatever the
		// client typed. ffmpeg parsing arbitrary uploaded bytes is a wide
		// surface, and narrowing it to things that are actually media costs one
		// comparison.
		return nil, fmt.Errorf("the upload is not a recording")
	}
	source := filepath.Join(directory, "recording")
	if err := os.WriteFile(source, recording, 0o600); err != nil {
		return nil, fmt.Errorf("write recording: %w", err)
	}
	output := filepath.Join(directory, "speech.wav")

	transcodeCtx, cancel := context.WithTimeout(ctx, transcodeTimeout)
	defer cancel()
	// #nosec G204 -- ffmpeg is fixed, and every argument is a constant or a
	// path this function created. The recording is data, never a filename.
	command := exec.CommandContext(transcodeCtx, "ffmpeg",
		// info, not error: volumedetect reports at info level, so silencing
		// ffmpeg silences the measurement too. That is not theoretical -- with
		// this at "error" the report never arrived, isSilent never fired, and
		// two seconds of digital silence came back transcribed as a sentence.
		"-nostdin", "-loglevel", "info",
		"-t", fmt.Sprintf("%d", maxCallRecordingSeconds),
		"-i", source,
		"-vn",
		"-ac", "1",
		"-ar", transcriptionSampleRate,
		"-c:a", "pcm_s16le",
		// Measures loudness while it converts. A model handed silence does not
		// return nothing -- it invents: two seconds of digital silence came
		// back as "The quick brown fox jumps over the lazy dog", which would
		// have been sent to her as something the caller said. So silence is
		// caught here, before the request, rather than hoped away after it.
		"-af", "volumedetect",
		"-f", "wav",
		"-y", output)
	var stderr bytes.Buffer
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		var missing *exec.Error
		if errors.As(err, &missing) {
			return nil, fmt.Errorf("audio conversion is unavailable: %w", err)
		}
		// A recording ffmpeg cannot read is a bad upload, not an outage, and
		// the two must not be reported the same way.
		return nil, fmt.Errorf("the recording could not be read: %w", err)
	}
	wav, err := os.ReadFile(output)
	if err != nil {
		return nil, fmt.Errorf("read converted audio: %w", err)
	}
	// A WAV header alone is 44 bytes. Anything at that size carries no sound,
	// which means the recorder produced silence rather than speech.
	if len(wav) <= 1024 {
		return nil, ErrNoSpeechHeard
	}
	if isSilent(stderr.String()) {
		return nil, ErrNoSpeechHeard
	}
	return wav, nil
}

// looksLikeRecordedMedia reports whether the bytes are a media container.
//
// Browsers record webm, mp4 or ogg depending on the platform, and all three
// sniff as media. Anything else never reaches ffmpeg.
func looksLikeRecordedMedia(recording []byte) bool {
	if len(recording) < 12 {
		return false
	}
	detected := http.DetectContentType(recording)
	return strings.HasPrefix(detected, "audio/") ||
		strings.HasPrefix(detected, "video/") ||
		detected == "application/ogg"
}

// silenceCeilingDB is the loudest a recording may peak and still count as
// silence. Digital silence measures around -91 dB or none at all; speech from
// across a room clears -50 by a wide margin.
const silenceCeilingDB = -50.0

// isSilent reads the peak level out of ffmpeg's volumedetect report.
//
// A report that cannot be read is not treated as silence. Refusing to send
// audio because a log line changed shape would be worse than sending it.
func isSilent(report string) bool {
	for _, line := range strings.Split(report, "\n") {
		_, value, found := strings.Cut(line, "max_volume:")
		if !found {
			continue
		}
		value = strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(value), "dB"))
		peak, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
		if err != nil {
			return false
		}
		return peak < silenceCeilingDB
	}
	return false
}
