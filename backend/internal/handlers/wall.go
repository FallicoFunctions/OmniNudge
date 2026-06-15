package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/services"
)

// WallHandler serves a user profile's "wall" — Facebook/MySpace-style posts left
// by the profile owner and their friends, distinct from hub/subreddit activity.
type WallHandler struct {
	pool         *pgxpool.Pool
	wallRepo     ports.WallPostRepository
	userRepo     ports.UserRepository
	userProfRepo ports.UserProfileRepository
	friendRepo   ports.UserFriendshipRepository
	notifService *services.NotificationService
}

// NewWallHandler creates a new WallHandler.
func NewWallHandler(
	pool *pgxpool.Pool,
	wallRepo ports.WallPostRepository,
	userRepo ports.UserRepository,
	userProfRepo ports.UserProfileRepository,
	friendRepo ports.UserFriendshipRepository,
) *WallHandler {
	return &WallHandler{
		pool:         pool,
		wallRepo:     wallRepo,
		userRepo:     userRepo,
		userProfRepo: userProfRepo,
		friendRepo:   friendRepo,
	}
}

// SetNotificationService sets the notification service (called after initialization).
func (h *WallHandler) SetNotificationService(notifService *services.NotificationService) {
	h.notifService = notifService
}

// resolveWallAccess loads the profile's wall_visibility setting and whether the
// viewer is friends with the profile owner.
func (h *WallHandler) resolveWallAccess(ctx context.Context, profileUserID, viewerID int) (visibility string, isFriend bool, err error) {
	visibility = "public"
	if h.userProfRepo != nil {
		visibility, err = h.userProfRepo.GetWallVisibility(ctx, profileUserID)
		if err != nil {
			return "", false, err
		}
	}

	if viewerID > 0 && viewerID != profileUserID && h.friendRepo != nil {
		isFriend, err = h.friendRepo.AreUsersFriends(ctx, profileUserID, viewerID)
		if err != nil {
			return visibility, false, err
		}
	}

	return visibility, isFriend, nil
}

// ensureWallViewable verifies the viewer may see profileUserID's wall, writing a
// 403 response and returning ok=false if not. On success it returns the wall's
// visibility and whether the viewer is friends with the profile owner, for callers
// that need them to compute can_post.
func (h *WallHandler) ensureWallViewable(c *gin.Context, profileUserID, viewerID int) (visibility string, isFriend bool, ok bool) {
	visibility, isFriend, err := h.resolveWallAccess(c.Request.Context(), profileUserID, viewerID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load wall")
		return "", false, false
	}
	if !canViewerSeeProfile(profileUserID, viewerID, visibility, isFriend) {
		RespondError(c, http.StatusForbidden, "This wall is private")
		return "", false, false
	}
	return visibility, isFriend, true
}

// ensureCanInteractWithWall verifies the viewer may post, comment, or like on
// profileUserID's wall, writing a 403 response (using forbiddenMsg) and returning
// ok=false if not.
func (h *WallHandler) ensureCanInteractWithWall(c *gin.Context, profileUserID, viewerID int, forbiddenMsg string) bool {
	visibility, isFriend, err := h.resolveWallAccess(c.Request.Context(), profileUserID, viewerID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load wall")
		return false
	}
	if !canPostToWall(profileUserID, viewerID, visibility, isFriend) {
		RespondError(c, http.StatusForbidden, forbiddenMsg)
		return false
	}
	return true
}

// canPostToWall reports whether viewerID may post, comment, or like on profileUserID's
// wall. The owner can always interact; friends can interact unless the wall is private
// (in which case they cannot view it either).
func canPostToWall(profileUserID, viewerID int, visibility string, isFriend bool) bool {
	if viewerID == profileUserID {
		return true
	}
	if viewerID <= 0 {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(visibility), "private") {
		return false
	}
	return isFriend
}

// WallPostsResponse is returned by GetWallPosts.
type WallPostsResponse struct {
	Posts          []*models.WallPost `json:"posts"`
	CanPost        bool                `json:"can_post"`
	WallVisibility string              `json:"wall_visibility"`
}

