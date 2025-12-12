package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"golang.org/x/crypto/bcrypt"
)

// UsersHandler serves public user profile data and profile management
type UsersHandler struct {
	userRepo    *models.UserRepository
	postRepo    *models.PlatformPostRepository
	commentRepo *models.PostCommentRepository
	authService *services.AuthService
}

// NewUsersHandler creates a new UsersHandler
func NewUsersHandler(
	userRepo *models.UserRepository,
	postRepo *models.PlatformPostRepository,
	commentRepo *models.PostCommentRepository,
	authService *services.AuthService,
) *UsersHandler {
	return &UsersHandler{
		userRepo:    userRepo,
		postRepo:    postRepo,
		commentRepo: commentRepo,
		authService: authService,
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

type updateProfileRequest struct {
	Bio       *string `json:"bio"`
	AvatarURL *string `json:"avatar_url"`
}

// UpdateProfile handles PUT /api/v1/users/profile
func (h *UsersHandler) UpdateProfile(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req updateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Get current user
	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user"})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Validate bio length if provided
	if req.Bio != nil {
		bio := strings.TrimSpace(*req.Bio)
		if len(bio) > 500 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Bio must be 500 characters or less"})
			return
		}
		if bio == "" {
			user.Bio = nil
		} else {
			user.Bio = &bio
		}
	}

	// Validate avatar URL if provided
	if req.AvatarURL != nil {
		avatarURL := strings.TrimSpace(*req.AvatarURL)
		if avatarURL == "" {
			user.AvatarURL = nil
		} else {
			// Basic URL validation
			if !strings.HasPrefix(avatarURL, "http://") && !strings.HasPrefix(avatarURL, "https://") {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Avatar URL must be a valid HTTP(S) URL"})
				return
			}
			user.AvatarURL = &avatarURL
		}
	}

	// Update profile
	if err := h.userRepo.UpdateProfile(c.Request.Context(), user.ID, user.Bio, user.AvatarURL); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
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

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8"`
}

// ChangePassword handles POST /api/v1/users/change-password
func (h *UsersHandler) ChangePassword(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request. Password must be at least 8 characters"})
		return
	}

	// Get current user
	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user"})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Verify current password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Current password is incorrect"})
		return
	}

	// Hash new password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	// Update password
	if err := h.userRepo.UpdatePassword(c.Request.Context(), user.ID, string(hashedPassword)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password changed successfully"})
}

// Ping updates the user's last_seen timestamp without fetching the profile
func (h *UsersHandler) Ping(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	lastSeen := time.Now().UTC()

	if err := h.userRepo.UpdateLastSeen(c.Request.Context(), userID.(int)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update last seen"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"last_seen": lastSeen.Format(time.RFC3339),
	})
}
