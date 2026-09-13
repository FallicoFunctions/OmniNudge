package handlers

import (
	"context"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/liveavatar"
	"github.com/omninudge/backend/internal/services/speech"
	zlog "github.com/rs/zerolog/log"
)

var omniChatVoiceIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)
var omniChatVoiceModelPattern = regexp.MustCompile(`^[A-Za-z0-9._/-]{1,128}$`)
var omniChatVoiceLanguagePattern = regexp.MustCompile(`^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,4})?$`)

func normalizeOmniChatVoiceProfile(voice *models.OmniChatPersonaVoice) error {
	voice.Provider = strings.TrimSpace(voice.Provider)
	voice.VoiceID = strings.TrimSpace(voice.VoiceID)
	voice.VoiceName = strings.TrimSpace(voice.VoiceName)
	voice.ModelID = strings.TrimSpace(voice.ModelID)
	if voice.LanguageCode != nil {
		language := strings.TrimSpace(*voice.LanguageCode)
		if language == "" {
			voice.LanguageCode = nil
		} else {
			voice.LanguageCode = &language
		}
	}
	if (voice.Provider != "browser" && voice.Provider != "elevenlabs" && voice.Provider != "voicebox") ||
		!omniChatVoiceIDPattern.MatchString(voice.VoiceID) || voice.VoiceName == "" ||
		len([]rune(voice.VoiceName)) > 100 || (voice.ModelID != "" && !omniChatVoiceModelPattern.MatchString(voice.ModelID)) ||
		(voice.LanguageCode != nil && !omniChatVoiceLanguagePattern.MatchString(*voice.LanguageCode)) ||
		voice.Stability < 0 || voice.Stability > 1 || voice.SimilarityBoost < 0 || voice.SimilarityBoost > 1 ||
		voice.Style < 0 || voice.Style > 1 || voice.Speed < 0.7 || voice.Speed > 1.2 ||
		voice.Pitch < 0.5 || voice.Pitch > 2 {
		return errors.New("invalid voice profile")
	}
	if voice.Provider == "voicebox" {
		preset, ok := services.FindOmniChatVoicePreset(voice.VoiceID)
		if !ok || voice.ModelID != preset.ModelID || voice.VoiceName != preset.Name || voice.LanguageCode == nil || *voice.LanguageCode != preset.LanguageCode {
			return errors.New("invalid voice profile")
		}
	}
	if voice.ModelID == "" {
		switch voice.Provider {
		case "browser":
			voice.ModelID = "browser-native"
		case "voicebox":
			voice.ModelID = "kokoro"
		default:
			voice.ModelID = "eleven_multilingual_v2"
		}
	}
	return nil
}

func publicOmniChatVoiceProfile(voice *models.OmniChatPersonaVoice) *models.OmniChatPersonaVoice {
	if voice == nil {
		return nil
	}
	public := *voice
	return &public
}

type OmniChatVoiceData interface {
	GetPersonaVoice(ctx context.Context, personaID int) (*models.OmniChatPersonaVoice, error)
	GetPersonaVoiceAccessible(ctx context.Context, personaID, viewerUserID int) (*models.OmniChatPersonaVoice, error)
	GetConversationVoiceOwned(ctx context.Context, userID, conversationID int) (*models.OmniChatPersonaVoice, error)
	UpsertPersonaVoiceAuthorized(ctx context.Context, userID int, voice *models.OmniChatPersonaVoice) (bool, error)
	StartCallOwned(ctx context.Context, userID, conversationID int, mode string) (*models.OmniChatCallSession, error)
	EndCallOwned(ctx context.Context, id uuid.UUID, userID int) (bool, error)
	IncrementCallTurnOwned(ctx context.Context, id uuid.UUID, userID int) (bool, error)
	GetLiveCallContextOwned(ctx context.Context, userID, conversationID int) (*models.OmniChatLiveCallContext, error)
	AttachCallProviderOwned(ctx context.Context, id uuid.UUID, userID int, provider, providerSessionID string) (bool, error)
	GetActiveCallProviderOwned(ctx context.Context, id uuid.UUID, userID int) (string, string, bool, error)
	ListActiveCallProvidersOwned(ctx context.Context, userID int) ([]models.OmniChatCallProviderSession, error)
	ClearCallProviderSessionOwned(ctx context.Context, id uuid.UUID, userID int, providerSessionID string) error
}
type OmniChatSpeechCreator interface {
	GetOrCreateSpeech(ctx context.Context, userID, conversationID, messageID int) (*services.OmniChatSpeech, error)
	PreviewPresetSpeech(ctx context.Context, preset services.OmniChatVoicePreset) (*speech.Audio, error)
	SpeakSentence(ctx context.Context, voice *models.OmniChatPersonaVoice, sentence string) (*speech.Audio, error)
}

