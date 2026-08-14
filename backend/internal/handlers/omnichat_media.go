package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	zlog "github.com/rs/zerolog/log"
)

type OmniChatGenerationCreator interface {
	CreateGeneration(ctx context.Context, ownerUserID int, request models.OmniChatGenerationRequest) (*models.OmniChatGenerationJob, error)
}

type OmniChatMediaCommandCreator interface {
	CreateConversationMediaCommand(ctx context.Context, ownerUserID, conversationID int, request models.OmniChatMediaCommandRequest) (*models.OmniChatGenerationJob, *models.BotMessage, error)
}

type OmniChatMediaStore interface {
	GetGenerationJobOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (*models.OmniChatGenerationJob, error)
	ListGenerationJobsOwned(ctx context.Context, ownerUserID, limit int) ([]*models.OmniChatGenerationJob, error)
	CancelGenerationJobOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (bool, error)
	ListMediaAssetsOwned(ctx context.Context, ownerUserID int, kind *models.OmniChatMediaKind, before *models.OmniChatMediaCursor, limit int) ([]*models.OmniChatMediaAsset, error)
	GetMediaAssetOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (*models.OmniChatMediaAsset, error)
	DeleteMediaAssetOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (bool, error)
	SetConversationSceneOwned(ctx context.Context, conversationID, ownerUserID int, scene models.OmniChatSceneState) (bool, error)
	GetConversationSceneOwned(ctx context.Context, conversationID, ownerUserID int) (*models.OmniChatSceneState, error)
}

type OmniChatMediaHandler struct {
	creator        OmniChatGenerationCreator
	commandCreator OmniChatMediaCommandCreator
	store          OmniChatMediaStore
	storage        services.StorageService
	idempotency    OmniChatRequestIdempotencyStore
	billing        interface {
		RefundOwned(context.Context, int, uuid.UUID) error
	}
}

func (h *OmniChatMediaHandler) SetRequestIdempotency(store OmniChatRequestIdempotencyStore) *OmniChatMediaHandler {
	h.idempotency = store
	return h
}

func (h *OmniChatMediaHandler) SetBilling(billing interface {
	RefundOwned(context.Context, int, uuid.UUID) error
}) *OmniChatMediaHandler {
	h.billing = billing
	return h
}

func omniChatMediaResponseMetadata(fileType string) (extension string, maxBytes int64, ok bool) {
	switch fileType {
	case "image/png":
		return "png", 25 << 20, true
	case "image/jpeg":
		return "jpg", 25 << 20, true
	case "image/webp":
		return "webp", 25 << 20, true
	case "video/mp4":
		return "mp4", 200 << 20, true
	default:
		return "", 0, false
	}
}

func NewOmniChatMediaHandler(creator OmniChatGenerationCreator, store OmniChatMediaStore, storage services.StorageService) *OmniChatMediaHandler {
	commandCreator, _ := creator.(OmniChatMediaCommandCreator)
	return &OmniChatMediaHandler{creator: creator, commandCreator: commandCreator, store: store, storage: storage}
}

func (h *OmniChatMediaHandler) CreateGeneration(c *gin.Context) {
	userID := c.GetInt("user_id")
	if userID <= 0 {
		RespondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	var request models.OmniChatGenerationRequest
	if err := decodeStrictJSON(c, &request); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid generation request")
		return
	}
	if _, err := services.NormalizeOmniChatGenerationRequest(request); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}
	claim, ok := h.claimMediaGenerationRequest(c, userID, request)
	if !ok {
		return
	}
	if claim.Replay {
		c.JSON(http.StatusOK, gin.H{"job": json.RawMessage(claim.Response)})
		return
	}
	completed := false
	defer func() {
		if !completed {
			h.failMediaGenerationRequest(userID, request.RequestID)
		}
	}()
	request.BillingOperationID = services.DeriveOmniChatRequestBillingOperationID(userID, "media_generation", request.RequestID)
	if h.creator == nil {
		RespondErrorCoded(c, http.StatusServiceUnavailable, "generation_not_configured", "Media generation is not configured")
		return
	}
	job, err := h.creator.CreateGeneration(c.Request.Context(), userID, request)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrOmniChatGenerationResourceNotFound):
			RespondError(c, http.StatusNotFound, "Generation resource not found")
		case errors.Is(err, services.ErrOmniChatGenerationUnavailable):
			RespondErrorCoded(c, http.StatusServiceUnavailable, "generation_unavailable", "Media generation is temporarily unavailable")
		case errors.Is(err, services.ErrOmniChatPaidFeatureRequired):
			RespondError(c, http.StatusPaymentRequired, "Media generation requires OmniCredits")
		case errors.Is(err, services.ErrOmniChatGenerationSafetyRejected):
			RespondErrorCoded(c, http.StatusUnprocessableEntity, "safety_rejected", "This request cannot be generated")
		default:
			RespondError(c, http.StatusInternalServerError, "Failed to create generation")
		}
		return
	}
	completed = true
	c.JSON(http.StatusAccepted, gin.H{"job": job})
}

