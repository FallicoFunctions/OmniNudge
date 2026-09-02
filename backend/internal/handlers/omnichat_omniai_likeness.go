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
	zlog "github.com/rs/zerolog/log"

	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// omniChatReferenceStartTimeout bounds the background start so a stalled queue
// cannot leave the goroutine alive indefinitely. It covers five job rows and
// five enqueues, not the renders themselves.
const omniChatReferenceStartTimeout = 15 * time.Second

// omniChatLikenessStore is the choice, read and settled.
type omniChatLikenessStore interface {
	ListLikenessCandidates(ctx context.Context, personaID, ownerUserID int) ([]*models.OmniChatOmniAILikenessCandidate, error)
	LikenessCandidateForOwner(ctx context.Context, personaID, ownerUserID int, candidateID int64) (*models.OmniChatOmniAILikenessCandidate, error)
	PickLikeness(ctx context.Context, personaID, ownerUserID int, candidateID int64) (*models.OmniChatMediaAsset, error)
	PendingLikenessCount(ctx context.Context, personaID, ownerUserID int) (int, error)
}

// OmniChatLikenessHandler serves the four pictures somebody chooses her face
// from, and settles which one she keeps.
// omniChatLikenessPersonaReader loads the character a pick belongs to, so her
// supporting references can be conditioned on what somebody just chose.
type omniChatLikenessPersonaReader interface {
	GetAccessibleByID(ctx context.Context, id int, viewerUserID *int) (*models.BotPersona, error)
}

// omniChatLikenessRerollStarter draws four more faces, and charges for them.
type omniChatLikenessRerollStarter interface {
	Reroll(ctx context.Context, persona *models.BotPersona) ([]uuid.UUID, error)
}

// omniChatReferenceStarter asks for the five pictures that make her look like
// herself in a scene.
type omniChatReferenceStarter interface {
	StartReferences(ctx context.Context, persona *models.BotPersona, anchorURL string) ([]uuid.UUID, error)
}

type OmniChatLikenessHandler struct {
	store    omniChatLikenessStore
	storage  services.StorageService
	personas omniChatLikenessPersonaReader
	starter  omniChatReferenceStarter
	reroller omniChatLikenessRerollStarter
}

// SetReroller installs what draws another set. Optional like the reference
// starter: without it the route refuses rather than the whole handler failing
// to build, so a deployment that has not wired billing cannot silently give
// re-rolls away.
func (h *OmniChatLikenessHandler) SetReroller(reroller omniChatLikenessRerollStarter) *OmniChatLikenessHandler {
	if h != nil {
		h.reroller = reroller
	}
	return h
}

// SetReferenceStarter installs what asks for her supporting pictures once a
// face has been chosen.
//
// Both halves are optional and nil-tolerant. A pick must never fail because a
// render could not be queued: she is already wearing the face somebody chose,
// and the supporting set only makes her more consistent in scenes.
func (h *OmniChatLikenessHandler) SetReferenceStarter(
	personas omniChatLikenessPersonaReader, starter omniChatReferenceStarter,
) *OmniChatLikenessHandler {
	h.personas = personas
	h.starter = starter
	return h
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
			ContentURL: fmt.Sprintf("/api/v1/omnichat/omniai/%d/likeness/%d/content",
				personaID, candidate.ID),
			// A render that has landed but not been scanned yet is listed and
			// not yet loadable, so the picker can show four places rather than
			// appearing to have lost one.
			Ready: candidate.ScanStatus == models.MediaScanStatusClean,
		})
	}
	// How many are still coming. Three candidates is otherwise two situations
	// the picker cannot tell apart -- a fourth still rendering, and a fourth
	// that failed and never will -- so it would either spin forever or settle
	// for three while one was seconds away.
	//
	// A failure to count is not a failure to choose. It reports none pending,
	// which shows what has arrived rather than refusing the whole screen over a
	// number that only decides whether to keep waiting.
	pending, err := h.store.PendingLikenessCount(c.Request.Context(), personaID, ownerUserID)
	if err != nil {
		pending = 0
	}
	c.JSON(http.StatusOK, gin.H{"candidates": views, "pending": pending})
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
	h.startSupportingReferences(c, personaID, ownerUserID, asset.StorageURL)
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

// startSupportingReferences asks for the other five, off the request.
//
// Detached and in the background for the same reason creation's first four are:
// this creates five job rows and puts five tasks on a queue, and a stalled
// queue would otherwise hold up a choice that has already been made. On the
// request's own context a client that disconnected would cancel them, and
// nothing would ever ask again.
//
// Every failure is logged rather than raised. The pick has committed, she is
// wearing the picture, and a missing supporting reference costs consistency in
// scenes rather than correctness.
func (h *OmniChatLikenessHandler) startSupportingReferences(
	c *gin.Context, personaID, ownerUserID int, anchorURL string,
) {
	if h.personas == nil || h.starter == nil {
		return
	}
	detached := context.WithoutCancel(c.Request.Context())
	starter, personas := h.starter, h.personas
	go func() {
		renderCtx, cancel := context.WithTimeout(detached, omniChatReferenceStartTimeout)
		defer cancel()

		persona, err := personas.GetAccessibleByID(renderCtx, personaID, &ownerUserID)
		if err != nil || persona == nil {
			zlog.Error().Err(err).Int("persona_id", personaID).
				Msg("omnichat likeness: could not load the character to support her picture")
			return
		}
		started, err := starter.StartReferences(renderCtx, persona, anchorURL)
		if err != nil {
			zlog.Error().Err(err).Int("persona_id", personaID).Int("started", len(started)).
				Msg("omnichat likeness: could not ask for every supporting reference")
		}
	}()
}

// Reroll draws four more faces for a character nobody has picked yet.
//
// Unlike the pick, this one waits. The four renders it queues are what somebody
// just paid for, and answering before the credits are held would mean reporting
// success for a set that a refused reservation is about to make nothing at all.
func (h *OmniChatLikenessHandler) Reroll(c *gin.Context) {
	personaID, ownerUserID, ok := h.scope(c)
	if !ok {
		return
	}
	if h.reroller == nil || h.personas == nil {
		RespondErrorCoded(c, http.StatusServiceUnavailable, "reroll_unavailable",
			"Drawing another set is unavailable right now.")
		return
	}

	persona, err := h.personas.GetAccessibleByID(c.Request.Context(), personaID, &ownerUserID)
	if err != nil || persona == nil {
		RespondError(c, http.StatusNotFound, "That character could not be found")
		return
	}

	started, err := h.reroller.Reroll(c.Request.Context(), persona)
	if err != nil {
		if errors.Is(err, models.ErrLikenessAlreadyChosen) {
			// Said plainly, and separately from a refusal about money. Somebody
			// whose character already has a face is not short of credits.
			RespondErrorCoded(c, http.StatusConflict, "likeness_already_chosen",
				"Her face is already chosen. Deleting her is how you start again.")
			return
		}
		if errors.Is(err, services.ErrOmniChatPaidFeatureRequired) {
			RespondErrorCoded(c, http.StatusPaymentRequired, "insufficient_credits",
				"Another set of four costs more credits than this account has.")
			return
		}
		zlog.Error().Err(err).Int("user_id", ownerUserID).Int("persona_id", personaID).
			Int("started", len(started)).Msg("omnichat likeness: could not draw another set")
		RespondError(c, http.StatusInternalServerError, "Failed to draw another set")
		return
	}

	c.JSON(http.StatusOK, gin.H{"started": len(started)})
}
