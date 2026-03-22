package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/utils"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockEmailService records all emails sent during a test without making
// real network calls. It satisfies the AuthEmailSender interface.
type mockEmailService struct {
	mu    sync.Mutex
	calls []mockEmailCall
	err   error // if non-nil, returned for every send attempt
}

type mockEmailCall struct {
	To      []string
	Subject string
	Body    string
}

func (m *mockEmailService) SendEmail(to []string, subject, body, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls = append(m.calls, mockEmailCall{To: to, Subject: subject, Body: body})
	return m.err
}

// SendTemplatedEmail satisfies AuthEmailSender; delegates to SendEmail for recording.
func (m *mockEmailService) SendTemplatedEmail(to []string, template services.EmailTemplate, data map[string]string) error {
	// Perform minimal template filling so callers can inspect the subject/body.
	subject := template.Subject
	body := template.Body
	for k, v := range data {
		placeholder := "{{" + k + "}}"
		subject = replaceAll(subject, placeholder, v)
		body = replaceAll(body, placeholder, v)
	}
	return m.SendEmail(to, subject, body, "")
}

// replaceAll is a local helper used by mockEmailService to avoid importing strings.
func replaceAll(s, old, new string) string {
	result := s
	for {
		idx := indexOf(result, old)
		if idx < 0 {
			break
		}
		result = result[:idx] + new + result[idx+len(old):]
	}
	return result
}

// indexOf returns the index of substr in s, or -1 if not found.
func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}

// callCount returns how many times SendEmail/SendTemplatedEmail were called.
func (m *mockEmailService) callCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.calls)
}

// uniqueAuthEmailUsername generates a unique username for auth email tests.
func uniqueAuthEmailUsername(base string) string {
	return fmt.Sprintf("%s_authemail_%d", base, time.Now().UnixNano())
}

// setupAuthHandlerForEmailTest creates an AuthHandler with real DB repos and a
// mock email service. The test database is migrated automatically and all table
// data is reset in t.Cleanup.
func setupAuthHandlerForEmailTest(t *testing.T) (
	*AuthHandler,
	*mockEmailService,
	*database.Database,
	func(),
) {
	t.Helper()

	// Initialize encryption key so email encrypt/decrypt works in tests.
	require.NoError(t, utils.SetEncryptionKey("test-encryption-key-for-auth!!"))

	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	passwordResetRepo := repository.NewPostgresPasswordResetRepository(db.Pool)
	emailVerificationRepo := repository.NewPostgresEmailVerificationRepository(db.Pool)

	authService := services.NewAuthService("", "", "", "test-jwt-secret", "ua", "")
	mockEmail := &mockEmailService{}

	handler := NewAuthHandler(
		authService,
		userRepo,
		// mockEmail satisfies AuthEmailSender — no real network calls are made.
		mockEmail,
		passwordResetRepo,
		emailVerificationRepo,
		"http://localhost:5176",
		nil, // auditLogger — nil safe
		nil, // lockoutService — nil safe
		"",  // appEnv — non-production
	)

	cleanup := func() { db.Close() }

	return handler, mockEmail, db, cleanup
}

// createVerifiedUserWithEmail inserts a user with a verified email for use in
// password-reset tests.
func createVerifiedUserWithEmail(t *testing.T, db *database.Database, username, email string) *models.User {
	t.Helper()
	ctx := context.Background()
	repo := models.NewUserRepository(db.Pool)

	hash, err := utils.HashPassword("ValidPassword1!")
	require.NoError(t, err)

	user := &models.User{
		Username:     username,
		PasswordHash: hash,
	}
	require.NoError(t, repo.Create(ctx, user))

	// Encrypt and set a verified email directly so the handler can use it.
	encryptedEmail, err := utils.EncryptEmail(email)
	require.NoError(t, err)
	require.NoError(t, repo.UpdateVerifiedEmail(ctx, user.ID, encryptedEmail))

	// Re-fetch to pick up the encrypted email field.
	updated, err := repo.GetByID(ctx, user.ID)
	require.NoError(t, err)
	return updated
}

// TestForgotPassword_UserExists verifies that a user with a verified email
// receives a 200 response (the specific wording guards against enumeration).
func TestForgotPassword_UserExists(t *testing.T) {
	handler, _, db, cleanup := setupAuthHandlerForEmailTest(t)
	defer cleanup()

	username := uniqueAuthEmailUsername("fp_exists")
	createVerifiedUserWithEmail(t, db, username, username+"@example.com")

	router := gin.New()
	router.POST("/auth/forgot-password", handler.ForgotPassword)

	body := map[string]interface{}{"username": username}
	payload, err := json.Marshal(body)
	require.NoError(t, err)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/auth/forgot-password", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	// Always 200 to prevent user enumeration.
	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Contains(t, resp["message"], "password reset link")
}

