package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
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

// OAuthHandler handles social login via Google, Discord, GitHub, and Steam.
// Steam uses OpenID 2.0, not OAuth2, so it's handled separately from the
// oauth2.Config-based providers throughout this file.
type OAuthHandler struct {
	sessions     *services.AuthSessionService
	userRepo     ports.UserRepository
	db           *pgxpool.Pool
	frontendURL  string
	backendURL   string
	secureCookie bool // true in production (HTTPS)
	google       *oauth2.Config
	discord      *oauth2.Config
	github       *oauth2.Config
	steamAPIKey  string
}

// NewOAuthHandler creates the handler. Pass empty client IDs (or an empty Steam API
// key) to disable a provider.
func NewOAuthHandler(
	sessions *services.AuthSessionService,
	userRepo ports.UserRepository,
	db *pgxpool.Pool,
	frontendURL, backendURL string,
	googleClientID, googleClientSecret string,
	discordClientID, discordClientSecret string,
	githubClientID, githubClientSecret string,
	steamAPIKey string,
	appEnv string,
) *OAuthHandler {
	h := &OAuthHandler{
		sessions:     sessions,
		userRepo:     userRepo,
		db:           db,
		frontendURL:  frontendURL,
		backendURL:   backendURL,
		secureCookie: appEnv != "" && appEnv != "development" && appEnv != "test",
		steamAPIKey:  steamAPIKey,
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

	if githubClientID != "" {
		h.github = &oauth2.Config{
			ClientID:     githubClientID,
			ClientSecret: githubClientSecret,
			RedirectURL:  backendURL + "/api/v1/auth/oauth/github/callback",
			Scopes:       []string{"read:user", "user:email"},
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://github.com/login/oauth/authorize",
				TokenURL: "https://github.com/login/oauth/access_token",
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

func (h *OAuthHandler) writeOAuthStateCookie(c *gin.Context, value string, maxAge int) {
	cookie := &http.Cookie{
		Name: "oauth_state", Value: value, Path: "/api/v1/auth/oauth/",
		MaxAge: maxAge, HttpOnly: true, Secure: h.secureCookie, SameSite: http.SameSiteLaxMode,
	}
	if maxAge < 0 {
		cookie.Expires = time.Unix(1, 0)
	}
	http.SetCookie(c.Writer, cookie)
}

func validOAuthState(cookieState, queryState string) bool {
	return cookieState != "" && queryState != "" &&
		subtle.ConstantTimeCompare([]byte(cookieState), []byte(queryState)) == 1
}

// Initiate handles GET /auth/oauth/:provider — sets state cookie and redirects to provider.
func (h *OAuthHandler) Initiate(c *gin.Context) {
	provider := c.Param("provider")

	if provider == "steam" {
		h.initiateSteam(c)
		return
	}

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

	h.writeOAuthStateCookie(c, state, 600)
	c.Redirect(http.StatusFound, cfg.AuthCodeURL(state, oauth2.AccessTypeOnline))
}

// initiateSteam redirects to Steam's OpenID 2.0 login endpoint. Steam's protocol
// verifies the round-trip itself via check_authentication, so no CSRF state cookie
// is needed here the way it is for the oauth2.Config-based providers.
func (h *OAuthHandler) initiateSteam(c *gin.Context) {
	if h.steamAPIKey == "" {
		c.Redirect(http.StatusFound, h.oauthErrorURL("unknown_provider"))
		return
	}

	state, err := randomHex(16)
	if err != nil {
		c.Redirect(http.StatusFound, h.oauthErrorURL("server_error"))
		return
	}
	h.writeOAuthStateCookie(c, state, 600)
	returnTo := h.backendURL + "/api/v1/auth/oauth/steam/callback?state=" + url.QueryEscape(state)
	params := url.Values{
		"openid.ns":         {"http://specs.openid.net/auth/2.0"},
		"openid.mode":       {"checkid_setup"},
		"openid.return_to":  {returnTo},
		"openid.realm":      {h.backendURL},
		"openid.identity":   {"http://specs.openid.net/auth/2.0/identifier_select"},
		"openid.claimed_id": {"http://specs.openid.net/auth/2.0/identifier_select"},
	}
	c.Redirect(http.StatusFound, "https://steamcommunity.com/openid/login?"+params.Encode())
}

// Callback handles GET /auth/oauth/:provider/callback and establishes a browser session.
func (h *OAuthHandler) Callback(c *gin.Context) {
	provider := c.Param("provider")

	if provider == "steam" {
		h.callbackSteam(c)
		return
	}

	cfg := h.configFor(provider)
	if cfg == nil {
		c.Redirect(http.StatusFound, h.oauthErrorURL("unknown_provider"))
		return
	}

	// CSRF state check
	cookieState, _ := c.Cookie("oauth_state")
	if !validOAuthState(cookieState, c.Query("state")) {
		c.Redirect(http.StatusFound, h.oauthErrorURL("invalid_state"))
		return
	}
	h.writeOAuthStateCookie(c, "", -1)

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

	h.finishOAuthLogin(c, provider, info)
}

// callbackSteam handles GET /auth/oauth/steam/callback. Steam never provides an
// email address, so Steam identities always go through the pending-signup path
// on first login.
func (h *OAuthHandler) callbackSteam(c *gin.Context) {
	if h.steamAPIKey == "" {
		c.Redirect(http.StatusFound, h.oauthErrorURL("unknown_provider"))
		return
	}
	cookieState, _ := c.Cookie("oauth_state")
	if !validOAuthState(cookieState, c.Query("state")) {
		c.Redirect(http.StatusFound, h.oauthErrorURL("invalid_state"))
		return
	}
	h.writeOAuthStateCookie(c, "", -1)

	steamID, err := h.verifySteamCallback(c.Request)
	if err != nil {
		log.Printf("[oauth] steam verification failed: %v", err)
		c.Redirect(http.StatusFound, h.oauthErrorURL("token_exchange"))
		return
	}

	info, err := h.fetchSteamUserInfo(c.Request.Context(), steamID)
	if err != nil {
		log.Printf("[oauth] steam fetchUserInfo failed: %v", err)
		c.Redirect(http.StatusFound, h.oauthErrorURL("user_info"))
		return
	}

	h.finishOAuthLogin(c, "steam", info)
}

// finishOAuthLogin finds/creates the local account for a verified provider identity
// and either redirects to the choose-username flow or establishes a browser session.
func (h *OAuthHandler) finishOAuthLogin(c *gin.Context, provider string, info *oauthUserInfo) {
	user, pending, err := h.findOrPrepareUser(c.Request.Context(), provider, info)
	if err != nil {
		log.Printf("[oauth] findOrPrepareUser failed (provider=%s): %v", provider, err)
		c.Redirect(http.StatusFound, h.oauthErrorURL("account_error"))
		return
	}

	if pending != nil {
		http.SetCookie(c.Writer, &http.Cookie{
			Name: "omni_oauth_pending", Value: pending.Token,
			Path: "/api/v1/auth/oauth/complete", MaxAge: 600,
			HttpOnly: true, Secure: h.secureCookie, SameSite: http.SameSiteStrictMode,
		})
		redirectURL := h.frontendURL + "/auth/choose-username?suggested=" +
			url.QueryEscape(pending.SuggestedUsername) + "&provider=" + provider
		if pending.Email == "" {
			redirectURL += "&no_email=1"
		}
		c.Redirect(http.StatusFound, redirectURL)
		return
	}

	credentials, err := h.sessions.Create(c.Request.Context(), user, true, c.Request.UserAgent(), c.ClientIP())
	if err != nil {
		log.Printf("[oauth] browser session creation failed: %v", err)
		c.Redirect(http.StatusFound, h.oauthErrorURL("server_error"))
		return
	}
	writeBrowserSessionCookies(c, credentials, h.secureCookie)
	c.Redirect(http.StatusFound, h.frontendURL+"/auth/callback?provider="+provider)
}

// verifySteamCallback validates a Steam OpenID 2.0 callback by POSTing the
// assertion back to Steam with openid.mode=check_authentication, and returns the
// authenticated SteamID64 on success.
func (h *OAuthHandler) verifySteamCallback(r *http.Request) (string, error) {
	q := r.URL.Query()
	if q.Get("openid.mode") != "id_res" {
		return "", fmt.Errorf("unexpected openid.mode %q", q.Get("openid.mode"))
	}

	steamID, err := extractSteamID(q.Get("openid.claimed_id"))
	if err != nil {
		return "", err
	}

	verifyParams := url.Values{}
	for k, v := range q {
		verifyParams[k] = v
	}
	verifyParams.Set("openid.mode", "check_authentication")

	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, "https://steamcommunity.com/openid/login", strings.NewReader(verifyParams.Encode()))
	if err != nil {
		return "", fmt.Errorf("create check_authentication request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return "", fmt.Errorf("check_authentication request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("read check_authentication response: %w", err)
	}
	if !strings.Contains(string(body), "is_valid:true") {
		return "", fmt.Errorf("steam rejected the assertion")
	}

	return steamID, nil
}

var steamClaimedIDPattern = regexp.MustCompile(`^https://steamcommunity\.com/openid/id/(\d+)$`)

func extractSteamID(claimedID string) (string, error) {
	m := steamClaimedIDPattern.FindStringSubmatch(claimedID)
	if m == nil {
		return "", fmt.Errorf("invalid claimed_id %q", claimedID)
	}
	return m[1], nil
}

// fetchSteamUserInfo calls the Steam Web API's GetPlayerSummaries to get the
// player's display name and avatar. Steam never exposes an email address.
func (h *OAuthHandler) fetchSteamUserInfo(ctx context.Context, steamID string) (*oauthUserInfo, error) {
	apiURL := fmt.Sprintf(
		"https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=%s&steamids=%s",
		url.QueryEscape(h.steamAPIKey), url.QueryEscape(steamID),
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("GetPlayerSummaries: %w", err)
	}
	defer resp.Body.Close()

	var parsed struct {
		Response struct {
			Players []struct {
				SteamID     string `json:"steamid"`
				PersonaName string `json:"personaname"`
				AvatarFull  string `json:"avatarfull"`
			} `json:"players"`
		} `json:"response"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("decode GetPlayerSummaries response: %w", err)
	}
	if len(parsed.Response.Players) == 0 {
		return nil, fmt.Errorf("steam returned no player for steamid %s", steamID)
	}

	p := parsed.Response.Players[0]
	return &oauthUserInfo{
		ProviderUserID: p.SteamID,
		Name:           p.PersonaName,
		AvatarURL:      p.AvatarFull,
	}, nil
}

// completeSignupRequest is the body for POST /auth/oauth/complete.
type completeSignupRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"` // optional; only sent when the provider didn't supply one
}

// CompleteSignup handles POST /auth/oauth/complete — finalises a pending OAuth
// signup with the user's chosen username and creates a browser session.
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

	pendingToken, cookieErr := c.Cookie("omni_oauth_pending")
	if cookieErr != nil || pendingToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "this sign-up link has expired, please sign in again"})
		return
	}
	pending, err := h.getPendingSignup(c.Request.Context(), pendingToken)
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

	// Use the provider-supplied email if available; otherwise accept the
	// user-supplied one (only offered when the provider gave us nothing).
	resolvedEmail := pending.Email
	userSuppliedEmail := strings.TrimSpace(req.Email)
	if resolvedEmail == "" && userSuppliedEmail != "" {
		resolvedEmail = userSuppliedEmail
	}

	var email *string
	if resolvedEmail != "" {
		email = &resolvedEmail
	}

	newUser := &models.User{
		Username:      username,
		Email:         email,
		EmailVerified: pending.Email != "", // only mark verified if it came from the provider
		PasswordHash:  "",                  // no password for OAuth-only accounts
		AvatarURL:     avatarURL,
	}

	if err := h.userRepo.Create(c.Request.Context(), newUser); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username already taken"})
		return
	}

	info := &oauthUserInfo{
		ProviderUserID: pending.ProviderUserID,
		Email:          resolvedEmail,
		Name:           pending.Name,
		AvatarURL:      pending.AvatarURL,
	}
	if err := h.insertOAuthAccount(c.Request.Context(), newUser.ID, pending.Provider, info); err != nil {
		log.Printf("[oauth] insert oauth_account for new user_id=%d: %v", newUser.ID, err)
	}

	h.deletePendingSignup(c.Request.Context(), pendingToken)
	http.SetCookie(c.Writer, &http.Cookie{
		Name: "omni_oauth_pending", Value: "", Path: "/api/v1/auth/oauth/complete",
		MaxAge: -1, Expires: time.Unix(1, 0), HttpOnly: true,
		Secure: h.secureCookie, SameSite: http.SameSiteStrictMode,
	})

	credentials, err := h.sessions.Create(c.Request.Context(), newUser, true, c.Request.UserAgent(), c.ClientIP())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "failed to create authentication session"})
		return
	}
	writeBrowserSessionCookies(c, credentials, h.secureCookie)
	c.JSON(http.StatusOK, gin.H{"user": newUser})
}

