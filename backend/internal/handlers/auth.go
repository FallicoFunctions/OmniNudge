package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/audit"
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/utils"
	zlog "github.com/rs/zerolog/log"
)

// AuthEmailSender is the email-sending interface required by AuthHandler.
// Using an interface (instead of the concrete *services.EmailService) allows
// test doubles to be injected without making real network calls.
type AuthEmailSender interface {
	SendEmail(to []string, subject, body, htmlBody string) error
	SendTemplatedEmail(to []string, template services.EmailTemplate, data map[string]string) error
}

// AuthHandler handles authentication endpoints
type AuthHandler struct {
	authService           *services.AuthService
	userRepo              ports.UserRepository
	emailService          AuthEmailSender
	passwordResetRepo     ports.PasswordResetRepository
	emailVerificationRepo ports.EmailVerificationRepository
	frontendURL           string
	auditLogger           *audit.AuditLogger
	lockoutService        *services.AccountLockoutService
}

// logAudit writes a structured audit event. It is a nil-safe wrapper around
// h.auditLogger.Log that:
//   - silently no-ops when h.auditLogger is nil (e.g. in unit tests), and
//   - logs any write failure via slog rather than discarding it silently.
//
// Fix 23: all audit log call sites in AuthHandler must use this helper instead
// of calling h.auditLogger.Log directly, so nil-guard and error logging are
// applied consistently.
func (h *AuthHandler) logAudit(ctx context.Context, userID *int, action, targetType string, targetID *int, ip, ua string, meta map[string]any) {
	if h.auditLogger == nil {
		return
	}
	if err := h.auditLogger.Log(ctx, userID, action, targetType, targetID, ip, ua, meta); err != nil {
		slog.Error("audit log write failed", "error", err, "action", action)
	}
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(
	authService *services.AuthService,
	userRepo ports.UserRepository,
	emailService AuthEmailSender,
	passwordResetRepo ports.PasswordResetRepository,
	emailVerificationRepo ports.EmailVerificationRepository,
	frontendURL string,
	auditLogger *audit.AuditLogger,
	lockoutService *services.AccountLockoutService,
	_ string,
) *AuthHandler {
	return &AuthHandler{
		authService:           authService,
		userRepo:              userRepo,
		emailService:          emailService,
		passwordResetRepo:     passwordResetRepo,
		emailVerificationRepo: emailVerificationRepo,
		frontendURL:           frontendURL,
		auditLogger:           auditLogger,
		lockoutService:        lockoutService,
	}
}

// GetMe returns the current authenticated user.
// @Summary      Get current user
// @Tags         Auth
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  models.User
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Router       /auth/me [get]
func (h *AuthHandler) GetMe(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusNotFound, "User not found")
		return
	}

	// Update last seen
	_ = h.userRepo.UpdateLastSeen(c.Request.Context(), user.ID)

	c.JSON(http.StatusOK, user)
}