// omniChatCallSentenceReader hands back a sentence the generator produced
// moments ago. The browser asks by number rather than sending the words, so
// this route can never be asked to say something the server did not write.
type omniChatCallSentenceReader interface {
	Read(ctx context.Context, userID, conversationID int, turn string, sequence int) (string, bool, error)
}

// SetCallSentences wires the store that holds a call reply while it is being
// spoken.
func (h *OmniChatVoiceHandler) SetCallSentences(sentences omniChatCallSentenceReader) *OmniChatVoiceHandler {
	h.callSentences = sentences
	return h
}

type OmniChatVoiceHandler struct {
	data                OmniChatVoiceData
	speech              OmniChatSpeechCreator
	storage             services.StorageService
	liveVideo           liveVideoClient
	voiceboxAvailable   bool
	voiceCloningEnabled bool
	transcription       omniChatCallTranscriber
	callSentences       omniChatCallSentenceReader
	billing             omniChatCallBilling
}

// omniChatCallBilling is what starting a call needs from billing: the video
// reservation, and whether a voice caller can pay for the first minute.
type omniChatCallBilling interface {
	ReserveOwned(context.Context, int, uuid.UUID, string) (*models.OmniCreditsUsageReservation, error)
	CaptureOwned(context.Context, int, uuid.UUID) error
	RefundOwned(context.Context, int, uuid.UUID) error
	CanAffordCallMinuteOwned(context.Context, int) (bool, int64, error)
}

type liveVideoClient interface {
	Configured() bool
	Start(context.Context, liveavatar.StartRequest) (*liveavatar.Session, error)
	EndConversation(context.Context, string) error
}

type liveVideoTokenRefresher interface {
	RefreshToken(context.Context, uuid.UUID, int) (string, error)
}

func (h *OmniChatVoiceHandler) SetBilling(billing omniChatCallBilling) *OmniChatVoiceHandler {
	h.billing = billing
	return h
}

func (h *OmniChatVoiceHandler) ConfigureVoiceCatalog(voiceboxAvailable, voiceCloningEnabled bool) *OmniChatVoiceHandler {
	h.voiceboxAvailable = voiceboxAvailable
	h.voiceCloningEnabled = voiceCloningEnabled
	return h
}

func (h *OmniChatVoiceHandler) ListVoicePresets(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"presets":               services.OmniChatVoicePresets(),
		"voicebox_available":    h.voiceboxAvailable,
		"voice_cloning_enabled": h.voiceCloningEnabled,
	})
}

func (h *OmniChatVoiceHandler) PreviewVoicePreset(c *gin.Context) {
	preset, ok := services.FindOmniChatVoicePreset(strings.TrimSpace(c.Param("preset_id")))
	if !ok {
		RespondError(c, http.StatusNotFound, "Voice preset not found")
		return
	}
	if !h.voiceboxAvailable || h.speech == nil {
		RespondError(c, http.StatusServiceUnavailable, "Voice previews are temporarily unavailable")
		return
	}
	audio, err := h.speech.PreviewPresetSpeech(c.Request.Context(), preset)
	if err != nil || audio == nil || audio.ContentType != "audio/wav" || len(audio.Bytes) == 0 || len(audio.Bytes) > 25<<20 {
		RespondError(c, http.StatusServiceUnavailable, "Voice preview is temporarily unavailable")
		return
	}
	c.Header("Content-Type", audio.ContentType)
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, audio.ContentType, audio.Bytes)
}

