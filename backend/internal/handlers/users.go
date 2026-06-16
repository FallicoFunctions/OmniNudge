package handlers

import (
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

	"github.com/omninudge/backend/internal/ports"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	zlog "github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/sync/errgroup"

	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/monitoring"
	"github.com/omninudge/backend/internal/services"
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
	pool         *pgxpool.Pool
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
	pool *pgxpool.Pool,
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
		pool:         pool,
	}
}

// UserProfileResponse exposes safe profile fields
type UserProfileResponse struct {
	ID        int                    `json:"id"`
	Username  string                 `json:"username"`
	AvatarURL *string                `json:"avatar_url,omitempty"`
	BannerURL *string                `json:"banner_url,omitempty"`
	Bio       *string                `json:"bio,omitempty"`
	Status    *string                `json:"status_text,omitempty"`
	Location  *string                `json:"location,omitempty"`
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

// LockedProfileResponse is returned for private profiles viewed by a non-friend:
// only the username is exposed, so the viewer can send a friend request.
type LockedProfileResponse struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Locked   bool   `json:"locked"`
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

// GetUserProfile returns a public user profile by username.
// @Summary      Get user profile
// @Tags         Users
// @Produce      json
// @Param        username  path  string  true  "Username"
// @Success      200  {object}  UserProfileResponse
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/{username} [get]
func (h *UsersHandler) GetUserProfile(c *gin.Context) {
	username := c.Param("username")
	h.getUserProfileResponse(c, func() (*models.User, error) {
		return h.userRepo.GetByUsername(c.Request.Context(), username)
	})
}

// GetUserProfileByID returns a public user profile by numeric ID.
// @Summary      Get user profile by ID
// @Tags         Users
// @Produce      json
// @Param        id  path  int  true  "User ID"
// @Success      200  {object}  UserProfileResponse
// @Failure      400  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/id/{id}/profile [get]
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
		RespondError(c, http.StatusInternalServerError, "Failed to fetch user")
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
	if isPendingDeletionHiddenFromViewer(user, viewerID) {
		resultState = "not_found"
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	// Point 1: if the profile owner has blocked the viewer, return 404 so the
	// blocked party cannot confirm the account exists.
	if viewerID != 0 && viewerID != user.ID && h.pool != nil {
		blocked, err := models.IsBlockedBidirectional(c.Request.Context(), h.pool, user.ID, viewerID)
		if err != nil {
			resultState = "error"
			RespondError(c, http.StatusInternalServerError, "Failed to load profile")
			return
		}
		if blocked {
			resultState = "not_found"
			RespondError(c, http.StatusNotFound, "User not found")
			return
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

	viewerIsFriend := false
	if viewerID > 0 && viewerID != user.ID && strings.EqualFold(strings.TrimSpace(profileVisibility), "private") && h.friendRepo != nil {
		isFriend, err := h.friendRepo.AreUsersFriends(c.Request.Context(), user.ID, viewerID)
		if err != nil {
			resultState = "error"
			RespondError(c, http.StatusInternalServerError, "Failed to validate profile access")
			return
		}
		viewerIsFriend = isFriend
	}

	if !canViewerSeeProfile(user.ID, viewerID, profileVisibility, viewerIsFriend) {
		resultState = "locked"
		c.JSON(http.StatusOK, LockedProfileResponse{
			ID:       user.ID,
			Username: user.Username,
			Locked:   true,
		})
		return
	}

	avatarURL := user.AvatarURL
	bio := user.Bio
	var statusText *string
	var bannerURL *string
	var location *string
	if h.userProfRepo != nil {
		profile, err := h.userProfRepo.GetByUserID(c.Request.Context(), user.ID)
		if err != nil {
			resultState = "error"
			RespondError(c, http.StatusInternalServerError, "Failed to fetch user profile")
			return
		}
		if profile != nil {
			avatarURL = profile.AvatarURL
			bio = profile.Bio
			statusText = profile.StatusText
			bannerURL = profile.BannerURL
			location = profile.Location
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
			RespondError(c, http.StatusInternalServerError, "Failed to fetch moderated hubs")
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
		BannerURL: bannerURL,
		Bio:       bio,
		Status:    statusText,
		Location:  location,
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

func isPendingDeletionHiddenFromViewer(user *models.User, viewerID int) bool {
	if user == nil || user.DeletedAt == nil {
		return false
	}
	return viewerID != user.ID
}

func canViewerSeeProfile(profileUserID, viewerID int, profileVisibility string, viewerIsFriend bool) bool {
	if viewerID == profileUserID {
		return true
	}

	switch strings.ToLower(strings.TrimSpace(profileVisibility)) {
	case "", "public":
		return true
	case "private":
		return viewerIsFriend
	default:
		// Fail closed on invalid persisted values.
		return false
	}
}

// viewerCanSeeProfile applies the profile-visibility rules used by the main profile
// endpoint to secondary per-user endpoints (top friends, friends list, mutual
// friends, etc.). It is a package-level helper (rather than a method) so any
// handler with access to a settings and friendship repository can reuse it.
func viewerCanSeeProfile(ctx context.Context, settingsRepo ports.UserSettingsRepository, friendRepo ports.UserFriendshipRepository, user *models.User, viewerID int) (bool, error) {
	if viewerID == user.ID {
		return true, nil
	}

	profileVisibility := "public"
	if settingsRepo != nil {
		settings, err := settingsRepo.GetByUserID(ctx, user.ID)
		if err != nil {
			return false, err
		}
		if settings != nil && strings.TrimSpace(settings.ProfileVisibility) != "" {
			profileVisibility = settings.ProfileVisibility
		}
	}

	viewerIsFriend := false
	if strings.EqualFold(strings.TrimSpace(profileVisibility), "private") &&
		friendRepo != nil && viewerID > 0 {
		isFriend, err := friendRepo.AreUsersFriends(ctx, user.ID, viewerID)
		if err != nil {
			return false, err
		}
		viewerIsFriend = isFriend
	}

	return canViewerSeeProfile(user.ID, viewerID, profileVisibility, viewerIsFriend), nil
}

// GetUserPosts returns posts by a user.
// @Summary      Get user posts
// @Tags         Users
// @Produce      json
// @Param        username  path   string  true   "Username"
// @Param        limit     query  int     false  "Page size (default 20)"
// @Param        offset    query  int     false  "Offset"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/{username}/posts [get]
func (h *UsersHandler) GetUserPosts(c *gin.Context) {
	username := c.Param("username")

	user, err := h.userRepo.GetByUsername(c.Request.Context(), username)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch user")
		return
	}
	if user == nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}
	viewerID, _ := middleware.GetOptionalUserID(c)
	if isPendingDeletionHiddenFromViewer(user, viewerID) {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 20
	}

	var posts []*models.PlatformPost
	var total int
	g, gCtx := errgroup.WithContext(c.Request.Context())
	g.Go(func() error {
		var err error
		posts, err = h.postRepo.GetByAuthor(gCtx, user.ID, limit, offset)
		return err
	})
	g.Go(func() error {
		var err error
		total, err = h.postRepo.CountByAuthor(gCtx, user.ID)
		return err
	})
	if err := g.Wait(); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch posts")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"posts":  posts,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// GetAgentState returns the authenticated user's agent activity state.
// @Summary      Get agent state
// @Tags         Users
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/agent/state [post]
func (h *UsersHandler) GetAgentState(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req AgentStateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
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

// GetUserComments returns comments by a user.
// @Summary      Get user comments
// @Tags         Users
// @Produce      json
// @Param        username  path   string  true   "Username"
// @Param        limit     query  int     false  "Page size (default 20)"
// @Param        offset    query  int     false  "Offset"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/{username}/comments [get]
func (h *UsersHandler) GetUserComments(c *gin.Context) {
	username := c.Param("username")

	user, err := h.userRepo.GetByUsername(c.Request.Context(), username)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch user")
		return
	}
	if user == nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}
	viewerID, _ := middleware.GetOptionalUserID(c)
	if isPendingDeletionHiddenFromViewer(user, viewerID) {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 20
	}

	var comments []*models.PostComment
	var total int
	g, gCtx := errgroup.WithContext(c.Request.Context())
	g.Go(func() error {
		var err error
		comments, err = h.commentRepo.GetByUserID(gCtx, user.ID, limit, offset)
		return err
	})
	g.Go(func() error {
		var err error
		total, err = h.commentRepo.CountByUserID(gCtx, user.ID)
		return err
	})
	if err := g.Wait(); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch comments")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"comments": comments,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	})
}

type updateProfileRequest struct {
	Bio       *string `json:"bio"`
	AvatarURL *string `json:"avatar_url"`
	Status    *string `json:"status_text"`
	BannerURL *string `json:"banner_url"`
	Location  *string `json:"location"`
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

// normalizeOptionalText trims an optional profile text field and enforces a max
// length. A blank result normalizes to nil so the field is cleared. ok is false
// if the trimmed value exceeds maxLen.
func normalizeOptionalText(raw string, maxLen int) (value *string, ok bool) {
	trimmed := strings.TrimSpace(raw)
	if len(trimmed) > maxLen {
		return nil, false
	}
	if trimmed == "" {
		return nil, true
	}
	return &trimmed, true
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

// UpdateProfile updates the authenticated user's profile.
// @Summary      Update profile
// @Tags         Users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      200  {object}  models.User
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/profile [put]
func (h *UsersHandler) UpdateProfile(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

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
		bio, ok := normalizeOptionalText(*req.Bio, 500)
		if !ok {
			RespondError(c, http.StatusBadRequest, "Bio must be 500 characters or less")
			return
		}
		user.Bio = bio
	}

	var statusText *string
	var bannerURL *string
	var topFriendsJSON *string
	var location *string
	if h.userProfRepo != nil {
		existingProfile, err := h.userProfRepo.GetByUserID(c.Request.Context(), user.ID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to fetch user profile")
			return
		}
		if existingProfile != nil {
			statusText = existingProfile.StatusText
			bannerURL = existingProfile.BannerURL
			topFriendsJSON = existingProfile.TopFriendsJSON
			location = existingProfile.Location
		}
	}
	if req.Status != nil {
		status, ok := normalizeOptionalText(*req.Status, 500)
		if !ok {
			RespondError(c, http.StatusBadRequest, "Status text must be 500 characters or less")
			return
		}
		statusText = status
	}

	// Validate avatar URL if provided
	if req.AvatarURL != nil {
		avatarURL := strings.TrimSpace(*req.AvatarURL)
		if avatarURL == "" {
			user.AvatarURL = nil
		} else {
			if !strings.HasPrefix(avatarURL, "http://") && !strings.HasPrefix(avatarURL, "https://") && !strings.HasPrefix(avatarURL, "/uploads/avatars/") {
				RespondError(c, http.StatusBadRequest, "Avatar URL must be a valid HTTP(S) URL")
				return
			}
			user.AvatarURL = &avatarURL
		}
	}

	// Validate and apply banner URL if provided
	if req.BannerURL != nil {
		bURL := strings.TrimSpace(*req.BannerURL)
		if bURL == "" {
			bannerURL = nil
		} else {
			if !strings.HasPrefix(bURL, "http://") && !strings.HasPrefix(bURL, "https://") && !strings.HasPrefix(bURL, "/uploads/banners/") {
				RespondError(c, http.StatusBadRequest, "Banner URL must be a valid HTTP(S) URL")
				return
			}
			bannerURL = &bURL
		}
	}

	// Validate location if provided
	if req.Location != nil {
		loc, ok := normalizeOptionalText(*req.Location, 100)
		if !ok {
			RespondError(c, http.StatusBadRequest, "Location must be 100 characters or less")
			return
		}
		location = loc
	}

	// Update profile
	if err := h.userRepo.UpdateProfile(c.Request.Context(), user.ID, user.Bio, user.AvatarURL, nil); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update profile")
		return
	}
	if h.userProfRepo != nil {
		if err := h.userProfRepo.Upsert(c.Request.Context(), user.ID, user.Bio, user.AvatarURL, statusText, bannerURL, topFriendsJSON, location); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to update user profile")
			return
		}
	}
	h.invalidateProfileResponseCache(c.Request.Context(), user.ID)

	c.JSON(http.StatusOK, UserProfileResponse{
		ID:        user.ID,
		Username:  user.Username,
		AvatarURL: user.AvatarURL,
		BannerURL: bannerURL,
		Bio:       user.Bio,
		Status:    statusText,
		Location:  location,
		Karma:     user.Karma,
		PublicKey: user.PublicKey,
		CreatedAt: user.CreatedAt.Format(time.RFC3339),
		LastSeen: func() *string {
			formatted := user.LastSeen.Format(time.RFC3339)
			return &formatted
		}(),
	})
}

// UploadMyAvatar uploads a new avatar image for the authenticated user.
// @Summary      Upload avatar
// @Tags         Users
// @Security     BearerAuth
// @Accept       multipart/form-data
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/avatar [post]
func (h *UsersHandler) UploadMyAvatar(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

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
			RespondError(c, http.StatusBadRequest, "Avatar file is required")
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
		RespondError(c, http.StatusInternalServerError, "Failed to prepare avatar storage")
		return
	}

	filename := fmt.Sprintf("avatar_%d_%d%s", userID, time.Now().UnixNano(), ext)
	originalPath := filepath.Join(uploadDir, filename)
	dst, err := os.Create(originalPath)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create avatar file")
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
			RespondError(c, http.StatusInternalServerError, "Failed to write avatar file")
			return
		}
	}

	written, err := io.Copy(dst, limited)
	total += written
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to save avatar file")
		return
	}
	if total > maxAvatarUploadSize {
		RespondError(c, http.StatusRequestEntityTooLarge, "Avatar exceeds 5MB limit")
		return
	}

	thumbPath, err = h.thumbService.GenerateSquareThumbnail(originalPath, avatarThumbSize)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to generate avatar thumbnail")
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
		var bannerURL *string
		var topFriendsJSON *string
		var location *string
		profile, err := h.userProfRepo.GetByUserID(c.Request.Context(), user.ID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to fetch user profile")
			return
		}
		if profile != nil {
			statusText = profile.StatusText
			bannerURL = profile.BannerURL
			topFriendsJSON = profile.TopFriendsJSON
			location = profile.Location
			if profile.Bio != nil {
				user.Bio = profile.Bio
			}
		}
		if err := h.userProfRepo.Upsert(c.Request.Context(), user.ID, user.Bio, user.AvatarURL, statusText, bannerURL, topFriendsJSON, location); err != nil {
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

const maxBannerUploadSize = 10 * 1024 * 1024

func localBannerDiskPath(bannerURL string) (string, bool) {
	if !strings.HasPrefix(bannerURL, "/uploads/banners/") {
		return "", false
	}
	trimmed := strings.TrimPrefix(bannerURL, "/")
	cleaned := filepath.Clean(trimmed)
	if cleaned != trimmed || filepath.IsAbs(cleaned) {
		return "", false
	}
	bannersRoot := filepath.Clean(filepath.Join("uploads", "banners"))
	if cleaned != bannersRoot && !strings.HasPrefix(cleaned, bannersRoot+string(os.PathSeparator)) {
		return "", false
	}
	return cleaned, true
}

// UploadMyBanner uploads a new cover/banner image for the authenticated user.
// @Summary      Upload banner
// @Tags         Users
// @Security     BearerAuth
// @Accept       multipart/form-data
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/banner [post]
func (h *UsersHandler) UploadMyBanner(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBannerUploadSize+1024)
	file, header, err := c.Request.FormFile("banner")
	if err != nil {
		if isRequestBodyTooLarge(err) {
			RespondError(c, http.StatusRequestEntityTooLarge, "Banner exceeds 10MB limit")
			return
		}
		file, header, err = c.Request.FormFile("file")
		if err != nil {
			if isRequestBodyTooLarge(err) {
				RespondError(c, http.StatusRequestEntityTooLarge, "Banner exceeds 10MB limit")
				return
			}
			RespondError(c, http.StatusBadRequest, "Banner file is required")
			return
		}
	}
	defer file.Close()

	if header.Size <= 0 {
		RespondError(c, http.StatusBadRequest, "Empty banner file is not allowed")
		return
	}

	safeName := filepath.Base(header.Filename)
	ext := strings.ToLower(filepath.Ext(safeName))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp":
	default:
		RespondError(c, http.StatusUnsupportedMediaType, "Unsupported banner file extension")
		return
	}

	uploadDir := filepath.Join("uploads", "banners")
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to prepare banner storage")
		return
	}

	filename := fmt.Sprintf("banner_%d_%d%s", userID, time.Now().UnixNano(), ext)
	filePath := filepath.Join(uploadDir, filename)
	dst, err := os.Create(filePath)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create banner file")
		return
	}
	defer dst.Close()

	persist := false
	defer func() {
		if !persist {
			_ = os.Remove(filePath)
		}
	}()

	limited := io.LimitReader(file, maxBannerUploadSize+1)
	var sniff [512]byte
	n, _ := io.ReadFull(limited, sniff[:])
	total := int64(n)

	detected := http.DetectContentType(sniff[:n])
	if !services.IsImageType(detected) {
		RespondError(c, http.StatusUnsupportedMediaType, "Banner must be an image")
		return
	}
	if !middleware.ValidateExtensionMatchesMIME(safeName, detected) {
		RespondError(c, http.StatusUnsupportedMediaType, "Banner extension does not match file type")
		return
	}
	if !middleware.ValidateNoSuspiciousSignatures(sniff[:n], detected) {
		RespondError(c, http.StatusBadRequest, "Banner file contains suspicious data")
		return
	}
	if n > 0 {
		if _, err := dst.Write(sniff[:n]); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to write banner file")
			return
		}
	}
	written, err := io.Copy(dst, limited)
	total += written
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to save banner file")
		return
	}
	if total > maxBannerUploadSize {
		RespondError(c, http.StatusRequestEntityTooLarge, "Banner exceeds 10MB limit")
		return
	}

	bannerURL := "/" + filepath.ToSlash(filePath)

	if h.userProfRepo != nil {
		var oldBannerURL *string
		existing, err := h.userProfRepo.GetByUserID(c.Request.Context(), userID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to fetch user profile")
			return
		}
		if existing != nil {
			oldBannerURL = existing.BannerURL
		}
		bURL := bannerURL
		if err := h.userProfRepo.UpdateBannerURL(c.Request.Context(), userID, &bURL); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to persist banner")
			return
		}
		if oldBannerURL != nil {
			if path, ok := localBannerDiskPath(*oldBannerURL); ok {
				_ = os.Remove(path)
			}
		}
	}

	h.invalidateProfileResponseCache(c.Request.Context(), userID)
	persist = true

	c.JSON(http.StatusOK, gin.H{
		"banner_url": bannerURL,
	})
}