// Logout handles user logout (client-side token removal).
// @Summary      Logout
// @Tags         Auth
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Router       /auth/logout [post]
func (h *AuthHandler) Logout(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	h.logAudit(c.Request.Context(), &userID, "logout", "user", &userID,
		c.ClientIP(), c.Request.UserAgent(), nil)
	if err := h.userRepo.IncrementTokenVersion(c.Request.Context(), userID); err != nil {
		slog.Error("failed to invalidate sessions on logout", "error", err, "user_id", userID)
		RespondError(c, http.StatusInternalServerError, "Failed to log out")
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

// Register handles user registration with username/password.
// @Summary      Register a new user
// @Tags         Auth
// @Accept       json
// @Produce      json
// @Param        body  body  services.RegisterRequest  true  "Registration request"
// @Success      201  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Router       /auth/register [post]
func (h *AuthHandler) Register(c *gin.Context) {
	ipAddress := c.ClientIP()

	var req services.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	user, token, err := h.authService.Register(c.Request.Context(), h.userRepo, &req)
	if err != nil {
		zlog.Warn().Err(err).Msg("registration validation failed")
		RespondError(c, http.StatusBadRequest, "Registration failed. Please check your input and try again.")
		return
	}

	uid := user.ID
	h.logAudit(c.Request.Context(), &uid, "register_success", "user", &uid,
		ipAddress, c.Request.UserAgent(), nil)

	// If user provided an email, send verification email
	emailVerificationSent := false
	if req.Email != nil && *req.Email != "" && h.emailService != nil && h.emailVerificationRepo != nil {
		// Generate verification token
		verification, err := h.emailVerificationRepo.GenerateToken(c.Request.Context(), user.ID, *req.Email, "registration")
		if err != nil {
			slog.Error("failed to generate email verification token", "error", err)
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
				slog.Error("failed to send verification email", "error", err)
			} else {
				emailVerificationSent = true
				slog.Info("verification email sent", "email_masked", maskEmail(*req.Email))
			}
		}
	}

	// Send welcome email asynchronously so registration does not block on email delivery.
	// Only sent when the user has an email address; welcome email does not require verification.
	if req.Email != nil && *req.Email != "" && h.emailService != nil {
		go func() {
			if err := h.emailService.SendTemplatedEmail(
				[]string{*req.Email},
				services.WelcomeEmailTemplate,
				map[string]string{
					"username": user.Username,
					"app_url":  h.frontendURL,
				},
			); err != nil {
				zlog.Warn().Err(err).Str("username", user.Username).Msg("auth: failed to send welcome email")
			}
		}()
	}

	c.JSON(http.StatusCreated, gin.H{
		"token":                   token,
		"user":                    user,
		"email_verification_sent": emailVerificationSent,
	})
}

// Login handles user login with username/password.
// @Summary      Login
// @Tags         Auth
// @Accept       json
// @Produce      json
// @Param        body  body  services.LoginRequest  true  "Login request"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Router       /auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
	var req services.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	normalizedUsername := strings.TrimSpace(req.Username)

	ipAddress := c.ClientIP()
	ctx := c.Request.Context()

	// Check account/IP lockout before attempting authentication.
	// Fix 1: fail closed on DB error — return 503 rather than allowing the
	// request to continue without a lockout check.
	if h.lockoutService != nil {
		locked, err := h.lockoutService.IsLocked(ctx, normalizedUsername, ipAddress)
		if err != nil {
			slog.Error("lockout check failed", "error", err, "ip", ipAddress)
			RespondError(c, http.StatusServiceUnavailable, "service temporarily unavailable")
			c.Abort()
			return
		}
		if locked {
			// Fix 4: no numeric user ID is available at this point, so targetType
			// and targetID are left empty/nil. Username is captured in metadata only.
			h.logAudit(ctx, nil, "login_blocked_lockout", "", nil,
				ipAddress, c.Request.UserAgent(),
				map[string]any{"username": normalizedUsername})
			RespondError(c, http.StatusTooManyRequests, "Account temporarily locked due to too many failed attempts")
			c.Abort()
			return
		}
	}

	user, token, err := h.authService.Login(ctx, h.userRepo, &req)
	if err != nil {
		// Record the failure for lockout tracking.
		// Fix 9: RecordFailure failure means this attempt is not counted toward
		// lockout — partial fail-open by design.
		if h.lockoutService != nil {
			if rfErr := h.lockoutService.RecordFailure(ctx, normalizedUsername, ipAddress); rfErr != nil {
				slog.Error("lockout record failure", "error", rfErr)
			}
		}
		h.logAudit(ctx, nil, "login_failed", "user", nil,
			ipAddress, c.Request.UserAgent(),
			map[string]any{"username": normalizedUsername})
		RespondError(c, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	// Successful login — clear active-window failures and emit audit event.
	if h.lockoutService != nil {
		if resetErr := h.lockoutService.Reset(ctx, normalizedUsername); resetErr != nil {
			slog.Error("lockout reset", "error", resetErr)
		}
		// Do not reset IP-wide failures on single-account success:
		// that would allow an attacker with one valid credential behind the same
		// NAT/proxy to repeatedly clear IP lockout history and continue brute-forcing
		// other accounts.
	}
	h.logAudit(ctx, &user.ID, "login_success", "user", &user.ID,
		ipAddress, c.Request.UserAgent(),
		map[string]any{"username": user.Username})

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  user,
	})
}

