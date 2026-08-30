package handlers

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// omniChatLikenessStore is the choice, read and settled.
type omniChatLikenessStore interface {
	ListLikenessCandidates(ctx context.Context, personaID, ownerUserID int) ([]*models.OmniChatIAILikenessCandidate, error)
	LikenessCandidateForOwner(ctx context.Context, personaID, ownerUserID int, candidateID int64) (*models.OmniChatIAILikenessCandidate, error)
	PickLikeness(ctx context.Context, personaID, ownerUserID int, candidateID int64) (*models.OmniChatMediaAsset, error)
}

// OmniChatLikenessHandler serves the four pictures somebody chooses her face
// from, and settles which one she keeps.
type OmniChatLikenessHandler struct {
	store   omniChatLikenessStore
	storage services.StorageService
}

func NewOmniChatLikenessHandler(store omniChatLikenessStore, storage services.StorageService) *OmniChatLikenessHandler {
	return &OmniChatLikenessHandler{store: store, storage: storage}
}

// omniChatLikenessCandidateView is what the picker is told about one candidate.
//
// No storage URL and no file path. A candidate is not an asset, so it is served
// through its own content route rather than by handing a browser somewhere to
// fetch from -- which is also what keeps a picture nobody has chosen from being
// linkable by anyone who learns the address.
type omniChatLikenessCandidateView struct {
	ID         int64  `json:"id"`
	ContentURL string `json:"content_url"`
	Ready      bool   `json:"ready"`
}

// List is her open choice.
func (h *OmniChatLikenessHandler) List(c *gin.Context) {
	personaID, ownerUserID, ok := h.scope(c)
	if !ok {
		return
	}

	candidates, err := h.store.ListLikenessCandidates(c.Request.Context(), personaID, ownerUserID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load her pictures")
		return
	}

	views := make([]omniChatLikenessCandidateView, 0, len(candidates))
	for _, candidate := range candidates {
		views = append(views, omniChatLikenessCandidateView{
			ID: candidate.ID,
			ContentURL: fmt.Sprintf("/api/v1/omnichat/iai/%d/likeness/%d/content",
				personaID, candidate.ID),
			// A render that has landed but not been scanned yet is listed and
			// not yet loadable, so the picker can show four places rather than
			// appearing to have lost one.
			Ready: candidate.ScanStatus == models.MediaScanStatusClean,
		})
	}
	c.JSON(http.StatusOK, gin.H{"candidates": views})
}

// Content streams one candidate to the person choosing.
func (h *OmniChatLikenessHandler) Content(c *gin.Context) {
	personaID, ownerUserID, ok := h.scope(c)
	if !ok {
		return
	}
	candidateID, ok := h.candidateID(c)
	if !ok {
		return
	}

	candidate, err := h.store.LikenessCandidateForOwner(c.Request.Context(), personaID, ownerUserID, candidateID)
	if err != nil {
		if errors.Is(err, models.ErrLikenessCandidateNotFound) {
			RespondError(c, http.StatusNotFound, "That picture is not among her choices")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to load her picture")
		return
	}
	if candidate.ScanStatus != models.MediaScanStatusClean {
		RespondError(c, http.StatusConflict, "That picture is still being verified")
		return
	}
	if h.storage == nil {
		RespondError(c, http.StatusServiceUnavailable, "Media storage is unavailable")
		return
	}

	extension, maxBytes, validType := omniChatMediaResponseMetadata(candidate.FileType)
	if !validType || !strings.HasPrefix(candidate.FileType, "image/") {
		// A likeness is a still. Anything else here is a render that went down
		// the wrong path, and streaming it would be the first anybody knew.
		RespondError(c, http.StatusConflict, "Media type is invalid")
		return
	}
	objectSize, err := h.storage.GetObjectSize(c.Request.Context(), candidate.StoragePath)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Media not found")
		return
	}
	if objectSize <= 0 || objectSize > maxBytes {
		RespondError(c, http.StatusConflict, "Media size is invalid")
		return
	}
	reader, err := h.storage.Download(c.Request.Context(), candidate.StoragePath)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Media not found")
		return
	}
	defer func() { _ = reader.Close() }()

	c.Header("Content-Type", candidate.FileType)
	c.Header("Content-Disposition",
		fmt.Sprintf(`inline; filename="candidate-%d.%s"`, candidate.ID, extension))
	c.Header("Content-Length", strconv.FormatInt(objectSize, 10))
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	limited := &io.LimitedReader{R: reader, N: objectSize}
	_, _ = io.Copy(c.Writer, limited)
}

// Pick settles which of the four she looks like.
func (h *OmniChatLikenessHandler) Pick(c *gin.Context) {
	personaID, ownerUserID, ok := h.scope(c)
	if !ok {
		return
	}
	candidateID, ok := h.candidateID(c)
	if !ok {
		return
	}

	asset, err := h.store.PickLikeness(c.Request.Context(), personaID, ownerUserID, candidateID)
	if err != nil {
		if errors.Is(err, models.ErrLikenessCandidateNotFound) {
			// Already chosen, never hers, or somebody else's character. The
			// second press of a double-click lands here rather than on an
			// error, which is the whole reason the pick locks the set.
			RespondError(c, http.StatusConflict, "Her face has already been chosen")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to keep that picture")
		return
	}
	c.JSON(http.StatusOK, gin.H{"asset_id": asset.ID})
}

func (h *OmniChatLikenessHandler) scope(c *gin.Context) (int, int, bool) {
	if h == nil || h.store == nil {
		RespondError(c, http.StatusServiceUnavailable, "Her pictures are temporarily unavailable")
		return 0, 0, false
	}
	ownerUserID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return 0, 0, false
	}
	personaID, err := strconv.Atoi(c.Param("id"))
	if err != nil || personaID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid character ID")
		return 0, 0, false
	}
	return personaID, ownerUserID, true
}

func (h *OmniChatLikenessHandler) candidateID(c *gin.Context) (int64, bool) {
	candidateID, err := strconv.ParseInt(c.Param("candidate_id"), 10, 64)
	if err != nil || candidateID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid picture ID")
		return 0, false
	}
	return candidateID, true
}