// GetMyProfile returns the authenticated user's own profile.
// @Summary      Get my profile
// @Tags         Users
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  UserProfileResponse
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/profile [get]
func (h *UsersHandler) GetMyProfile(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	h.getUserProfileResponse(c, func() (*models.User, error) {
		return h.userRepo.GetByID(c.Request.Context(), userID)
	})
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8"`
}

// ChangePassword changes the authenticated user's password.
// @Summary      Change password
// @Tags         Users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/change-password [post]
func (h *UsersHandler) ChangePassword(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

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
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), 12)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to hash password")
		return
	}

	// Update password
	if err := h.userRepo.UpdatePassword(c.Request.Context(), user.ID, string(hashedPassword)); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update password")
		return
	}
	if err := h.userRepo.IncrementTokenVersion(c.Request.Context(), userID); err != nil {
		zlog.Error().Err(err).Msg("Failed to increment token version after password change")
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password changed successfully"})
}

type updateEmailRequest struct {
	Email        string `json:"email" binding:"required,email"`
	EmailConfirm string `json:"email_confirm" binding:"required"`
}

// UpdateEmail updates the authenticated user's email address.
// NOTE: this legacy path is not registered in main router; the active
// /users/email endpoint is served by AuthHandler.UpdateEmail.
func (h *UsersHandler) UpdateEmail(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

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

// Ping updates the user's last_seen timestamp without fetching the profile.
// @Summary      Ping (update last seen)
// @Tags         Users
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/ping [post]
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

// UpdateLastAgentPostAt updates the last_agent_post_at timestamp for the authenticated user.
// @Summary      Record agent post activity
// @Tags         Users
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/agent/post [post]
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

// UpdateLastAgentBrowseAt updates the last_agent_browse_at timestamp for the authenticated user.
// @Summary      Record agent browse activity
// @Tags         Users
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/agent/browse [post]
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

// topFriendsConfig is the JSON structure stored in user_profiles.top_friends_json.
type topFriendsConfig struct {
	Count      int      `json:"count"`
	BestFriend string   `json:"best_friend,omitempty"`
	Friends    []string `json:"friends"`
}

// TopFriendPreview is a resolved friend entry for API responses.
type TopFriendPreview struct {
	Username  string  `json:"username"`
	AvatarURL *string `json:"avatar_url,omitempty"`
}

// TopFriendsResponse is returned by GetTopFriends.
type TopFriendsResponse struct {
	Count      int                `json:"count"`
	BestFriend string             `json:"best_friend,omitempty"`
	Friends    []TopFriendPreview `json:"friends"`
}

// GetTopFriends returns the configured top friends for a user profile.
// @Summary      Get top friends
// @Tags         Users
// @Produce      json
// @Param        username  path  string  true  "Username"
// @Success      200  {object}  TopFriendsResponse
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/{username}/top-friends [get]
func (h *UsersHandler) GetTopFriends(c *gin.Context) {
	username := c.Param("username")

	user, err := h.userRepo.GetByUsername(c.Request.Context(), username)
	if err != nil || user == nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	// Apply the same profile-visibility check used by the main profile endpoint.
	var viewerID int
	if v, _ := middleware.GetOptionalUserID(c); v != 0 {
		viewerID = v
	}
	canSee, err := viewerCanSeeProfile(c.Request.Context(), h.settingsRepo, h.friendRepo, user, viewerID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load profile")
		return
	}
	if !canSee {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	if h.userProfRepo == nil {
		c.JSON(http.StatusOK, TopFriendsResponse{Count: 0, Friends: []TopFriendPreview{}})
		return
	}

	profile, err := h.userProfRepo.GetByUserID(c.Request.Context(), user.ID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch profile")
		return
	}
	if profile == nil || profile.TopFriendsJSON == nil {
		c.JSON(http.StatusOK, TopFriendsResponse{Count: 0, Friends: []TopFriendPreview{}})
		return
	}

	var cfg topFriendsConfig
	if err := json.Unmarshal([]byte(*profile.TopFriendsJSON), &cfg); err != nil {
		zlog.Error().Err(err).Int("userID", user.ID).Msg("GetTopFriends: corrupt top_friends_json in DB")
		RespondError(c, http.StatusInternalServerError, "Failed to load top friends")
		return
	}

	previews := make([]TopFriendPreview, 0, len(cfg.Friends))
	for _, friendUsername := range cfg.Friends {
		fu, ferr := h.userRepo.GetByUsername(c.Request.Context(), friendUsername)
		if ferr != nil {
			// Distinguish a real DB error from a legitimately missing user.
			zlog.Error().Err(ferr).Str("friend", friendUsername).Msg("GetTopFriends: error fetching friend user")
			RespondError(c, http.StatusInternalServerError, "Failed to load top friends")
			return
		}
		if fu == nil {
			// Friend account no longer exists — skip silently.
			continue
		}
		preview := TopFriendPreview{Username: fu.Username}
		fp, fperr := h.userProfRepo.GetByUserID(c.Request.Context(), fu.ID)
		if fperr != nil {
			zlog.Error().Err(fperr).Int("friendID", fu.ID).Msg("GetTopFriends: error fetching friend profile")
			RespondError(c, http.StatusInternalServerError, "Failed to load top friends")
			return
		}
		if fp != nil && fp.AvatarURL != nil {
			preview.AvatarURL = fp.AvatarURL
		} else if fu.AvatarURL != nil {
			preview.AvatarURL = fu.AvatarURL
		}
		previews = append(previews, preview)
	}

	// Return the actual resolved count rather than the stored count, which may
	// be stale if friends have since deleted their accounts.
	c.JSON(http.StatusOK, TopFriendsResponse{
		Count:      len(previews),
		BestFriend: cfg.BestFriend,
		Friends:    previews,
	})
}

// setTopFriendsRequest is the request body for SetTopFriends.
type setTopFriendsRequest struct {
	Count      int      `json:"count"`
	BestFriend string   `json:"best_friend,omitempty"`
	Friends    []string `json:"friends"`
}

// SetTopFriends saves the authenticated user's top friends configuration.
// @Summary      Set top friends
// @Tags         Users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/top-friends [put]
func (h *UsersHandler) SetTopFriends(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req setTopFriendsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	const maxTopFriends = 8
	if req.Count < 0 || req.Count > maxTopFriends {
		RespondError(c, http.StatusBadRequest, fmt.Sprintf("Count must be between 0 and %d", maxTopFriends))
		return
	}

	if req.Count == 0 {
		req.Friends = nil
		req.BestFriend = ""
	} else {
		if len(req.Friends) != req.Count {
			RespondError(c, http.StatusBadRequest, fmt.Sprintf("Expected %d friends, got %d", req.Count, len(req.Friends)))
			return
		}
		// Validate uniqueness
		seen := make(map[string]bool, len(req.Friends))
		for _, f := range req.Friends {
			if seen[f] {
				RespondError(c, http.StatusBadRequest, "Duplicate friends are not allowed")
				return
			}
			seen[f] = true
		}
		// Validate best_friend is in the list
		if req.BestFriend != "" && !seen[req.BestFriend] {
			RespondError(c, http.StatusBadRequest, "Best friend must be in the friends list")
			return
		}
		// Validate each listed user is actually a friend
		if h.friendRepo != nil {
			for _, friendUsername := range req.Friends {
				fu, ferr := h.userRepo.GetByUsername(c.Request.Context(), friendUsername)
				if ferr != nil {
					RespondError(c, http.StatusInternalServerError, "Failed to validate friends")
					return
				}
				if fu == nil {
					RespondError(c, http.StatusBadRequest, fmt.Sprintf("User %q not found", friendUsername))
					return
				}
				isFriend, ferr2 := h.friendRepo.AreUsersFriends(c.Request.Context(), userID, fu.ID)
				if ferr2 != nil {
					RespondError(c, http.StatusInternalServerError, "Failed to validate friendship")
					return
				}
				if !isFriend {
					RespondError(c, http.StatusBadRequest, fmt.Sprintf("%q is not your friend", friendUsername))
					return
				}
			}
		}
	}

	if h.userProfRepo == nil {
		RespondError(c, http.StatusInternalServerError, "Profile service unavailable")
		return
	}

	cfg := topFriendsConfig(req)
	data, err := json.Marshal(cfg)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to serialize top friends")
		return
	}
	jsonStr := string(data)

	// Use a targeted single-column update to avoid the read-modify-write race
	// that would occur if we read all profile fields then Upsert everything back.
	if err := h.userProfRepo.UpdateTopFriends(c.Request.Context(), userID, &jsonStr); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to save top friends")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Top friends updated"})
}

