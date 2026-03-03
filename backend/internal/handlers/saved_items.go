package handlers

import (
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/api/middleware"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// SavedItemsHandler manages saved posts and comments
type SavedItemsHandler struct {
	savedRepo         ports.SavedItemsRepository
	postRepo          ports.PlatformPostRepository
	postCommentRepo   ports.PostCommentRepository
	redditCommentRepo ports.RedditPostCommentRepository
	redditClient      redditPostFetcher
}

type redditPostFetcher interface {
	GetPostInfo(ctx context.Context, subreddit string, redditPostID string) (*services.RedditPost, error)
}

type removedRedditPost struct {
	Subreddit    string `json:"subreddit"`
	RedditPostID string `json:"reddit_post_id"`
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
func NewSavedItemsHandler(savedRepo ports.SavedItemsRepository, postRepo ports.PlatformPostRepository, postCommentRepo ports.PostCommentRepository, redditCommentRepo ports.RedditPostCommentRepository, redditClient redditPostFetcher) *SavedItemsHandler {
	return &SavedItemsHandler{
		savedRepo:         savedRepo,
		postRepo:          postRepo,
		postCommentRepo:   postCommentRepo,
		redditCommentRepo: redditCommentRepo,
		redditClient:      redditClient,
	}
}

// GetSavedItems returns saved posts and comments for the current user.
// @Summary      Get saved items
// @Tags         SavedItems
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/saved [get]
func (h *SavedItemsHandler) GetSavedItems(c *gin.Context) {
	intUserID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	filterType := c.DefaultQuery("type", "all")
	validTypes := map[string]bool{
		"all": true, "posts": true, "reddit_posts": true,
		"post_comments": true, "reddit_comments": true, "reddit_api_comments": true,
	}
	if !validTypes[filterType] {
		RespondError(c, http.StatusBadRequest, "Invalid type filter. Use all, posts, reddit_posts, post_comments, reddit_comments, or reddit_api_comments")
		return
	}

	response := gin.H{}
	if filterType == "all" || filterType == "posts" {
		posts, err := h.savedRepo.GetSavedPosts(c.Request.Context(), intUserID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to fetch saved posts")
			return
		}
		if posts == nil {
			posts = []*models.SavedPostOverview{}
		}
		response["saved_posts"] = posts
	}

	if filterType == "all" || filterType == "reddit_posts" {
		redditPosts, err := h.savedRepo.GetSavedRedditPosts(c.Request.Context(), intUserID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to fetch saved Reddit posts")
			return
		}
		filteredPosts, removed := h.pruneRemovedRedditPosts(c, intUserID, redditPosts)
		if filteredPosts == nil {
			filteredPosts = []*models.SavedRedditPost{}
		}
		response["saved_reddit_posts"] = filteredPosts
		if len(removed) > 0 {
			response["auto_removed_reddit_posts"] = removed
		}
	}

	if filterType == "all" || filterType == "post_comments" {
		comments, err := h.savedRepo.GetSavedPostComments(c.Request.Context(), intUserID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to fetch saved site comments")
			return
		}
		if comments == nil {
			comments = []*models.SavedPostComment{}
		}
		response["saved_post_comments"] = comments
	}

	if filterType == "all" || filterType == "reddit_comments" {
		comments, err := h.savedRepo.GetSavedRedditComments(c.Request.Context(), intUserID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to fetch saved comments")
			return
		}
		if comments == nil {
			comments = []*models.RedditPostComment{}
		}
		response["saved_reddit_comments"] = comments
	}

	if filterType == "all" || filterType == "reddit_api_comments" {
		apiComments, err := h.savedRepo.GetSavedRedditAPIComments(c.Request.Context(), intUserID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to fetch saved Reddit API comments")
			return
		}
		if apiComments == nil {
			apiComments = []*models.SavedRedditAPIComment{}
		}
		response["saved_reddit_api_comments"] = apiComments
	}

response["type"] = filterType
c.JSON(http.StatusOK, response)
}

func (h *SavedItemsHandler) pruneRemovedRedditPosts(c *gin.Context, userID int, posts []*models.SavedRedditPost) ([]*models.SavedRedditPost, []removedRedditPost) {
	if len(posts) == 0 {
		return posts, nil
	}

	ctx := c.Request.Context()
	var filtered []*models.SavedRedditPost
	var removed []removedRedditPost

	// Fetch Reddit API info for all posts concurrently for better performance
	type postCheckResult struct {
		post      *models.SavedRedditPost
		isRemoved bool
		err       error
	}

	resultsChan := make(chan postCheckResult, len(posts))

	// Launch concurrent checkers
	for _, post := range posts {
		go func(p *models.SavedRedditPost) {
			isRemoved := isLocallyRemovedRedditPost(p)

			if !isRemoved && h.redditClient != nil {
				apiPost, err := h.redditClient.GetPostInfo(ctx, p.Subreddit, p.RedditPostID)
				if err != nil {
					resultsChan <- postCheckResult{post: p, isRemoved: false, err: err}
					return
				} else if services.IsRedditPostRemoved(apiPost) || apiPost == nil {
					isRemoved = true
				}
			}

			resultsChan <- postCheckResult{post: p, isRemoved: isRemoved, err: nil}
		}(post)
	}

	// Collect results
	for i := 0; i < len(posts); i++ {
		result := <-resultsChan

		if result.err != nil {
			c.Error(fmt.Errorf("failed to fetch reddit post info for %s/%s: %w", result.post.Subreddit, result.post.RedditPostID, result.err))
			// Keep the post if we couldn't verify it was removed
			filtered = append(filtered, result.post)
			continue
		}

		if result.isRemoved {
			if err := h.savedRepo.RemoveRedditPost(ctx, userID, result.post.Subreddit, result.post.RedditPostID); err != nil {
				c.Error(fmt.Errorf("failed to remove stale reddit post %s/%s: %w", result.post.Subreddit, result.post.RedditPostID, err))
				filtered = append(filtered, result.post)
				continue
			}
			removed = append(removed, removedRedditPost{
				Subreddit:    result.post.Subreddit,
				RedditPostID: result.post.RedditPostID,
			})
			continue
		}
		filtered = append(filtered, result.post)
	}

	return filtered, removed
}

func isLocallyRemovedRedditPost(post *models.SavedRedditPost) bool {
	title := normalizeSavedText(post.Title)
	if title == "[removed]" || title == "[deleted]" || strings.Contains(title, "removed by moderator") {
		return true
	}

	author := normalizeSavedText(post.Author)
	if author == "[deleted]" {
		return true
	}

	return false
}

func normalizeSavedText(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

// GetHiddenItems returns hidden posts for the current user.
// @Summary      Get hidden items
// @Tags         SavedItems
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/hidden [get]
func (h *SavedItemsHandler) GetHiddenItems(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	filterType := c.DefaultQuery("type", "all")
	validTypes := map[string]bool{
		"all": true, "posts": true, "reddit_posts": true,
	}
	if !validTypes[filterType] {
		RespondError(c, http.StatusBadRequest, "Invalid type filter. Use all, posts, or reddit_posts")
		return
	}

	response := gin.H{}
	if filterType == "all" || filterType == "posts" {
		posts, err := h.savedRepo.GetHiddenPosts(c.Request.Context(), userID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to fetch hidden posts")
			return
		}
		response["hidden_posts"] = posts
	}

	if filterType == "all" || filterType == "reddit_posts" {
		redditPosts, err := h.savedRepo.GetHiddenRedditPosts(c.Request.Context(), userID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to fetch hidden Reddit posts")
			return
		}
		response["hidden_reddit_posts"] = redditPosts
	}

	response["type"] = filterType
	c.JSON(http.StatusOK, response)
}

// SavePost saves a platform post.
// @Summary      Save post
// @Tags         SavedItems
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Post ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /posts/{id}/save [post]
func (h *SavedItemsHandler) SavePost(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil || postID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
		return
	}

	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch post")
		return
	}
	if post == nil {
		RespondError(c, http.StatusNotFound, "Post not found")
		return
	}

	alreadySaved, err := h.savedRepo.IsPostSaved(c.Request.Context(), userID, postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check saved status")
		return
	}
	if alreadySaved {
		RespondError(c, http.StatusConflict, "Post already saved")
		return
	}

	if err := h.savedRepo.SavePost(c.Request.Context(), userID, postID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to save post")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"saved":   true,
		"message": "Post saved successfully",
	})
}

