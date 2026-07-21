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
	"github.com/omninudge/backend/internal/services/elevenlabs"
	"golang.org/x/sync/singleflight"
)

var ErrOmniChatBrowserVoice = errors.New("omnichat voice uses browser synthesis")

type OmniChatSpeechSynthesizer interface {
	Synthesize(ctx context.Context, voiceID string, request elevenlabs.SpeechRequest) ([]byte, string, error)
}

type OmniChatVoiceStore interface {
	GetSpeechSourceOwned(ctx context.Context, userID, conversationID, messageID int) (*models.OmniChatSpeechSource, error)
	GetCachedSpeechOwned(ctx context.Context, userID, messageID int, textHash, voiceHash string) (*models.OmniChatSpeechAudio, error)
	SaveSpeechAudio(ctx context.Context, audio *models.OmniChatSpeechAudio) error
}

type OmniChatVoiceService struct {
	store        OmniChatVoiceStore
	storage      StorageService
	synthesizer  OmniChatSpeechSynthesizer
	defaultModel string
	speechGroup  singleflight.Group
}

func NewOmniChatVoiceService(store OmniChatVoiceStore, storage StorageService, synthesizer OmniChatSpeechSynthesizer, defaultModel string) *OmniChatVoiceService {
	return &OmniChatVoiceService{store: store, storage: storage, synthesizer: synthesizer, defaultModel: defaultModel}
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
	if source.Voice.Provider != "elevenlabs" || s.synthesizer == nil || s.storage == nil {
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
		return s.generateSpeech(workCtx, source, userID, messageID, textHash, voiceHash)
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

func (s *OmniChatVoiceService) generateSpeech(ctx context.Context, source *models.OmniChatSpeechSource, userID, messageID int, textHash, voiceHash string) (*models.OmniChatSpeechAudio, error) {
	model := source.Voice.ModelID
	if strings.TrimSpace(model) == "" {
		model = s.defaultModel
	}
	languageCode := ""
	if source.Voice.LanguageCode != nil {
		languageCode = strings.TrimSpace(*source.Voice.LanguageCode)
	}
	audioBytes, contentType, err := s.synthesizer.Synthesize(ctx, source.Voice.VoiceID, elevenlabs.SpeechRequest{
		Text: source.Text, ModelID: model, LanguageCode: languageCode,
		VoiceSettings: &elevenlabs.VoiceSettings{
			Stability: source.Voice.Stability, SimilarityBoost: source.Voice.SimilarityBoost,
			Style: source.Voice.Style, Speed: source.Voice.Speed,
		},
	})
	if err != nil {
		return nil, err
	}
	path := fmt.Sprintf("omnichat/speech/%d/%d/%s-%s-%s.mp3", userID, messageID, voiceHash[:16], textHash[:16], uuid.NewString())
	if _, err = s.storage.Upload(ctx, path, bytes.NewReader(audioBytes), contentType); err != nil {
		return nil, err
	}
	audio := &models.OmniChatSpeechAudio{OwnerUserID: userID, PersonaID: source.PersonaID, MessageID: messageID, TextHash: textHash, VoiceConfigHash: voiceHash, StoragePath: path, FileType: contentType, FileSize: int64(len(audioBytes))}
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

func (s *OmniChatVoiceService) deleteSpeechObject(ctx context.Context, path string) {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
	defer cancel()
	_ = s.storage.Delete(cleanupCtx, path)
}
