package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var authTestCounter int64

func uniqueAuthUsername(base string) string {
	id := atomic.AddInt64(&authTestCounter, 1)
	return fmt.Sprintf("%s_auth_%d_%d", base, time.Now().UnixNano(), id)
}

func setupAuthHandlerTest(t *testing.T) (*AuthHandler, *database.Database, func()) {
	t.Helper()

	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	err = database.ResetTestData(ctx, db)
	require.NoError(t, err)

	// AuthService with empty turnstile secret (skips captcha in tests)
	authSvc := services.NewAuthService(
		"",                                 // clientID
		"",                                 // clientSecret
		"",                                 // redirectURI
		"test-jwt-secret-for-testing-only", // jwtSecret
		"test-agent",                       // userAgent
		"",                                 // turnstileSecret (empty = skip)
	)

	userRepo := models.NewUserRepository(db.Pool)
	handler := NewAuthHandler(
		authSvc,
		userRepo,
		nil, // emailService
		nil, // passwordResetRepo
		nil, // emailVerificationRepo
		"http://localhost:3000",
		nil, // auditLogger
		nil, // lockoutService
	)

	cleanup := func() {
		db.Close()
	}
	return handler, db, cleanup
}

func TestRegister(t *testing.T) {
	gin.SetMode(gin.TestMode)

	testCases := []struct {
		name           string
		body           map[string]interface{}
		expectedStatus int
		expectToken    bool
	}{
		{
			name: "success",
			body: map[string]interface{}{
				"username":              uniqueAuthUsername("register_ok"),
				"password":              "ValidPass123!",
				"accept_privacy_policy": true,
				"accept_terms":          true,
			},
			expectedStatus: http.StatusCreated,
			expectToken:    true,
		},
		{
			name: "password too short",
			body: map[string]interface{}{
				"username":              uniqueAuthUsername("short_pw"),
				"password":              "short",
				"accept_privacy_policy": true,
				"accept_terms":          true,
			},
			expectedStatus: http.StatusBadRequest,
			expectToken:    false,
		},
		{
			name: "username too short",
			body: map[string]interface{}{
				"username":              "ab",
				"password":              "ValidPass123!",
				"accept_privacy_policy": true,
				"accept_terms":          true,
			},
			expectedStatus: http.StatusBadRequest,
			expectToken:    false,
		},
		{
			name: "missing privacy policy acceptance",
			body: map[string]interface{}{
				"username":              uniqueAuthUsername("no_policy"),
				"password":              "ValidPass123!",
				"accept_privacy_policy": false,
				"accept_terms":          true,
			},
			expectedStatus: http.StatusBadRequest,
			expectToken:    false,
		},
		{
			name: "missing terms acceptance",
			body: map[string]interface{}{
				"username":              uniqueAuthUsername("no_terms"),
				"password":              "ValidPass123!",
				"accept_privacy_policy": true,
				"accept_terms":          false,
			},
			expectedStatus: http.StatusBadRequest,
			expectToken:    false,
		},
		{
			name:           "empty body returns bad request",
			body:           map[string]interface{}{},
			expectedStatus: http.StatusBadRequest,
			expectToken:    false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			handler, _, cleanup := setupAuthHandlerTest(t)
			defer cleanup()

			router := gin.New()
			router.POST("/auth/register", handler.Register)

			bodyJSON, err := json.Marshal(tc.body)
			require.NoError(t, err)

			req := httptest.NewRequest(http.MethodPost, "/auth/register", bytes.NewBuffer(bodyJSON))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, tc.expectedStatus, w.Code)

			if tc.expectToken {
				var resp map[string]interface{}
				err := json.Unmarshal(w.Body.Bytes(), &resp)
				require.NoError(t, err)
				assert.Contains(t, resp, "token")
				// Token must be a non-empty string
				token, _ := resp["token"].(string)
				assert.NotEmpty(t, token, "token must be a non-empty string")
			}
		})
	}
}

func TestRegisterDuplicateUsername(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, _, cleanup := setupAuthHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/auth/register", handler.Register)

	username := uniqueAuthUsername("dup_user")
	body := map[string]interface{}{
		"username":              username,
		"password":              "ValidPass123!",
		"accept_privacy_policy": true,
		"accept_terms":          true,
	}
	bodyJSON, _ := json.Marshal(body)

	// First registration — should succeed
	req1 := httptest.NewRequest(http.MethodPost, "/auth/register", bytes.NewBuffer(bodyJSON))
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	assert.Equal(t, http.StatusCreated, w1.Code)

	// Second registration with same username — must fail
	bodyJSON2, _ := json.Marshal(body)
	req2 := httptest.NewRequest(http.MethodPost, "/auth/register", bytes.NewBuffer(bodyJSON2))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusBadRequest, w2.Code)

	// Second response must NOT contain a token
	var resp map[string]interface{}
	err := json.Unmarshal(w2.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.NotContains(t, resp, "token")
}

