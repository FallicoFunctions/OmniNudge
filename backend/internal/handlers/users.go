package handlers

import (
	"github.com/omninudge/backend/internal/ports"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/monitoring"
	"github.com/omninudge/backend/internal/services"
	"golang.org/x/crypto/bcrypt"
)

// UsersHandler serves public user profile data and profile management
type UsersHandler struct {
	userRepo     ports.UserRepository
	userProfRepo ports.UserProfileRepository
	friendRepo   ports.UserFriendshipRepository
	settingsRepo ports.UserSettingsRepository
	postRepo     ports.PlatformPostRepository
	commentRepo  ports.PostCommentRepository
	authService  *services.AuthService
	hubModRepo   ports.HubModeratorRepository
	cache        services.Cache
	thumbService *services.ThumbnailService
}

// NewUsersHandler creates a new UsersHandler
func NewUsersHandler(
	userRepo ports.UserRepository,
	userProfRepo ports.UserProfileRepository,
	friendRepo ports.UserFriendshipRepository,
	settingsRepo ports.UserSettingsRepository,
	postRepo ports.PlatformPostRepository,
	commentRepo ports.PostCommentRepository,
	authService *services.AuthService,
	hubModRepo ports.HubModeratorRepository,
	cache services.Cache,
	thumbService *services.ThumbnailService,
) *UsersHandler {
	if cache == nil {
		cache = services.NoopCache{}
	}
	if thumbService == nil {
		thumbService = services.NewThumbnailService()
	}
	return &UsersHandler{
		userRepo:     userRepo,
		userProfRepo: userProfRepo,
		friendRepo:   friendRepo,
		settingsRepo: settingsRepo,
		postRepo:     postRepo,
		commentRepo:  commentRepo,
		authService:  authService,
		hubModRepo:   hubModRepo,
		cache:        cache,
		thumbService: thumbService,
	}
}

// UserProfileResponse exposes safe profile fields
type UserProfileResponse struct {
	ID        int                    `json:"id"`
	Username  string                 `json:"username"`
	AvatarURL *string                `json:"avatar_url,omitempty"`
	Bio       *string                `json:"bio,omitempty"`
	Status    *string                `json:"status_text,omitempty"`
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
		RespondError(c, http.StatusBadRequest, "Invalid user id")
		return
	}
	h.getUserProfileResponse(c, func() (*models.User, error) {
		return h.userRepo.GetByID(c.Request.Context(), userID)
	})
}

