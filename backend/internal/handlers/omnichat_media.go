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
)

type OmniChatGenerationCreator interface {
	CreateGeneration(ctx context.Context, ownerUserID int, request models.OmniChatGenerationRequest) (*models.OmniChatGenerationJob, error)
}

type OmniChatMediaStore interface {
	GetGenerationJobOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (*models.OmniChatGenerationJob, error)
	ListGenerationJobsOwned(ctx context.Context, ownerUserID, limit int) ([]*models.OmniChatGenerationJob, error)
	CancelGenerationJobOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (bool, error)
	ListMediaAssetsOwned(ctx context.Context, ownerUserID int, kind *models.OmniChatMediaKind, before *models.OmniChatMediaCursor, limit int) ([]*models.OmniChatMediaAsset, error)
	GetMediaAssetOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (*models.OmniChatMediaAsset, error)
	SetConversationSceneOwned(ctx context.Context, conversationID, ownerUserID int, scene models.OmniChatSceneState) (bool, error)
	GetConversationSceneOwned(ctx context.Context, conversationID, ownerUserID int) (*models.OmniChatSceneState, error)
}

type OmniChatMediaHandler struct {
	creator OmniChatGenerationCreator
	store   OmniChatMediaStore
	storage services.StorageService
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
	return &OmniChatMediaHandler{creator: creator, store: store, storage: storage}
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
	if h.creator == nil {
		RespondError(c, http.StatusServiceUnavailable, "Media generation is not configured")
		return
	}
	job, err := h.creator.CreateGeneration(c.Request.Context(), userID, request)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrOmniChatGenerationResourceNotFound):
			RespondError(c, http.StatusNotFound, "Generation resource not found")
		case errors.Is(err, services.ErrOmniChatGenerationUnavailable):
			RespondError(c, http.StatusServiceUnavailable, "Media generation is temporarily unavailable")
		default:
			RespondError(c, http.StatusInternalServerError, "Failed to create generation")
		}
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"job": job})
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
	cancelled, err := h.store.CancelGenerationJobOwned(c.Request.Context(), jobID, c.GetInt("user_id"))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to cancel generation")
		return
	}
	if !cancelled {
		RespondError(c, http.StatusConflict, "Generation can no longer be cancelled")
		return
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
	defer reader.Close()
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