type omniChatMediaCommandPayload struct {
	RequestID       uuid.UUID                `json:"request_id"`
	Kind            models.OmniChatMediaKind `json:"kind"`
	Prompt          string                   `json:"prompt"`
	AspectRatio     string                   `json:"aspect_ratio,omitempty"`
	DurationSeconds int                      `json:"duration_seconds,omitempty"`
}

// CreateConversationMediaCommand persists a direct /photo or /video command,
// then queues media without asking the chat model to answer the command.
func (h *OmniChatMediaHandler) CreateConversationMediaCommand(c *gin.Context) {
	userID := c.GetInt("user_id")
	if userID <= 0 {
		RespondError(c, http.StatusUnauthorized, "Authentication required")
		return
	}
	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil || conversationID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}
	var payload omniChatMediaCommandPayload
	if err := decodeStrictJSON(c, &payload); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid media command")
		return
	}
	if payload.RequestID == uuid.Nil {
		RespondError(c, http.StatusBadRequest, "A valid request_id is required")
		return
	}
	if payload.Kind != models.OmniChatMediaKindImage && payload.Kind != models.OmniChatMediaKindVideo {
		RespondError(c, http.StatusBadRequest, "kind must be image or video")
		return
	}
	claimPayload := struct {
		Kind            models.OmniChatMediaKind `json:"kind"`
		Prompt          string                   `json:"prompt"`
		AspectRatio     string                   `json:"aspect_ratio,omitempty"`
		DurationSeconds int                      `json:"duration_seconds,omitempty"`
	}{payload.Kind, strings.TrimSpace(payload.Prompt), strings.TrimSpace(payload.AspectRatio), payload.DurationSeconds}
	encodedPayload, err := json.Marshal(claimPayload)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to prepare media command")
		return
	}
	if h.idempotency == nil {
		RespondErrorCoded(c, http.StatusServiceUnavailable, "replay_protection_unavailable", "Request replay protection is temporarily unavailable")
		return
	}
	claim, err := h.idempotency.Begin(
		c.Request.Context(), userID, payload.RequestID, "media_command",
		fmt.Sprintf("conversation:%d", conversationID), models.OmniChatRequestPayloadHash(encodedPayload),
	)
	if err != nil {
		switch {
		case errors.Is(err, models.ErrOmniChatRequestConflict):
			RespondError(c, http.StatusConflict, "request_id was already used for a different request")
		case errors.Is(err, models.ErrOmniChatRequestInProgress):
			RespondError(c, http.StatusConflict, "This media command is already in progress")
		default:
			// The browser only ever sees a generic 503, so an unexpected
			// failure here is otherwise invisible. A missing scope in the
			// idempotency CHECK constraint hid a completely broken /photo
			// command behind "temporarily unavailable" with nothing logged.
			zlog.Error().Err(err).Int("user_id", userID).Int("conversation_id", conversationID).
				Msg("omnichat media command: idempotency claim failed")
			RespondErrorCoded(c, http.StatusServiceUnavailable, "replay_protection_unavailable", "Request replay protection is temporarily unavailable")
		}
		return
	}
	if claim.Replay {
		c.Data(http.StatusOK, "application/json", claim.Response)
		return
	}
	completed := false
	defer func() {
		if !completed {
			h.failMediaGenerationRequest(userID, payload.RequestID)
		}
	}()
	if h.commandCreator == nil {
		RespondErrorCoded(c, http.StatusServiceUnavailable, "generation_not_configured", "Media generation is not configured")
		return
	}
	job, message, err := h.commandCreator.CreateConversationMediaCommand(c.Request.Context(), userID, conversationID, models.OmniChatMediaCommandRequest{
		RequestID: payload.RequestID, Kind: payload.Kind, Prompt: payload.Prompt,
		AspectRatio: payload.AspectRatio, DurationSeconds: payload.DurationSeconds,
	})
	if err != nil {
		switch {
		case errors.Is(err, services.ErrOmniChatGenerationResourceNotFound):
			RespondError(c, http.StatusNotFound, "Conversation not found")
		case errors.Is(err, services.ErrOmniChatGenerationUnavailable):
			RespondErrorCoded(c, http.StatusServiceUnavailable, "generation_unavailable", "Media generation is temporarily unavailable")
		case errors.Is(err, services.ErrOmniChatPaidFeatureRequired):
			RespondError(c, http.StatusPaymentRequired, "Media generation requires OmniCredits")
		case errors.Is(err, services.ErrOmniChatGenerationSafetyRejected):
			RespondErrorCoded(c, http.StatusUnprocessableEntity, "safety_rejected", "This request cannot be generated")
		default:
			RespondError(c, http.StatusBadRequest, err.Error())
		}
		return
	}
	response := gin.H{"job": job, "message": message}
	encodedResponse, err := json.Marshal(response)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to prepare media command response")
		return
	}
	if err := h.idempotency.Complete(c.Request.Context(), userID, payload.RequestID, encodedResponse); err != nil {
		RespondErrorCoded(c, http.StatusServiceUnavailable, "replay_completion_failed", "Media command replay protection is temporarily unavailable")
		return
	}
	completed = true
	c.JSON(http.StatusAccepted, response)
}

