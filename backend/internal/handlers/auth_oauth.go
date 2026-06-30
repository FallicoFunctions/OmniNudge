package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/services"
)

// oauthUserInfo holds the normalised user profile returned by each provider.
type oauthUserInfo struct {
	ProviderUserID string
	Email          string
	Name           string
	AvatarURL      string
}

// OAuthHandler handles social login via Google and Discord.
type OAuthHandler struct {
	authService  *services.AuthService
	userRepo     ports.UserRepository
	db           *pgxpool.Pool
	frontendURL  string
	backendURL   string
	secureCookie bool // true in production (HTTPS)
	google       *oauth2.Config
	discord      *oauth2.Config
}

// NewOAuthHandler creates the handler. Pass empty client IDs to disable a provider.
func NewOAuthHandler(
	authService *services.AuthService,
	userRepo ports.UserRepository,
	db *pgxpool.Pool,
	frontendURL, backendURL string,
	googleClientID, googleClientSecret string,
	discordClientID, discordClientSecret string,
	appEnv string,
) *OAuthHandler {
	h := &OAuthHandler{
		authService:  authService,
		userRepo:     userRepo,
		db:           db,
		frontendURL:  frontendURL,
		backendURL:   backendURL,
		secureCookie: appEnv == "production",
	}

	if googleClientID != "" {
		h.google = &oauth2.Config{
			ClientID:     googleClientID,
			ClientSecret: googleClientSecret,
			RedirectURL:  backendURL + "/api/v1/auth/oauth/google/callback",
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint:     google.Endpoint,
		}
	}

	if discordClientID != "" {
		h.discord = &oauth2.Config{
			ClientID:     discordClientID,
			ClientSecret: discordClientSecret,
			RedirectURL:  backendURL + "/api/v1/auth/oauth/discord/callback",
			Scopes:       []string{"identify", "email"},
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://discord.com/api/oauth2/authorize",
				TokenURL: "https://discord.com/api/oauth2/token",
			},
		}
	}

	return h
}

// oauthErrorURL returns the frontend /auth/callback URL with an error param so the
// OAuthCallbackPage can display user-facing feedback.
func (h *OAuthHandler) oauthErrorURL(reason string) string {
	return h.frontendURL + "/auth/callback?auth_error=" + reason
}

// Initiate handles GET /auth/oauth/:provider — sets state cookie and redirects to provider.
func (h *OAuthHandler) Initiate(c *gin.Context) {
	provider := c.Param("provider")
	cfg := h.configFor(provider)
	if cfg == nil {
		c.Redirect(http.StatusFound, h.oauthErrorURL("unknown_provider"))
		return
	}

	state, err := randomHex(16)
	if err != nil {
		c.Redirect(http.StatusFound, h.oauthErrorURL("server_error"))
		return
	}

	c.SetCookie("oauth_state", state, 600, "/", "", h.secureCookie, true)
	c.Redirect(http.StatusFound, cfg.AuthCodeURL(state, oauth2.AccessTypeOnline))
}

// Callback handles GET /auth/oauth/:provider/callback — exchanges code, finds/creates user, issues JWT.
func (h *OAuthHandler) Callback(c *gin.Context) {
	provider := c.Param("provider")
	cfg := h.configFor(provider)
	if cfg == nil {
		c.Redirect(http.StatusFound, h.oauthErrorURL("unknown_provider"))
		return
	}

	// CSRF state check
	cookieState, _ := c.Cookie("oauth_state")
	if cookieState == "" || cookieState != c.Query("state") {
		c.Redirect(http.StatusFound, h.oauthErrorURL("invalid_state"))
		return
	}
	c.SetCookie("oauth_state", "", -1, "/", "", h.secureCookie, true)

	// Exchange authorisation code for token
	code := c.Query("code")
	if code == "" {
		c.Redirect(http.StatusFound, h.oauthErrorURL("no_code"))
		return
	}

	token, err := cfg.Exchange(c.Request.Context(), code)
	if err != nil {
		log.Printf("[oauth] token exchange failed (provider=%s): %v", provider, err)
		c.Redirect(http.StatusFound, h.oauthErrorURL("token_exchange"))
		return
	}

	// Fetch user profile from provider
	info, err := h.fetchUserInfo(c.Request.Context(), provider, token)
	if err != nil {
		log.Printf("[oauth] fetchUserInfo failed (provider=%s): %v", provider, err)
		c.Redirect(http.StatusFound, h.oauthErrorURL("user_info"))
		return
	}

	// Find an existing account to log into, or stage a pending signup that
	// requires the user to pick a username before the account is created.
	user, pending, err := h.findOrPrepareUser(c.Request.Context(), provider, info)
	if err != nil {
		log.Printf("[oauth] findOrPrepareUser failed (provider=%s): %v", provider, err)
		c.Redirect(http.StatusFound, h.oauthErrorURL("account_error"))
		return
	}

	if pending != nil {
		c.Redirect(http.StatusFound, h.frontendURL+"/auth/choose-username?pending_token="+pending.Token+
			"&suggested="+url.QueryEscape(pending.SuggestedUsername)+"&provider="+provider)
		return
	}

	// Issue JWT (7-day, same as regular login)
	jwtToken, err := h.authService.GenerateJWTWithVersion(user.ID, user.Username, user.Role, user.TokenVersion)
	if err != nil {
		log.Printf("[oauth] GenerateJWT failed: %v", err)
		c.Redirect(http.StatusFound, h.oauthErrorURL("server_error"))
		return
	}

	c.Redirect(http.StatusFound, h.frontendURL+"/auth/callback?token="+jwtToken+"&provider="+provider)
}