func NewOmniChatVoiceHandler(data OmniChatVoiceData, speech OmniChatSpeechCreator, storage services.StorageService, liveVideo liveVideoClient, _ ...string) *OmniChatVoiceHandler {
	return &OmniChatVoiceHandler{data: data, speech: speech, storage: storage, liveVideo: liveVideo}
}

func (h *OmniChatVoiceHandler) GetPersonaVoice(c *gin.Context) {
	personaID, err := strconv.Atoi(c.Param("id"))
	if err != nil || personaID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid persona ID")
		return
	}
	voice, err := h.data.GetPersonaVoiceAccessible(c.Request.Context(), personaID, c.GetInt("user_id"))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load character voice")
		return
	}
	if voice == nil {
		RespondError(c, http.StatusNotFound, "Character not found")
		return
	}
	c.JSON(http.StatusOK, gin.H{"voice": publicOmniChatVoiceProfile(voice)})
}

func (h *OmniChatVoiceHandler) UpdatePersonaVoice(c *gin.Context) {
	personaID, err := strconv.Atoi(c.Param("id"))
	if err != nil || personaID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid persona ID")
		return
	}
	voice := &models.OmniChatPersonaVoice{}
	if err := decodeStrictJSON(c, voice); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid voice profile")
		return
	}
	voice.PersonaID = personaID
	if err := normalizeOmniChatVoiceProfile(voice); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid voice profile")
		return
	}
	// Live avatar workers are selected by the deployment, not by client-supplied
	// provider identifiers. The request may configure speech only.
	updated, err := h.data.UpsertPersonaVoiceAuthorized(c.Request.Context(), c.GetInt("user_id"), voice)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update character voice")
		return
	}
	if !updated {
		RespondError(c, http.StatusForbidden, "You cannot configure this character")
		return
	}
	saved, err := h.data.GetPersonaVoice(c.Request.Context(), personaID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load character voice")
		return
	}
	c.JSON(http.StatusOK, gin.H{"voice": publicOmniChatVoiceProfile(saved)})
}

func (h *OmniChatVoiceHandler) GetMessageSpeech(c *gin.Context) {
	conversationID, err1 := strconv.Atoi(c.Param("id"))
	messageID, err2 := strconv.Atoi(c.Param("message_id"))
	if err1 != nil || err2 != nil || conversationID <= 0 || messageID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid message")
		return
	}
	generated, err := h.speech.GetOrCreateSpeech(c.Request.Context(), c.GetInt("user_id"), conversationID, messageID)
	if errors.Is(err, services.ErrOmniChatBrowserVoice) {
		RespondError(c, http.StatusConflict, "This character uses on-device speech")
		return
	}
	if errors.Is(err, services.ErrNotFound) {
		RespondError(c, http.StatusNotFound, "Message not found")
		return
	}
	if errors.Is(err, services.ErrOmniChatPaidFeatureRequired) {
		RespondError(c, http.StatusPaymentRequired, "Character speech requires OmniCredits")
		return
	}
	if err != nil {
		RespondError(c, http.StatusServiceUnavailable, "Character speech is temporarily unavailable")
		return
	}
	audio := generated.Audio
	if audio == nil {
		RespondError(c, http.StatusServiceUnavailable, "Character speech is temporarily unavailable")
		return
	}
	if audio.FileType != "audio/mpeg" && audio.FileType != "audio/wav" {
		RespondError(c, http.StatusConflict, "Speech audio type is invalid")
		return
	}
	maxBytes := int64(10 << 20)
	if audio.FileType == "audio/wav" {
		maxBytes = 25 << 20
	}

	// Bytes this request just synthesised are already in memory. Reading them
	// back out of object storage costs a HEAD, a GET and the whole file over the
	// network, and on a phone call that is time the caller spends in silence.
	if len(generated.Fresh) > 0 {
		if int64(len(generated.Fresh)) > maxBytes {
			RespondError(c, http.StatusConflict, "Speech audio size is invalid")
			return
		}
		writeOmniChatSpeechHeaders(c, audio.FileType, int64(len(generated.Fresh)))
		_, _ = c.Writer.Write(generated.Fresh)
		return
	}

	if h.storage == nil {
		RespondError(c, http.StatusServiceUnavailable, "Speech storage is unavailable")
		return
	}
	objectSize, err := h.storage.GetObjectSize(c.Request.Context(), audio.StoragePath)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Speech audio not found")
		return
	}
	if objectSize <= 0 || objectSize > maxBytes {
		RespondError(c, http.StatusConflict, "Speech audio size is invalid")
		return
	}
	reader, err := h.storage.Download(c.Request.Context(), audio.StoragePath)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Speech audio not found")
		return
	}
	defer func() { _ = reader.Close() }()
	writeOmniChatSpeechHeaders(c, audio.FileType, objectSize)
	_, _ = io.Copy(c.Writer, &io.LimitedReader{R: reader, N: objectSize})
}

