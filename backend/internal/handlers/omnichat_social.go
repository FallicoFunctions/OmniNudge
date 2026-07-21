package handlers

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

type OmniChatSocialPublisher interface {
	PublishAsset(ctx context.Context, ownerUserID int, assetID uuid.UUID, caption string) (*models.OmniChatPublication, error)
	PublishChat(ctx context.Context, ownerUserID, conversationID int, messageIDs []int, title, caption string) (*models.OmniChatPublication, error)
	AddComment(ctx context.Context, publicationID uuid.UUID, authorUserID int, parentID *uuid.UUID, body string) (*models.OmniChatPublicationComment, error)
}

type OmniChatSocialStore interface {
	ListExplore(ctx context.Context, viewerUserID *int, kind string, before *models.OmniChatExploreCursor, limit int) ([]*models.OmniChatPublication, error)
	GetPublicationAccessible(ctx context.Context, id uuid.UUID, viewerUserID *int) (*models.OmniChatPublication, error)
	SetPublicationLiked(ctx context.Context, publicationID uuid.UUID, userID int, liked bool) error
	ListPublicationComments(ctx context.Context, publicationID uuid.UUID, viewerUserID *int, after *models.OmniChatCommentCursor, limit int) ([]*models.OmniChatPublicationComment, error)
	RecordPublicationShare(ctx context.Context, publicationID uuid.UUID, userID int) error
	SetPublicationBookmarked(ctx context.Context, publicationID uuid.UUID, userID int, bookmarked bool) error
	CanFollow(ctx context.Context, followerUserID, followedUserID int) (bool, error)
	SetFollowing(ctx context.Context, followerUserID, followedUserID int, following bool) error
	ContinueChatSnapshot(ctx context.Context, publicationID uuid.UUID, userID int) (*models.BotConversation, error)
	ReportPublication(ctx context.Context, publicationID uuid.UUID, reporterUserID int, reason, details string) error
	RemovePublicationOwned(ctx context.Context, publicationID uuid.UUID, ownerUserID int) (bool, error)
	PublicAssetStoragePath(ctx context.Context, assetID uuid.UUID, viewerUserID *int) (string, string, error)
	DeleteCommentOwned(ctx context.Context, id uuid.UUID, userID int, moderator bool) (bool, error)
}

type OmniChatSocialHandler struct {
	publisher OmniChatSocialPublisher
	store     OmniChatSocialStore
	storage   services.StorageService
}

func NewOmniChatSocialHandler(publisher OmniChatSocialPublisher, store OmniChatSocialStore, storage services.StorageService) *OmniChatSocialHandler {
	return &OmniChatSocialHandler{publisher: publisher, store: store, storage: storage}
}

func (h *OmniChatSocialHandler) ListExplore(c *gin.Context) {
	kind := strings.TrimSpace(c.Query("kind"))
	if kind != "" && kind != string(models.OmniChatPublicationKindImage) && kind != string(models.OmniChatPublicationKindVideo) && kind != string(models.OmniChatPublicationKindChat) {
		RespondError(c, http.StatusBadRequest, "kind must be image, video, or chat")
		return
	}
	var before *models.OmniChatExploreCursor
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
		before = &models.OmniChatExploreCursor{PublishedAt: parsed, ID: beforeID}
	} else if strings.TrimSpace(c.Query("before_id")) != "" {
		RespondError(c, http.StatusBadRequest, "Invalid pagination cursor")
		return
	}
	var viewer *int
	if id, ok := middleware.GetOptionalUserID(c); ok {
		viewer = &id
	}
	publications, err := h.store.ListExplore(c.Request.Context(), viewer, kind, before, parseBoundedLimit(c, 20, 50))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load Explore")
		return
	}
	for _, publication := range publications {
		decoratePublicPublication(publication)
	}
	c.JSON(http.StatusOK, gin.H{"publications": publications})
}