// GetWallPosts returns recent posts on a user's profile wall.
// @Summary      Get profile wall posts
// @Tags         Users
// @Produce      json
// @Param        username  path   string  true   "Username"
// @Param        limit     query  int     false  "Page size (default 20)"
// @Param        offset    query  int     false  "Offset"
// @Success      200  {object}  WallPostsResponse
// @Failure      403  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/{username}/wall [get]
func (h *WallHandler) GetWallPosts(c *gin.Context) {
	username := c.Param("username")

	user, err := h.userRepo.GetByUsername(c.Request.Context(), username)
	if err != nil || user == nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	viewerID, _ := middleware.GetOptionalUserID(c)
	if isPendingDeletionHiddenFromViewer(user, viewerID) {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	visibility, isFriend, ok := h.ensureWallViewable(c, user.ID, viewerID)
	if !ok {
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 50 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	posts, err := h.wallRepo.GetByProfileUserID(c.Request.Context(), user.ID, viewerID, limit, offset)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load wall posts")
		return
	}

	c.JSON(http.StatusOK, WallPostsResponse{
		Posts:          posts,
		CanPost:        canPostToWall(user.ID, viewerID, visibility, isFriend),
		WallVisibility: visibility,
	})
}

// CreateWallPostRequest is the request body for posting to a wall.
type CreateWallPostRequest struct {
	Body  string                 `json:"body" binding:"max=2000"`
	Media []models.WallPostMedia `json:"media,omitempty"`
}

const maxWallPostMediaItems = 10

// CreateWallPost adds a post to a user's profile wall.
// @Summary      Create a wall post
// @Tags         Users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        username  path  string                 true  "Username"
// @Param        body      body  CreateWallPostRequest  true  "Wall post"
// @Success      201  {object}  models.WallPost
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/{username}/wall [post]
func (h *WallHandler) CreateWallPost(c *gin.Context) {
	authorID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	username := c.Param("username")
	user, err := h.userRepo.GetByUsername(c.Request.Context(), username)
	if err != nil || user == nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}
	if isPendingDeletionHiddenFromViewer(user, authorID) {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	if !h.ensureCanInteractWithWall(c, user.ID, authorID, "You can't post on this wall") {
		return
	}

	var req CreateWallPostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	body := strings.TrimSpace(req.Body)
	if body == "" && len(req.Media) == 0 {
		RespondError(c, http.StatusBadRequest, "Post must have text or media")
		return
	}

	if len(req.Media) > maxWallPostMediaItems {
		RespondError(c, http.StatusBadRequest, fmt.Sprintf("A post can have at most %d media items", maxWallPostMediaItems))
		return
	}
	for _, item := range req.Media {
		if item.URL == "" {
			RespondError(c, http.StatusBadRequest, "Media item is missing a URL")
			return
		}
		if item.MediaType != "image" && item.MediaType != "video" {
			RespondError(c, http.StatusBadRequest, "Media items must be of type image or video")
			return
		}
	}

	post := &models.WallPost{
		ProfileUserID: user.ID,
		AuthorID:      authorID,
		Body:          body,
		Media:         req.Media,
	}
	if err := h.wallRepo.Create(c.Request.Context(), post); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create wall post")
		return
	}

	author := user
	if authorID != user.ID {
		author, err = h.userRepo.GetByID(c.Request.Context(), authorID)
	}
	if err == nil && author != nil {
		post.AuthorUsername = author.Username
		post.AuthorAvatarURL = author.AvatarURL
	}

	if h.notifService != nil {
		go h.notifService.NotifyWallPost(context.Background(), user.ID, authorID, post.ID, post.AuthorUsername)
	}

	c.JSON(http.StatusCreated, post)
}

// DeleteWallPost removes a wall post. Allowed for the post's author or the wall's owner.
// @Summary      Delete a wall post
// @Tags         Users
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Wall post ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /wall-posts/{id} [delete]
func (h *WallHandler) DeleteWallPost(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid wall post ID")
		return
	}

	post, err := h.wallRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load wall post")
		return
	}
	if post == nil {
		RespondError(c, http.StatusNotFound, "Wall post not found")
		return
	}

	if userID != post.AuthorID && userID != post.ProfileUserID {
		RespondError(c, http.StatusForbidden, "You can't delete this post")
		return
	}

	if err := h.wallRepo.SoftDelete(c.Request.Context(), postID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete wall post")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Wall post deleted"})
}