// GetCallSentenceSpeech turns one sentence of a live call into her voice.
//
// This is what makes a call feel like a call. The whole-reply route waits for
// the last word to be written before the first one is spoken; this one is asked
// for sentence one while sentence two is still being generated.
//
// The browser asks by turn and number, never by sending text: a route that
// synthesised whatever a client typed would be a voice-cloning oracle wearing
// somebody's character as a costume.
func (h *OmniChatVoiceHandler) GetCallSentenceSpeech(c *gin.Context) {
	conversationID, err1 := strconv.Atoi(c.Param("id"))
	sequence, err2 := strconv.Atoi(c.Param("sequence"))
	turn := c.Param("turn")
	if err1 != nil || err2 != nil || conversationID <= 0 || sequence <= 0 || !services.ValidCallTurn(turn) {
		RespondError(c, http.StatusBadRequest, "Invalid sentence")
		return
	}
	if h.callSentences == nil || h.speech == nil {
		RespondError(c, http.StatusServiceUnavailable, "Character speech is temporarily unavailable")
		return
	}
	userID := c.GetInt("user_id")
	sentence, found, err := h.callSentences.Read(c.Request.Context(), userID, conversationID, turn, sequence)
	if err != nil {
		RespondError(c, http.StatusServiceUnavailable, "Character speech is temporarily unavailable")
		return
	}
	if !found {
		// Ordinary, not a fault: the turn ended, or the call did.
		RespondError(c, http.StatusNotFound, "That sentence is no longer available")
		return
	}

	// Ownership is decided here, not by the cache. A sentence key is derived
	// from a user id and would be enough on its own, which is exactly why it is
	// not trusted on its own: one query settles both whether this conversation
	// is theirs and whose voice it is.
	voice, err := h.data.GetConversationVoiceOwned(c.Request.Context(), userID, conversationID)
	if err != nil {
		RespondError(c, http.StatusServiceUnavailable, "Character speech is temporarily unavailable")
		return
	}
	if voice == nil {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	}

	audio, err := h.speech.SpeakSentence(c.Request.Context(), voice, sentence)
	if errors.Is(err, services.ErrOmniChatBrowserVoice) {
		RespondError(c, http.StatusConflict, "This character uses on-device speech")
		return
	}
	if errors.Is(err, services.ErrNotFound) {
		// Nothing in it was speech -- a sentence of pure narration. The caller
		// skips it and asks for the next one. A 204 carries no body by
		// definition, so this is a status and not an error document.
		c.Status(http.StatusNoContent)
		return
	}
	if err != nil {
		RespondError(c, http.StatusServiceUnavailable, "Character speech is temporarily unavailable")
		return
	}
	writeOmniChatSpeechHeaders(c, audio.ContentType, int64(len(audio.Bytes)))
	_, _ = c.Writer.Write(audio.Bytes)
}

