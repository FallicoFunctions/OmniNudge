package handlers

import (
	"errors"
	"io"
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

type saveRedditPostRequest struct {
	Title       string  `json:"title"`
	Author      string  `json:"author"`
	Score       int     `json:"score"`
	NumComments int     `json:"num_comments"`
	Thumbnail   *string `json:"thumbnail"`
	CreatedUTC  *int64  `json:"created_utc"`
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
	validTypes := map[string]bool{
		"all": true, "posts": true, "reddit_posts": true,
		"post_comments": true, "reddit_comments": true,
	}
	if !validTypes[filterType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid type filter. Use all, posts, reddit_posts, post_comments, or reddit_comments"})
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

	if filterType == "all" || filterType == "reddit_posts" {
		redditPosts, err := h.savedRepo.GetSavedRedditPosts(c.Request.Context(), userID.(int))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch saved Reddit posts", "details": err.Error()})
			return
		}
		response["saved_reddit_posts"] = redditPosts
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

// GetHiddenItems handles GET /api/v1/users/me/hidden
func (h *SavedItemsHandler) GetHiddenItems(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	filterType := c.DefaultQuery("type", "all")
	validTypes := map[string]bool{
		"all": true, "posts": true, "reddit_posts": true,
	}
	if !validTypes[filterType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid type filter. Use all, posts, or reddit_posts"})
		return
	}

	response := gin.H{}
	if filterType == "all" || filterType == "posts" {
		posts, err := h.savedRepo.GetHiddenPosts(c.Request.Context(), userID.(int))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hidden posts", "details": err.Error()})
			return
		}
		response["hidden_posts"] = posts
	}

	if filterType == "all" || filterType == "reddit_posts" {
		redditPosts, err := h.savedRepo.GetHiddenRedditPosts(c.Request.Context(), userID.(int))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hidden Reddit posts", "details": err.Error()})
			return
		}
		response["hidden_reddit_posts"] = redditPosts
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

// SaveRedditPost handles POST /api/v1/reddit/posts/:subreddit/:postId/save
func (h *SavedItemsHandler) SaveRedditPost(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	subreddit := c.Param("subreddit")
	postId := c.Param("postId")

	if subreddit == "" || postId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid subreddit or post ID"})
		return
	}

	var req saveRedditPostRequest
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	if err := h.savedRepo.SaveRedditPost(c.Request.Context(), userID.(int), &models.RedditPostDetails{
		Subreddit:    subreddit,
		RedditPostID: postId,
		Title:        req.Title,
		Author:       req.Author,
		Score:        req.Score,
		NumComments:  req.NumComments,
		Thumbnail:    req.Thumbnail,
		CreatedUTC:   req.CreatedUTC,
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save Reddit post", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": true})
}

// UnsaveRedditPost handles DELETE /api/v1/reddit/posts/:subreddit/:postId/save
func (h *SavedItemsHandler) UnsaveRedditPost(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	subreddit := c.Param("subreddit")
	postId := c.Param("postId")

	if subreddit == "" || postId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid subreddit or post ID"})
		return
	}

	if err := h.savedRepo.RemoveRedditPost(c.Request.Context(), userID.(int), subreddit, postId); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unsave Reddit post", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": false})
}

// HidePost handles POST /api/v1/posts/:id/hide
func (h *SavedItemsHandler) HidePost(c *gin.Context) {
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

	if err := h.savedRepo.HidePost(c.Request.Context(), userID.(int), postID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hide post", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"hidden": true})
}

// UnhidePost handles DELETE /api/v1/posts/:id/hide
func (h *SavedItemsHandler) UnhidePost(c *gin.Context) {
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

	if err := h.savedRepo.UnhidePost(c.Request.Context(), userID.(int), postID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unhide post", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"hidden": false})
}

// HideRedditPost handles POST /api/v1/reddit/posts/:subreddit/:postId/hide
func (h *SavedItemsHandler) HideRedditPost(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	subreddit := c.Param("subreddit")
	postId := c.Param("postId")

	if subreddit == "" || postId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid subreddit or post ID"})
		return
	}

	if err := h.savedRepo.HideRedditPost(c.Request.Context(), userID.(int), subreddit, postId); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hide Reddit post", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"hidden": true})
}

// UnhideRedditPost handles DELETE /api/v1/reddit/posts/:subreddit/:postId/hide
func (h *SavedItemsHandler) UnhideRedditPost(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	subreddit := c.Param("subreddit")
	postId := c.Param("postId")

	if subreddit == "" || postId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid subreddit or post ID"})
		return
	}

	if err := h.savedRepo.UnhideRedditPost(c.Request.Context(), userID.(int), subreddit, postId); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unhide Reddit post", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"hidden": false})
}
