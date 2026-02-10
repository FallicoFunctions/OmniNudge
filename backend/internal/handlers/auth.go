package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/utils"
	"github.com/gin-gonic/gin"
)

// AuthHandler handles authentication endpoints
type AuthHandler struct {
	authService             *services.AuthService
	userRepo                *models.UserRepository
	emailService            *services.EmailService
	passwordResetRepo       *models.PasswordResetRepository
	emailVerificationRepo   *models.EmailVerificationRepository
	frontendURL             string
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(authService *services.AuthService, userRepo *models.UserRepository, emailService *services.EmailService, passwordResetRepo *models.PasswordResetRepository, emailVerificationRepo *models.EmailVerificationRepository, frontendURL string) *AuthHandler {
	return &AuthHandler{
		authService:           authService,
		userRepo:              userRepo,
		emailService:          emailService,
		passwordResetRepo:     passwordResetRepo,
		emailVerificationRepo: emailVerificationRepo,
		frontendURL:           frontendURL,
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
	jwtToken, err := h.authService.GenerateJWT(user.ID, redditID, user.Username, user.Role)
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

	// If user provided an email, send verification email
	emailVerificationSent := false
	if req.Email != nil && *req.Email != "" && h.emailService != nil && h.emailVerificationRepo != nil {
		// Generate verification token
		verification, err := h.emailVerificationRepo.GenerateToken(c.Request.Context(), user.ID, *req.Email, "registration")
		if err != nil {
			fmt.Printf("[ERROR] Failed to generate email verification token: %v\n", err)
		} else {
			// Send verification email
			verifyURL := fmt.Sprintf("%s/verify-email?token=%s", h.frontendURL, verification.Token)

			err = h.emailService.SendTemplatedEmail(
				[]string{*req.Email},
				services.EmailVerificationTemplate,
				map[string]string{
					"username":   user.Username,
					"verify_url": verifyURL,
				},
			)
			if err != nil {
				fmt.Printf("[ERROR] Failed to send verification email: %v\n", err)
			} else {
				emailVerificationSent = true
				fmt.Printf("[EMAIL] Verification email sent to %s\n", *req.Email)
			}
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"token":                   token,
		"user":                    user,
		"email_verification_sent": emailVerificationSent,
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

// UpdatePublicKey handles updating user's public encryption key
func (h *AuthHandler) UpdatePublicKey(c *gin.Context) {
	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req struct {
		PublicKey string `json:"public_key" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// Update public key in database
	if err := h.userRepo.UpdatePublicKey(c.Request.Context(), userID.(int), req.PublicKey); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update public key", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Public key updated successfully"})
}

// GetPublicKeys handles fetching public keys for multiple users
func (h *AuthHandler) GetPublicKeys(c *gin.Context) {
	userIDsParam := c.Query("user_ids")
	if userIDsParam == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_ids parameter is required"})
		return
	}

	// Parse comma-separated user IDs
	var userIDs []int
	for _, idStr := range strings.Split(userIDsParam, ",") {
		var id int
		if _, err := fmt.Sscanf(idStr, "%d", &id); err == nil {
			userIDs = append(userIDs, id)
		}
	}

	if len(userIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No valid user IDs provided"})
		return
	}

	// Fetch public keys for all users in one query
	publicKeys, err := h.userRepo.GetPublicKeysByIDs(c.Request.Context(), userIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch public keys", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"public_keys": publicKeys})
}

// UpdateEncryptedPrivateKey handles updating user's encrypted private key for cross-browser sync
func (h *AuthHandler) UpdateEncryptedPrivateKey(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req struct {
		EncryptedPrivateKey string `json:"encrypted_private_key" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if err := h.userRepo.UpdateEncryptedPrivateKey(c.Request.Context(), userID.(int), req.EncryptedPrivateKey); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update encrypted private key"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Encrypted private key updated successfully"})
}

// GetEncryptedPrivateKey handles fetching user's encrypted private key for cross-browser sync
func (h *AuthHandler) GetEncryptedPrivateKey(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	user, err := h.userRepo.GetByID(c.Request.Context(), userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user data"})
		return
	}

	if user.EncryptedPrivateKey == nil {
		c.JSON(http.StatusOK, gin.H{"encrypted_private_key": nil})
		return
	}

	c.JSON(http.StatusOK, gin.H{"encrypted_private_key": *user.EncryptedPrivateKey})
}

// ForgotPassword handles password reset requests
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username is required"})
		return
	}

	// Find user by username
	user, err := h.userRepo.GetByUsername(c.Request.Context(), req.Username)
	if err != nil {
		// Log error for debugging (but don't reveal to user)
		fmt.Printf("[DEBUG] GetByUsername failed for %s: %v\n", req.Username, err)
		// Don't reveal whether user exists (security best practice)
		c.JSON(http.StatusOK, gin.H{"message": "If an account exists with a verified email, a password reset link has been sent"})
		return
	}

	// Check if user has a verified email
	if user.Email == nil || *user.Email == "" || !user.EmailVerified {
		fmt.Printf("[DEBUG] User %s has no verified email\n", user.Username)
		// Don't reveal whether user exists or has email (security best practice)
		c.JSON(http.StatusOK, gin.H{"message": "If an account exists with a verified email, a password reset link has been sent"})
		return
	}

	fmt.Printf("[DEBUG] Found user: id=%d username=%s with verified email\n", user.ID, user.Username)

	// Generate password reset token
	resetToken, err := h.passwordResetRepo.GenerateToken(c.Request.Context(), user.ID)
	if err != nil {
		fmt.Printf("[ERROR] Failed to generate password reset token: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process password reset request"})
		return
	}

	// Build reset URL (frontend URL)
	resetURL := fmt.Sprintf("%s/reset-password?token=%s", h.frontendURL, resetToken.Token)

	// Send password reset email
	if h.emailService != nil {
		err = h.emailService.SendTemplatedEmail(
			[]string{*user.Email},
			services.PasswordResetTemplate,
			map[string]string{
				"username":  user.Username,
				"reset_url": resetURL,
			},
		)
		if err != nil {
			fmt.Printf("[ERROR] Failed to send password reset email: %v\n", err)
			// Continue anyway - don't reveal email send failure to user
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "If the email exists, a password reset link has been sent"})
}

// ResetPassword handles password reset with token
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req struct {
		Token       string `json:"token" binding:"required"`
		NewPassword string `json:"new_password" binding:"required,min=8"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request. Password must be at least 8 characters"})
		return
	}

	// Validate token
	valid, userID, err := h.passwordResetRepo.IsValid(c.Request.Context(), req.Token)
	if err != nil || !valid {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid or expired reset token"})
		return
	}

	// Get user
	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "User not found"})
		return
	}

	// Update password (hash using bcrypt)
	hashedPassword, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		fmt.Printf("[ERROR] Failed to hash password: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reset password"})
		return
	}

	err = h.userRepo.UpdatePassword(c.Request.Context(), userID, hashedPassword)
	if err != nil {
		fmt.Printf("[ERROR] Failed to update password: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reset password"})
		return
	}

	// Mark token as used
	err = h.passwordResetRepo.MarkAsUsed(c.Request.Context(), req.Token)
	if err != nil {
		fmt.Printf("[ERROR] Failed to mark token as used: %v\n", err)
		// Continue anyway - password was updated
	}

	// Invalidate any other active reset tokens for this user
	_ = h.passwordResetRepo.InvalidateUserTokens(c.Request.Context(), userID)

	c.JSON(http.StatusOK, gin.H{
		"message": "Password successfully reset",
		"username": user.Username,
	})
}

// ValidateResetToken checks if a reset token is valid (for frontend validation)
func (h *AuthHandler) ValidateResetToken(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Token is required"})
		return
	}

	valid, userID, err := h.passwordResetRepo.IsValid(c.Request.Context(), token)
	if err != nil || !valid {
		c.JSON(http.StatusOK, gin.H{"valid": false, "error": "Invalid or expired token"})
		return
	}

	// Get username for display
	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"valid": true})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"valid": true,
		"username": user.Username,
	})
}

// VerifyEmail handles email verification with token
func (h *AuthHandler) VerifyEmail(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Token is required"})
		return
	}

	// Verify the token
	verification, err := h.emailVerificationRepo.Verify(c.Request.Context(), token)
	if err != nil {
		fmt.Printf("[ERROR] Email verification failed: %v\n", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid or expired verification token"})
		return
	}

	// Get user
	user, err := h.userRepo.GetByID(c.Request.Context(), verification.UserID)
	if err != nil {
		fmt.Printf("[ERROR] Failed to get user: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify email"})
		return
	}

	// Update user's email and mark as verified
	encryptedEmail, err := utils.EncryptEmail(verification.Email)
	if err != nil {
		fmt.Printf("[ERROR] Failed to encrypt email: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify email"})
		return
	}

	query := `
		UPDATE users
		SET email = $1, email_verified = true, email_encrypted = true
		WHERE id = $2
	`
	_, err = h.userRepo.GetPool().Exec(c.Request.Context(), query, encryptedEmail, verification.UserID)
	if err != nil {
		fmt.Printf("[ERROR] Failed to update user email: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify email"})
		return
	}

	fmt.Printf("[EMAIL] Email verified for user %s: %s\n", user.Username, verification.Email)

	c.JSON(http.StatusOK, gin.H{
		"verified": true,
		"username": user.Username,
		"purpose":  verification.Purpose,
	})
}

// ResendVerification resends email verification
func (h *AuthHandler) ResendVerification(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
	}

	// Check if user is authenticated (for logged-in resend)
	userID, authenticated := c.Get("user_id")

	// If not authenticated, require username
	if !authenticated {
		if err := c.ShouldBindJSON(&req); err != nil || req.Username == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Username is required"})
			return
		}

		// Get user by username
		user, err := h.userRepo.GetByUsername(c.Request.Context(), req.Username)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"message": "If the account exists, a verification email has been sent"})
			return
		}
		userID = user.ID
	}

	// Get user
	user, err := h.userRepo.GetByID(c.Request.Context(), userID.(int))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "If the account exists, a verification email has been sent"})
		return
	}

	// Check if user has an email
	if user.Email == nil || *user.Email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No email address on file"})
		return
	}

	// Check if already verified
	if user.EmailVerified {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email already verified"})
		return
	}

	// Invalidate old tokens
	_ = h.emailVerificationRepo.InvalidateUserTokens(c.Request.Context(), user.ID, "registration")

	// Generate new verification token
	verification, err := h.emailVerificationRepo.GenerateToken(c.Request.Context(), user.ID, *user.Email, "registration")
	if err != nil {
		fmt.Printf("[ERROR] Failed to generate verification token: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send verification email"})
		return
	}

	// Send verification email
	verifyURL := fmt.Sprintf("%s/verify-email?token=%s", h.frontendURL, verification.Token)

	if h.emailService != nil {
		err = h.emailService.SendTemplatedEmail(
			[]string{*user.Email},
			services.EmailVerificationTemplate,
			map[string]string{
				"username":   user.Username,
				"verify_url": verifyURL,
			},
		)
		if err != nil {
			fmt.Printf("[ERROR] Failed to send verification email: %v\n", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send verification email"})
			return
		}
	}

	// Mask email for response
	maskedEmail := maskEmail(*user.Email)

	c.JSON(http.StatusOK, gin.H{
		"message":      "Verification email sent",
		"email_masked": maskedEmail,
	})
}

// maskEmail masks an email address (e.g., "test@example.com" -> "t***@example.com")
func maskEmail(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return email
	}
	local := parts[0]
	domain := parts[1]

	if len(local) <= 1 {
		return email
	}

	masked := string(local[0]) + "***"
	return masked + "@" + domain
}

// UpdateEmail updates user's email address (requires verification)
func (h *AuthHandler) UpdateEmail(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req struct {
		Email        string `json:"email" binding:"required,email"`
		EmailConfirm string `json:"email_confirm" binding:"required,email"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Valid email is required"})
		return
	}

	// Validate emails match
	if req.Email != req.EmailConfirm {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email addresses do not match"})
		return
	}

	// Get user
	user, err := h.userRepo.GetByID(c.Request.Context(), userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user"})
		return
	}

	// Invalidate old verification tokens
	_ = h.emailVerificationRepo.InvalidateUserTokens(c.Request.Context(), user.ID, "update_email")

	// Generate verification token
	verification, err := h.emailVerificationRepo.GenerateToken(c.Request.Context(), user.ID, req.Email, "update_email")
	if err != nil {
		fmt.Printf("[ERROR] Failed to generate verification token: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send verification email"})
		return
	}

	// Send verification email
	verifyURL := fmt.Sprintf("%s/verify-email?token=%s", h.frontendURL, verification.Token)

	if h.emailService != nil {
		err = h.emailService.SendTemplatedEmail(
			[]string{req.Email},
			services.EmailUpdateVerificationTemplate,
			map[string]string{
				"username":   user.Username,
				"verify_url": verifyURL,
			},
		)
		if err != nil {
			fmt.Printf("[ERROR] Failed to send verification email: %v\n", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send verification email"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":        "Verification email sent to " + req.Email + ". Your email will be updated after verification.",
		"email_verified": false,
	})
}
