package handlers

import (
	"context"
	"errors"
	"fmt"
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
	"github.com/omninudge/backend/internal/services/tavus"
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
	for _, value := range []*string{voice.LiveVideoReplicaID, voice.LiveVideoPersonaID} {
		if value != nil {
			trimmed := strings.TrimSpace(*value)
			*value = trimmed
		}
	}
	if voice.LiveVideoReplicaID != nil && *voice.LiveVideoReplicaID == "" {
		voice.LiveVideoReplicaID = nil
	}
	if voice.LiveVideoPersonaID != nil && *voice.LiveVideoPersonaID == "" {
		voice.LiveVideoPersonaID = nil
	}
	if (voice.Provider != "browser" && voice.Provider != "elevenlabs") ||
		!omniChatVoiceIDPattern.MatchString(voice.VoiceID) || voice.VoiceName == "" ||
		len([]rune(voice.VoiceName)) > 100 || (voice.ModelID != "" && !omniChatVoiceModelPattern.MatchString(voice.ModelID)) ||
		(voice.LanguageCode != nil && !omniChatVoiceLanguagePattern.MatchString(*voice.LanguageCode)) ||
		voice.Stability < 0 || voice.Stability > 1 || voice.SimilarityBoost < 0 || voice.SimilarityBoost > 1 ||
		voice.Style < 0 || voice.Style > 1 || voice.Speed < 0.7 || voice.Speed > 1.2 ||
		voice.Pitch < 0.5 || voice.Pitch > 2 ||
		((voice.LiveVideoReplicaID == nil) != (voice.LiveVideoPersonaID == nil)) ||
		(voice.LiveVideoReplicaID != nil && (!omniChatVoiceIDPattern.MatchString(*voice.LiveVideoReplicaID) || !omniChatVoiceIDPattern.MatchString(*voice.LiveVideoPersonaID))) {
		return errors.New("invalid voice profile")
	}
	if voice.ModelID == "" {
		if voice.Provider == "browser" {
			voice.ModelID = "browser-native"
		} else {
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
	public.LiveVideoReplicaID = nil
	public.LiveVideoPersonaID = nil
	return &public
}

type OmniChatVoiceData interface {
	GetPersonaVoice(ctx context.Context, personaID int) (*models.OmniChatPersonaVoice, error)
	GetPersonaVoiceAccessible(ctx context.Context, personaID, viewerUserID int) (*models.OmniChatPersonaVoice, error)
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
	GetOrCreateSpeech(ctx context.Context, userID, conversationID, messageID int) (*models.OmniChatSpeechAudio, error)
}

type OmniChatVoiceHandler struct {
	data          OmniChatVoiceData
	speech        OmniChatSpeechCreator
	storage       services.StorageService
	liveVideo     *tavus.Client
	liveReplicaID string
	livePersonaID string
}

func NewOmniChatVoiceHandler(data OmniChatVoiceData, speech OmniChatSpeechCreator, storage services.StorageService, liveVideo *tavus.Client, liveReplicaID, livePersonaID string) *OmniChatVoiceHandler {
	return &OmniChatVoiceHandler{data: data, speech: speech, storage: storage, liveVideo: liveVideo, liveReplicaID: strings.TrimSpace(liveReplicaID), livePersonaID: strings.TrimSpace(livePersonaID)}
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
	c.JSON(http.StatusOK, gin.H{"voice": saved})
}

func (h *OmniChatVoiceHandler) GetMessageSpeech(c *gin.Context) {
	conversationID, err1 := strconv.Atoi(c.Param("id"))
	messageID, err2 := strconv.Atoi(c.Param("message_id"))
	if err1 != nil || err2 != nil || conversationID <= 0 || messageID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid message")
		return
	}
	audio, err := h.speech.GetOrCreateSpeech(c.Request.Context(), c.GetInt("user_id"), conversationID, messageID)
	if errors.Is(err, services.ErrOmniChatBrowserVoice) {
		RespondError(c, http.StatusConflict, "This character uses on-device speech")
		return
	}
	if errors.Is(err, services.ErrNotFound) {
		RespondError(c, http.StatusNotFound, "Message not found")
		return
	}
	if err != nil {
		RespondError(c, http.StatusServiceUnavailable, "Character speech is temporarily unavailable")
		return
	}
	if h.storage == nil {
		RespondError(c, http.StatusServiceUnavailable, "Speech storage is unavailable")
		return
	}
	if audio.FileType != "audio/mpeg" {
		RespondError(c, http.StatusConflict, "Speech audio type is invalid")
		return
	}
	objectSize, err := h.storage.GetObjectSize(c.Request.Context(), audio.StoragePath)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Speech audio not found")
		return
	}
	if objectSize <= 0 || objectSize > 10<<20 {
		RespondError(c, http.StatusConflict, "Speech audio size is invalid")
		return
	}
	reader, err := h.storage.Download(c.Request.Context(), audio.StoragePath)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Speech audio not found")
		return
	}
	defer reader.Close()
	c.Header("Content-Type", audio.FileType)
	c.Header("Content-Length", strconv.FormatInt(objectSize, 10))
	c.Header("Cache-Control", "private, max-age=86400")
	c.Header("X-Content-Type-Options", "nosniff")
	_, _ = io.Copy(c.Writer, &io.LimitedReader{R: reader, N: objectSize})
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
	for _, active := range activeProviders {
		h.endProviderSessionBestEffort(c.Request.Context(), active.CallID, userID, active.Provider, active.SessionID)
	}
	if request.Mode == "video" && h.liveVideo != nil && h.liveVideo.Configured() {
		callContext, contextErr := h.data.GetLiveCallContextOwned(c.Request.Context(), userID, conversationID)
		if contextErr != nil || callContext == nil {
			h.endLocalCallBestEffort(c.Request.Context(), session.ID, userID)
			RespondError(c, http.StatusInternalServerError, "Failed to prepare live video call")
			return
		}
		replicaID, personaID := callContext.LiveVideoReplicaID, callContext.LiveVideoPersonaID
		if replicaID == "" || personaID == "" {
			replicaID, personaID = h.liveReplicaID, h.livePersonaID
		}
		if replicaID == "" || personaID == "" {
			h.endLocalCallBestEffort(c.Request.Context(), session.ID, userID)
			RespondError(c, http.StatusServiceUnavailable, "This character does not have a live avatar configured")
			return
		}
		providerSession, providerErr := h.liveVideo.CreateConversation(c.Request.Context(), tavus.CreateConversationRequest{
			ReplicaID: replicaID, PersonaID: personaID,
			ConversationName:      callContext.PersonaName + " on OmniChat",
			ConversationalContext: callContext.Context,
			MemoryStores:          []string{fmt.Sprintf("omnichat-user-%d-persona-%d", userID, session.PersonaID)},
		})
		if providerErr != nil {
			h.endLocalCallBestEffort(c.Request.Context(), session.ID, userID)
			RespondError(c, http.StatusServiceUnavailable, "Live avatar video is temporarily unavailable")
			return
		}
		attached, attachErr := h.data.AttachCallProviderOwned(c.Request.Context(), session.ID, userID, "tavus", providerSession.ConversationID)
		if attachErr != nil || !attached {
			h.cleanupUnattachedProviderCall(c.Request.Context(), session.ID, userID, providerSession.ConversationID)
			RespondError(c, http.StatusConflict, "Live video call was superseded")
			return
		}
		session.LiveVideoURL = providerSession.JoinURL
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

func (h *OmniChatVoiceHandler) endProviderSessionBestEffort(ctx context.Context, callID uuid.UUID, userID int, provider, providerSessionID string) {
	if provider != "tavus" || providerSessionID == "" || h.liveVideo == nil {
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
