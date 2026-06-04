package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/websocket"
)

// FriendsHandler manages friend requests and friend lists.
type FriendsHandler struct {
	friendRepo ports.UserFriendshipRepository
	userRepo   ports.UserRepository
	hub        *websocket.Hub
}

// NewFriendsHandler creates a new FriendsHandler.
func NewFriendsHandler(friendRepo ports.UserFriendshipRepository, userRepo ports.UserRepository, hub *websocket.Hub) *FriendsHandler {
	return &FriendsHandler{friendRepo: friendRepo, userRepo: userRepo, hub: hub}
}

// GetFriends returns the authenticated user's accepted friend list.
//
// @Summary      List friends
// @Tags         Friends
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/friends [get]
func (h *FriendsHandler) GetFriends(c *gin.Context) {
	userID := c.GetInt("user_id")
	friends, err := h.friendRepo.ListFriends(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load friends")
		return
	}
	if friends == nil {
		friends = []models.FriendEntry{}
	}
	c.JSON(http.StatusOK, gin.H{"friends": friends})
}

// GetFriendRequests returns incoming and outgoing pending friend requests.
//
// @Summary      List friend requests
// @Tags         Friends
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/friends/requests [get]
func (h *FriendsHandler) GetFriendRequests(c *gin.Context) {
	userID := c.GetInt("user_id")
	ctx := c.Request.Context()

	incoming, err := h.friendRepo.ListIncomingRequests(ctx, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load incoming requests")
		return
	}
	outgoing, err := h.friendRepo.ListOutgoingRequests(ctx, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load outgoing requests")
		return
	}

	if incoming == nil {
		incoming = []models.FriendRequestEntry{}
	}
	if outgoing == nil {
		outgoing = []models.FriendRequestEntry{}
	}

	c.JSON(http.StatusOK, gin.H{
		"incoming": incoming,
		"outgoing": outgoing,
	})
}

type sendFriendRequestBody struct {
	Username string `json:"username" binding:"required"`
}

// SendFriendRequest sends a friend request to another user.
//
// @Summary      Send friend request
// @Tags         Friends
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      409  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/friends/requests [post]
func (h *FriendsHandler) SendFriendRequest(c *gin.Context) {
	myID := c.GetInt("user_id")
	ctx := c.Request.Context()

	var body sendFriendRequestBody
	if err := c.ShouldBindJSON(&body); err != nil {
		RespondError(c, http.StatusBadRequest, "username is required")
		return
	}

	target, err := h.userRepo.GetByUsername(ctx, body.Username)
	if err != nil || target == nil || isPendingDeletionHiddenFromViewer(target, myID) {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}
	if target.ID == myID {
		RespondError(c, http.StatusBadRequest, "Cannot send a friend request to yourself")
		return
	}

	// Check existing status
	status, err := h.friendRepo.GetFriendshipStatus(ctx, myID, target.ID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check friendship status")
		return
	}
	switch status.Status {
	case "accepted":
		RespondError(c, http.StatusConflict, "Already friends")
		return
	case "pending_outgoing":
		RespondError(c, http.StatusConflict, "Friend request already sent")
		return
	case "pending_incoming":
		// They already sent us a request — auto-accept it.
		if err := h.friendRepo.AcceptRequest(ctx, myID, target.ID); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to accept friend request")
			return
		}
		// Notify both parties that they are now friends.
		h.hub.Broadcast(&websocket.Message{RecipientID: target.ID, Type: "friend_request_accepted", Payload: map[string]interface{}{"from_user_id": myID}})
		h.hub.Broadcast(&websocket.Message{RecipientID: myID, Type: "friend_request_accepted", Payload: map[string]interface{}{"from_user_id": target.ID}})
		c.JSON(http.StatusOK, gin.H{
			"message": "Friend request accepted — you are now friends!",
			"result":  "accepted",
		})
		return
	}

	// No existing relationship — send the request.
	if err := h.friendRepo.SendRequest(ctx, myID, target.ID); err != nil {
		if errors.Is(err, models.ErrRequestAlreadyExists) {
			// Race condition: another tab/request got there first. Return 409 so the
			// client can refetch the current status rather than showing a generic error.
			RespondError(c, http.StatusConflict, "Friend request already sent")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to send friend request")
		return
	}
	// Push a real-time notification to the recipient so their badge updates instantly.
	h.hub.Broadcast(&websocket.Message{
		RecipientID: target.ID,
		Type:        "friend_request",
		Payload:     map[string]interface{}{"from_user_id": myID, "from_username": body.Username},
	})
	c.JSON(http.StatusOK, gin.H{
		"message": "Friend request sent",
		"result":  "sent",
	})
}