func (h *OmniChatMediaHandler) claimMediaGenerationRequest(c *gin.Context, userID int, request models.OmniChatGenerationRequest) (*models.OmniChatRequestClaim, bool) {
	if request.RequestID == uuid.Nil {
		RespondError(c, http.StatusBadRequest, "A valid request_id is required")
		return nil, false
	}
	if h.idempotency == nil {
		RespondErrorCoded(c, http.StatusServiceUnavailable, "replay_protection_unavailable", "Request replay protection is temporarily unavailable")
		return nil, false
	}
	payload := struct {
		Kind            models.OmniChatMediaKind      `json:"kind"`
		Mode            models.OmniChatGenerationMode `json:"mode"`
		PersonaID       int                           `json:"persona_id"`
		ConversationID  *int                          `json:"conversation_id,omitempty"`
		SourceMessageID *int                          `json:"source_message_id,omitempty"`
		SourceAssetID   *uuid.UUID                    `json:"source_asset_id,omitempty"`
		Prompt          string                        `json:"prompt"`
		NegativePrompt  string                        `json:"negative_prompt,omitempty"`
		AspectRatio     string                        `json:"aspect_ratio,omitempty"`
		DurationSeconds int                           `json:"duration_seconds,omitempty"`
		Scene           models.OmniChatSceneState     `json:"scene,omitempty"`
	}{
		Kind: request.Kind, Mode: request.Mode, PersonaID: request.PersonaID,
		ConversationID: request.ConversationID, SourceMessageID: request.SourceMessageID,
		SourceAssetID: request.SourceAssetID, Prompt: request.Prompt, NegativePrompt: request.NegativePrompt,
		AspectRatio: request.AspectRatio, DurationSeconds: request.DurationSeconds, Scene: request.Scene,
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to prepare generation request")
		return nil, false
	}
	resource := fmt.Sprintf("persona:%d", request.PersonaID)
	if request.ConversationID != nil {
		resource = fmt.Sprintf("conversation:%d:persona:%d", *request.ConversationID, request.PersonaID)
	}
	claim, err := h.idempotency.Begin(c.Request.Context(), userID, request.RequestID, "media_generation", resource, models.OmniChatRequestPayloadHash(encoded))
	if err == nil {
		return claim, true
	}
	switch {
	case errors.Is(err, models.ErrOmniChatRequestConflict):
		RespondError(c, http.StatusConflict, "request_id was already used for a different request")
	case errors.Is(err, models.ErrOmniChatRequestInProgress):
		RespondError(c, http.StatusConflict, "This generation request is already in progress")
	default:
		RespondErrorCoded(c, http.StatusServiceUnavailable, "replay_protection_unavailable", "Request replay protection is temporarily unavailable")
	}
	return nil, false
}