// completeSignupRequest is the body for POST /auth/oauth/complete.
type completeSignupRequest struct {
	PendingToken string `json:"pending_token"`
	Username     string `json:"username"`
}

// CompleteSignup handles POST /auth/oauth/complete — finalises a pending OAuth
// signup with the user's chosen username, creates the account, and issues a JWT.
func (h *OAuthHandler) CompleteSignup(c *gin.Context) {
	var req completeSignupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	username := strings.TrimSpace(req.Username)
	if len(username) < 3 || len(username) > 50 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username must be between 3 and 50 characters"})
		return
	}

	pending, err := h.getPendingSignup(c.Request.Context(), req.PendingToken)
	if err != nil || pending == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "this sign-up link has expired, please sign in again"})
		return
	}

	if existing, _ := h.userRepo.GetByUsername(c.Request.Context(), username); existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username already taken"})
		return
	}

	var avatarURL *string
	if pending.AvatarURL != "" {
		avatarURL = &pending.AvatarURL
	}
	var email *string
	if pending.Email != "" {
		email = &pending.Email
	}

	newUser := &models.User{
		Username:      username,
		Email:         email,
		EmailVerified: pending.Email != "",
		PasswordHash:  "", // no password for OAuth-only accounts
		AvatarURL:     avatarURL,
	}

	if err := h.userRepo.Create(c.Request.Context(), newUser); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username already taken"})
		return
	}

	info := &oauthUserInfo{
		ProviderUserID: pending.ProviderUserID,
		Email:          pending.Email,
		Name:           pending.Name,
		AvatarURL:      pending.AvatarURL,
	}
	if err := h.insertOAuthAccount(c.Request.Context(), newUser.ID, pending.Provider, info); err != nil {
		log.Printf("[oauth] insert oauth_account for new user_id=%d: %v", newUser.ID, err)
	}

	h.deletePendingSignup(c.Request.Context(), req.PendingToken)

	jwtToken, err := h.authService.GenerateJWTWithVersion(newUser.ID, newUser.Username, newUser.Role, newUser.TokenVersion)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": jwtToken})
}

// ── Helpers ────────────────────────────────────────────────────────────────────

func (h *OAuthHandler) configFor(provider string) *oauth2.Config {
	switch provider {
	case "google":
		return h.google
	case "discord":
		return h.discord
	default:
		return nil
	}
}

func (h *OAuthHandler) fetchUserInfo(ctx context.Context, provider string, token *oauth2.Token) (*oauthUserInfo, error) {
	var url string
	switch provider {
	case "google":
		url = "https://www.googleapis.com/oauth2/v2/userinfo"
	case "discord":
		url = "https://discord.com/api/users/@me"
	default:
		return nil, fmt.Errorf("unsupported provider %q", provider)
	}

	client := oauth2.NewClient(ctx, oauth2.StaticTokenSource(token))
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("GET %s: %w", url, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}

	info := &oauthUserInfo{}
	switch provider {
	case "google":
		info.ProviderUserID = stringField(raw, "id")
		info.Email = stringField(raw, "email")
		info.Name = stringField(raw, "name")
		info.AvatarURL = stringField(raw, "picture")
	case "discord":
		info.ProviderUserID = stringField(raw, "id")
		info.Email = stringField(raw, "email")
		info.Name = stringField(raw, "username")
		// Build Discord CDN avatar URL if avatar hash present
		if avatarHash := stringField(raw, "avatar"); avatarHash != "" {
			info.AvatarURL = fmt.Sprintf("https://cdn.discordapp.com/avatars/%s/%s.png?size=256", info.ProviderUserID, avatarHash)
		}
	}

	if info.ProviderUserID == "" {
		return nil, fmt.Errorf("provider %q returned empty user id", provider)
	}
	return info, nil
}

// pendingSignup holds a staged OAuth profile awaiting username selection.
type pendingSignup struct {
	Token             string
	Provider          string
	ProviderUserID    string
	Email             string
	Name              string
	AvatarURL         string
	SuggestedUsername string
}

