package openrouter

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// Turning speech into text with a model we already pay for.
//
// The browser's own SpeechRecognition was tried first and cannot be made to
// work: in Chromium browsers it ships audio to a Google service on a key only
// Chrome carries, so Opera and Brave hold the microphone and never answer, and
// in Safari it needs macOS Dictation switched on. Neither is a thing to ask
// somebody to configure before they can make a phone call.
//
// This asks the same provider that already writes her replies. It needs no new
// key, no new account, and no setting on anybody's machine: the one microphone
// permission the browser already prompts for is genuinely enough.

// ErrTranscriptionEmpty means the model returned no words. Silence is the
// ordinary reason, so the caller says "I didn't catch that" rather than
// treating it as a fault.
var ErrTranscriptionEmpty = errors.New("openrouter: the audio contained no speech")

// maxTranscriptionAudioBytes caps what is base64-encoded into one request.
// Roughly ten minutes of the 16 kHz mono WAV the caller sends.
const maxTranscriptionAudioBytes = 20 << 20

// transcriptionInstruction is deliberately narrow.
//
// The model is a conversational one, and asked loosely it will answer the
// speech rather than transcribe it -- "can you hear me" comes back as "Yes, I
// can hear you". Naming the output and forbidding everything else is what
// keeps a transcript a transcript.
const transcriptionInstruction = "Transcribe the speech in this audio verbatim. " +
	"Reply with only the words that were spoken, with no quotation marks, no speaker labels, " +
	"no commentary, and no description of the audio. If there is no speech, reply with nothing at all."

type transcriptionAudio struct {
	Data   string `json:"data"`
	Format string `json:"format"`
}

type transcriptionPart struct {
	Type       string              `json:"type"`
	Text       string              `json:"text,omitempty"`
	InputAudio *transcriptionAudio `json:"input_audio,omitempty"`
}

// Transcribe returns the words spoken in the audio.
//
// The audio must already be in a format the provider accepts -- wav or mp3.
// Callers hand it whatever the browser recorded and let ffmpeg normalise it,
// because no browser records either of those.
func (c *Client) Transcribe(ctx context.Context, model string, audio []byte, format string) (string, error) {
	if c == nil {
		return "", ErrNotConfigured
	}
	if strings.TrimSpace(c.apiKey) == "" {
		return "", ErrNotConfigured
	}
	if len(audio) == 0 {
		return "", ErrTranscriptionEmpty
	}
	if len(audio) > maxTranscriptionAudioBytes {
		return "", fmt.Errorf("openrouter: audio is %d bytes, over the %d limit",
			len(audio), maxTranscriptionAudioBytes)
	}
	if model = strings.TrimSpace(model); model == "" {
		return "", errors.New("openrouter: no transcription model configured")
	}
	if format = strings.TrimSpace(strings.ToLower(format)); format != "wav" && format != "mp3" {
		return "", fmt.Errorf("openrouter: %q is not an accepted audio format", format)
	}

	payload := map[string]any{
		"model": model,
		// Nothing creative. A transcript that varies between identical inputs
		// is a transcript nobody can debug.
		"temperature": 0,
		"messages": []map[string]any{{
			"role": "user",
			"content": []transcriptionPart{
				{Type: "text", Text: transcriptionInstruction},
				{Type: "input_audio", InputAudio: &transcriptionAudio{
					Data:   base64.StdEncoding.EncodeToString(audio),
					Format: format,
				}},
			},
		}},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("openrouter: encode transcription request: %w", err)
	}

	// The same endpoint the chat path uses: this is a chat completion whose
	// content happens to be audio.
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(raw))
	if err != nil {
		return "", fmt.Errorf("openrouter: build transcription request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+c.apiKey)
	request.Header.Set("Content-Type", "application/json")

	response, err := c.httpClient.Do(request)
	if err != nil {
		return "", fmt.Errorf("openrouter: transcription request failed: %w", err)
	}
	defer func() { _ = response.Body.Close() }()

	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("openrouter: read transcription response: %w", err)
	}
	if response.StatusCode == http.StatusTooManyRequests {
		return "", ErrRateLimited
	}
	if response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden {
		return "", ErrAccessDenied
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("openrouter: transcription returned HTTP %d", response.StatusCode)
	}

	var decoded struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &decoded); err != nil {
		return "", fmt.Errorf("openrouter: decode transcription response: %w", err)
	}
	if len(decoded.Choices) == 0 {
		return "", ErrTranscriptionEmpty
	}
	text := cleanTranscript(decoded.Choices[0].Message.Content)
	if text == "" {
		return "", ErrTranscriptionEmpty
	}
	return text, nil
}

// cleanTranscript removes the wrapping a conversational model adds even when
// told not to.
//
// Asked for words only, it still sometimes returns them in quotes, and on
// silence it announces the silence instead of saying nothing. Both would be
// spoken back to the user as though they had said them.
func cleanTranscript(raw string) string {
	text := strings.TrimSpace(raw)
	text = strings.Trim(text, "\"'")
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	// A model describing an absence, rather than transcribing a presence.
	lowered := strings.ToLower(text)
	for _, refusal := range []string{
		"no speech", "there is no speech", "(no speech)", "[no speech]",
		"silence", "(silence)", "[silence]", "inaudible", "(inaudible)", "[inaudible]",
		"no audible speech", "unintelligible",
	} {
		if lowered == refusal {
			return ""
		}
	}
	return text
}