// ── Helpers ────────────────────────────────────────────────────────────────────

func (h *OAuthHandler) configFor(provider string) *oauth2.Config {
	switch provider {
	case "google":
		return h.google
	case "discord":
		return h.discord
	case "github":
		return h.github
	default:
		return nil
	}
}

func (h *OAuthHandler) fetchUserInfo(ctx context.Context, provider string, token *oauth2.Token) (*oauthUserInfo, error) {
	if provider == "github" {
		return h.fetchGitHubUserInfo(ctx, token)
	}

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

// fetchGitHubUserInfo fetches the GitHub profile and, if the public email field
// is empty (common when a user has set their email to private), falls back to
// GET /user/emails to find a verified primary address.
func (h *OAuthHandler) fetchGitHubUserInfo(ctx context.Context, token *oauth2.Token) (*oauthUserInfo, error) {
	client := oauth2.NewClient(ctx, oauth2.StaticTokenSource(token))

	resp, err := client.Get("https://api.github.com/user")
	if err != nil {
		return nil, fmt.Errorf("GET /user: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read /user body: %w", err)
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("unmarshal /user: %w", err)
	}

	idFloat, ok := raw["id"].(float64)
	if !ok || idFloat == 0 {
		return nil, fmt.Errorf("github returned empty user id")
	}

	info := &oauthUserInfo{
		ProviderUserID: fmt.Sprintf("%.0f", idFloat),
		Name:           stringField(raw, "login"),
		AvatarURL:      stringField(raw, "avatar_url"),
		Email:          stringField(raw, "email"),
	}

	if info.Email == "" {
		if email, emailErr := h.fetchGitHubPrimaryEmail(client); emailErr == nil {
			info.Email = email
		}
	}

	return info, nil
}

// fetchGitHubPrimaryEmail calls GET /user/emails and returns the primary verified
// address, falling back to any verified address if no primary one is flagged.
func (h *OAuthHandler) fetchGitHubPrimaryEmail(client *http.Client) (string, error) {
	resp, err := client.Get("https://api.github.com/user/emails")
	if err != nil {
		return "", fmt.Errorf("GET /user/emails: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read /user/emails body: %w", err)
	}

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := json.Unmarshal(body, &emails); err != nil {
		return "", fmt.Errorf("unmarshal /user/emails: %w", err)
	}

	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email, nil
		}
	}
	for _, e := range emails {
		if e.Verified {
			return e.Email, nil
		}
	}
	return "", fmt.Errorf("no verified email found")
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
		hashPendingSignupToken(token), provider, info.ProviderUserID, info.Email, info.Name, info.AvatarURL, suggested, time.Now().UTC().Add(10*time.Minute),
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
		hashPendingSignupToken(token),
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
	if _, err := h.db.Exec(ctx, `DELETE FROM oauth_pending_signups WHERE token = $1`, hashPendingSignupToken(token)); err != nil {
		log.Printf("[oauth] delete pending signup failed: %v", err)
	}
}

func hashPendingSignupToken(token string) string {
	digest := sha256.Sum256([]byte(token))
	return hex.EncodeToString(digest[:])
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
