package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/utils"
)

// TurnstileResponse represents Cloudflare Turnstile verification response
type TurnstileResponse struct {
	Success    bool     `json:"success"`
	ErrorCodes []string `json:"error-codes,omitempty"`
}

// AuthService handles authentication operations
type AuthService struct {
	jwtSecret       []byte
	userAgent       string
	turnstileSecret string
	userRepo        ports.UserRepository
}

// NewAuthService creates a new auth service
func NewAuthService(jwtSecret, userAgent, turnstileSecret string) *AuthService {
	return &AuthService{
		jwtSecret:       []byte(jwtSecret),
		userAgent:       userAgent,
		turnstileSecret: turnstileSecret,
	}
}

func (s *AuthService) SetUserRepository(userRepo ports.UserRepository) {
	s.userRepo = userRepo
}

// VerifyTurnstileToken verifies a Cloudflare Turnstile token
func (s *AuthService) VerifyTurnstileToken(token, remoteIP string) error {
	if s.turnstileSecret == "" {
		// Skip verification if no secret is configured (for development)
		return nil
	}

	// Prepare request to Cloudflare API
	data := fmt.Sprintf("secret=%s&response=%s", s.turnstileSecret, token)
	if remoteIP != "" {
		data += fmt.Sprintf("&remoteip=%s", remoteIP)
	}

	req, err := http.NewRequest("POST", "https://challenges.cloudflare.com/turnstile/v0/siteverify", strings.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to create turnstile verification request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	// Send request
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to verify turnstile token: %w", err)
	}
	defer resp.Body.Close()

	// Parse response
	var turnstileResp TurnstileResponse
	if err := json.NewDecoder(resp.Body).Decode(&turnstileResp); err != nil {
		return fmt.Errorf("failed to decode turnstile response: %w", err)
	}

	if !turnstileResp.Success {
		if len(turnstileResp.ErrorCodes) > 0 {
			return fmt.Errorf("turnstile verification failed: %s", strings.Join(turnstileResp.ErrorCodes, ", "))
		}
		return errors.New("turnstile verification failed")
	}

	return nil
}

// JWTClaims represents the claims stored in our JWT tokens
type JWTClaims struct {
	UserID       int    `json:"user_id"`
	Username     string `json:"username"`
	Role         string `json:"role"`
	TokenVersion int    `json:"token_version"`
	Use          string `json:"use,omitempty"`
	jwt.RegisteredClaims
}

// GenerateJWT creates a new JWT token for a user
func (s *AuthService) GenerateJWT(userID int, username, role string) (string, error) {
	return s.GenerateJWTWithExpiry(userID, username, role, 7*24*time.Hour) // Default 7 days
}

// GenerateJWTWithExpiry creates a new JWT token for a user with custom expiry
func (s *AuthService) GenerateJWTWithExpiry(userID int, username, role string, expiry time.Duration) (string, error) {
	return s.GenerateJWTWithExpiryAndVersion(userID, username, role, 0, expiry)
}

func (s *AuthService) GenerateJWTWithVersion(userID int, username, role string, tokenVersion int) (string, error) {
	return s.GenerateJWTWithExpiryAndVersion(userID, username, role, tokenVersion, 7*24*time.Hour)
}

func (s *AuthService) GenerateJWTWithExpiryAndVersion(userID int, username, role string, tokenVersion int, expiry time.Duration) (string, error) {
	return s.generateJWT(userID, username, role, tokenVersion, expiry, "")
}

// GenerateWebSocketJWT creates a short-lived token intended only for WebSocket upgrades.
func (s *AuthService) GenerateWebSocketJWT(userID int, username, role string, tokenVersion int) (string, error) {
	return s.generateJWT(userID, username, role, tokenVersion, 5*time.Minute, "ws")
}

