package handlers

import (
	"github.com/omninudge/backend/internal/api/middleware"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// ReactionsHandler handles HTTP requests for message reactions.
type ReactionsHandler struct {
	reactionService *services.ReactionService
}

// NewReactionsHandler creates a new reactions handler.
func NewReactionsHandler(reactionService *services.ReactionService) *ReactionsHandler {
	return &ReactionsHandler{reactionService: reactionService}
}

// requireUserID extracts the authenticated user ID from the gin context.
// On failure it writes a 401 response and returns (0, false).
// Using a typed assertion (v.(int)) guards against a middleware bug where
// user_id is stored as a different numeric type, which would otherwise
// cause an unrecovered panic in production.
func requireUserID(c *gin.Context) (int, bool) {
	return middleware.GetAuthenticatedUserID(c)
}

// AddReactionRequest is the JSON body for POST /api/v1/messages/:id/reactions.
type AddReactionRequest struct {
	Emoji string `json:"emoji" binding:"required"`
}

// AddReaction handles POST /api/v1/messages/:id/reactions
//
// @Summary      Add a reaction to a message
// @Description  Adds an emoji reaction to a message. Each user may add at most one
//
//	reaction per emoji per message. A message may have at most 10 distinct
//	emoji types across all users. Rate-limited to 10 reactions per 10 seconds
//	(1 req/s steady-state, burst of 10).
//
// @Tags         Messages, Reactions
// @Accept       json
// @Produce      json
// @Param        id      path     int                true  "Message ID"
// @Param        request body     AddReactionRequest true  "Emoji to react with"
// @Success      201     {object} models.MessageReaction
// @Failure      400     {object} map[string]string "Invalid request or emoji"
// @Failure      401     {object} map[string]string "Unauthenticated"
// @Failure      403     {object} map[string]string "Not a conversation participant"
// @Failure      404     {object} map[string]string "Message not found"
// @Failure      409     {object} map[string]string "Already reacted / too many emoji"
// @Failure      429     {object} map[string]string "Rate limit exceeded"
// @Failure      500     {object} map[string]string "Internal server error"
// @Router       /messages/{id}/reactions [post]
// @Security     BearerAuth
func (h *ReactionsHandler) AddReaction(c *gin.Context) {
	userID, ok := requireUserID(c)
	if !ok {
		return
	}

	messageID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}

	var req AddReactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	reaction, err := h.reactionService.AddReaction(c.Request.Context(), messageID, userID, req.Emoji)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrInvalidEmoji):
			RespondError(c, http.StatusBadRequest, err.Error())
		case errors.Is(err, services.ErrMessageNotFound):
			RespondError(c, http.StatusNotFound, "Message not found")
		case errors.Is(err, services.ErrNotParticipant):
			RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
		case errors.Is(err, services.ErrTooManyEmoji):
			RespondError(c, http.StatusConflict, err.Error())
		case errors.Is(err, services.ErrAlreadyReacted):
			RespondError(c, http.StatusConflict, "You have already reacted with this emoji")
		default:
			log.Printf("[ReactionsHandler] AddReaction error: message=%d user=%d: %v", messageID, userID, err)
			RespondError(c, http.StatusInternalServerError, "Failed to add reaction")
		}
		return
	}

	c.JSON(http.StatusCreated, reaction)
}

// RemoveReaction handles DELETE /api/v1/messages/:id/reactions/:reaction_id
//
// @Summary      Remove a reaction from a message
// @Description  Removes a reaction by its ID. Only the user who added the reaction
//
//	may remove it. The reaction must belong to the specified message.
//
// @Tags         Messages, Reactions
// @Produce      json
// @Param        id          path int true "Message ID"
// @Param        reaction_id path int true "Reaction ID"
// @Success      200         {object} map[string]string "Reaction removed"
// @Failure      400         {object} map[string]string "Invalid IDs"
// @Failure      401         {object} map[string]string "Unauthenticated"
// @Failure      403         {object} map[string]string "Not the reaction owner"
// @Failure      404         {object} map[string]string "Reaction not found"
// @Failure      429         {object} map[string]string "Rate limit exceeded"
// @Failure      500         {object} map[string]string "Internal server error"
// @Router       /messages/{id}/reactions/{reaction_id} [delete]
// @Security     BearerAuth
func (h *ReactionsHandler) RemoveReaction(c *gin.Context) {
	userID, ok := requireUserID(c)
	if !ok {
		return
	}

	messageID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}

	reactionID, err := strconv.Atoi(c.Param("reaction_id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid reaction ID")
		return
	}

	if err := h.reactionService.RemoveReaction(c.Request.Context(), messageID, reactionID, userID); err != nil {
		switch {
		case errors.Is(err, services.ErrReactionNotFound):
			RespondError(c, http.StatusNotFound, "Reaction not found")
		case errors.Is(err, services.ErrNotReactionOwner):
			RespondError(c, http.StatusForbidden, "You can only remove your own reactions")
		default:
			log.Printf("[ReactionsHandler] RemoveReaction error: message=%d reaction=%d user=%d: %v", messageID, reactionID, userID, err)
			RespondError(c, http.StatusInternalServerError, "Failed to remove reaction")
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Reaction removed"})
}

// GetReactionsResponse is the response body for GET /api/v1/messages/:id/reactions.
type GetReactionsResponse struct {
	// Reactions contains aggregated per-emoji reaction data, ordered by:
	// 1) count descending (most popular first),
	// 2) first-seen ascending,
	// 3) emoji lexicographically.
	Reactions []models.ReactionSummary `json:"reactions"`
	// TotalUniqueEmoji is the number of distinct emoji types on this message (max 10).
	TotalUniqueEmoji int `json:"total_unique_emoji"`
	// UsersTruncated is true when the combined per-emoji user lists exceed 500
	// entries and were capped. Individual reaction counts remain accurate.
	UsersTruncated bool `json:"users_truncated"`
}

// GetReactions handles GET /api/v1/messages/:id/reactions
//
// @Summary      Get reactions for a message
// @Description  Returns aggregated emoji reactions for a message, ordered by
//
//	count DESC, first-seen ASC, emoji ASC. Includes per-emoji user lists
//	and a user_reacted flag for the calling user. When users_truncated is
//	true, user lists are capped at 500 entries; reaction counts are always
//	accurate.
//
// @Tags         Messages, Reactions
// @Produce      json
// @Param        id  path     int true "Message ID"
// @Success      200 {object} GetReactionsResponse
// @Failure      400 {object} map[string]string "Invalid message ID"
// @Failure      401 {object} map[string]string "Unauthenticated"
// @Failure      403 {object} map[string]string "Not a participant"
// @Failure      404 {object} map[string]string "Message not found"
// @Failure      500 {object} map[string]string "Internal server error"
// @Router       /messages/{id}/reactions [get]
// @Security     BearerAuth
func (h *ReactionsHandler) GetReactions(c *gin.Context) {
	userID, ok := requireUserID(c)
	if !ok {
		return
	}

	messageID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid message ID")
		return
	}

	reactions, truncated, err := h.reactionService.GetReactions(c.Request.Context(), messageID, userID)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrMessageNotFound):
			RespondError(c, http.StatusNotFound, "Message not found")
		case errors.Is(err, services.ErrNotParticipant):
			RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
		default:
			log.Printf("[ReactionsHandler] GetReactions error: message=%d user=%d: %v", messageID, userID, err)
			RespondError(c, http.StatusInternalServerError, "Failed to get reactions")
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"reactions":          reactions,
		"total_unique_emoji": len(reactions),
		"users_truncated":    truncated,
	})
}