// writeOmniChatSpeechHeaders is written once because the two delivery paths
// must not drift.
//
// A conversation/message URL can be reused by a different account in the same
// browser, so the no-store rule is what keeps one account's speech out of
// another's disk cache. A fresh response that forgot it would be exactly that
// disclosure, and it would look identical from the outside.
func writeOmniChatSpeechHeaders(c *gin.Context, contentType string, size int64) {
	c.Header("Content-Type", contentType)
	c.Header("Content-Length", strconv.FormatInt(size, 10))
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
}

func (h *OmniChatVoiceHandler) StartCall(c *gin.Context) {
	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil || conversationID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}
	var request struct {
		Mode string `json:"mode"`
	}
	if err := decodeStrictJSON(c, &request); err != nil || (request.Mode != "voice" && request.Mode != "video") {
		RespondError(c, http.StatusBadRequest, "mode must be voice or video")
		return
	}
	if request.Mode == "video" && (h.liveVideo == nil || !h.liveVideo.Configured()) {
		RespondError(c, http.StatusServiceUnavailable, "Live avatar video is not configured")
		return
	}
	userID := c.GetInt("user_id")
	// A voice call is paid by the minute from the moment the phone is
	// pressed, so a caller who cannot pay for the first one is stopped here,
	// before a call exists. Without billing the answer is no, never free.
	if request.Mode == "voice" {
		if h.billing == nil {
			RespondError(c, http.StatusServiceUnavailable, "Voice calls are not available right now")
			return
		}
		affordable, _, err := h.billing.CanAffordCallMinuteOwned(c.Request.Context(), userID)
		if err != nil {
			zlog.Error().Err(err).Int("user_id", userID).Msg("omnichat call: could not check the caller's credits")
			RespondError(c, http.StatusServiceUnavailable, "Voice billing is temporarily unavailable")
			return
		}
		if !affordable {
			RespondError(c, http.StatusPaymentRequired, "Voice calls require OmniCredits")
			return
		}
	}
	var activeProviders []models.OmniChatCallProviderSession
	if h.liveVideo != nil && h.liveVideo.Configured() {
		var providerErr error
		activeProviders, providerErr = h.data.ListActiveCallProvidersOwned(c.Request.Context(), userID)
		if providerErr != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to start call")
			return
		}
	}
	session, err := h.data.StartCallOwned(c.Request.Context(), userID, conversationID, request.Mode)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to start call")
		return
	}
	if session == nil {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	}
	// StartCallOwned has already ended the prior local call. Reclaim its
	// provider session on every subsequent path, including billing failures.
	for _, active := range activeProviders {
		h.endProviderSessionBestEffort(c.Request.Context(), active.CallID, userID, active.Provider, active.SessionID)
	}
	videoReserved := false
	refundVideo := func() {
		if videoReserved {
			cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(c.Request.Context()), 15*time.Second)
			defer cancel()
			if err := h.billing.RefundOwned(cleanupCtx, userID, session.ID); err != nil {
				zlog.Error().Err(err).Str("call_id", session.ID.String()).Msg("failed to refund live video reservation; reconciliation will retry")
			}
			videoReserved = false
		}
	}
	if request.Mode == "video" {
		if h.billing == nil {
			h.endLocalCallBestEffort(c.Request.Context(), session.ID, userID)
			RespondError(c, http.StatusServiceUnavailable, "Video billing is not configured")
			return
		}
		if _, err := h.billing.ReserveOwned(c.Request.Context(), userID, session.ID, models.OmniCreditsUsageVideo); err != nil {
			h.endLocalCallBestEffort(c.Request.Context(), session.ID, userID)
			if errors.Is(err, models.ErrOmniCreditsInsufficient) {
				RespondError(c, http.StatusPaymentRequired, "Video calls require OmniCredits")
			} else {
				RespondError(c, http.StatusServiceUnavailable, "Video billing is temporarily unavailable")
			}
			return
		}
		videoReserved = true
	}
	if request.Mode == "video" && h.liveVideo != nil && h.liveVideo.Configured() {
		callContext, contextErr := h.data.GetLiveCallContextOwned(c.Request.Context(), userID, conversationID)
		if contextErr != nil || callContext == nil {
			h.endLocalCallBestEffort(c.Request.Context(), session.ID, userID)
			refundVideo()
			RespondError(c, http.StatusInternalServerError, "Failed to prepare live video call")
			return
		}
		avatarURL := ""
		if callContext.AvatarURL != nil {
			avatarURL = *callContext.AvatarURL
		}
		providerSession, providerErr := h.liveVideo.Start(c.Request.Context(), liveavatar.StartRequest{
			CallID: session.ID, UserID: userID, PersonaID: session.PersonaID,
			PersonaName: callContext.PersonaName, AvatarURL: avatarURL, Context: callContext.Context,
		})
		if providerErr != nil {
			h.endLocalCallBestEffort(c.Request.Context(), session.ID, userID)
			refundVideo()
			RespondError(c, http.StatusServiceUnavailable, "Live avatar video is temporarily unavailable")
			return
		}
		if providerSession == nil || providerSession.ProviderSessionID == "" {
			h.endLocalCallBestEffort(c.Request.Context(), session.ID, userID)
			refundVideo()
			RespondError(c, http.StatusServiceUnavailable, "Live avatar video is temporarily unavailable")
			return
		}
		attached, attachErr := h.data.AttachCallProviderOwned(c.Request.Context(), session.ID, userID, liveavatar.ProviderName, providerSession.ProviderSessionID)
		if attachErr != nil || !attached {
			h.cleanupUnattachedProviderCall(c.Request.Context(), session.ID, userID, providerSession.ProviderSessionID)
			refundVideo()
			RespondError(c, http.StatusConflict, "Live video call was superseded")
			return
		}
		if err := h.billing.CaptureOwned(c.Request.Context(), userID, session.ID); err != nil {
			h.cleanupUnattachedProviderCall(c.Request.Context(), session.ID, userID, providerSession.ProviderSessionID)
			refundVideo()
			RespondError(c, http.StatusServiceUnavailable, "Video billing is temporarily unavailable")
			return
		}
		videoReserved = false
		session.LiveVideoURL = providerSession.LiveKitURL
		session.LiveVideoToken = providerSession.ParticipantToken
		session.LiveVideoRoom = providerSession.RoomName
		session.LiveVideoTokenTTLSeconds = providerSession.TokenTTLSeconds
	}
	c.JSON(http.StatusCreated, gin.H{"session": session})
}