// UnsavePost removes a platform post from saved items.
// @Summary      Unsave post
// @Tags         SavedItems
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Post ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /posts/{id}/save [delete]
func (h *SavedItemsHandler) UnsavePost(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil || postID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
		return
	}

	if err := h.savedRepo.RemovePost(c.Request.Context(), userID, postID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to unsave post")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"saved":   false,
		"message": "Post unsaved successfully",
	})
}

// SaveRedditComment saves a Reddit comment.
// @Summary      Save Reddit comment
// @Tags         SavedItems
// @Security     BearerAuth
// @Produce      json
// @Param        subreddit  path  string  true  "Subreddit"
// @Param        postId     path  string  true  "Post ID"
// @Param        commentId  path  string  true  "Comment ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /reddit/posts/{subreddit}/{postId}/comments/{commentId}/save [post]
func (h *SavedItemsHandler) SaveRedditComment(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil || commentID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	comment, err := h.redditCommentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch comment")
		return
	}
	if comment == nil || comment.DeletedAt != nil {
		RespondError(c, http.StatusNotFound, "Comment not found")
		return
	}

	// Ensure comment belongs to route context
	if comment.Subreddit != c.Param("subreddit") || comment.RedditPostID != c.Param("postId") {
		RespondError(c, http.StatusBadRequest, "Comment does not belong to this post")
		return
	}

	if err := h.savedRepo.SaveRedditComment(c.Request.Context(), userID, commentID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to save comment")
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": true})
}