// UpdatePublicKey handles updating user's public encryption key.
// @Summary      Update public key
// @Tags         Auth
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /auth/public-key [put]
func (h *AuthHandler) UpdatePublicKey(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req struct {
		PublicKey string `json:"public_key" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Update public key in database
	if err := h.userRepo.UpdatePublicKey(c.Request.Context(), userID, req.PublicKey); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update public key")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Public key updated successfully"})
}

// GetPublicKeys handles fetching public keys for multiple users.
// @Summary      Get public keys
// @Tags         Auth
// @Security     BearerAuth
// @Produce      json
// @Param        user_ids  query  string  true  "Comma-separated user IDs"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /auth/public-keys [get]
func (h *AuthHandler) GetPublicKeys(c *gin.Context) {
	userIDsParam := c.Query("user_ids")
	if userIDsParam == "" {
		RespondError(c, http.StatusBadRequest, "user_ids parameter is required")
		return
	}

	// Parse comma-separated user IDs — cap at 100 to bound DB IN() clause size.
	const maxPublicKeyLookup = 100
	var userIDs []int
	for _, idStr := range strings.Split(userIDsParam, ",") {
		if len(userIDs) >= maxPublicKeyLookup {
			break
		}
		var id int
		if _, err := fmt.Sscanf(idStr, "%d", &id); err == nil {
			userIDs = append(userIDs, id)
		}
	}

	if len(userIDs) == 0 {
		RespondError(c, http.StatusBadRequest, "No valid user IDs provided")
		return
	}

	// Fetch public keys for all users in one query
	publicKeys, err := h.userRepo.GetPublicKeysByIDs(c.Request.Context(), userIDs)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch public keys")
		return
	}

	c.JSON(http.StatusOK, gin.H{"public_keys": publicKeys})
}

// UpdateEncryptedPrivateKey handles updating user's encrypted private key for cross-browser sync.
// @Summary      Update encrypted private key
// @Tags         Auth
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /auth/encrypted-private-key [put]
func (h *AuthHandler) UpdateEncryptedPrivateKey(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req struct {
		EncryptedPrivateKey string `json:"encrypted_private_key" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.userRepo.UpdateEncryptedPrivateKey(c.Request.Context(), userID, req.EncryptedPrivateKey); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update encrypted private key")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Encrypted private key updated successfully"})
}

// GetEncryptedPrivateKey handles fetching user's encrypted private key for cross-browser sync.
// @Summary      Get encrypted private key
// @Tags         Auth
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /auth/encrypted-private-key [get]
func (h *AuthHandler) GetEncryptedPrivateKey(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch user data")
		return
	}

	if user.EncryptedPrivateKey == nil {
		c.JSON(http.StatusOK, gin.H{"encrypted_private_key": nil})
		return
	}

	c.JSON(http.StatusOK, gin.H{"encrypted_private_key": *user.EncryptedPrivateKey})
}

// ForgotPassword handles password reset requests.
// @Summary      Request password reset
// @Tags         Auth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /auth/forgot-password [post]
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Username is required")
		return
	}

	// Find user by username. GetByUsername returns (nil, nil) when not found.
	user, err := h.userRepo.GetByUsername(c.Request.Context(), req.Username)
	if err != nil {
		// Don't reveal whether user exists (security best practice).
		slog.Debug("GetByUsername error during forgot-password", "error", err)
		c.JSON(http.StatusOK, gin.H{"message": "If an account exists with a verified email, a password reset link has been sent"})
		return
	}
	if user == nil {
		// User does not exist — return same generic response to prevent enumeration.
		c.JSON(http.StatusOK, gin.H{"message": "If an account exists with a verified email, a password reset link has been sent"})
		return
	}

	// Check if user has a verified email
	if user.Email == nil || *user.Email == "" || !user.EmailVerified {
		// Don't reveal whether user exists or has email (security best practice).
		slog.Debug("forgot-password: user has no verified email", "user_id", user.ID)
		c.JSON(http.StatusOK, gin.H{"message": "If an account exists with a verified email, a password reset link has been sent"})
		return
	}

	slog.Debug("forgot-password: found user with verified email", "user_id", user.ID)

	// Generate password reset token
	resetToken, err := h.passwordResetRepo.GenerateToken(c.Request.Context(), user.ID)
	if err != nil {
		slog.Error("failed to generate password reset token", "error", err, "user_id", user.ID)
		RespondError(c, http.StatusInternalServerError, "Failed to process password reset request")
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
			slog.Error("failed to send password reset email", "error", err, "user_id", user.ID)
			// Continue anyway - don't reveal email send failure to user
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "If the email exists, a password reset link has been sent"})
}

