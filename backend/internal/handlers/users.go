package handlers

import (
	"context"
	"encoding/json"
	"fmt"
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
	userRepo     *models.UserRepository
	userProfRepo *models.UserProfileRepository
	settingsRepo *models.UserSettingsRepository
	postRepo     *models.PlatformPostRepository
	commentRepo  *models.PostCommentRepository
	authService  *services.AuthService
	hubModRepo   *models.HubModeratorRepository
	cache        services.Cache
}

// NewUsersHandler creates a new UsersHandler
func NewUsersHandler(
	userRepo *models.UserRepository,
	userProfRepo *models.UserProfileRepository,
	settingsRepo *models.UserSettingsRepository,
	postRepo *models.PlatformPostRepository,
	commentRepo *models.PostCommentRepository,
	authService *services.AuthService,
	hubModRepo *models.HubModeratorRepository,
	cache services.Cache,
) *UsersHandler {
	if cache == nil {
		cache = services.NoopCache{}
	}
	return &UsersHandler{
		userRepo:     userRepo,
		userProfRepo: userProfRepo,
		settingsRepo: settingsRepo,
		postRepo:     postRepo,
		commentRepo:  commentRepo,
		authService:  authService,
		hubModRepo:   hubModRepo,
		cache:        cache,
	}
}

// UserProfileResponse exposes safe profile fields
type UserProfileResponse struct {
	ID        int                    `json:"id"`
	Username  string                 `json:"username"`
	AvatarURL *string                `json:"avatar_url,omitempty"`
	Bio       *string                `json:"bio,omitempty"`
	Karma     int                    `json:"karma"`
	PublicKey *string                `json:"public_key,omitempty"`
	CreatedAt string                 `json:"created_at"`
	LastSeen  *string                `json:"last_seen,omitempty"`
	Moderated []ModeratedHubResponse `json:"moderated_hubs,omitempty"`
}

// ModeratedHubResponse describes a hub a user moderates
type ModeratedHubResponse struct {
	ID    int     `json:"id"`
	Name  string  `json:"name"`
	Title *string `json:"title,omitempty"`
}

// AgentStateRequest is used to fetch persistent interaction state for the authenticated user.
type AgentStateRequest struct {
	PostIDs    []int `json:"post_ids"`
	CommentIDs []int `json:"comment_ids"`
}

// AgentStateResponse returns which items the user has already interacted with.
type AgentStateResponse struct {
	VotedPosts      []int `json:"voted_posts"`
	CommentedPosts  []int `json:"commented_posts"`
	VotedComments   []int `json:"voted_comments"`
	RepliedComments []int `json:"replied_comments"`
}

// GetUserProfile handles GET /api/v1/users/:username
func (h *UsersHandler) GetUserProfile(c *gin.Context) {
	username := c.Param("username")
	h.getUserProfileResponse(c, func() (*models.User, error) {
		return h.userRepo.GetByUsername(c.Request.Context(), username)
	})
}

// GetUserProfileByID handles GET /api/v1/users/id/:id/profile
func (h *UsersHandler) GetUserProfileByID(c *gin.Context) {
	idStr := c.Param("id")
	userID, err := strconv.Atoi(idStr)
	if err != nil || userID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user id"})
		return
	}
	h.getUserProfileResponse(c, func() (*models.User, error) {
		return h.userRepo.GetByID(c.Request.Context(), userID)
	})
}