func (h *OmniChatVoiceHandler) endLocalCallBestEffort(ctx context.Context, callID uuid.UUID, userID int) {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
	defer cancel()
	if _, err := h.data.EndCallOwned(cleanupCtx, callID, userID); err != nil {
		zlog.Warn().Err(err).Str("call_id", callID.String()).Msg("failed to end local OmniChat call during cleanup")
	}
}

func (h *OmniChatVoiceHandler) cleanupUnattachedProviderCall(ctx context.Context, callID uuid.UUID, userID int, providerSessionID string) {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
	defer cancel()
	if h.liveVideo != nil {
		if err := h.liveVideo.EndConversation(cleanupCtx, providerSessionID); err != nil {
			zlog.Warn().Err(err).Str("call_id", callID.String()).Msg("failed to end unattached live avatar provider session")
		}
	}
	if _, err := h.data.EndCallOwned(cleanupCtx, callID, userID); err != nil {
		zlog.Warn().Err(err).Str("call_id", callID.String()).Msg("failed to end superseded local OmniChat call")
	}
}

func (h *OmniChatVoiceHandler) EndCall(c *gin.Context) {
	id, ok := parseUUIDParam(c, "call_id")
	if !ok {
		return
	}
	userID := c.GetInt("user_id")
	provider, providerSessionID, active, err := h.data.GetActiveCallProviderOwned(c.Request.Context(), id, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to end call")
		return
	}
	if !active {
		RespondError(c, http.StatusNotFound, "Active call not found")
		return
	}
	ended, err := h.data.EndCallOwned(c.Request.Context(), id, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to end call")
		return
	}
	if !ended {
		RespondError(c, http.StatusNotFound, "Active call not found")
		return
	}
	h.endProviderSessionBestEffort(c.Request.Context(), id, userID, provider, providerSessionID)
	c.Status(http.StatusNoContent)
}