// ResetPassword handles password reset with token.
// @Summary      Reset password
// @Tags         Auth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /auth/reset-password [post]
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req struct {
		Token       string `json:"token" binding:"required"`
		NewPassword string `json:"new_password" binding:"required,min=8"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request. Password must be at least 8 characters")
		return
	}

	// Validate token
	valid, userID, err := h.passwordResetRepo.IsValid(c.Request.Context(), req.Token)
	if err != nil || !valid {
		RespondError(c, http.StatusBadRequest, "Invalid or expired reset token")
		return
	}

	// Get user
	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "User not found")
		return
	}

	// Update password (hash using bcrypt)
	hashedPassword, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		slog.Error("failed to hash password during reset", "error", err)
		RespondError(c, http.StatusInternalServerError, "Failed to reset password")
		return
	}

	err = h.userRepo.UpdatePassword(c.Request.Context(), userID, hashedPassword)
	if err != nil {
		slog.Error("failed to update password", "error", err)
		RespondError(c, http.StatusInternalServerError, "Failed to reset password")
		return
	}

	// Mark token as used
	err = h.passwordResetRepo.MarkAsUsed(c.Request.Context(), req.Token)
	if err != nil {
		slog.Error("failed to mark reset token as used", "error", err)
		// Continue anyway - password was updated
	}

	// Invalidate any other active reset tokens for this user
	_ = h.passwordResetRepo.InvalidateUserTokens(c.Request.Context(), userID)
	if err := h.userRepo.IncrementTokenVersion(c.Request.Context(), userID); err != nil {
		slog.Error("failed to invalidate sessions after password reset", "error", err, "user_id", userID)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "Password successfully reset",
		"username": user.Username,
	})
}

// ValidateResetToken checks if a reset token is valid (for frontend validation).
// @Summary      Validate reset token
// @Tags         Auth
// @Produce      json
// @Param        token  query  string  true  "Reset token"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Router       /auth/validate-reset-token [get]
func (h *AuthHandler) ValidateResetToken(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		RespondError(c, http.StatusBadRequest, "Token is required")
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
		"valid":    true,
		"username": user.Username,
	})
}

// VerifyEmail handles email verification with token.
// @Summary      Verify email address
// @Tags         Auth
// @Produce      json
// @Param        token  query  string  true  "Verification token"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /auth/verify-email [get]
func (h *AuthHandler) VerifyEmail(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		RespondError(c, http.StatusBadRequest, "Token is required")
		return
	}

	// Verify the token
	verification, err := h.emailVerificationRepo.Verify(c.Request.Context(), token)
	if err != nil {
		slog.Error("email verification failed", "error", err)
		RespondError(c, http.StatusBadRequest, "Invalid or expired verification token")
		return
	}

	// Get user
	user, err := h.userRepo.GetByID(c.Request.Context(), verification.UserID)
	if err != nil {
		slog.Error("failed to get user during email verification", "error", err, "user_id", verification.UserID)
		RespondError(c, http.StatusInternalServerError, "Failed to verify email")
		return
	}

	// Update user's email and mark as verified
	encryptedEmail, err := utils.EncryptEmail(verification.Email)
	if err != nil {
		slog.Error("failed to encrypt email during verification", "error", err)
		RespondError(c, http.StatusInternalServerError, "Failed to verify email")
		return
	}

	if err = h.userRepo.UpdateVerifiedEmail(c.Request.Context(), verification.UserID, encryptedEmail); err != nil {
		slog.Error("failed to update verified email", "error", err, "user_id", verification.UserID)
		RespondError(c, http.StatusInternalServerError, "Failed to verify email")
		return
	}

	slog.Info("email verified", "user_id", user.ID)

	c.JSON(http.StatusOK, gin.H{
		"verified": true,
		"username": user.Username,
		"purpose":  verification.Purpose,
	})
}

// ResendVerification resends email verification.
// @Summary      Resend verification email
// @Tags         Auth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /auth/resend-verification [post]
func (h *AuthHandler) ResendVerification(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
	}

	// Check if user is authenticated (for logged-in resend)
	var userID int
	if uid, authenticated := middleware.GetOptionalUserID(c); authenticated {
		userID = uid
	} else {
		// If not authenticated, require username
		if err := c.ShouldBindJSON(&req); err != nil || req.Username == "" {
			RespondError(c, http.StatusBadRequest, "Username is required")
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
	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "If the account exists, a verification email has been sent"})
		return
	}

	// Check if user has an email
	if user.Email == nil || *user.Email == "" {
		RespondError(c, http.StatusBadRequest, "No email address on file")
		return
	}

	// Check if already verified
	if user.EmailVerified {
		RespondError(c, http.StatusBadRequest, "Email already verified")
		return
	}

	// Invalidate old tokens
	_ = h.emailVerificationRepo.InvalidateUserTokens(c.Request.Context(), user.ID, "registration")

	// Generate new verification token
	verification, err := h.emailVerificationRepo.GenerateToken(c.Request.Context(), user.ID, *user.Email, "registration")
	if err != nil {
		slog.Error("failed to generate verification token", "error", err, "user_id", user.ID)
		RespondError(c, http.StatusInternalServerError, "Failed to send verification email")
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
			slog.Error("failed to send verification email", "error", err, "user_id", user.ID)
			RespondError(c, http.StatusInternalServerError, "Failed to send verification email")
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

// GenerateWSToken returns a short-lived token for browser WebSocket upgrades.
// @Summary      Generate WebSocket token
// @Tags         Auth
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /auth/ws-token [post]
func (h *AuthHandler) GenerateWSToken(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		zlog.Error().Err(err).Int("user_id", userID).Msg("Failed to load user for websocket token")
		RespondError(c, http.StatusInternalServerError, "Failed to generate WebSocket token")
		return
	}
	if user == nil {
		RespondError(c, http.StatusUnauthorized, "Invalid user")
		return
	}

	token, err := h.authService.GenerateWebSocketJWT(user.ID, user.Username, user.Role, user.TokenVersion)
	if err != nil {
		zlog.Error().Err(err).Int("user_id", userID).Msg("Failed to generate websocket token")
		RespondError(c, http.StatusInternalServerError, "Failed to generate WebSocket token")
		return
	}

	c.JSON(http.StatusOK, gin.H{"ws_token": token})
}

// UpdateEmail updates user's email address (requires verification).
// @Summary      Update email address
// @Tags         Auth
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/email [put]
func (h *AuthHandler) UpdateEmail(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req struct {
		Email        string `json:"email" binding:"required,email"`
		EmailConfirm string `json:"email_confirm" binding:"required,email"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Valid email is required")
		return
	}

	// Validate emails match
	if req.Email != req.EmailConfirm {
		RespondError(c, http.StatusBadRequest, "Email addresses do not match")
		return
	}

	// Get user
	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get user")
		return
	}

	// Invalidate old verification tokens
	_ = h.emailVerificationRepo.InvalidateUserTokens(c.Request.Context(), user.ID, "update_email")

	// Generate verification token
	verification, err := h.emailVerificationRepo.GenerateToken(c.Request.Context(), user.ID, req.Email, "update_email")
	if err != nil {
		slog.Error("failed to generate email update verification token", "error", err, "user_id", user.ID)
		RespondError(c, http.StatusInternalServerError, "Failed to send verification email")
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
			slog.Error("failed to send email update verification email", "error", err, "user_id", user.ID)
			RespondError(c, http.StatusInternalServerError, "Failed to send verification email")
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":        "Verification email sent to " + req.Email + ". Your email will be updated after verification.",
		"email_verified": false,
	})
}
