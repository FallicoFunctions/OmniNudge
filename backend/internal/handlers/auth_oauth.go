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
	authService *services.AuthService
	userRepo    ports.UserRepository
	db          *pgxpool.Pool
	frontendURL string
	backendURL  string
	secureCookie bool // true in production (HTTPS)
	google      *oauth2.Config
	discord     *oauth2.Config
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

// Initiate handles GET /auth/oauth/:provider — sets state cookie and redirects to provider.
func (h *OAuthHandler) Initiate(c *gin.Context) {
	provider := c.Param("provider")
	cfg := h.configFor(provider)
	if cfg == nil {
		c.Redirect(http.StatusFound, h.frontendURL+"?auth_error=unknown_provider")
		return
	}

	state, err := randomHex(16)
	if err != nil {
		c.Redirect(http.StatusFound, h.frontendURL+"?auth_error=server_error")
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
		c.Redirect(http.StatusFound, h.frontendURL+"?auth_error=unknown_provider")
		return
	}

	// CSRF state check
	cookieState, _ := c.Cookie("oauth_state")
	if cookieState == "" || cookieState != c.Query("state") {
		c.Redirect(http.StatusFound, h.frontendURL+"?auth_error=invalid_state")
		return
	}
	c.SetCookie("oauth_state", "", -1, "/", "", h.secureCookie, true)

	// Exchange authorisation code for token
	code := c.Query("code")
	if code == "" {
		c.Redirect(http.StatusFound, h.frontendURL+"?auth_error=no_code")
		return
	}

	token, err := cfg.Exchange(c.Request.Context(), code)
	if err != nil {
		log.Printf("[oauth] token exchange failed (provider=%s): %v", provider, err)
		c.Redirect(http.StatusFound, h.frontendURL+"?auth_error=token_exchange")
		return
	}

	// Fetch user profile from provider
	info, err := h.fetchUserInfo(c.Request.Context(), provider, token)
	if err != nil {
		log.Printf("[oauth] fetchUserInfo failed (provider=%s): %v", provider, err)
		c.Redirect(http.StatusFound, h.frontendURL+"?auth_error=user_info")
		return
	}

	// Find or create the local user account
	user, err := h.findOrCreateUser(c.Request.Context(), provider, info)
	if err != nil {
		log.Printf("[oauth] findOrCreateUser failed (provider=%s): %v", provider, err)
		c.Redirect(http.StatusFound, h.frontendURL+"?auth_error=account_error")
		return
	}

	// Issue JWT (7-day, same as regular login)
	jwtToken, err := h.authService.GenerateJWT(user.ID, user.Username, user.Role)
	if err != nil {
		log.Printf("[oauth] GenerateJWT failed: %v", err)
		c.Redirect(http.StatusFound, h.frontendURL+"?auth_error=server_error")
		return
	}

	c.Redirect(http.StatusFound, h.frontendURL+"/auth/callback?token="+jwtToken+"&provider="+provider)
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

func (h *OAuthHandler) findOrCreateUser(ctx context.Context, provider string, info *oauthUserInfo) (*models.User, error) {
	// 1. Check if this OAuth identity already exists
	var userID int
	err := h.db.QueryRow(ctx,
		`SELECT user_id FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2`,
		provider, info.ProviderUserID,
	).Scan(&userID)

	if err == nil {
		// Existing OAuth account — load user
		return h.userRepo.GetByID(ctx, userID)
	}

	// 2. If the provider gave us an email, try to find an existing native account to link
	if info.Email != "" {
		existing, lookupErr := h.userRepo.GetByEmail(ctx, info.Email)
		if lookupErr == nil && existing != nil {
			// Link this OAuth identity to the existing account
			if linkErr := h.insertOAuthAccount(ctx, existing.ID, provider, info); linkErr != nil {
				log.Printf("[oauth] link existing account (user_id=%d): %v", existing.ID, linkErr)
			}
			return existing, nil
		}
	}

	// 3. Create a brand-new user
	username, err := h.generateUsername(ctx, info.Name, info.Email)
	if err != nil {
		return nil, fmt.Errorf("generateUsername: %w", err)
	}

	var avatarURL *string
	if info.AvatarURL != "" {
		avatarURL = &info.AvatarURL
	}
	var email *string
	if info.Email != "" {
		email = &info.Email
	}

	newUser := &models.User{
		Username:      username,
		Email:         email,
		EmailVerified: info.Email != "",
		PasswordHash:  "", // no password for OAuth-only accounts
		AvatarURL:     avatarURL,
	}

	if err := h.userRepo.Create(ctx, newUser); err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	if err := h.insertOAuthAccount(ctx, newUser.ID, provider, info); err != nil {
		log.Printf("[oauth] insert oauth_account for new user_id=%d: %v", newUser.ID, err)
	}

	return newUser, nil
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
	if base == "" {
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
