package services

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/chatreddit/backend/internal/models"
	"github.com/chatreddit/backend/internal/utils"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/oauth2"
)

// AuthService handles authentication operations
type AuthService struct {
	oauthConfig *oauth2.Config
	jwtSecret   []byte
	userAgent   string
}

// NewAuthService creates a new auth service
func NewAuthService(clientID, clientSecret, redirectURI, jwtSecret, userAgent string) *AuthService {
	return &AuthService{
		oauthConfig: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURI,
			Scopes:       []string{"identity", "read", "submit", "privatemessages"},
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://www.reddit.com/api/v1/authorize",
				TokenURL: "https://www.reddit.com/api/v1/access_token",
			},
		},
		jwtSecret: []byte(jwtSecret),
		userAgent: userAgent,
	}
}

// GenerateState generates a random state string for OAuth
func (s *AuthService) GenerateState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

// GetAuthURL returns the Reddit OAuth authorization URL
func (s *AuthService) GetAuthURL(state string) string {
	return s.oauthConfig.AuthCodeURL(state, oauth2.SetAuthURLParam("duration", "permanent"))
}

// ExchangeCode exchanges an authorization code for tokens
func (s *AuthService) ExchangeCode(ctx context.Context, code string) (*oauth2.Token, error) {
	return s.oauthConfig.Exchange(ctx, code)
}

// RedditUser represents user data from Reddit API
type RedditUser struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Karma     int    `json:"total_karma"`
	Created   int64  `json:"created_utc"`
	IconImg   string `json:"icon_img"`
	Snoovatar string `json:"snoovatar_img"`
}

// GetRedditUser fetches the authenticated user's info from Reddit
func (s *AuthService) GetRedditUser(ctx context.Context, token *oauth2.Token) (*RedditUser, error) {
	client := s.oauthConfig.Client(ctx, token)

	req, err := http.NewRequestWithContext(ctx, "GET", "https://oauth.reddit.com/api/v1/me", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", s.userAgent)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("reddit API error: %s - %s", resp.Status, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var user RedditUser
	if err := json.Unmarshal(body, &user); err != nil {
		return nil, err
	}

	return &user, nil
}

// JWTClaims represents the claims stored in our JWT tokens
type JWTClaims struct {
	UserID   int    `json:"user_id"`
	RedditID string `json:"reddit_id"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// GenerateJWT creates a new JWT token for a user
func (s *AuthService) GenerateJWT(userID int, redditID, username string) (string, error) {
	claims := JWTClaims{
		UserID:   userID,
		RedditID: redditID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)), // 7 days
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "chatreddit",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

// ValidateJWT validates a JWT token and returns the claims
func (s *AuthService) ValidateJWT(tokenString string) (*JWTClaims, error) {
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
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token")
}

// RegisterRequest represents the registration request payload
type RegisterRequest struct {
	Username string  `json:"username"`
	Password string  `json:"password"`
	Email    *string `json:"email,omitempty"`
}

// LoginRequest represents the login request payload
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Register creates a new user with username/password
func (s *AuthService) Register(ctx context.Context, userRepo *models.UserRepository, req *RegisterRequest) (*models.User, string, error) {
	// Validate input
	if len(req.Username) < 3 || len(req.Username) > 50 {
		return nil, "", errors.New("username must be between 3 and 50 characters")
	}

	if len(req.Password) < 8 {
		return nil, "", errors.New("password must be at least 8 characters")
	}

	// Check if username already exists
	existingUser, _ := userRepo.GetByUsername(ctx, req.Username)
	if existingUser != nil {
		return nil, "", errors.New("username already taken")
	}

	// Hash password
	hashedPassword, err := utils.HashPassword(req.Password)
	if err != nil {
		return nil, "", fmt.Errorf("failed to hash password: %w", err)
	}

	// Create user
	user := &models.User{
		Username:     req.Username,
		Email:        req.Email,
		PasswordHash: hashedPassword,
	}

	if err := userRepo.Create(ctx, user); err != nil {
		return nil, "", fmt.Errorf("failed to create user: %w", err)
	}

	// Generate JWT
	token, err := s.GenerateJWT(user.ID, "", user.Username)
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate token: %w", err)
	}

	return user, token, nil
}

// Login authenticates a user with username/password
func (s *AuthService) Login(ctx context.Context, userRepo *models.UserRepository, req *LoginRequest) (*models.User, string, error) {
	// Get user by username
	user, _ := userRepo.GetByUsername(ctx, req.Username)
	if user == nil {
		return nil, "", errors.New("invalid username or password")
	}

	// Check password
	if err := utils.CheckPassword(user.PasswordHash, req.Password); err != nil {
		return nil, "", errors.New("invalid username or password")
	}

	// Update last seen
	_ = userRepo.UpdateLastSeen(ctx, user.ID)

	// Generate JWT
	redditID := ""
	if user.RedditID != nil {
		redditID = *user.RedditID
	}

	token, err := s.GenerateJWT(user.ID, redditID, user.Username)
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate token: %w", err)
	}

	return user, token, nil
}
