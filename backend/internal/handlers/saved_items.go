package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
)

// SavedItemsHandler manages saved posts and comments
type SavedItemsHandler struct {
	savedRepo         *models.SavedItemsRepository
	postRepo          *models.PlatformPostRepository
	postCommentRepo   *models.PostCommentRepository
	redditCommentRepo *models.RedditPostCommentRepository
}

// NewSavedItemsHandler constructs the handler
func NewSavedItemsHandler(savedRepo *models.SavedItemsRepository, postRepo *models.PlatformPostRepository, postCommentRepo *models.PostCommentRepository, redditCommentRepo *models.RedditPostCommentRepository) *SavedItemsHandler {
	return &SavedItemsHandler{
		savedRepo:         savedRepo,
		postRepo:          postRepo,
		postCommentRepo:   postCommentRepo,
		redditCommentRepo: redditCommentRepo,
	}
}

// GetSavedItems handles GET /api/v1/users/me/saved
func (h *SavedItemsHandler) GetSavedItems(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	filterType := c.DefaultQuery("type", "all")
	if filterType != "all" && filterType != "posts" && filterType != "reddit_comments" && filterType != "post_comments" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid type filter. Use all, posts, post_comments, or reddit_comments"})
		return
	}

	response := gin.H{}
	if filterType == "all" || filterType == "posts" {
		posts, err := h.savedRepo.GetSavedPosts(c.Request.Context(), userID.(int))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch saved posts", "details": err.Error()})
			return
		}
		response["saved_posts"] = posts
	}

	if filterType == "all" || filterType == "post_comments" {
		comments, err := h.savedRepo.GetSavedPostComments(c.Request.Context(), userID.(int))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch saved site comments", "details": err.Error()})
			return
		}
		response["saved_post_comments"] = comments
	}

	if filterType == "all" || filterType == "reddit_comments" {
		comments, err := h.savedRepo.GetSavedRedditComments(c.Request.Context(), userID.(int))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch saved comments", "details": err.Error()})
			return
		}
		response["saved_reddit_comments"] = comments
	}

	response["type"] = filterType
	c.JSON(http.StatusOK, response)
}

// SavePost handles POST /api/v1/posts/:id/save
func (h *SavedItemsHandler) SavePost(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil || postID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch post", "details": err.Error()})
		return
	}
	if post == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}

	if err := h.savedRepo.SavePost(c.Request.Context(), userID.(int), postID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save post", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": true})
}

// UnsavePost handles DELETE /api/v1/posts/:id/save
func (h *SavedItemsHandler) UnsavePost(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil || postID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	if err := h.savedRepo.RemovePost(c.Request.Context(), userID.(int), postID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unsave post", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": false})
}

// SaveRedditComment handles POST /api/v1/reddit/posts/:subreddit/:postId/comments/:commentId/save
func (h *SavedItemsHandler) SaveRedditComment(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil || commentID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	comment, err := h.redditCommentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comment", "details": err.Error()})
		return
	}
	if comment == nil || comment.DeletedAt != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	// Ensure comment belongs to route context
	if comment.Subreddit != c.Param("subreddit") || comment.RedditPostID != c.Param("postId") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Comment does not belong to this post"})
		return
	}

	if err := h.savedRepo.SaveRedditComment(c.Request.Context(), userID.(int), commentID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save comment", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": true})
}

// UnsaveRedditComment handles DELETE /api/v1/reddit/posts/:subreddit/:postId/comments/:commentId/save
func (h *SavedItemsHandler) UnsaveRedditComment(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil || commentID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	if err := h.savedRepo.RemoveRedditComment(c.Request.Context(), userID.(int), commentID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unsave comment", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": false})
}

// SavePostComment handles POST /api/v1/comments/:commentId/save
func (h *SavedItemsHandler) SavePostComment(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil || commentID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	comment, err := h.postCommentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comment", "details": err.Error()})
		return
	}
	if comment == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	if err := h.savedRepo.SavePostComment(c.Request.Context(), userID.(int), commentID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save comment", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": true})
}

// UnsavePostComment handles DELETE /api/v1/comments/:commentId/save
func (h *SavedItemsHandler) UnsavePostComment(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil || commentID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	if err := h.savedRepo.RemovePostComment(c.Request.Context(), userID.(int), commentID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unsave comment", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": false})
}