// TestForgotPassword_UserNotFound verifies that a missing user still returns
// 200 (anti-enumeration).
func TestForgotPassword_UserNotFound(t *testing.T) {
	handler, _, _, cleanup := setupAuthHandlerForEmailTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/auth/forgot-password", handler.ForgotPassword)

	body := map[string]interface{}{"username": "nonexistent_user_xyz_99999"}
	payload, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/auth/forgot-password", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Contains(t, resp["message"], "password reset link")
}

// TestForgotPassword_UserNoEmail verifies that a user without a verified email
// still returns 200 (anti-enumeration).
func TestForgotPassword_UserNoEmail(t *testing.T) {
	handler, _, db, cleanup := setupAuthHandlerForEmailTest(t)
	defer cleanup()

	ctx := context.Background()
	repo := models.NewUserRepository(db.Pool)
	username := uniqueAuthEmailUsername("fp_noemail")

	hash, err := utils.HashPassword("ValidPassword1!")
	require.NoError(t, err)
	user := &models.User{Username: username, PasswordHash: hash}
	require.NoError(t, repo.Create(ctx, user))

	router := gin.New()
	router.POST("/auth/forgot-password", handler.ForgotPassword)

	body := map[string]interface{}{"username": username}
	payload, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/auth/forgot-password", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

// TestResetPassword_ValidToken verifies that a valid reset token causes the
// password to be updated and returns 200.
func TestResetPassword_ValidToken(t *testing.T) {
	handler, _, db, cleanup := setupAuthHandlerForEmailTest(t)
	defer cleanup()

	username := uniqueAuthEmailUsername("rp_valid")
	createVerifiedUserWithEmail(t, db, username, username+"@example.com")

	// Obtain a real token by calling ForgotPassword first.
	router := gin.New()
	router.POST("/auth/forgot-password", handler.ForgotPassword)
	router.POST("/auth/reset-password", handler.ResetPassword)

	fpBody, _ := json.Marshal(map[string]interface{}{"username": username})
	fpReq := httptest.NewRequest(http.MethodPost, "/auth/forgot-password", bytes.NewBuffer(fpBody))
	fpReq.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(httptest.NewRecorder(), fpReq)

	// Read the token directly from the database.
	ctx := context.Background()
	var token string
	err := db.Pool.QueryRow(ctx,
		`SELECT token FROM password_resets WHERE used_at IS NULL ORDER BY created_at DESC LIMIT 1`,
	).Scan(&token)
	require.NoError(t, err, "expected a password reset token in the database")

	// Now reset the password with the real token.
	rpBody, _ := json.Marshal(map[string]interface{}{
		"token":        token,
		"new_password": "NewSecurePass1!",
	})
	w := httptest.NewRecorder()
	rpReq := httptest.NewRequest(http.MethodPost, "/auth/reset-password", bytes.NewBuffer(rpBody))
	rpReq.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, rpReq)

	assert.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Contains(t, resp["message"], "reset")
}

// TestResetPassword_InvalidToken verifies that an unknown token returns 400.
func TestResetPassword_InvalidToken(t *testing.T) {
	handler, _, _, cleanup := setupAuthHandlerForEmailTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/auth/reset-password", handler.ResetPassword)

	body, _ := json.Marshal(map[string]interface{}{
		"token":        "totally-invalid-token-xyz",
		"new_password": "NewSecurePass1!",
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/auth/reset-password", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())
}

// TestResetPassword_AlreadyUsedToken verifies that a token that has already
// been consumed returns 400 rather than allowing a second password reset.
func TestResetPassword_AlreadyUsedToken(t *testing.T) {
	handler, _, db, cleanup := setupAuthHandlerForEmailTest(t)
	defer cleanup()

	username := uniqueAuthEmailUsername("rp_used")
	createVerifiedUserWithEmail(t, db, username, username+"@example.com")

	router := gin.New()
	router.POST("/auth/forgot-password", handler.ForgotPassword)
	router.POST("/auth/reset-password", handler.ResetPassword)

	// Generate a token.
	fpBody, _ := json.Marshal(map[string]interface{}{"username": username})
	fpReq := httptest.NewRequest(http.MethodPost, "/auth/forgot-password", bytes.NewBuffer(fpBody))
	fpReq.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(httptest.NewRecorder(), fpReq)

	ctx := context.Background()
	var token string
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT token FROM password_resets WHERE used_at IS NULL ORDER BY created_at DESC LIMIT 1`,
	).Scan(&token))

	// Use the token once — should succeed.
	firstBody, _ := json.Marshal(map[string]interface{}{
		"token":        token,
		"new_password": "FirstNewPass1!",
	})
	w1 := httptest.NewRecorder()
	req1 := httptest.NewRequest(http.MethodPost, "/auth/reset-password", bytes.NewBuffer(firstBody))
	req1.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w1, req1)
	require.Equal(t, http.StatusOK, w1.Code, w1.Body.String())

	// Use the same token again — must fail with 400.
	secondBody, _ := json.Marshal(map[string]interface{}{
		"token":        token,
		"new_password": "SecondNewPass1!",
	})
	w2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodPost, "/auth/reset-password", bytes.NewBuffer(secondBody))
	req2.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusBadRequest, w2.Code, w2.Body.String())
}