func (h *OmniChatMediaHandler) failMediaGenerationRequest(userID int, requestID uuid.UUID) {
	if h.idempotency == nil || requestID == uuid.Nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = h.idempotency.Fail(ctx, userID, requestID)
}

func (h *OmniChatMediaHandler) GetGeneration(c *gin.Context) {
	jobID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	job, err := h.store.GetGenerationJobOwned(c.Request.Context(), jobID, c.GetInt("user_id"))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch generation")
		return
	}
	if job == nil {
		RespondError(c, http.StatusNotFound, "Generation not found")
		return
	}
	c.JSON(http.StatusOK, gin.H{"job": job})
}

func (h *OmniChatMediaHandler) ListGenerations(c *gin.Context) {
	limit := parseBoundedLimit(c, 50, 100)
	jobs, err := h.store.ListGenerationJobsOwned(c.Request.Context(), c.GetInt("user_id"), limit)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch generations")
		return
	}
	c.JSON(http.StatusOK, gin.H{"jobs": jobs})
}

func (h *OmniChatMediaHandler) CancelGeneration(c *gin.Context) {
	jobID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	userID := c.GetInt("user_id")
	job, err := h.store.GetGenerationJobOwned(c.Request.Context(), jobID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to cancel generation")
		return
	}
	if job == nil {
		RespondError(c, http.StatusNotFound, "Generation not found")
		return
	}
	cancelled := job.Status == models.OmniChatGenerationStatusCancelled
	if !cancelled {
		cancelled, err = h.store.CancelGenerationJobOwned(c.Request.Context(), jobID, userID)
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to cancel generation")
		return
	}
	if !cancelled {
		RespondError(c, http.StatusConflict, "Generation can no longer be cancelled")
		return
	}
	if job.BillingOperationID != nil {
		if h.billing == nil {
			RespondError(c, http.StatusServiceUnavailable, "Generation billing is temporarily unavailable")
			return
		}
		refundCtx, cancel := context.WithTimeout(context.WithoutCancel(c.Request.Context()), 15*time.Second)
		err = h.billing.RefundOwned(refundCtx, userID, *job.BillingOperationID)
		cancel()
		if err != nil {
			RespondError(c, http.StatusServiceUnavailable, "Generation billing is temporarily unavailable")
			return
		}
	}
	c.Status(http.StatusNoContent)
}

func (h *OmniChatMediaHandler) ListGallery(c *gin.Context) {
	var kind *models.OmniChatMediaKind
	if rawKind := strings.TrimSpace(c.Query("kind")); rawKind != "" {
		parsed := models.OmniChatMediaKind(rawKind)
		if parsed != models.OmniChatMediaKindImage && parsed != models.OmniChatMediaKindVideo {
			RespondError(c, http.StatusBadRequest, "kind must be image or video")
			return
		}
		kind = &parsed
	}
	var before *models.OmniChatMediaCursor
	if raw := strings.TrimSpace(c.Query("before")); raw != "" {
		parsed, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid pagination cursor")
			return
		}
		beforeID, err := uuid.Parse(strings.TrimSpace(c.Query("before_id")))
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid pagination cursor")
			return
		}
		before = &models.OmniChatMediaCursor{CreatedAt: parsed, ID: beforeID}
	} else if strings.TrimSpace(c.Query("before_id")) != "" {
		RespondError(c, http.StatusBadRequest, "Invalid pagination cursor")
		return
	}
	assets, err := h.store.ListMediaAssetsOwned(c.Request.Context(), c.GetInt("user_id"), kind, before, parseBoundedLimit(c, 50, 100))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch gallery")
		return
	}
	for _, asset := range assets {
		decorateOmniChatAsset(asset)
	}
	c.JSON(http.StatusOK, gin.H{"assets": assets})
}

func (h *OmniChatMediaHandler) GetAsset(c *gin.Context) {
	asset, ok := h.getOwnedAsset(c)
	if !ok {
		return
	}
	decorateOmniChatAsset(asset)
	c.JSON(http.StatusOK, gin.H{"asset": asset})
}

