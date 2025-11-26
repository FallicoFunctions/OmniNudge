package handlers

import (
	"net/http"

	"github.com/chatreddit/backend/internal/models"
	"github.com/chatreddit/backend/internal/services"
	"github.com/gin-gonic/gin"
)

// AuthHandler handles authentication endpoints
type AuthHandler struct {
	authService *services.AuthService
	userRepo    *models.UserRepository
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(authService *services.AuthService, userRepo *models.UserRepository) *AuthHandler {
	return &AuthHandler{
		authService: authService,
		userRepo:    userRepo,
	}
}

// RedditLogin initiates the Reddit OAuth flow
func (h *AuthHandler) RedditLogin(c *gin.Context) {
	state, err := h.authService.GenerateState()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate state"})
		return
	}

	// Store state in cookie for validation (in production, use Redis)
	c.SetCookie("oauth_state", state, 600, "/", "", false, true)

	url := h.authService.GetAuthURL(state)
	c.Redirect(http.StatusTemporaryRedirect, url)
}

// RedditCallback handles the OAuth callback from Reddit
func (h *AuthHandler) RedditCallback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")
	errorParam := c.Query("error")

	// Check for OAuth errors
	if errorParam != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "OAuth error: " + errorParam})
		return
	}

	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No authorization code provided"})
		return
	}

	// Validate state (in production, compare with stored state)
	storedState, _ := c.Cookie("oauth_state")
	if state != storedState {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid state parameter"})
		return
	}

	// Exchange code for token
	token, err := h.authService.ExchangeCode(c.Request.Context(), code)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to exchange code: " + err.Error()})
		return
	}

	// Get Reddit user info
	redditUser, err := h.authService.GetRedditUser(c.Request.Context(), token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get Reddit user info: " + err.Error()})
		return
	}

	// Determine avatar URL (prefer snoovatar, fall back to icon_img)
	avatarURL := redditUser.Snoovatar
	if avatarURL == "" {
		avatarURL = redditUser.IconImg
	}

	// Create or update user in database
	user := &models.User{
		Username:       redditUser.Name,
		RedditID:       &redditUser.ID,
		RedditUsername: &redditUser.Name,
		AccessToken:    token.AccessToken,
		RefreshToken:   token.RefreshToken,
		TokenExpiresAt: &token.Expiry,
		Karma:          redditUser.Karma,
		AvatarURL:      &avatarURL,
	}

	if err := h.userRepo.CreateOrUpdateFromReddit(c.Request.Context(), user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create/update user: " + err.Error()})
		return
	}

	// Generate JWT
	redditID := ""
	if user.RedditID != nil {
		redditID = *user.RedditID
	}
	jwtToken, err := h.authService.GenerateJWT(user.ID, redditID, user.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// Clear the state cookie
	c.SetCookie("oauth_state", "", -1, "/", "", false, true)

	// Return JWT and user info
	// In production, you might redirect to frontend with token in URL fragment
	c.JSON(http.StatusOK, gin.H{
		"token": jwtToken,
		"user":  user,
	})
}

// GetMe returns the current authenticated user
func (h *AuthHandler) GetMe(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	user, err := h.userRepo.GetByID(c.Request.Context(), userID.(int))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Update last seen
	_ = h.userRepo.UpdateLastSeen(c.Request.Context(), user.ID)

	c.JSON(http.StatusOK, user)
}

// Logout handles user logout (client-side token removal)
func (h *AuthHandler) Logout(c *gin.Context) {
	// JWT tokens are stateless, so logout is handled client-side
	// In production, you might want to add token to a blacklist in Redis
	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

// Register handles user registration with username/password
func (h *AuthHandler) Register(c *gin.Context) {
	var req services.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	user, token, err := h.authService.Register(c.Request.Context(), h.userRepo, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"token": token,
		"user":  user,
	})
}

// Login handles user login with username/password
func (h *AuthHandler) Login(c *gin.Context) {
	var req services.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	user, token, err := h.authService.Login(c.Request.Context(), h.userRepo, &req)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  user,
	})
}