// RefreshCallToken keeps long-running LiveKit calls alive without restarting
// the RunPod avatar worker. The active provider row is checked first so a
// token cannot be minted for an ended or superseded call.
func (h *OmniChatVoiceHandler) RefreshCallToken(c *gin.Context) {
	id, ok := parseUUIDParam(c, "call_id")
	if !ok {
		return
	}
	provider, providerSessionID, active, err := h.data.GetActiveCallProviderOwned(c.Request.Context(), id, c.GetInt("user_id"))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to refresh call")
		return
	}
	if !active || provider != liveavatar.ProviderName || providerSessionID == "" {
		RespondError(c, http.StatusNotFound, "Active video call not found")
		return
	}
	refresher, ok := h.liveVideo.(liveVideoTokenRefresher)
	if !ok {
		RespondError(c, http.StatusServiceUnavailable, "Live video token refresh is unavailable")
		return
	}
	token, err := refresher.RefreshToken(c.Request.Context(), id, c.GetInt("user_id"))
	if err != nil || strings.TrimSpace(token) == "" {
		RespondError(c, http.StatusServiceUnavailable, "Live video token refresh is unavailable")
		return
	}
	c.JSON(http.StatusOK, gin.H{"live_video_token": token})
}

func (h *OmniChatVoiceHandler) endProviderSessionBestEffort(ctx context.Context, callID uuid.UUID, userID int, provider, providerSessionID string) {
	if provider != liveavatar.ProviderName || providerSessionID == "" || h.liveVideo == nil {
		return
	}
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
	defer cancel()
	if err := h.liveVideo.EndConversation(cleanupCtx, providerSessionID); err != nil {
		zlog.Warn().Err(err).Str("call_id", callID.String()).Msg("failed to end live avatar provider session; retention will retry")
		return
	}
	if err := h.data.ClearCallProviderSessionOwned(cleanupCtx, callID, userID, providerSessionID); err != nil {
		zlog.Warn().Err(err).Str("call_id", callID.String()).Msg("failed to record live avatar provider cleanup")
	}
}

func (h *OmniChatVoiceHandler) RecordCallTurn(c *gin.Context) {
	id, ok := parseUUIDParam(c, "call_id")
	if !ok {
		return
	}
	updated, err := h.data.IncrementCallTurnOwned(c.Request.Context(), id, c.GetInt("user_id"))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update call")
		return
	}
	if !updated {
		RespondError(c, http.StatusNotFound, "Active call not found")
		return
	}
	c.Status(http.StatusNoContent)
}

// omniChatCallTranscriber turns a recording from a call into words.
type omniChatCallTranscriber interface {
	Configured() bool
	Transcribe(ctx context.Context, recording []byte) (string, error)
}

// SetCallTranscription gives the handler the server-side ear.
//
// Without it the transcribe route reports that it is unconfigured, which is a
// far better answer than the browser's own recognition gave: that held the
// microphone and never replied at all.
func (h *OmniChatVoiceHandler) SetCallTranscription(transcription omniChatCallTranscriber) *OmniChatVoiceHandler {
	if h != nil {
		h.transcription = transcription
	}
	return h
}