// findOrPrepareUser returns an existing user to log into, or (if this is a brand-new
// identity) stages a pendingSignup so the frontend can ask the user to pick a username.
func (h *OAuthHandler) findOrPrepareUser(ctx context.Context, provider string, info *oauthUserInfo) (*models.User, *pendingSignup, error) {
	// 1. Check if this OAuth identity already exists
	var userID int
	err := h.db.QueryRow(ctx,
		`SELECT user_id FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2`,
		provider, info.ProviderUserID,
	).Scan(&userID)

	if err == nil {
		// Existing OAuth account — load user
		user, getErr := h.userRepo.GetByID(ctx, userID)
		return user, nil, getErr
	}

	// 2. If the provider gave us an email, try to find an existing native account to link
	if info.Email != "" {
		existing, lookupErr := h.userRepo.GetByEmail(ctx, info.Email)
		if lookupErr == nil && existing != nil {
			// Link this OAuth identity to the existing account
			if linkErr := h.insertOAuthAccount(ctx, existing.ID, provider, info); linkErr != nil {
				log.Printf("[oauth] link existing account (user_id=%d): %v", existing.ID, linkErr)
			}
			return existing, nil, nil
		}
	}

	// 3. Brand-new identity — stage a pending signup awaiting username selection
	suggested, err := h.generateUsername(ctx, info.Name, info.Email)
	if err != nil {
		return nil, nil, fmt.Errorf("generateUsername: %w", err)
	}

	token, err := randomHex(24)
	if err != nil {
		return nil, nil, fmt.Errorf("randomHex: %w", err)
	}

	_, err = h.db.Exec(ctx,
		`INSERT INTO oauth_pending_signups (token, provider, provider_user_id, email, name, avatar_url, suggested_username, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		token, provider, info.ProviderUserID, info.Email, info.Name, info.AvatarURL, suggested, time.Now().UTC().Add(15*time.Minute),
	)
	if err != nil {
		return nil, nil, fmt.Errorf("insert pending signup: %w", err)
	}

	return nil, &pendingSignup{
		Token:             token,
		Provider:          provider,
		ProviderUserID:    info.ProviderUserID,
		Email:             info.Email,
		Name:              info.Name,
		AvatarURL:         info.AvatarURL,
		SuggestedUsername: suggested,
	}, nil
}

// getPendingSignup loads and validates a not-yet-expired pending signup.
func (h *OAuthHandler) getPendingSignup(ctx context.Context, token string) (*pendingSignup, error) {
	if token == "" {
		return nil, fmt.Errorf("missing token")
	}
	p := &pendingSignup{Token: token}
	var expiresAt time.Time
	err := h.db.QueryRow(ctx,
		`SELECT provider, provider_user_id, COALESCE(email, ''), COALESCE(name, ''), COALESCE(avatar_url, ''), suggested_username, expires_at
		 FROM oauth_pending_signups WHERE token = $1`,
		token,
	).Scan(&p.Provider, &p.ProviderUserID, &p.Email, &p.Name, &p.AvatarURL, &p.SuggestedUsername, &expiresAt)
	if err != nil {
		return nil, err
	}
	if time.Now().UTC().After(expiresAt) {
		h.deletePendingSignup(ctx, token)
		return nil, fmt.Errorf("pending signup expired")
	}
	return p, nil
}

func (h *OAuthHandler) deletePendingSignup(ctx context.Context, token string) {
	if _, err := h.db.Exec(ctx, `DELETE FROM oauth_pending_signups WHERE token = $1`, token); err != nil {
		log.Printf("[oauth] delete pending signup failed: %v", err)
	}
}

func (h *OAuthHandler) insertOAuthAccount(ctx context.Context, userID int, provider string, info *oauthUserInfo) error {
	var email *string
	if info.Email != "" {
		email = &info.Email
	}
	_, err := h.db.Exec(ctx,
		`INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email, created_at)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (provider, provider_user_id) DO NOTHING`,
		userID, provider, info.ProviderUserID, email, time.Now().UTC(),
	)
	return err
}

// generateUsername derives a username from display name / email and ensures it's unique.
var nonAlphanumUnderscore = regexp.MustCompile(`[^a-z0-9_]`)

func (h *OAuthHandler) generateUsername(ctx context.Context, name, email string) (string, error) {
	base := strings.ToLower(name)
	if base == "" && email != "" {
		base = strings.SplitN(email, "@", 2)[0]
	}
	if base == "" {
		base = "user"
	}
	base = nonAlphanumUnderscore.ReplaceAllString(base, "_")
	base = strings.Trim(base, "_")
	if len(base) > 20 {
		base = base[:20]
	}
	if len(base) < 3 {
		base = "user"
	}

	// Try base, then base + random suffix
	for attempt := 0; attempt < 10; attempt++ {
		candidate := base
		if attempt > 0 {
			suffix, err := randomHex(2)
			if err != nil {
				return "", err
			}
			candidate = base + "_" + suffix
			if len(candidate) > 25 {
				candidate = candidate[:25]
			}
		}
		existing, _ := h.userRepo.GetByUsername(ctx, candidate)
		if existing == nil {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("could not generate unique username after 10 attempts")
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func stringField(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}