func (h *OmniChatSocialHandler) GetPublication(c *gin.Context) {
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	var viewer *int
	if userID, exists := middleware.GetOptionalUserID(c); exists {
		viewer = &userID
	}
	publication, err := h.store.GetPublicationAccessible(c.Request.Context(), id, viewer)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load publication")
		return
	}
	if publication == nil {
		RespondError(c, http.StatusNotFound, "Publication not found")
		return
	}
	decoratePublicPublication(publication)
	c.JSON(http.StatusOK, gin.H{"publication": publication})
}

func (h *OmniChatSocialHandler) PublishAsset(c *gin.Context) {
	var request struct {
		AssetID uuid.UUID `json:"asset_id"`
		Caption string    `json:"caption"`
	}
	if err := decodeStrictJSON(c, &request); err != nil || request.AssetID == uuid.Nil {
		RespondError(c, http.StatusBadRequest, "Invalid publish request")
		return
	}
	publication, err := h.publisher.PublishAsset(c.Request.Context(), c.GetInt("user_id"), request.AssetID, request.Caption)
	h.respondPublished(c, publication, err)
}

func (h *OmniChatSocialHandler) PublishChat(c *gin.Context) {
	var request struct {
		ConversationID int    `json:"conversation_id"`
		MessageIDs     []int  `json:"message_ids"`
		Title          string `json:"title"`
		Caption        string `json:"caption"`
	}
	if err := decodeStrictJSON(c, &request); err != nil || request.ConversationID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid chat publish request")
		return
	}
	publication, err := h.publisher.PublishChat(c.Request.Context(), c.GetInt("user_id"), request.ConversationID, request.MessageIDs, request.Title, request.Caption)
	h.respondPublished(c, publication, err)
}

func (h *OmniChatSocialHandler) respondPublished(c *gin.Context, publication *models.OmniChatPublication, err error) {
	if err != nil {
		if errors.Is(err, services.ErrOmniChatPublicContentRejected) {
			RespondError(c, http.StatusUnprocessableEntity, "Content could not be published under the community safety policy")
			return
		}
		if errors.Is(err, services.ErrOmniChatSocialInvalidInput) {
			RespondError(c, http.StatusBadRequest, "Invalid publication content")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to publish")
		return
	}
	if publication == nil {
		RespondError(c, http.StatusNotFound, "Publishable content not found")
		return
	}
	decoratePublicPublication(publication)
	c.JSON(http.StatusCreated, gin.H{"publication": publication})
}

func (h *OmniChatSocialHandler) SetLike(c *gin.Context) {
	h.setBooleanEngagement(c, "liked", func(id uuid.UUID, userID int, value bool) error {
		return h.store.SetPublicationLiked(c.Request.Context(), id, userID, value)
	})
}

func (h *OmniChatSocialHandler) SetBookmark(c *gin.Context) {
	h.setBooleanEngagement(c, "bookmarked", func(id uuid.UUID, userID int, value bool) error {
		return h.store.SetPublicationBookmarked(c.Request.Context(), id, userID, value)
	})
}

func (h *OmniChatSocialHandler) setBooleanEngagement(c *gin.Context, field string, apply func(uuid.UUID, int, bool) error) {
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	var request map[string]bool
	if err := decodeStrictJSON(c, &request); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	value, exists := request[field]
	if !exists || len(request) != 1 {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}
	userID := c.GetInt("user_id")
	publication, err := h.store.GetPublicationAccessible(c.Request.Context(), id, &userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update publication")
		return
	}
	if publication == nil {
		RespondError(c, http.StatusNotFound, "Publication not found")
		return
	}
	if err := apply(id, userID, value); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update publication")
		return
	}
	c.JSON(http.StatusOK, gin.H{field: value})
}

func (h *OmniChatSocialHandler) AddComment(c *gin.Context) {
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	var request struct {
		ParentID *uuid.UUID `json:"parent_id"`
		Body     string     `json:"body"`
	}
	if err := decodeStrictJSON(c, &request); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid comment")
		return
	}
	comment, err := h.publisher.AddComment(c.Request.Context(), id, c.GetInt("user_id"), request.ParentID, request.Body)
	if errors.Is(err, services.ErrOmniChatPublicContentRejected) {
		RespondError(c, http.StatusUnprocessableEntity, "Comment could not be posted under the community safety policy")
		return
	}
	if errors.Is(err, services.ErrOmniChatSocialInvalidInput) {
		RespondError(c, http.StatusBadRequest, "Invalid comment")
		return
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to add comment")
		return
	}
	if comment == nil {
		RespondError(c, http.StatusNotFound, "Publication not found")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"comment": comment})
}

