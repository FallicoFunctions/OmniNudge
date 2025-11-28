package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/chatreddit/backend/internal/models"
	"github.com/gin-gonic/gin"
)

// UsersHandler serves public user profile data
type UsersHandler struct {
	userRepo    *models.UserRepository
	postRepo    *models.PlatformPostRepository
	commentRepo *models.PostCommentRepository
}

// NewUsersHandler creates a new UsersHandler
func NewUsersHandler(
	userRepo *models.UserRepository,
	postRepo *models.PlatformPostRepository,
	commentRepo *models.PostCommentRepository,
) *UsersHandler {
	return &UsersHandler{
		userRepo:    userRepo,
		postRepo:    postRepo,
		commentRepo: commentRepo,
	}
}

// UserProfileResponse exposes safe profile fields
type UserProfileResponse struct {
	ID        int     `json:"id"`
	Username  string  `json:"username"`
	AvatarURL *string `json:"avatar_url,omitempty"`
	Bio       *string `json:"bio,omitempty"`
	Karma     int     `json:"karma"`
	PublicKey *string `json:"public_key,omitempty"`
	CreatedAt string  `json:"created_at"`
	LastSeen  string  `json:"last_seen"`
}

// GetUserProfile handles GET /api/v1/users/:username
func (h *UsersHandler) GetUserProfile(c *gin.Context) {
	username := c.Param("username")

	user, err := h.userRepo.GetByUsername(c.Request.Context(), username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user", "details": err.Error()})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, UserProfileResponse{
		ID:        user.ID,
		Username:  user.Username,
		AvatarURL: user.AvatarURL,
		Bio:       user.Bio,
		Karma:     user.Karma,
		PublicKey: user.PublicKey,
		CreatedAt: user.CreatedAt.Format(time.RFC3339),
		LastSeen:  user.LastSeen.Format(time.RFC3339),
	})
}

// GetUserPosts handles GET /api/v1/users/:username/posts
func (h *UsersHandler) GetUserPosts(c *gin.Context) {
	username := c.Param("username")

	user, err := h.userRepo.GetByUsername(c.Request.Context(), username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user", "details": err.Error()})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 20
	}

	posts, err := h.postRepo.GetByAuthor(c.Request.Context(), user.ID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch posts", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"posts":  posts,
		"limit":  limit,
		"offset": offset,
	})
}

// GetUserComments handles GET /api/v1/users/:username/comments
func (h *UsersHandler) GetUserComments(c *gin.Context) {
	username := c.Param("username")

	user, err := h.userRepo.GetByUsername(c.Request.Context(), username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user", "details": err.Error()})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 20
	}

	comments, err := h.commentRepo.GetByUserID(c.Request.Context(), user.ID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comments", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"comments": comments,
		"limit":    limit,
		"offset":   offset,
	})
}