func (h *UsersHandler) getUserProfileResponse(c *gin.Context, loadUser func() (*models.User, error)) {
	start := time.Now()
	cacheState := "miss"
	resultState := "success"
	defer func() {
		monitoring.RecordProfileRead(time.Since(start), cacheState, resultState)
	}()

	user, err := loadUser()
	if err != nil {
		resultState = "error"
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user", "details": err.Error()})
		return
	}
	if user == nil {
		resultState = "not_found"
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	var viewerID int
	if v, _ := middleware.GetOptionalUserID(c); v != 0 {
			viewerID = v
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

	viewerIsFriend := false
	if viewerID > 0 && viewerID != user.ID && strings.EqualFold(strings.TrimSpace(profileVisibility), "friends_only") && h.friendRepo != nil {
		isFriend, err := h.friendRepo.AreUsersFriends(c.Request.Context(), user.ID, viewerID)
		if err != nil {
			resultState = "error"
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate profile access", "details": err.Error()})
			return
		}
		viewerIsFriend = isFriend
	}

	if !canViewerSeeProfile(user.ID, viewerID, profileVisibility, viewerIsFriend) {
		resultState = "not_found"
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	avatarURL := user.AvatarURL
	bio := user.Bio
	var statusText *string
	if h.userProfRepo != nil {
		profile, err := h.userProfRepo.GetByUserID(c.Request.Context(), user.ID)
		if err != nil {
			resultState = "error"
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user profile", "details": err.Error()})
			return
		}
		if profile != nil {
			avatarURL = profile.AvatarURL
			bio = profile.Bio
			statusText = profile.StatusText
		}
	}

	exposeLastSeen := showLastSeen || viewerID == user.ID
	cacheScope := profileResponseCacheScope(user.ID, viewerID)
	if cached, ok := h.getCachedProfileResponse(c.Request.Context(), user.ID, viewerID, exposeLastSeen); ok {
		cacheState = "hit"
		monitoring.RecordProfileCacheAccess(true, cacheScope)
		c.JSON(http.StatusOK, cached)
		return
	}
	monitoring.RecordProfileCacheAccess(false, cacheScope)

	var lastSeenPtr *string
	if exposeLastSeen {
		formatted := user.LastSeen.Format(time.RFC3339)
		lastSeenPtr = &formatted
	}

	var moderatedHubs []ModeratedHubResponse
	if h.hubModRepo != nil {
		hubs, err := h.hubModRepo.GetHubsForModerator(c.Request.Context(), user.ID)
		if err != nil {
			resultState = "error"
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
		Status:    statusText,
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

func canViewerSeeProfile(profileUserID, viewerID int, profileVisibility string, viewerIsFriend bool) bool {
	if viewerID == profileUserID {
		return true
	}

	switch strings.ToLower(strings.TrimSpace(profileVisibility)) {
	case "", "public":
		return true
	case "friends_only":
		return viewerIsFriend
	case "private":
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
		RespondError(c, http.StatusNotFound, "User not found")
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
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req AgentStateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	uid := userID

	votedPosts, err := h.postRepo.GetUserVotedPostIDs(c.Request.Context(), uid, req.PostIDs)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch voted posts")
		return
	}

	commentedPosts, err := h.commentRepo.GetUserCommentedPostIDs(c.Request.Context(), uid, req.PostIDs)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch commented posts")
		return
	}

	votedComments, err := h.commentRepo.GetUserVotedCommentIDs(c.Request.Context(), uid, req.CommentIDs)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch voted comments")
		return
	}

	repliedComments, err := h.commentRepo.GetUserRepliedCommentIDs(c.Request.Context(), uid, req.CommentIDs)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch replied comments")
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
		RespondError(c, http.StatusNotFound, "User not found")
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
	Status    *string `json:"status_text"`
}

const (
	maxAvatarUploadSize = 5 * 1024 * 1024
	avatarThumbSize     = 200
)

func localAvatarDiskPath(avatarURL string) (string, bool) {
	if !strings.HasPrefix(avatarURL, "/uploads/avatars/") {
		return "", false
	}
	trimmed := strings.TrimPrefix(avatarURL, "/")
	cleaned := filepath.Clean(trimmed)
	if cleaned != trimmed || filepath.IsAbs(cleaned) {
		return "", false
	}
	avatarsRoot := filepath.Clean(filepath.Join("uploads", "avatars"))
	if cleaned != avatarsRoot && !strings.HasPrefix(cleaned, avatarsRoot+string(os.PathSeparator)) {
		return "", false
	}
	return cleaned, true
}

func isRequestBodyTooLarge(err error) bool {
	if err == nil {
		return false
	}
	var maxBytesErr *http.MaxBytesError
	if errors.As(err, &maxBytesErr) {
		return true
	}
	return strings.Contains(strings.ToLower(err.Error()), "request body too large")
}

// UpdateProfile handles PUT /api/v1/users/profile
func (h *UsersHandler) UpdateProfile(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req updateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	// Get current user
	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch user")
		return
	}
	if user == nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	// Validate bio length if provided
	if req.Bio != nil {
		bio := strings.TrimSpace(*req.Bio)
		if len(bio) > 500 {
			RespondError(c, http.StatusBadRequest, "Bio must be 500 characters or less")
			return
		}
		if bio == "" {
			user.Bio = nil
		} else {
			user.Bio = &bio
		}
	}

	var statusText *string
	if h.userProfRepo != nil {
		existingProfile, err := h.userProfRepo.GetByUserID(c.Request.Context(), user.ID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to fetch user profile")
			return
		}
		if existingProfile != nil {
			statusText = existingProfile.StatusText
		}
	}
	if req.Status != nil {
		status := strings.TrimSpace(*req.Status)
		if len(status) > 500 {
			RespondError(c, http.StatusBadRequest, "Status text must be 500 characters or less")
			return
		}
		if status == "" {
			statusText = nil
		} else {
			statusText = &status
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
				RespondError(c, http.StatusBadRequest, "Avatar URL must be a valid HTTP(S) URL")
				return
			}
			user.AvatarURL = &avatarURL
		}
	}
	// Update profile
	if err := h.userRepo.UpdateProfile(c.Request.Context(), user.ID, user.Bio, user.AvatarURL, nil); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update profile")
		return
	}
	if h.userProfRepo != nil {
		if err := h.userProfRepo.Upsert(c.Request.Context(), user.ID, user.Bio, user.AvatarURL, statusText); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to update user profile")
			return
		}
	}
	h.invalidateProfileResponseCache(c.Request.Context(), user.ID)

	c.JSON(http.StatusOK, UserProfileResponse{
		ID:        user.ID,
		Username:  user.Username,
		AvatarURL: user.AvatarURL,
		Bio:       user.Bio,
		Status:    statusText,
		Karma:     user.Karma,
		PublicKey: user.PublicKey,
		CreatedAt: user.CreatedAt.Format(time.RFC3339),
		LastSeen: func() *string {
			formatted := user.LastSeen.Format(time.RFC3339)
			return &formatted
		}(),
	})
}