func (h *OmniChatSocialHandler) ListComments(c *gin.Context) {
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	var viewer *int
	if userID, exists := middleware.GetOptionalUserID(c); exists {
		viewer = &userID
	}
	publication, err := h.store.GetPublicationAccessible(c.Request.Context(), id, viewer)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load comments")
		return
	}
	if publication == nil {
		RespondError(c, http.StatusNotFound, "Publication not found")
		return
	}
	var after *models.OmniChatCommentCursor
	if raw := strings.TrimSpace(c.Query("after")); raw != "" {
		createdAt, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid pagination cursor")
			return
		}
		afterID, err := uuid.Parse(strings.TrimSpace(c.Query("after_id")))
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid pagination cursor")
			return
		}
		after = &models.OmniChatCommentCursor{CreatedAt: createdAt, ID: afterID}
	} else if strings.TrimSpace(c.Query("after_id")) != "" {
		RespondError(c, http.StatusBadRequest, "Invalid pagination cursor")
		return
	}
	comments, err := h.store.ListPublicationComments(c.Request.Context(), id, viewer, after, parseBoundedLimit(c, 50, 100))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load comments")
		return
	}
	c.JSON(http.StatusOK, gin.H{"comments": comments})
}

func (h *OmniChatSocialHandler) DeleteComment(c *gin.Context) {
	id, ok := parseUUIDParam(c, "comment_id")
	if !ok {
		return
	}
	role := c.GetString("role")
	deleted, err := h.store.DeleteCommentOwned(c.Request.Context(), id, c.GetInt("user_id"), role == "admin" || role == "moderator")
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete comment")
		return
	}
	if !deleted {
		RespondError(c, http.StatusNotFound, "Comment not found")
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *OmniChatSocialHandler) RecordShare(c *gin.Context) {
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	userID := c.GetInt("user_id")
	publication, err := h.store.GetPublicationAccessible(c.Request.Context(), id, &userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to share publication")
		return
	}
	if publication == nil {
		RespondError(c, http.StatusNotFound, "Publication not found")
		return
	}
	if err := h.store.RecordPublicationShare(c.Request.Context(), id, userID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to share publication")
		return
	}
	c.JSON(http.StatusOK, gin.H{"share_path": "/omnichat/explore/" + id.String()})
}

func (h *OmniChatSocialHandler) SetFollow(c *gin.Context) {
	target, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || target <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid user ID")
		return
	}
	var request struct {
		Following *bool `json:"following"`
	}
	if err := decodeStrictJSON(c, &request); err != nil || request.Following == nil {
		RespondError(c, http.StatusBadRequest, "Invalid follow request")
		return
	}
	userID := c.GetInt("user_id")
	if userID == target {
		RespondError(c, http.StatusBadRequest, "You cannot follow yourself")
		return
	}
	if *request.Following {
		allowed, err := h.store.CanFollow(c.Request.Context(), userID, target)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to update follow")
			return
		}
		if !allowed {
			RespondError(c, http.StatusNotFound, "User not found")
			return
		}
	}
	if err := h.store.SetFollowing(c.Request.Context(), userID, target, *request.Following); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update follow")
		return
	}
	c.JSON(http.StatusOK, gin.H{"following": *request.Following})
}

func (h *OmniChatSocialHandler) ContinueChat(c *gin.Context) {
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	conversation, err := h.store.ContinueChatSnapshot(c.Request.Context(), id, c.GetInt("user_id"))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to continue chat")
		return
	}
	if conversation == nil {
		RespondError(c, http.StatusNotFound, "Shared chat not found")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"conversation": conversation})
}

