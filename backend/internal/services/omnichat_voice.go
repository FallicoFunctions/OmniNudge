package services

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/speech"
	"golang.org/x/sync/singleflight"
)

var ErrOmniChatBrowserVoice = errors.New("omnichat voice uses browser synthesis")

const (
	maxOmniChatMP3Bytes = 10 << 20
	maxOmniChatWAVBytes = 25 << 20
)

type OmniChatVoiceStore interface {
	GetSpeechSourceOwned(ctx context.Context, userID, conversationID, messageID int) (*models.OmniChatSpeechSource, error)
	GetCachedSpeechOwned(ctx context.Context, userID, messageID int, textHash, voiceHash string) (*models.OmniChatSpeechAudio, error)
	SaveSpeechAudio(ctx context.Context, audio *models.OmniChatSpeechAudio) error
}

type OmniChatVoiceService struct {
	store         OmniChatVoiceStore
	storage       StorageService
	providers     map[string]speech.Synthesizer
	defaultModels map[string]string
	speechGroup   singleflight.Group
}

func NewOmniChatVoiceService(store OmniChatVoiceStore, storage StorageService, providers map[string]speech.Synthesizer, defaultModels map[string]string) *OmniChatVoiceService {
	return &OmniChatVoiceService{store: store, storage: storage, providers: providers, defaultModels: defaultModels}
}

func (s *OmniChatVoiceService) GetOrCreateSpeech(ctx context.Context, userID, conversationID, messageID int) (*models.OmniChatSpeechAudio, error) {
	source, err := s.store.GetSpeechSourceOwned(ctx, userID, conversationID, messageID)
	if err != nil {
		return nil, err
	}
	if source == nil || source.Voice == nil {
		return nil, ErrNotFound
	}
	if source.Voice.Provider == "browser" {
		return nil, ErrOmniChatBrowserVoice
	}
	synthesizer := s.providers[source.Voice.Provider]
	if synthesizer == nil || s.storage == nil {
		return nil, errors.New("character speech provider is unavailable")
	}
	textHashBytes := sha256.Sum256([]byte(source.Text))
	textHash := hex.EncodeToString(textHashBytes[:])
	voiceConfig, err := json.Marshal(source.Voice)
	if err != nil {
		return nil, err
	}
	voiceHashBytes := sha256.Sum256(voiceConfig)
	voiceHash := hex.EncodeToString(voiceHashBytes[:])
	cached, err := s.store.GetCachedSpeechOwned(ctx, userID, messageID, textHash, voiceHash)
	if err != nil {
		return nil, err
	}
	if cached != nil {
		return cached, nil
	}
	key := fmt.Sprintf("%d:%d:%s:%s", userID, messageID, textHash, voiceHash)
	result := s.speechGroup.DoChan(key, func() (any, error) {
		// A speech request is shared by concurrent HTTP requests. Keep it alive
		// when one waiter disconnects, but impose a hard provider/storage bound.
		workCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Minute)
		defer cancel()
		cached, err := s.store.GetCachedSpeechOwned(workCtx, userID, messageID, textHash, voiceHash)
		if err != nil {
			return nil, err
		}
		if cached != nil {
			return cached, nil
		}
		return s.generateSpeech(workCtx, synthesizer, source, userID, messageID, textHash, voiceHash)
	})
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case shared := <-result:
		if shared.Err != nil {
			return nil, shared.Err
		}
		audio, ok := shared.Val.(*models.OmniChatSpeechAudio)
		if !ok || audio == nil {
			return nil, errors.New("character speech generation returned an invalid result")
		}
		return audio, nil
	}
}

func (s *OmniChatVoiceService) generateSpeech(ctx context.Context, synthesizer speech.Synthesizer, source *models.OmniChatSpeechSource, userID, messageID int, textHash, voiceHash string) (*models.OmniChatSpeechAudio, error) {
	model := source.Voice.ModelID
	if strings.TrimSpace(model) == "" {
		model = s.defaultModels[source.Voice.Provider]
	}
	languageCode := ""
	if source.Voice.LanguageCode != nil {
		languageCode = strings.TrimSpace(*source.Voice.LanguageCode)
	}
	generated, err := synthesizer.Synthesize(ctx, source.Voice.VoiceID, speech.Request{
		Text: source.Text, VoiceName: source.Voice.VoiceName, ModelID: model, LanguageCode: languageCode,
		VoiceSettings: &speech.VoiceSettings{
			Stability: source.Voice.Stability, SimilarityBoost: source.Voice.SimilarityBoost,
			Style: source.Voice.Style, Speed: source.Voice.Speed,
		},
	})
	if err != nil {
		return nil, err
	}
	if !validOmniChatSpeechAudio(generated) {
		return nil, errors.New("speech provider returned invalid audio metadata")
	}
	path := fmt.Sprintf("omnichat/speech/%d/%d/%s-%s-%s%s", userID, messageID, voiceHash[:16], textHash[:16], uuid.NewString(), generated.Extension)
	if _, err = s.storage.Upload(ctx, path, bytes.NewReader(generated.Bytes), generated.ContentType); err != nil {
		return nil, err
	}
	audio := &models.OmniChatSpeechAudio{OwnerUserID: userID, PersonaID: source.PersonaID, MessageID: messageID, TextHash: textHash, VoiceConfigHash: voiceHash, StoragePath: path, FileType: generated.ContentType, FileSize: int64(len(generated.Bytes))}
	if err = s.store.SaveSpeechAudio(ctx, audio); err != nil {
		s.deleteSpeechObject(ctx, path)
		return nil, err
	}
	// A concurrent request may have won the cache upsert. Keep the canonical
	// object returned by the repository and remove this request's unused upload.
	if audio.StoragePath != path {
		s.deleteSpeechObject(ctx, path)
	}
	return audio, nil
}

func validOmniChatSpeechAudio(audio *speech.Audio) bool {
	if audio == nil || len(audio.Bytes) == 0 {
		return false
	}
	switch audio.ContentType {
	case "audio/mpeg":
		return audio.Extension == ".mp3" && len(audio.Bytes) <= maxOmniChatMP3Bytes
	case "audio/wav":
		return audio.Extension == ".wav" && len(audio.Bytes) <= maxOmniChatWAVBytes
	default:
		return false
	}
}

func (s *OmniChatVoiceService) PreviewPresetSpeech(ctx context.Context, preset OmniChatVoicePreset) (*speech.Audio, error) {
	synthesizer := s.providers[preset.Provider]
	if synthesizer == nil {
		return nil, errors.New("character speech provider is unavailable")
	}
	previewCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	return synthesizer.Synthesize(previewCtx, preset.VoiceID, speech.Request{
		Text:         "Hi, this is " + preset.Name + ". Choose me as your character voice.",
		VoiceName:    preset.Name,
		ModelID:      preset.ModelID,
		LanguageCode: preset.LanguageCode,
	})
}

func (s *OmniChatVoiceService) deleteSpeechObject(ctx context.Context, path string) {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
	defer cancel()
	_ = s.storage.Delete(cleanupCtx, path)
}
