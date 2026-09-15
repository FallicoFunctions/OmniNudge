package handlers

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/utils"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const changePasswordTestSalt = "MDEyMzQ1Njc4OWFiY2RlZg=="

var changePasswordNewKey = base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{8}, 32))

// The handler gets the production repository: the mock once hid that GetByID
// never read the password hash, and every change was refused.
func setupChangePasswordTest(t *testing.T) (*UsersHandler, *database.Database, int) {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	hash, err := utils.HashPassword("correct-password")
	require.NoError(t, err)
	user := &models.User{Username: uniqueAccountDeletionUsername("pwchange"), PasswordHash: hash}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	return &UsersHandler{userRepo: repository.NewPostgresUserRepository(db.Pool)}, db, user.ID
}

func callChangePassword(t *testing.T, h *UsersHandler, userID int, body map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	payload, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/users/change-password", bytes.NewReader(payload))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", userID)
	h.ChangePassword(c)
	return w
}

func storedUserForTest(t *testing.T, db *database.Database, userID int) *models.User {
	t.Helper()
	user, err := models.NewUserRepository(db.Pool).GetByID(context.Background(), userID)
	require.NoError(t, err)
	require.NotNil(t, user)
	return user
}

func TestChangePassword_PasswordAccount(t *testing.T) {
	h, db, userID := setupChangePasswordTest(t)

	assert.Equal(t, http.StatusUnauthorized, callChangePassword(t, h, userID, map[string]any{
		"current_password": "wrong-password", "new_password": "brand-new-password"}).Code)
	assert.Equal(t, http.StatusBadRequest, callChangePassword(t, h, userID, map[string]any{
		"current_password": "correct-password", "new_password": "short"}).Code)
	assert.Equal(t, http.StatusConflict, callChangePassword(t, h, userID, map[string]any{
		"current_login_key": handlerTestLoginKey, "new_login_key": changePasswordNewKey,
		"kdf_salt": changePasswordTestSalt, "kdf_iterations": 600000}).Code,
		"a password account moves to a login key before changing one")

	w := callChangePassword(t, h, userID, map[string]any{
		"current_password": "correct-password", "new_password": "brand-new-password"})
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	stored := storedUserForTest(t, db, userID)
	assert.Equal(t, 1, stored.AuthScheme)
	assert.NoError(t, utils.CheckPassword(stored.PasswordHash, "brand-new-password"))
}

func TestChangePassword_LoginKeyAccount(t *testing.T) {
	h, db, userID := setupChangePasswordTest(t)
	moveTestUserToLoginKey(t, db, userID, handlerTestLoginKey)
	_, err := db.Pool.Exec(context.Background(), `UPDATE users SET encrypted_private_key = 'copy-under-old-key' WHERE id = $1`, userID)
	require.NoError(t, err)

	change := func(current string, rounds int, copy string) map[string]any {
		return map[string]any{"current_login_key": current, "new_login_key": changePasswordNewKey,
			"kdf_salt": changePasswordTestSalt, "kdf_iterations": rounds, "encrypted_private_key": copy}
	}

	assert.Equal(t, http.StatusConflict, callChangePassword(t, h, userID, map[string]any{
		"current_password": "correct-password", "new_password": "brand-new-password"}).Code,
		"a login key account never sends its password")
	assert.Equal(t, http.StatusUnauthorized, callChangePassword(t, h, userID, change(changePasswordNewKey, 600000, "copy-under-new-key")).Code)
	assert.Equal(t, http.StatusBadRequest, callChangePassword(t, h, userID, change(handlerTestLoginKey, 600000, "")).Code,
		"a change must carry the rewrapped key")
	assert.Equal(t, http.StatusBadRequest, callChangePassword(t, h, userID, change(handlerTestLoginKey, 1000, "copy-under-new-key")).Code)

	w := callChangePassword(t, h, userID, change(handlerTestLoginKey, 600000, "copy-under-new-key"))
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	stored := storedUserForTest(t, db, userID)
	assert.Equal(t, 2, stored.AuthScheme)
	require.NotNil(t, stored.EncryptedPrivateKey)
	assert.Equal(t, "copy-under-new-key", *stored.EncryptedPrivateKey)
	assert.NoError(t, services.CheckAccountSecret(stored.PasswordHash, stored.AuthScheme, "", changePasswordNewKey))
}
