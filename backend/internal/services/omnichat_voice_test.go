package services

import (
	"bytes"
	"context"
	"errors"
	"io"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/speech"
	"github.com/stretchr/testify/require"
)

type omniChatVoiceStoreFake struct {
	source  *models.OmniChatSpeechSource
	saved   *models.OmniChatSpeechAudio
	saveErr error
}

func (f *omniChatVoiceStoreFake) GetSpeechSourceOwned(context.Context, int, int, int) (*models.OmniChatSpeechSource, error) {
	return f.source, nil
}
func (f *omniChatVoiceStoreFake) GetCachedSpeechOwned(context.Context, int, int, string, string) (*models.OmniChatSpeechAudio, error) {
	return nil, nil
}
func (f *omniChatVoiceStoreFake) SaveSpeechAudio(_ context.Context, audio *models.OmniChatSpeechAudio) error {
	f.saved = audio
	return f.saveErr
}

type omniChatSpeechSynthesizerFake struct {
	request speech.Request
	audio   *speech.Audio
}

func (f *omniChatSpeechSynthesizerFake) Synthesize(_ context.Context, _ string, request speech.Request) (*speech.Audio, error) {
	f.request = request
	if f.audio != nil {
		return f.audio, nil
	}
	return &speech.Audio{Bytes: []byte("wav"), ContentType: "audio/wav", Extension: ".wav"}, nil
}

type concurrentSpeechSynthesizerFake struct{ calls atomic.Int32 }

func (f *concurrentSpeechSynthesizerFake) Synthesize(_ context.Context, _ string, _ speech.Request) (*speech.Audio, error) {
	f.calls.Add(1)
	time.Sleep(100 * time.Millisecond)
	return &speech.Audio{Bytes: []byte("wav"), ContentType: "audio/wav", Extension: ".wav"}, nil
}

type omniChatVoiceStorageFake struct {
	mu               sync.Mutex
	deleteCalls      int
	deleteContextErr error
}

func (*omniChatVoiceStorageFake) Upload(context.Context, string, io.Reader, string) (string, error) {
	return "stored", nil
}
func (*omniChatVoiceStorageFake) Download(context.Context, string) (io.ReadCloser, error) {
	return io.NopCloser(bytes.NewReader(nil)), nil
}
func (f *omniChatVoiceStorageFake) Delete(ctx context.Context, _ string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deleteCalls++
	f.deleteContextErr = ctx.Err()
	return nil
}
func (f *omniChatVoiceStorageFake) deletionState() (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.deleteCalls, f.deleteContextErr
}
func (*omniChatVoiceStorageFake) GetSignedURL(context.Context, string, time.Duration) (string, error) {
	return "", nil
}
func (*omniChatVoiceStorageFake) List(context.Context, string) ([]string, error) { return nil, nil }
func (*omniChatVoiceStorageFake) GeneratePresignedPutURL(context.Context, string, string, time.Duration) (string, error) {
	return "", nil
}
func (*omniChatVoiceStorageFake) PublicURL(string) string { return "" }
func (*omniChatVoiceStorageFake) GetObjectSize(context.Context, string) (int64, error) {
	return 0, nil
}

func TestOmniChatVoiceServicePassesCharacterLanguageToProvider(t *testing.T) {
	language := "es"
	store := &omniChatVoiceStoreFake{source: &models.OmniChatSpeechSource{
		OwnerUserID: 7, PersonaID: 22, MessageID: 33, Text: "Hola",
		Voice: &models.OmniChatPersonaVoice{
			PersonaID: 22, Provider: "elevenlabs", VoiceID: "voice-22", ModelID: "eleven_multilingual_v2",
			Stability: .4, SimilarityBoost: .7, Speed: 1, LanguageCode: &language,
		},
	}}
	synthesizer := &omniChatSpeechSynthesizerFake{}
	service := NewOmniChatVoiceService(store, &omniChatVoiceStorageFake{}, map[string]speech.Synthesizer{"elevenlabs": synthesizer}, map[string]string{"elevenlabs": "default-model"})

	_, err := service.GetOrCreateSpeech(context.Background(), 7, 11, 33)
	require.NoError(t, err)
	require.Equal(t, "es", synthesizer.request.LanguageCode)
	require.NotNil(t, store.saved)
}

func TestOmniChatVoiceServiceDeletesUploadedAudioWhenCachePersistenceFails(t *testing.T) {
	store := &omniChatVoiceStoreFake{
		source: &models.OmniChatSpeechSource{OwnerUserID: 7, PersonaID: 22, MessageID: 33, Text: "Hello", Voice: &models.OmniChatPersonaVoice{
			PersonaID: 22, Provider: "elevenlabs", VoiceID: "voice-22", ModelID: "eleven_multilingual_v2", Speed: 1,
		}},
		saveErr: errors.New("database unavailable"),
	}
	storage := &omniChatVoiceStorageFake{}
	service := NewOmniChatVoiceService(store, storage, map[string]speech.Synthesizer{"elevenlabs": &omniChatSpeechSynthesizerFake{}}, map[string]string{"elevenlabs": "default-model"})

	_, err := service.GetOrCreateSpeech(context.Background(), 7, 11, 33)
	require.Error(t, err)
	deleteCalls, _ := storage.deletionState()
	require.Equal(t, 1, deleteCalls, "a failed cache row must not leave orphaned private audio")
}