func (h *UsersHandler) getUserProfileResponse(c *gin.Context, loadUser func() (*models.User, error)) {
	user, err := loadUser()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user", "details": err.Error()})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	var viewerID int
	if v, exists := c.Get("user_id"); exists {
		if id, ok := v.(int); ok {
			viewerID = id
		}
	}

	showLastSeen := true
	profileVisibility := "public"
	if h.settingsRepo != nil {
		settings, err := h.settingsRepo.GetByUserID(c.Request.Context(), user.ID)
		if err != nil {
			// Fail closed on settings read errors.
			showLastSeen = false
			profileVisibility = "private"
		} else if settings != nil {
			showLastSeen = settings.ShowLastSeen
			if strings.TrimSpace(settings.ProfileVisibility) != "" {
				profileVisibility = settings.ProfileVisibility
			}
		}
	}

	if !canViewerSeeProfile(user.ID, viewerID, profileVisibility) {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	avatarURL := user.AvatarURL
	bio := user.Bio
	if h.userProfRepo != nil {
		profile, err := h.userProfRepo.GetByUserID(c.Request.Context(), user.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user profile", "details": err.Error()})
			return
		}
		if profile != nil {
			avatarURL = profile.AvatarURL
			bio = profile.Bio
		}
	}

	exposeLastSeen := showLastSeen || viewerID == user.ID
	if cached, ok := h.getCachedProfileResponse(c.Request.Context(), user.ID, viewerID, exposeLastSeen); ok {
		c.JSON(http.StatusOK, cached)
		return
	}

	var lastSeenPtr *string
	if exposeLastSeen {
		formatted := user.LastSeen.Format(time.RFC3339)
		lastSeenPtr = &formatted
	}

	var moderatedHubs []ModeratedHubResponse
	if h.hubModRepo != nil {
		hubs, err := h.hubModRepo.GetHubsForModerator(c.Request.Context(), user.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch moderated hubs", "details": err.Error()})
			return
		}
		for _, hub := range hubs {
			hubCopy := hub
			moderatedHubs = append(moderatedHubs, ModeratedHubResponse{
				ID:    hubCopy.HubID,
				Name:  hubCopy.Name,
				Title: hubCopy.Title,
			})
		}
	}

	response := UserProfileResponse{
		ID:        user.ID,
		Username:  user.Username,
		AvatarURL: avatarURL,
		Bio:       bio,
		Karma:     user.Karma,
		PublicKey: user.PublicKey,
		CreatedAt: user.CreatedAt.Format(time.RFC3339),
		LastSeen:  lastSeenPtr,
	}
	if len(moderatedHubs) > 0 {
		response.Moderated = moderatedHubs
	}
	h.setCachedProfileResponse(c.Request.Context(), user.ID, viewerID, exposeLastSeen, response)

	c.JSON(http.StatusOK, response)
}

func canViewerSeeProfile(profileUserID, viewerID int, profileVisibility string) bool {
	if viewerID == profileUserID {
		return true
	}

	switch strings.ToLower(strings.TrimSpace(profileVisibility)) {
	case "", "public":
		return true
	case "private", "friends_only":
		// Friendship graph is not yet implemented; treat friends_only as private for now.
		return false
	default:
		// Fail closed on invalid persisted values.
		return false
	}
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

// GetAgentState handles POST /api/v1/users/me/agent/state
func (h *UsersHandler) GetAgentState(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req AgentStateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	uid := userID.(int)

	votedPosts, err := h.postRepo.GetUserVotedPostIDs(c.Request.Context(), uid, req.PostIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch voted posts"})
		return
	}

	commentedPosts, err := h.commentRepo.GetUserCommentedPostIDs(c.Request.Context(), uid, req.PostIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch commented posts"})
		return
	}

	votedComments, err := h.commentRepo.GetUserVotedCommentIDs(c.Request.Context(), uid, req.CommentIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch voted comments"})
		return
	}

	repliedComments, err := h.commentRepo.GetUserRepliedCommentIDs(c.Request.Context(), uid, req.CommentIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch replied comments"})
		return
	}

	c.JSON(http.StatusOK, AgentStateResponse{
		VotedPosts:      votedPosts,
		CommentedPosts:  commentedPosts,
		VotedComments:   votedComments,
		RepliedComments: repliedComments,
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
	if h.userProfRepo != nil {
		if err := h.userProfRepo.Upsert(c.Request.Context(), user.ID, user.Bio, user.AvatarURL, nil); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user profile"})
			return
		}
	}
	h.invalidateProfileResponseCache(c.Request.Context(), user.ID)

	c.JSON(http.StatusOK, UserProfileResponse{
		ID:        user.ID,
		Username:  user.Username,
		AvatarURL: user.AvatarURL,
		Bio:       user.Bio,
		Karma:     user.Karma,
		PublicKey: user.PublicKey,
		CreatedAt: user.CreatedAt.Format(time.RFC3339),
		LastSeen: func() *string {
			formatted := user.LastSeen.Format(time.RFC3339)
			return &formatted
		}(),
	})
}

// GetMyProfile handles GET /api/v1/users/me/profile
func (h *UsersHandler) GetMyProfile(c *gin.Context) {
	userID := c.GetInt("user_id")
	h.getUserProfileResponse(c, func() (*models.User, error) {
		return h.userRepo.GetByID(c.Request.Context(), userID)
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

type updateEmailRequest struct {
	Email        string `json:"email" binding:"required,email"`
	EmailConfirm string `json:"email_confirm" binding:"required"`
}

// UpdateEmail handles PUT /api/v1/users/email
func (h *UsersHandler) UpdateEmail(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req updateEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request. Please provide a valid email address"})
		return
	}

	if req.Email != req.EmailConfirm {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email addresses do not match"})
		return
	}

	normalizedEmail := strings.ToLower(strings.TrimSpace(req.Email))
	if normalizedEmail == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email cannot be empty"})
		return
	}

	atIndex := strings.Index(normalizedEmail, "@")
	if atIndex < 1 || atIndex >= len(normalizedEmail)-1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid email format"})
		return
	}

	if err := h.userRepo.UpdateEmail(c.Request.Context(), userID, &normalizedEmail); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update email"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Email updated successfully"})
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
	h.invalidateProfileResponseCache(c.Request.Context(), userID.(int))

	c.JSON(http.StatusOK, gin.H{
		"last_seen": lastSeen.Format(time.RFC3339),
	})
}

func profileResponseCacheScope(profileUserID, viewerID int) string {
	if viewerID == profileUserID {
		return "owner"
	}
	return "public"
}

func profileResponseCacheKey(profileUserID, viewerID int, exposeLastSeen bool) string {
	return fmt.Sprintf("profile:response:%d:%s:%t", profileUserID, profileResponseCacheScope(profileUserID, viewerID), exposeLastSeen)
}

func (h *UsersHandler) getCachedProfileResponse(ctx context.Context, profileUserID, viewerID int, exposeLastSeen bool) (UserProfileResponse, bool) {
	cacheKey := profileResponseCacheKey(profileUserID, viewerID, exposeLastSeen)
	raw, hit, err := h.cache.Get(ctx, cacheKey)
	if err != nil || !hit || strings.TrimSpace(raw) == "" {
		return UserProfileResponse{}, false
	}

	var response UserProfileResponse
	if err := json.Unmarshal([]byte(raw), &response); err != nil {
		return UserProfileResponse{}, false
	}
	return response, true
}

func (h *UsersHandler) setCachedProfileResponse(ctx context.Context, profileUserID, viewerID int, exposeLastSeen bool, response UserProfileResponse) {
	data, err := json.Marshal(response)
	if err != nil {
		return
	}
	cacheKey := profileResponseCacheKey(profileUserID, viewerID, exposeLastSeen)
	_ = h.cache.Set(ctx, cacheKey, string(data), services.TTLUserProfile)
}

func (h *UsersHandler) invalidateProfileResponseCache(ctx context.Context, profileUserID int) {
	keys := []string{
		profileResponseCacheKey(profileUserID, profileUserID, true),
		profileResponseCacheKey(profileUserID, 0, false),
		profileResponseCacheKey(profileUserID, 0, true),
	}
	for _, key := range keys {
		_ = h.cache.Set(ctx, key, "", time.Second)
	}
}

// UpdateLastAgentPostAt updates the last_agent_post_at timestamp for the authenticated user
func (h *UsersHandler) UpdateLastAgentPostAt(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	timestamp := time.Now()

	if err := h.userRepo.UpdateLastAgentPostAt(c.Request.Context(), userID.(int), timestamp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update last agent post timestamp"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"last_agent_post_at": timestamp.Format(time.RFC3339),
	})
}

// UpdateLastAgentBrowseAt updates the last_agent_browse_at timestamp for the authenticated user
func (h *UsersHandler) UpdateLastAgentBrowseAt(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	timestamp := time.Now()

	if err := h.userRepo.UpdateLastAgentBrowseAt(c.Request.Context(), userID.(int), timestamp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update last agent browse timestamp"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"last_agent_browse_at": timestamp.Format(time.RFC3339),
	})
}