func (s *AuthService) generateJWT(userID int, username, role string, tokenVersion int, expiry time.Duration, use string) (string, error) {
	claims := JWTClaims{
		UserID:       userID,
		Username:     username,
		Role:         role,
		TokenVersion: tokenVersion,
		Use:          use,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "OmniNudge",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

// ValidateJWT validates a JWT token and returns the claims
func (s *AuthService) ValidateJWT(tokenString string) (*JWTClaims, error) {
	return s.ValidateJWTContext(context.Background(), tokenString)
}

func (s *AuthService) ValidateJWTContext(ctx context.Context, tokenString string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return s.jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
		if s.userRepo != nil {
			user, userErr := s.userRepo.GetByID(ctx, claims.UserID)
			if userErr != nil {
				return nil, userErr
			}
			if user == nil || user.TokenVersion != claims.TokenVersion || user.Banned || user.Deleted {
				return nil, fmt.Errorf("invalid token")
			}
		}
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token")
}

// RegisterRequest represents the registration request payload
type RegisterRequest struct {
	Username            string  `json:"username"`
	Password            string  `json:"password"`
	Email               *string `json:"email,omitempty"`
	TurnstileToken      string  `json:"turnstile_token"`
	AcceptPrivacyPolicy bool    `json:"accept_privacy_policy"` // GDPR requirement
	AcceptTerms         bool    `json:"accept_terms"`          // Legal requirement
}

// LoginRequest represents the login request payload
type LoginRequest struct {
	Username     string `json:"username"`
	Password     string `json:"password"`
	KeepLoggedIn bool   `json:"keep_logged_in"`
}

// Register creates a new user with username/password
func (s *AuthService) Register(ctx context.Context, userRepo ports.UserRepository, req *RegisterRequest) (*models.User, string, error) {
	username := strings.TrimSpace(req.Username)

	// Validate input
	if len(username) < 3 || len(username) > 50 {
		return nil, "", errors.New("username must be between 3 and 50 characters")
	}

	if len(req.Password) < 8 {
		return nil, "", errors.New("password must be at least 8 characters")
	}

	// Validate email format if provided
	if req.Email != nil && *req.Email != "" {
		emailRegex := regexp.MustCompile(`^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$`)
		if !emailRegex.MatchString(*req.Email) {
			return nil, "", errors.New("invalid email format")
		}
	}

	// Validate policy acceptance (GDPR/Legal requirement)
	if !req.AcceptPrivacyPolicy {
		return nil, "", errors.New("you must accept the Privacy Policy to create an account")
	}
	if !req.AcceptTerms {
		return nil, "", errors.New("you must accept the Terms of Service to create an account")
	}

	// Verify Turnstile captcha token
	if err := s.VerifyTurnstileToken(req.TurnstileToken, ""); err != nil {
		return nil, "", fmt.Errorf("captcha verification failed: %w", err)
	}

	// Check if username already exists
	existingUser, _ := userRepo.GetByUsername(ctx, username)
	if existingUser != nil {
		return nil, "", errors.New("username already taken")
	}

	// Hash password
	hashedPassword, err := utils.HashPassword(req.Password)
	if err != nil {
		return nil, "", fmt.Errorf("failed to hash password: %w", err)
	}

	// Create user with policy acceptance
	currentTime := time.Now()
	privacyVersion := "1.0" // Current privacy policy version
	termsVersion := "1.0"   // Current terms of service version

	user := &models.User{
		Username:              username,
		Email:                 req.Email,
		PasswordHash:          hashedPassword,
		PrivacyPolicyVersion:  &privacyVersion,
		TermsOfServiceVersion: &termsVersion,
		PrivacyAcceptedAt:     &currentTime,
		TermsAcceptedAt:       &currentTime,
	}

	if err := userRepo.Create(ctx, user); err != nil {
		return nil, "", fmt.Errorf("failed to create user: %w", err)
	}

	// Generate JWT
	token, err := s.GenerateJWTWithVersion(user.ID, user.Username, user.Role, user.TokenVersion)
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate token: %w", err)
	}

	return user, token, nil
}

// Login authenticates a user with username/password
func (s *AuthService) Login(ctx context.Context, userRepo ports.UserRepository, req *LoginRequest) (*models.User, string, error) {
	username := strings.TrimSpace(req.Username)

	// Get user by username
	user, err := userRepo.GetByUsername(ctx, username)
	if err != nil {
		log.Printf("Login lookup error for username=%q: %v", username, err)
		return nil, "", errors.New("invalid username or password")
	}
	if user == nil {
		log.Printf("Login failed: user not found for username=%q", username)
		return nil, "", errors.New("invalid username or password")
	}
	if user.Banned || user.Deleted {
		log.Printf("Login failed: access revoked for user_id=%d username=%q banned=%t deleted=%t", user.ID, user.Username, user.Banned, user.Deleted)
		return nil, "", errors.New("invalid username or password")
	}

	// Check password
	if err := utils.CheckPassword(user.PasswordHash, req.Password); err != nil {
		log.Printf("Login failed: password mismatch for user_id=%d username=%q", user.ID, user.Username)
		return nil, "", errors.New("invalid username or password")
	}

	// Update last seen
	_ = userRepo.UpdateLastSeen(ctx, user.ID)

	// Generate JWT with appropriate expiry
	var expiry time.Duration
	if req.KeepLoggedIn {
		expiry = 30 * 24 * time.Hour // 30 days
	} else {
		expiry = 24 * time.Hour // 1 day
	}

	token, err := s.GenerateJWTWithExpiryAndVersion(user.ID, user.Username, user.Role, user.TokenVersion, expiry)
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate token: %w", err)
	}

	return user, token, nil
}