// UploadMyAvatar handles POST /api/v1/users/me/avatar
func (h *UsersHandler) UploadMyAvatar(c *gin.Context) {
	userID := c.GetInt("user_id")

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAvatarUploadSize+1024)
	file, header, err := c.Request.FormFile("avatar")
	if err != nil {
		if isRequestBodyTooLarge(err) {
			RespondError(c, http.StatusRequestEntityTooLarge, "Avatar exceeds 5MB limit")
			return
		}
		// Support generic uploader clients that use "file".
		file, header, err = c.Request.FormFile("file")
		if err != nil {
			if isRequestBodyTooLarge(err) {
				RespondError(c, http.StatusRequestEntityTooLarge, "Avatar exceeds 5MB limit")
				return
			}
			c.JSON(http.StatusBadRequest, gin.H{"error": "Avatar file is required", "details": err.Error()})
			return
		}
	}
	defer file.Close()

	if header.Size <= 0 {
		RespondError(c, http.StatusBadRequest, "Empty avatar file is not allowed")
		return
	}

	safeName := filepath.Base(header.Filename)
	ext := strings.ToLower(filepath.Ext(safeName))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp":
	default:
		RespondError(c, http.StatusUnsupportedMediaType, "Unsupported avatar file extension")
		return
	}

	uploadDir := filepath.Join("uploads", "avatars")
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare avatar storage", "details": err.Error()})
		return
	}

	filename := fmt.Sprintf("avatar_%d_%d%s", userID, time.Now().UnixNano(), ext)
	originalPath := filepath.Join(uploadDir, filename)
	dst, err := os.Create(originalPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create avatar file", "details": err.Error()})
		return
	}
	defer dst.Close()
	defer func() { _ = os.Remove(originalPath) }()

	var thumbPath string
	persistThumb := false
	defer func() {
		if !persistThumb && thumbPath != "" {
			_ = os.Remove(thumbPath)
		}
	}()

	limited := io.LimitReader(file, maxAvatarUploadSize+1)
	var sniff [512]byte
	n, _ := io.ReadFull(limited, sniff[:])
	total := int64(n)

	detected := http.DetectContentType(sniff[:n])
	if !services.IsImageType(detected) {
		RespondError(c, http.StatusUnsupportedMediaType, "Avatar must be an image")
		return
	}
	if !middleware.ValidateExtensionMatchesMIME(safeName, detected) {
		RespondError(c, http.StatusUnsupportedMediaType, "Avatar extension does not match file type")
		return
	}
	if !middleware.ValidateNoSuspiciousSignatures(sniff[:n], detected) {
		RespondError(c, http.StatusBadRequest, "Avatar file contains suspicious data")
		return
	}
	if n > 0 {
		if _, err := dst.Write(sniff[:n]); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to write avatar file", "details": err.Error()})
			return
		}
	}

	written, err := io.Copy(dst, limited)
	total += written
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save avatar file", "details": err.Error()})
		return
	}
	if total > maxAvatarUploadSize {
		RespondError(c, http.StatusRequestEntityTooLarge, "Avatar exceeds 5MB limit")
		return
	}

	thumbPath, err = h.thumbService.GenerateSquareThumbnail(originalPath, avatarThumbSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate avatar thumbnail", "details": err.Error()})
		return
	}

	width, height, err := h.thumbService.GetImageDimensions(thumbPath)
	if err != nil || width != avatarThumbSize || height != avatarThumbSize {
		RespondError(c, http.StatusInternalServerError, "Failed to verify avatar thumbnail dimensions")
		return
	}

	avatarURL := "/" + filepath.ToSlash(thumbPath)

	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch user")
		return
	}
	if user == nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}
	var oldAvatarLocalPath string
	if user.AvatarURL != nil {
		if path, ok := localAvatarDiskPath(*user.AvatarURL); ok {
			oldAvatarLocalPath = path
		}
	}
	user.AvatarURL = &avatarURL

	if err := h.userRepo.UpdateProfile(c.Request.Context(), user.ID, user.Bio, user.AvatarURL, nil); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update user avatar")
		return
	}

	if h.userProfRepo != nil {
		var statusText *string
		profile, err := h.userProfRepo.GetByUserID(c.Request.Context(), user.ID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to fetch user profile")
			return
		}
		if profile != nil {
			statusText = profile.StatusText
			if profile.Bio != nil {
				user.Bio = profile.Bio
			}
		}
		if err := h.userProfRepo.Upsert(c.Request.Context(), user.ID, user.Bio, user.AvatarURL, statusText); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to persist user avatar")
			return
		}
	}

	h.invalidateProfileResponseCache(c.Request.Context(), user.ID)
	persistThumb = true
	if oldAvatarLocalPath != "" && oldAvatarLocalPath != thumbPath {
		_ = os.Remove(oldAvatarLocalPath)
	}

	c.JSON(http.StatusOK, gin.H{
		"avatar_url":     avatarURL,
		"thumbnail_size": avatarThumbSize,
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
		RespondError(c, http.StatusBadRequest, "Invalid request. Password must be at least 8 characters")
		return
	}

	// Get current user
	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch user")
		return
	}
	if user == nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	// Verify current password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		RespondError(c, http.StatusUnauthorized, "Current password is incorrect")
		return
	}

	// Hash new password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to hash password")
		return
	}

	// Update password
	if err := h.userRepo.UpdatePassword(c.Request.Context(), user.ID, string(hashedPassword)); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update password")
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
		RespondError(c, http.StatusBadRequest, "Invalid request. Please provide a valid email address")
		return
	}

	if req.Email != req.EmailConfirm {
		RespondError(c, http.StatusBadRequest, "Email addresses do not match")
		return
	}

	normalizedEmail := strings.ToLower(strings.TrimSpace(req.Email))
	if normalizedEmail == "" {
		RespondError(c, http.StatusBadRequest, "Email cannot be empty")
		return
	}

	atIndex := strings.Index(normalizedEmail, "@")
	if atIndex < 1 || atIndex >= len(normalizedEmail)-1 {
		RespondError(c, http.StatusBadRequest, "Invalid email format")
		return
	}

	if err := h.userRepo.UpdateEmail(c.Request.Context(), userID, &normalizedEmail); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update email")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Email updated successfully"})
}

// Ping updates the user's last_seen timestamp without fetching the profile
func (h *UsersHandler) Ping(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	lastSeen := time.Now().UTC()

	if err := h.userRepo.UpdateLastSeen(c.Request.Context(), userID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update last seen")
		return
	}
	h.invalidateProfileResponseCache(c.Request.Context(), userID)

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
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	timestamp := time.Now()

	if err := h.userRepo.UpdateLastAgentPostAt(c.Request.Context(), userID, timestamp); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update last agent post timestamp")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"last_agent_post_at": timestamp.Format(time.RFC3339),
	})
}

// UpdateLastAgentBrowseAt updates the last_agent_browse_at timestamp for the authenticated user
func (h *UsersHandler) UpdateLastAgentBrowseAt(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	timestamp := time.Now()

	if err := h.userRepo.UpdateLastAgentBrowseAt(c.Request.Context(), userID, timestamp); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update last agent browse timestamp")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"last_agent_browse_at": timestamp.Format(time.RFC3339),
	})
}