func (h *OmniChatSocialHandler) Report(c *gin.Context) {
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	var request struct {
		Reason  string `json:"reason"`
		Details string `json:"details"`
	}
	if err := decodeStrictJSON(c, &request); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid report")
		return
	}
	valid := map[string]bool{"sexual_content": true, "minor_safety": true, "violence": true, "harassment": true, "hate": true, "self_harm": true, "impersonation": true, "copyright": true, "spam": true, "other": true}
	request.Reason = strings.TrimSpace(request.Reason)
	request.Details = strings.TrimSpace(request.Details)
	if !valid[request.Reason] || len([]rune(request.Details)) > 1000 {
		RespondError(c, http.StatusBadRequest, "Invalid report")
		return
	}
	userID := c.GetInt("user_id")
	publication, err := h.store.GetPublicationAccessible(c.Request.Context(), id, &userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to submit report")
		return
	}
	if publication == nil {
		RespondError(c, http.StatusNotFound, "Publication not found")
		return
	}
	if publication.AuthorUserID == userID {
		RespondError(c, http.StatusBadRequest, "You cannot report your own publication")
		return
	}
	if err := h.store.ReportPublication(c.Request.Context(), id, userID, request.Reason, request.Details); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to submit report")
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *OmniChatSocialHandler) RemovePublication(c *gin.Context) {
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	removed, err := h.store.RemovePublicationOwned(c.Request.Context(), id, c.GetInt("user_id"))
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to remove publication")
		return
	}
	if !removed {
		RespondError(c, http.StatusNotFound, "Publication not found")
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *OmniChatSocialHandler) GetPublicMediaContent(c *gin.Context) {
	assetID, ok := parseUUIDParam(c, "asset_id")
	if !ok {
		return
	}
	var viewer *int
	if userID, exists := middleware.GetOptionalUserID(c); exists {
		viewer = &userID
	}
	path, fileType, err := h.store.PublicAssetStoragePath(c.Request.Context(), assetID, viewer)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load media")
		return
	}
	if path == "" {
		RespondError(c, http.StatusNotFound, "Media not found")
		return
	}
	if h.storage == nil {
		RespondError(c, http.StatusServiceUnavailable, "Media storage is unavailable")
		return
	}
	extension, maxBytes, validType := omniChatMediaResponseMetadata(fileType)
	if !validType {
		RespondError(c, http.StatusConflict, "Media type is invalid")
		return
	}
	objectSize, err := h.storage.GetObjectSize(c.Request.Context(), path)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Media not found")
		return
	}
	if objectSize <= 0 || objectSize > maxBytes {
		RespondError(c, http.StatusConflict, "Media size is invalid")
		return
	}
	reader, err := h.storage.Download(c.Request.Context(), path)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Media not found")
		return
	}
	defer reader.Close()
	c.Header("Content-Type", fileType)
	c.Header("Content-Disposition", fmt.Sprintf(`inline; filename="%s.%s"`, assetID, extension))
	c.Header("Content-Length", strconv.FormatInt(objectSize, 10))
	// Access depends on the current viewer's NSFW preference and block graph.
	// Never let a browser, proxy, or CDN replay an authorized response to a
	// different viewer using the same asset URL.
	c.Header("Cache-Control", "private, no-store")
	c.Writer.Header().Add("Vary", "Authorization")
	c.Writer.Header().Add("Vary", "Cookie")
	c.Header("X-Content-Type-Options", "nosniff")
	_, _ = io.Copy(c.Writer, &io.LimitedReader{R: reader, N: objectSize})
}

func decoratePublicPublication(publication *models.OmniChatPublication) {
	decorate := func(asset *models.OmniChatPublicMediaAsset) {
		if asset == nil {
			return
		}
		asset.ContentURL = "/api/v1/omnichat/explore/media/" + asset.ID.String() + "/content"
	}
	decorate(publication.Asset)
	if publication.Snapshot != nil {
		for _, message := range publication.Snapshot.Messages {
			for _, asset := range message.Attachments {
				decorate(asset)
			}
		}
	}
}