// maxCallUploadBytes bounds one upload before any of it is read into memory.
// Two minutes of browser-recorded opus is well under a megabyte; this leaves
// room for a wasteful codec without leaving room for an attack.
const maxCallUploadBytes = 25 << 20

// TranscribeCallTurn turns one recorded utterance into text.
//
// The browser records; the server listens. SpeechRecognition in the browser was
// tried first and cannot be relied on -- Chromium browsers other than Chrome
// hold the microphone and never answer, and Safari needs macOS Dictation
// switched on -- so a call depended on a setting nobody should have to find.
// MediaRecorder needs only the microphone permission the browser already asks
// for when the call starts.
func (h *OmniChatVoiceHandler) TranscribeCallTurn(c *gin.Context) {
	callID, ok := parseUUIDParam(c, "call_id")
	if !ok {
		return
	}
	if h.transcription == nil || !h.transcription.Configured() {
		RespondError(c, http.StatusServiceUnavailable, "Voice transcription is not configured")
		return
	}
	// The call has to belong to this user, and be live. Otherwise the route is
	// an open transcription service attached to somebody's session.
	// GetActiveCallProviderOwned answers "is this call live and this user's"
	// without writing anything. IncrementCallTurnOwned would answer it too and
	// would count a turn per recording, including the ones that turn out to be
	// silence.
	_, _, active, err := h.data.GetActiveCallProviderOwned(c.Request.Context(), callID, c.GetInt("user_id"))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check the call")
		return
	}
	if !active {
		RespondError(c, http.StatusNotFound, "Active call not found")
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxCallUploadBytes)
	file, header, err := c.Request.FormFile("audio")
	if err != nil {
		RespondError(c, http.StatusBadRequest, "An audio recording is required")
		return
	}
	defer func() { _ = file.Close() }()
	if header.Size > maxCallUploadBytes {
		RespondError(c, http.StatusRequestEntityTooLarge, "The recording is too large")
		return
	}
	recording, err := io.ReadAll(io.LimitReader(file, maxCallUploadBytes))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "The recording could not be read")
		return
	}

	text, err := h.transcription.Transcribe(c.Request.Context(), recording)
	if errors.Is(err, services.ErrNoSpeechHeard) {
		// Not a failure. Somebody pressed the button and said nothing, or said
		// it too quietly, and the call should say so rather than report a
		// fault.
		c.JSON(http.StatusOK, gin.H{"text": ""})
		return
	}
	if err != nil {
		// One opaque message for every failure is what the media path already
		// learned not to do: a completely broken route and a transient provider
		// blip read identically, and whoever is debugging it is sent nowhere.
		// The reason never carries the provider's words, only which of ours it
		// was.
		zlog.Warn().Err(err).Str("call_id", callID.String()).Msg("omnichat: call transcription failed")
		reason, status := transcriptionFailureReason(err)
		RespondErrorCoded(c, status, reason, "The recording could not be transcribed")
		return
	}
	c.JSON(http.StatusOK, gin.H{"text": text})
}

// transcriptionFailureReason names which of our own failures happened.
//
// Three things go wrong here and they need three different answers: an upload
// that was never a recording is the caller's, a recording ffmpeg cannot read is
// the browser's, and everything else is ours or the provider's.
func transcriptionFailureReason(err error) (string, int) {
	switch {
	case errors.Is(err, services.ErrNotARecording):
		return "recording_invalid", http.StatusBadRequest
	case errors.Is(err, services.ErrRecordingUnreadable):
		return "recording_unreadable", http.StatusBadRequest
	case errors.Is(err, services.ErrTranscoderUnavailable):
		return "transcoder_unavailable", http.StatusServiceUnavailable
	default:
		return "transcription_failed", http.StatusBadGateway
	}
}