// UnsaveRedditComment removes a Reddit comment from saved items.
// @Summary      Unsave Reddit comment
// @Tags         SavedItems
// @Security     BearerAuth
// @Produce      json
// @Param        subreddit  path  string  true  "Subreddit"
// @Param        postId     path  string  true  "Post ID"
// @Param        commentId  path  string  true  "Comment ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /reddit/posts/{subreddit}/{postId}/comments/{commentId}/save [delete]
func (h *SavedItemsHandler) UnsaveRedditComment(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil || commentID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	if err := h.savedRepo.RemoveRedditComment(c.Request.Context(), userID, commentID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to unsave comment")
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": false})
}

// SaveRedditAPIComment saves a Reddit API comment by ID.
// @Summary      Save Reddit API comment
// @Tags         SavedItems
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /reddit/api-comments/save [post]
func (h *SavedItemsHandler) SaveRedditAPIComment(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req struct {
		Subreddit       string  `json:"subreddit" binding:"required"`
		RedditPostID    string  `json:"reddit_post_id" binding:"required"`
		RedditCommentID string  `json:"reddit_comment_id" binding:"required"`
		PostTitle       *string `json:"post_title"`
		PostAuthor      *string `json:"post_author"`
		CommentAuthor   string  `json:"comment_author" binding:"required"`
		CommentBody     string  `json:"comment_body" binding:"required"`
		Score           int     `json:"score"`
		CreatedUTC      *int64  `json:"created_utc"`
		ParentID        *string `json:"parent_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	comment := &models.RedditAPICommentDetails{
		Subreddit:       req.Subreddit,
		RedditPostID:    req.RedditPostID,
		RedditCommentID: req.RedditCommentID,
		PostTitle:       req.PostTitle,
		PostAuthor:      req.PostAuthor,
		CommentAuthor:   req.CommentAuthor,
		CommentBody:     req.CommentBody,
		Score:           req.Score,
		CreatedUTC:      req.CreatedUTC,
		ParentID:        req.ParentID,
	}

	if err := h.savedRepo.SaveRedditAPIComment(c.Request.Context(), userID, comment); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to save comment")
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": true})
}

// UnsaveRedditAPIComment removes a Reddit API comment from saved items.
// @Summary      Unsave Reddit API comment
// @Tags         SavedItems
// @Security     BearerAuth
// @Produce      json
// @Param        commentId  path  string  true  "Comment ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /reddit/api-comments/{commentId}/save [delete]
func (h *SavedItemsHandler) UnsaveRedditAPIComment(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	redditCommentID := c.Param("commentId")
	if redditCommentID == "" {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	if err := h.savedRepo.RemoveRedditAPIComment(c.Request.Context(), userID, redditCommentID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to unsave comment")
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": false})
}

// SavePostComment saves a platform post comment.
// @Summary      Save post comment
// @Tags         SavedItems
// @Security     BearerAuth
// @Produce      json
// @Param        commentId  path  int  true  "Comment ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /comments/{commentId}/save [post]
func (h *SavedItemsHandler) SavePostComment(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil || commentID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	comment, err := h.postCommentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch comment")
		return
	}
	if comment == nil {
		RespondError(c, http.StatusNotFound, "Comment not found")
		return
	}

	if err := h.savedRepo.SavePostComment(c.Request.Context(), userID, commentID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to save comment")
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": true})
}

// UnsavePostComment removes a platform comment from saved items.
// @Summary      Unsave post comment
// @Tags         SavedItems
// @Security     BearerAuth
// @Produce      json
// @Param        commentId  path  int  true  "Comment ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /comments/{commentId}/save [delete]
func (h *SavedItemsHandler) UnsavePostComment(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil || commentID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	if err := h.savedRepo.RemovePostComment(c.Request.Context(), userID, commentID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to unsave comment")
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": false})
}

// SaveRedditPost saves a Reddit post.
// @Summary      Save Reddit post
// @Tags         SavedItems
// @Security     BearerAuth
// @Produce      json
// @Param        subreddit  path  string  true  "Subreddit"
// @Param        postId     path  string  true  "Post ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /reddit/posts/{subreddit}/{postId}/save [post]
func (h *SavedItemsHandler) SaveRedditPost(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	subreddit := c.Param("subreddit")
	postId := c.Param("postId")

	if subreddit == "" || postId == "" {
		RespondError(c, http.StatusBadRequest, "Invalid subreddit or post ID")
		return
	}

	var req saveRedditPostRequest
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.savedRepo.SaveRedditPost(c.Request.Context(), userID, &models.RedditPostDetails{
		Subreddit:    subreddit,
		RedditPostID: postId,
		Title:        req.Title,
		Author:       req.Author,
		Score:        req.Score,
		NumComments:  req.NumComments,
		Thumbnail:    req.Thumbnail,
		CreatedUTC:   req.CreatedUTC,
	}); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to save Reddit post")
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": true})
}

// UnsaveRedditPost removes a Reddit post from saved items.
// @Summary      Unsave Reddit post
// @Tags         SavedItems
// @Security     BearerAuth
// @Produce      json
// @Param        subreddit  path  string  true  "Subreddit"
// @Param        postId     path  string  true  "Post ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /reddit/posts/{subreddit}/{postId}/save [delete]
func (h *SavedItemsHandler) UnsaveRedditPost(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	subreddit := c.Param("subreddit")
	postId := c.Param("postId")

	if subreddit == "" || postId == "" {
		RespondError(c, http.StatusBadRequest, "Invalid subreddit or post ID")
		return
	}

	if err := h.savedRepo.RemoveRedditPost(c.Request.Context(), userID, subreddit, postId); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to unsave Reddit post")
		return
	}

	c.JSON(http.StatusOK, gin.H{"saved": false})
}

// HidePost hides a platform post from feeds.
// @Summary      Hide post
// @Tags         SavedItems
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Post ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /posts/{id}/hide [post]
func (h *SavedItemsHandler) HidePost(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil || postID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
		return
	}

	if err := h.savedRepo.HidePost(c.Request.Context(), userID, postID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to hide post")
		return
	}

	c.JSON(http.StatusOK, gin.H{"hidden": true})
}

// UnhidePost un-hides a platform post.
// @Summary      Unhide post
// @Tags         SavedItems
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Post ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /posts/{id}/hide [delete]
func (h *SavedItemsHandler) UnhidePost(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil || postID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
		return
	}

	if err := h.savedRepo.UnhidePost(c.Request.Context(), userID, postID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to unhide post")
		return
	}

	c.JSON(http.StatusOK, gin.H{"hidden": false})
}

// HideRedditPost hides a Reddit post from feeds.
// @Summary      Hide Reddit post
// @Tags         SavedItems
// @Security     BearerAuth
// @Produce      json
// @Param        subreddit  path  string  true  "Subreddit"
// @Param        postId     path  string  true  "Post ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /reddit/posts/{subreddit}/{postId}/hide [post]
func (h *SavedItemsHandler) HideRedditPost(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	subreddit := c.Param("subreddit")
	postId := c.Param("postId")

	if subreddit == "" || postId == "" {
		RespondError(c, http.StatusBadRequest, "Invalid subreddit or post ID")
		return
	}

	if err := h.savedRepo.HideRedditPost(c.Request.Context(), userID, subreddit, postId); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to hide Reddit post")
		return
	}

	c.JSON(http.StatusOK, gin.H{"hidden": true})
}

// UnhideRedditPost un-hides a Reddit post.
// @Summary      Unhide Reddit post
// @Tags         SavedItems
// @Security     BearerAuth
// @Produce      json
// @Param        subreddit  path  string  true  "Subreddit"
// @Param        postId     path  string  true  "Post ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /reddit/posts/{subreddit}/{postId}/hide [delete]
func (h *SavedItemsHandler) UnhideRedditPost(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	subreddit := c.Param("subreddit")
	postId := c.Param("postId")

	if subreddit == "" || postId == "" {
		RespondError(c, http.StatusBadRequest, "Invalid subreddit or post ID")
		return
	}

	if err := h.savedRepo.UnhideRedditPost(c.Request.Context(), userID, subreddit, postId); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to unhide Reddit post")
		return
	}

	c.JSON(http.StatusOK, gin.H{"hidden": false})
}