func TestLogin(t *testing.T) {
	gin.SetMode(gin.TestMode)

	testCases := []struct {
		name           string
		setup          func(t *testing.T, handler *AuthHandler) string // returns username
		password       string
		expectedStatus int
		expectToken    bool
	}{
		{
			name: "success",
			setup: func(t *testing.T, handler *AuthHandler) string {
				t.Helper()
				return "" // signals caller to register first
			},
			password:       "ValidPass123!",
			expectedStatus: http.StatusOK,
			expectToken:    true,
		},
		{
			name: "wrong password",
			setup: func(t *testing.T, handler *AuthHandler) string {
				t.Helper()
				return ""
			},
			password:       "WrongPassword!",
			expectedStatus: http.StatusUnauthorized,
			expectToken:    false,
		},
		{
			name: "user not found",
			setup: func(t *testing.T, handler *AuthHandler) string {
				t.Helper()
				return "nonexistent_user_xyz"
			},
			password:       "SomePassword123!",
			expectedStatus: http.StatusUnauthorized,
			expectToken:    false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			handler, _, cleanup := setupAuthHandlerTest(t)
			defer cleanup()

			registerRouter := gin.New()
			registerRouter.POST("/auth/register", handler.Register)

			loginRouter := gin.New()
			loginRouter.POST("/auth/login", handler.Login)

			username := tc.setup(t, handler)
			correctPassword := "ValidPass123!"

			// If setup returned empty string, register a fresh user
			if username == "" {
				username = uniqueAuthUsername("login_user")
				regBody := map[string]interface{}{
					"username":              username,
					"password":              correctPassword,
					"accept_privacy_policy": true,
					"accept_terms":          true,
				}
				regJSON, _ := json.Marshal(regBody)
				regReq := httptest.NewRequest(http.MethodPost, "/auth/register", bytes.NewBuffer(regJSON))
				regReq.Header.Set("Content-Type", "application/json")
				regW := httptest.NewRecorder()
				registerRouter.ServeHTTP(regW, regReq)
				require.Equal(t, http.StatusCreated, regW.Code, "pre-test registration failed")
			}

			loginBody := map[string]interface{}{
				"username": username,
				"password": tc.password,
			}
			loginJSON, _ := json.Marshal(loginBody)
			req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewBuffer(loginJSON))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			loginRouter.ServeHTTP(w, req)

			assert.Equal(t, tc.expectedStatus, w.Code)

			if tc.expectToken {
				var resp map[string]interface{}
				err := json.Unmarshal(w.Body.Bytes(), &resp)
				require.NoError(t, err)
				assert.Contains(t, resp, "token")
				assert.Contains(t, resp, "user")
				// Token must not be empty
				token, _ := resp["token"].(string)
				assert.NotEmpty(t, token)
			} else {
				// Unauthorized responses must NOT expose a token
				var resp map[string]interface{}
				err := json.Unmarshal(w.Body.Bytes(), &resp)
				require.NoError(t, err)
				assert.NotContains(t, resp, "token")
			}
		})
	}
}

func TestLogin_EmptyBody(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, _, cleanup := setupAuthHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/auth/login", handler.Login)

	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewBuffer([]byte("{}")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Missing credentials must not succeed
	assert.NotEqual(t, http.StatusOK, w.Code)
}

func TestGetMe(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, db, cleanup := setupAuthHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     uniqueAuthUsername("getme_user"),
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, user)
	require.NoError(t, err)

	testCases := []struct {
		name           string
		setupContext   func(c *gin.Context)
		expectedStatus int
	}{
		{
			name: "authenticated user gets profile",
			setupContext: func(c *gin.Context) {
				c.Set("user_id", user.ID)
			},
			expectedStatus: http.StatusOK,
		},
		{
			name: "missing user_id in context returns error",
			setupContext: func(c *gin.Context) {
				// do not set user_id
			},
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name: "invalid user_id type in context returns error",
			setupContext: func(c *gin.Context) {
				c.Set("user_id", "not-an-int")
			},
			expectedStatus: http.StatusUnauthorized,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			router := gin.New()
			setup := tc.setupContext
			router.GET("/auth/me", func(c *gin.Context) {
				setup(c)
				handler.GetMe(c)
			})

			req := httptest.NewRequest(http.MethodGet, "/auth/me", nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, tc.expectedStatus, w.Code)

			if tc.expectedStatus == http.StatusOK {
				var resp map[string]interface{}
				err := json.Unmarshal(w.Body.Bytes(), &resp)
				require.NoError(t, err)
				assert.Contains(t, resp, "id")
				assert.Contains(t, resp, "username")
			}
		})
	}
}

func TestLogout(t *testing.T) {
	gin.SetMode(gin.TestMode)

	testCases := []struct {
		name           string
		setUserID      bool
		userID         int
		expectedStatus int
	}{
		{
			name:           "logout with authenticated user",
			setUserID:      true,
			userID:         1,
			expectedStatus: http.StatusOK,
		},
		{
			name:           "logout without user_id in context",
			setUserID:      false,
			userID:         0,
			expectedStatus: http.StatusUnauthorized,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			handler, _, cleanup := setupAuthHandlerTest(t)
			defer cleanup()

			router := gin.New()
			setID := tc.setUserID
			uid := tc.userID
			router.POST("/auth/logout", func(c *gin.Context) {
				if setID {
					c.Set("user_id", uid)
				}
				handler.Logout(c)
			})

			req := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, tc.expectedStatus, w.Code)
		})
	}
}