// UserFriendsResponse is returned by GetUserFriends.
type UserFriendsResponse struct {
	Friends []models.FriendEntry `json:"friends"`
}

// GetUserFriends returns the accepted friends list for a user profile, subject to
// the same visibility rules as the profile itself.
// @Summary      Get user friends
// @Tags         Users
// @Produce      json
// @Param        username  path  string  true  "Username"
// @Success      200  {object}  UserFriendsResponse
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/{username}/friends [get]
func (h *UsersHandler) GetUserFriends(c *gin.Context) {
	username := c.Param("username")

	user, err := h.userRepo.GetByUsername(c.Request.Context(), username)
	if err != nil || user == nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	var viewerID int
	if v, _ := middleware.GetOptionalUserID(c); v != 0 {
		viewerID = v
	}
	if isPendingDeletionHiddenFromViewer(user, viewerID) {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	if viewerID != 0 && viewerID != user.ID && h.pool != nil {
		blocked, err := models.IsBlockedBidirectional(c.Request.Context(), h.pool, user.ID, viewerID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to load profile")
			return
		}
		if blocked {
			RespondError(c, http.StatusNotFound, "User not found")
			return
		}
	}

	canSee, err := viewerCanSeeProfile(c.Request.Context(), h.settingsRepo, h.friendRepo, user, viewerID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load profile")
		return
	}
	if !canSee {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	if h.friendRepo == nil {
		c.JSON(http.StatusOK, UserFriendsResponse{Friends: []models.FriendEntry{}})
		return
	}

	friends, err := h.friendRepo.ListFriends(c.Request.Context(), user.ID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load friends")
		return
	}
	if friends == nil {
		friends = []models.FriendEntry{}
	}
	c.JSON(http.StatusOK, UserFriendsResponse{Friends: friends})
}