// WallPostReactionResponse is returned by SetWallPostReaction.
type WallPostReactionResponse struct {
	Liked        bool `json:"liked"`
	Disliked     bool `json:"disliked"`
	LikeCount    int  `json:"like_count"`
	DislikeCount int  `json:"dislike_count"`
}

// SetWallPostReactionRequest is the request body for reacting to a wall post.
type SetWallPostReactionRequest struct {
	Reaction models.ReactionType `json:"reaction" binding:"required,oneof=like dislike"`
}

// SetWallPostReaction sets, switches, or clears the current user's like/dislike
// on a wall post. A user can only have one of like or dislike active at a time;
// choosing the active reaction again clears it.
// @Summary      Like or dislike a wall post
// @Tags         Users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  int                          true  "Wall post ID"
// @Param        body  body  SetWallPostReactionRequest   true  "Reaction"
// @Success      200  {object}  WallPostReactionResponse
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /wall-posts/{id}/reaction [post]
func (h *WallHandler) SetWallPostReaction(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid wall post ID")
		return
	}

	var req SetWallPostReactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	post, err := h.wallRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load wall post")
		return
	}
	if post == nil {
		RespondError(c, http.StatusNotFound, "Wall post not found")
		return
	}

	if !h.ensureCanInteractWithWall(c, post.ProfileUserID, userID, "You can't interact with this wall") {
		return
	}

	liked, disliked, likeCount, dislikeCount, err := h.wallRepo.SetPostReaction(c.Request.Context(), postID, userID, req.Reaction)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update reaction")
		return
	}

	if liked && h.notifService != nil {
		actor, err := h.userRepo.GetByID(c.Request.Context(), userID)
		username := "Someone"
		if err == nil && actor != nil {
			username = actor.Username
		}
		go h.notifService.NotifyWallLike(context.Background(), post.AuthorID, userID, post.ID, username)
	}

	c.JSON(http.StatusOK, WallPostReactionResponse{Liked: liked, Disliked: disliked, LikeCount: likeCount, DislikeCount: dislikeCount})
}

// WallPostCommentsResponse is returned by GetWallPostComments.
type WallPostCommentsResponse struct {
	Comments []*models.WallPostComment `json:"comments"`
}

// GetWallPostComments returns comments on a wall post.
// @Summary      Get wall post comments
// @Tags         Users
// @Produce      json
// @Param        id      path   int  true   "Wall post ID"
// @Param        limit   query  int  false  "Page size (default 50)"
// @Param        offset  query  int  false  "Offset"
// @Success      200  {object}  WallPostCommentsResponse
// @Failure      403  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /wall-posts/{id}/comments [get]
func (h *WallHandler) GetWallPostComments(c *gin.Context) {
	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid wall post ID")
		return
	}

	post, err := h.wallRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load wall post")
		return
	}
	if post == nil {
		RespondError(c, http.StatusNotFound, "Wall post not found")
		return
	}

	viewerID, _ := middleware.GetOptionalUserID(c)
	if _, _, ok := h.ensureWallViewable(c, post.ProfileUserID, viewerID); !ok {
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	comments, err := h.wallRepo.GetComments(c.Request.Context(), postID, viewerID, limit, offset)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load comments")
		return
	}

	c.JSON(http.StatusOK, WallPostCommentsResponse{Comments: comments})
}

// CreateWallPostCommentRequest is the request body for commenting on a wall post.
type CreateWallPostCommentRequest struct {
	Body string `json:"body" binding:"required,min=1,max=2000"`
}

