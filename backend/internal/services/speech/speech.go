package speech

import (
	"context"
	"path"
	"strings"
)

// VoiceSettings is provider-neutral. Providers use only settings they support.
type VoiceSettings struct {
	Stability       float32 `json:"stability"`
	SimilarityBoost float32 `json:"similarity_boost"`
	Style           float32 `json:"style"`
	Speed           float32 `json:"speed"`
}

type Request struct {
	Text          string         `json:"text"`
	VoiceName     string         `json:"-"`
	ModelID       string         `json:"model_id,omitempty"`
	LanguageCode  string         `json:"language_code,omitempty"`
	VoiceSettings *VoiceSettings `json:"voice_settings,omitempty"`
}

type Audio struct {
	Bytes       []byte
	ContentType string
	Extension   string
}

type Synthesizer interface {
	Synthesize(ctx context.Context, voiceID string, request Request) (*Audio, error)
}

// IsOmniChatStoragePath accepts only the server-generated speech namespace.
// Cleanup callers use it before a destructive storage operation so a corrupted
// row or tombstone cannot become an arbitrary object-delete primitive.
func IsOmniChatStoragePath(storagePath string) bool {
	storagePath = strings.TrimSpace(storagePath)
	if !strings.HasPrefix(storagePath, "omnichat/speech/") || strings.ContainsAny(storagePath, "\\\x00\r\n\t") || path.Clean(storagePath) != storagePath {
		return false
	}
	return strings.HasSuffix(storagePath, ".mp3") || strings.HasSuffix(storagePath, ".wav")
}