// AcceptFriendRequest accepts a pending incoming friend request.
//
// @Summary      Accept friend request
// @Tags         Friends
// @Security     BearerAuth
// @Produce      json
// @Param        username  path  string  true  "Username of request sender"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/friends/requests/{username}/accept [put]
func (h *FriendsHandler) AcceptFriendRequest(c *gin.Context) {
	myID := c.GetInt("user_id")
	ctx := c.Request.Context()
	username := c.Param("username")

	sender, err := h.userRepo.GetByUsername(ctx, username)
	if err != nil || sender == nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	if err := h.friendRepo.AcceptRequest(ctx, myID, sender.ID); err != nil {
		if errors.Is(err, models.ErrFriendshipNotFound) {
			RespondError(c, http.StatusNotFound, "No pending friend request from this user")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to accept friend request")
		return
	}
	// Notify both users so their friend lists update in real time.
	h.hub.Broadcast(&websocket.Message{RecipientID: sender.ID, Type: "friend_request_accepted", Payload: map[string]interface{}{"from_user_id": myID}})
	h.hub.Broadcast(&websocket.Message{RecipientID: myID, Type: "friend_request_accepted", Payload: map[string]interface{}{"from_user_id": sender.ID}})
	c.JSON(http.StatusOK, gin.H{"message": "Friend request accepted"})
}

// DeclineOrCancelFriendRequest declines an incoming request or cancels an outgoing one.
//
// @Summary      Decline or cancel friend request
// @Tags         Friends
// @Security     BearerAuth
// @Produce      json
// @Param        username  path  string  true  "Username of the other user"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/friends/requests/{username} [delete]
func (h *FriendsHandler) DeclineOrCancelFriendRequest(c *gin.Context) {
	myID := c.GetInt("user_id")
	ctx := c.Request.Context()
	username := c.Param("username")

	other, err := h.userRepo.GetByUsername(ctx, username)
	if err != nil || other == nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	if err := h.friendRepo.DeclineOrCancelRequest(ctx, myID, other.ID); err != nil {
		if errors.Is(err, models.ErrFriendshipNotFound) {
			RespondError(c, http.StatusNotFound, "No pending friend request found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to remove friend request")
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Friend request removed"})
}

// RemoveFriend removes an accepted friendship.
//
// @Summary      Remove friend
// @Tags         Friends
// @Security     BearerAuth
// @Produce      json
// @Param        username  path  string  true  "Username to unfriend"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/friends/{username} [delete]
func (h *FriendsHandler) RemoveFriend(c *gin.Context) {
	myID := c.GetInt("user_id")
	ctx := c.Request.Context()
	username := c.Param("username")

	other, err := h.userRepo.GetByUsername(ctx, username)
	if err != nil || other == nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	if err := h.friendRepo.RemoveFriend(ctx, myID, other.ID); err != nil {
		if errors.Is(err, models.ErrFriendshipNotFound) {
			RespondError(c, http.StatusNotFound, "Not friends with this user")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to remove friend")
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Friend removed"})
}

// GetFriendshipStatus returns the friendship relationship between the viewer and a given user.
// Works for authenticated users (full status) and guests (always "none").
//
// @Summary      Get friendship status with a user
// @Tags         Friends
// @Security     BearerAuth
// @Produce      json
// @Param        username  path  string  true  "Username to check"
// @Success      200  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/{username}/friendship [get]
func (h *FriendsHandler) GetFriendshipStatus(c *gin.Context) {
	viewerID := c.GetInt("user_id") // 0 if not authenticated
	username := c.Param("username")
	ctx := c.Request.Context()

	other, err := h.userRepo.GetByUsername(ctx, username)
	if err != nil || other == nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	if viewerID == other.ID {
		// Can't have a friendship with yourself.
		c.JSON(http.StatusOK, gin.H{"status": "none"})
		return
	}

	status, err := h.friendRepo.GetFriendshipStatus(ctx, viewerID, other.ID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load friendship status")
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": status.Status})
}