// CreateWallPostComment adds a comment to a wall post.
// @Summary      Comment on a wall post
// @Tags         Users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  int                          true  "Wall post ID"
// @Param        body  body  CreateWallPostCommentRequest true  "Comment"
// @Success      201  {object}  models.WallPostComment
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /wall-posts/{id}/comments [post]
func (h *WallHandler) CreateWallPostComment(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid wall post ID")
		return
	}

	post, err := h.wallRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load wall post")
		return
	}
	if post == nil {
		RespondError(c, http.StatusNotFound, "Wall post not found")
		return
	}

	if !h.ensureCanInteractWithWall(c, post.ProfileUserID, userID, "You can't interact with this wall") {
		return
	}

	var req CreateWallPostCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	body := strings.TrimSpace(req.Body)
	if body == "" {
		RespondError(c, http.StatusBadRequest, "Comment cannot be empty")
		return
	}

	comment := &models.WallPostComment{
		WallPostID: postID,
		AuthorID:   userID,
		Body:       body,
	}
	if err := h.wallRepo.CreateComment(c.Request.Context(), comment); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create comment")
		return
	}

	author, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err == nil && author != nil {
		comment.AuthorUsername = author.Username
		comment.AuthorAvatarURL = author.AvatarURL
	}

	if h.notifService != nil {
		go h.notifService.NotifyWallComment(context.Background(), post.AuthorID, userID, post.ID, comment.AuthorUsername)
	}

	c.JSON(http.StatusCreated, comment)
}

// DeleteWallPostComment removes a comment from a wall post. Allowed for the
// comment's author or the wall's owner.
// @Summary      Delete a wall post comment
// @Tags         Users
// @Security     BearerAuth
// @Produce      json
// @Param        id         path  int  true  "Wall post ID"
// @Param        commentId  path  int  true  "Comment ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /wall-posts/{id}/comments/{commentId} [delete]
func (h *WallHandler) DeleteWallPostComment(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid wall post ID")
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	comment, err := h.wallRepo.GetCommentByID(c.Request.Context(), commentID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load comment")
		return
	}
	if comment == nil || comment.WallPostID != postID {
		RespondError(c, http.StatusNotFound, "Comment not found")
		return
	}

	if userID != comment.AuthorID {
		post, err := h.wallRepo.GetByID(c.Request.Context(), postID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to load wall post")
			return
		}
		if post == nil || userID != post.ProfileUserID {
			RespondError(c, http.StatusForbidden, "You can't delete this comment")
			return
		}
	}

	if err := h.wallRepo.DeleteComment(c.Request.Context(), commentID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete comment")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Comment deleted"})
}

// SetWallPostCommentReaction sets, switches, or clears the current user's
// like/dislike on a wall post comment, mirroring SetWallPostReaction.
// @Summary      Like or dislike a wall post comment
// @Tags         Users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id         path  int                          true  "Wall post ID"
// @Param        commentId  path  int                          true  "Comment ID"
// @Param        body       body  SetWallPostReactionRequest   true  "Reaction"
// @Success      200  {object}  WallPostReactionResponse
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /wall-posts/{id}/comments/{commentId}/reaction [post]
func (h *WallHandler) SetWallPostCommentReaction(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid wall post ID")
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	var req SetWallPostReactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	comment, err := h.wallRepo.GetCommentByID(c.Request.Context(), commentID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load comment")
		return
	}
	if comment == nil || comment.WallPostID != postID {
		RespondError(c, http.StatusNotFound, "Comment not found")
		return
	}

	post, err := h.wallRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load wall post")
		return
	}
	if post == nil {
		RespondError(c, http.StatusNotFound, "Wall post not found")
		return
	}

	if !h.ensureCanInteractWithWall(c, post.ProfileUserID, userID, "You can't interact with this wall") {
		return
	}

	liked, disliked, likeCount, dislikeCount, err := h.wallRepo.SetCommentReaction(c.Request.Context(), commentID, userID, req.Reaction)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update reaction")
		return
	}

	c.JSON(http.StatusOK, WallPostReactionResponse{Liked: liked, Disliked: disliked, LikeCount: likeCount, DislikeCount: dislikeCount})
}

// SetWallVisibilityRequest is the request body for updating wall visibility.
type SetWallVisibilityRequest struct {
	WallVisibility string `json:"wall_visibility" binding:"required,oneof=public friends_only private"`
}

// SetWallVisibility updates the visibility of the authenticated user's profile wall.
// @Summary      Update wall visibility
// @Tags         Users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  SetWallVisibilityRequest  true  "Visibility"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/wall-visibility [put]
func (h *WallHandler) SetWallVisibility(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req SetWallVisibilityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.userProfRepo.UpdateWallVisibility(c.Request.Context(), userID, req.WallVisibility); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update wall visibility")
		return
	}

	c.JSON(http.StatusOK, gin.H{"wall_visibility": req.WallVisibility})
}