func TestOmniChatVoiceServiceCleanupSurvivesCancelledRequestContext(t *testing.T) {
	store := &omniChatVoiceStoreFake{
		source: &models.OmniChatSpeechSource{OwnerUserID: 7, PersonaID: 22, MessageID: 33, Text: "Hello", Voice: &models.OmniChatPersonaVoice{
			PersonaID: 22, Provider: "elevenlabs", VoiceID: "voice-22", ModelID: "eleven_multilingual_v2", Speed: 1,
		}},
		saveErr: errors.New("database unavailable"),
	}
	storage := &omniChatVoiceStorageFake{}
	service := NewOmniChatVoiceService(store, storage, map[string]speech.Synthesizer{"elevenlabs": &omniChatSpeechSynthesizerFake{}}, map[string]string{"elevenlabs": "default-model"})
	requestContext, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := service.GetOrCreateSpeech(requestContext, 7, 11, 33)

	require.Error(t, err)
	require.Eventually(t, func() bool {
		deleteCalls, _ := storage.deletionState()
		return deleteCalls == 1
	}, time.Second, 10*time.Millisecond)
	_, deleteContextErr := storage.deletionState()
	require.NoError(t, deleteContextErr)
}

func TestOmniChatVoiceServiceCoalescesConcurrentSpeechGeneration(t *testing.T) {
	store := &omniChatVoiceStoreFake{source: &models.OmniChatSpeechSource{
		OwnerUserID: 7, PersonaID: 22, MessageID: 33, Text: "Hello", Voice: &models.OmniChatPersonaVoice{
			PersonaID: 22, Provider: "elevenlabs", VoiceID: "voice-22", ModelID: "eleven_multilingual_v2", Speed: 1,
		},
	}}
	synthesizer := &concurrentSpeechSynthesizerFake{}
	service := NewOmniChatVoiceService(store, &omniChatVoiceStorageFake{}, map[string]speech.Synthesizer{"elevenlabs": synthesizer}, map[string]string{"elevenlabs": "default-model"})
	start := make(chan struct{})
	errorsByRequest := make(chan error, 2)
	var requests sync.WaitGroup
	for range 2 {
		requests.Add(1)
		go func() {
			defer requests.Done()
			<-start
			_, err := service.GetOrCreateSpeech(context.Background(), 7, 11, 33)
			errorsByRequest <- err
		}()
	}
	close(start)
	requests.Wait()
	close(errorsByRequest)
	for err := range errorsByRequest {
		require.NoError(t, err)
	}
	require.Equal(t, int32(1), synthesizer.calls.Load(), "the same message and voice must generate only one provider request")
}

func TestOmniChatVoiceServiceRoutesVoiceboxAndStoresWAV(t *testing.T) {
	store := &omniChatVoiceStoreFake{source: &models.OmniChatSpeechSource{
		OwnerUserID: 7, PersonaID: 22, MessageID: 33, Text: "Welcome back",
		Voice: &models.OmniChatPersonaVoice{
			PersonaID: 22, Provider: "voicebox", VoiceID: "af_heart", VoiceName: "Heart",
			ModelID: "kokoro", Speed: 1,
		},
	}}
	voicebox := &omniChatSpeechSynthesizerFake{}
	service := NewOmniChatVoiceService(store, &omniChatVoiceStorageFake{}, map[string]speech.Synthesizer{"voicebox": voicebox}, map[string]string{"voicebox": "kokoro"})

	audio, err := service.GetOrCreateSpeech(context.Background(), 7, 11, 33)

	require.NoError(t, err)
	require.Equal(t, "kokoro", voicebox.request.ModelID)
	require.Equal(t, "audio/wav", audio.FileType)
	require.Contains(t, audio.StoragePath, ".wav")
}

func TestOmniChatVoiceServiceRejectsMismatchedAudioMetadata(t *testing.T) {
	store := &omniChatVoiceStoreFake{source: &models.OmniChatSpeechSource{
		OwnerUserID: 7, PersonaID: 22, MessageID: 33, Text: "Welcome back",
		Voice: &models.OmniChatPersonaVoice{
			PersonaID: 22, Provider: "voicebox", VoiceID: "af_heart", VoiceName: "Heart",
			ModelID: "kokoro", Speed: 1,
		},
	}}
	voicebox := &omniChatSpeechSynthesizerFake{audio: &speech.Audio{
		Bytes: []byte("not-an-mp3"), ContentType: "audio/wav", Extension: ".mp3",
	}}
	service := NewOmniChatVoiceService(store, &omniChatVoiceStorageFake{}, map[string]speech.Synthesizer{"voicebox": voicebox}, map[string]string{"voicebox": "kokoro"})

	_, err := service.GetOrCreateSpeech(context.Background(), 7, 11, 33)

	require.ErrorContains(t, err, "invalid audio metadata")
	require.Nil(t, store.saved)
}

func TestValidOmniChatSpeechAudioRequiresMatchingBoundedFormats(t *testing.T) {
	tests := []struct {
		name  string
		audio *speech.Audio
		valid bool
	}{
		{name: "mp3", audio: &speech.Audio{Bytes: []byte("mp3"), ContentType: "audio/mpeg", Extension: ".mp3"}, valid: true},
		{name: "wav", audio: &speech.Audio{Bytes: []byte("wav"), ContentType: "audio/wav", Extension: ".wav"}, valid: true},
		{name: "mismatched extension", audio: &speech.Audio{Bytes: []byte("wav"), ContentType: "audio/wav", Extension: ".mp3"}},
		{name: "oversized mp3", audio: &speech.Audio{Bytes: make([]byte, maxOmniChatMP3Bytes+1), ContentType: "audio/mpeg", Extension: ".mp3"}},
		{name: "oversized wav", audio: &speech.Audio{Bytes: make([]byte, maxOmniChatWAVBytes+1), ContentType: "audio/wav", Extension: ".wav"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			require.Equal(t, test.valid, validOmniChatSpeechAudio(test.audio))
		})
	}
}