func (h *OmniChatMediaHandler) DeleteAsset(c *gin.Context) {
	assetID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	deleted, err := h.store.DeleteMediaAssetOwned(c.Request.Context(), assetID, c.GetInt("user_id"))
	if err != nil {
		if errors.Is(err, models.ErrOmniChatMediaInUse) {
			RespondError(c, http.StatusConflict, "Unpublish this media before deleting it")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to delete media")
		return
	}
	if !deleted {
		RespondError(c, http.StatusNotFound, "Media not found")
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *OmniChatMediaHandler) GetAssetContent(c *gin.Context) {
	asset, ok := h.getOwnedAsset(c)
	if !ok {
		return
	}
	if asset.ScanStatus != models.MediaScanStatusClean {
		RespondError(c, http.StatusConflict, "Media is still being verified")
		return
	}
	if h.storage == nil {
		RespondError(c, http.StatusServiceUnavailable, "Media storage is unavailable")
		return
	}
	contentType := asset.FileType
	extension, maxBytes, validType := omniChatMediaResponseMetadata(contentType)
	if !validType || (asset.Kind == models.OmniChatMediaKindImage) != strings.HasPrefix(contentType, "image/") {
		RespondError(c, http.StatusConflict, "Media type is invalid")
		return
	}
	objectSize, err := h.storage.GetObjectSize(c.Request.Context(), asset.StoragePath)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Media not found")
		return
	}
	if objectSize <= 0 || objectSize > maxBytes {
		RespondError(c, http.StatusConflict, "Media size is invalid")
		return
	}
	reader, err := h.storage.Download(c.Request.Context(), asset.StoragePath)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Media not found")
		return
	}
	defer func() { _ = reader.Close() }()
	c.Header("Content-Type", contentType)
	c.Header("Content-Disposition", fmt.Sprintf(`inline; filename="%s.%s"`, asset.ID.String(), extension))
	c.Header("Content-Length", strconv.FormatInt(objectSize, 10))
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	limited := &io.LimitedReader{R: reader, N: objectSize}
	if _, err := io.Copy(c.Writer, limited); err != nil {
		return
	}
}

func (h *OmniChatMediaHandler) UpdateConversationScene(c *gin.Context) {
	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil || conversationID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}
	var scene models.OmniChatSceneState
	if err := decodeStrictJSON(c, &scene); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid scene")
		return
	}
	scene, err = services.NormalizeOmniChatSceneState(scene)
	if err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}
	updated, err := h.store.SetConversationSceneOwned(c.Request.Context(), conversationID, c.GetInt("user_id"), scene)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update scene")
		return
	}
	if !updated {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	}
	c.JSON(http.StatusOK, gin.H{"scene": scene})
}

func (h *OmniChatMediaHandler) GetConversationScene(c *gin.Context) {
	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil || conversationID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}
	scene, err := h.store.GetConversationSceneOwned(c.Request.Context(), conversationID, c.GetInt("user_id"))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch scene")
		return
	}
	if scene == nil {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return
	}
	c.JSON(http.StatusOK, gin.H{"scene": scene})
}

func (h *OmniChatMediaHandler) getOwnedAsset(c *gin.Context) (*models.OmniChatMediaAsset, bool) {
	assetID, ok := parseUUIDParam(c, "id")
	if !ok {
		return nil, false
	}
	asset, err := h.store.GetMediaAssetOwned(c.Request.Context(), assetID, c.GetInt("user_id"))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch media")
		return nil, false
	}
	if asset == nil {
		RespondError(c, http.StatusNotFound, "Media not found")
		return nil, false
	}
	return asset, true
}

func decorateOmniChatAsset(asset *models.OmniChatMediaAsset) {
	asset.ContentURL = "/api/v1/omnichat/media/" + asset.ID.String() + "/content"
	// Never expose an underlying storage/CDN thumbnail URL for a private asset.
	asset.ThumbnailURL = nil
}

func parseUUIDParam(c *gin.Context, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param(name))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid ID")
		return uuid.Nil, false
	}
	return id, true
}

func parseBoundedLimit(c *gin.Context, fallback, maximum int) int {
	limit, err := strconv.Atoi(c.DefaultQuery("limit", strconv.Itoa(fallback)))
	if err != nil || limit < 1 || limit > maximum {
		return fallback
	}
	return limit
}

func decodeStrictJSON(c *gin.Context, target any) error {
	const maximumRequestBodyBytes = 1 << 20
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, maximumRequestBodyBytes+1))
	if err != nil {
		return err
	}
	if len(body) > maximumRequestBodyBytes {
		return errors.New("request body exceeds 1 MiB limit")
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return errors.New("request body must contain one JSON object")
	}
	return nil
}
