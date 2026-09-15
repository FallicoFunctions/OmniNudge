//go:build integration

package integration

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var itKDFSalt = base64.StdEncoding.EncodeToString([]byte("0123456789abcdef"))

func itLoginKey(fill byte) string {
	return base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{fill}, 32))
}

func postAuthJSON(t *testing.T, router *gin.Engine, path string, body any, bearer string) *httptest.ResponseRecorder {
	t.Helper()
	return sendAuthJSON(t, router, http.MethodPost, path, body, bearer)
}

func sendAuthJSON(t *testing.T, router *gin.Engine, method, path string, body any, bearer string) *httptest.ResponseRecorder {
	t.Helper()
	payload, err := json.Marshal(body)
	require.NoError(t, err)
	req, err := http.NewRequest(method, path, bytes.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "198.51.100.7:40000"
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	return doRequest(t, router, req)
}

func preLoginBody(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	return body
}

func TestLoginKeyAccountSignsUpAndInOverHTTP(t *testing.T) {
	deps := newTestDeps(t)
	name := uniqueRLUsername("keyholder")

	w := postAuthJSON(t, deps.Router, "/api/v1/auth/register", map[string]any{
		"username": name, "login_key": itLoginKey(7), "kdf_salt": itKDFSalt, "kdf_iterations": 600000,
		"accept_privacy_policy": true, "accept_terms": true,
	}, "")
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	assert.NotContains(t, w.Body.String(), itLoginKey(7), "the sign-up response must not echo the login key")

	body := preLoginBody(t, postAuthJSON(t, deps.Router, "/api/v1/auth/prelogin", map[string]any{"username": name}, ""))
	assert.Equal(t, map[string]any{"scheme": float64(2), "kdf_salt": itKDFSalt, "kdf_iterations": float64(600000)}, body)

	w = postAuthJSON(t, deps.Router, "/api/v1/auth/login", map[string]any{"username": name, "login_key": itLoginKey(7)}, "")
	assert.Equal(t, http.StatusOK, w.Code, w.Body.String())
	w = postAuthJSON(t, deps.Router, "/api/v1/auth/login", map[string]any{"username": name, "password": "password123"}, "")
	assert.Equal(t, http.StatusUnauthorized, w.Code, "a login key account refuses its password")
}

func TestPasswordAccountMovesToLoginKeyOverHTTP(t *testing.T) {
	deps := newTestDeps(t)
	user := createUser(t, deps.UserRepo, uniqueRLUsername("mover"), "user")
	token, err := deps.AuthService.GenerateJWT(user.ID, user.Username, user.Role)
	require.NoError(t, err)

	body := preLoginBody(t, postAuthJSON(t, deps.Router, "/api/v1/auth/prelogin", map[string]any{"username": user.Username}, ""))
	assert.Equal(t, map[string]any{"scheme": float64(1)}, body, "a password account gets no salt")

	move := map[string]any{"current_password": "wrong-password", "login_key": itLoginKey(9), "kdf_salt": itKDFSalt,
		"kdf_iterations": 600000, "encrypted_private_key": "wrapped-by-wrap-key"}
	assert.Equal(t, http.StatusUnauthorized, postAuthJSON(t, deps.Router, "/api/v1/auth/login-key", move, token).Code)

	move["current_password"] = "password123"
	move["kdf_iterations"] = 1000
	assert.Equal(t, http.StatusBadRequest, postAuthJSON(t, deps.Router, "/api/v1/auth/login-key", move, token).Code)

	move["kdf_iterations"] = 600000
	w := postAuthJSON(t, deps.Router, "/api/v1/auth/login-key", move, token)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, http.StatusConflict, postAuthJSON(t, deps.Router, "/api/v1/auth/login-key", move, token).Code)

	assert.Equal(t, http.StatusUnauthorized,
		postAuthJSON(t, deps.Router, "/api/v1/auth/login", map[string]any{"username": user.Username, "password": "password123"}, "").Code,
		"after the move the password is refused")
	assert.Equal(t, http.StatusOK,
		postAuthJSON(t, deps.Router, "/api/v1/auth/login", map[string]any{"username": user.Username, "login_key": itLoginKey(9)}, "").Code)

	moved, err := deps.UserRepo.GetByID(t.Context(), user.ID)
	require.NoError(t, err)
	require.NotNil(t, moved.EncryptedPrivateKey)
	assert.Equal(t, "wrapped-by-wrap-key", *moved.EncryptedPrivateKey)
}

func TestPreLoginAnswersAMissingNameInTheSameShape(t *testing.T) {
	deps := newTestDeps(t)
	name := uniqueRLUsername("realkey")
	w := postAuthJSON(t, deps.Router, "/api/v1/auth/register", map[string]any{
		"username": name, "login_key": itLoginKey(3), "kdf_salt": itKDFSalt, "kdf_iterations": 600000,
		"accept_privacy_policy": true, "accept_terms": true,
	}, "")
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	real := preLoginBody(t, postAuthJSON(t, deps.Router, "/api/v1/auth/prelogin", map[string]any{"username": name}, ""))
	ghost := preLoginBody(t, postAuthJSON(t, deps.Router, "/api/v1/auth/prelogin", map[string]any{"username": uniqueRLUsername("nobody")}, ""))

	realKeys, ghostKeys := []string{}, []string{}
	for k := range real {
		realKeys = append(realKeys, k)
	}
	for k := range ghost {
		ghostKeys = append(ghostKeys, k)
	}
	assert.ElementsMatch(t, realKeys, ghostKeys)
	assert.Equal(t, real["scheme"], ghost["scheme"])
	assert.Equal(t, real["kdf_iterations"], ghost["kdf_iterations"])
	salt, err := base64.StdEncoding.DecodeString(ghost["kdf_salt"].(string))
	require.NoError(t, err)
	assert.Len(t, salt, 16)
}

func TestRecoveryCopyAndKeyBackupOverHTTP(t *testing.T) {
	deps := newTestDeps(t)
	name := uniqueRLUsername("backedup")
	w := postAuthJSON(t, deps.Router, "/api/v1/auth/register", map[string]any{
		"username": name, "login_key": itLoginKey(7), "kdf_salt": itKDFSalt, "kdf_iterations": 600000,
		"accept_privacy_policy": true, "accept_terms": true,
	}, "")
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	user, err := deps.UserRepo.GetByUsername(t.Context(), name)
	require.NoError(t, err)
	token, err := deps.AuthService.GenerateJWT(user.ID, user.Username, user.Role)
	require.NoError(t, err)

	assert.Equal(t, http.StatusUnauthorized, sendAuthJSON(t, deps.Router, http.MethodPut, "/api/v1/auth/recovery-key",
		map[string]any{"recovery_wrapped_private_key": "copy-under-phrase"}, token).Code, "a session alone cannot replace the phrase")
	assert.Equal(t, http.StatusBadRequest, sendAuthJSON(t, deps.Router, http.MethodPut, "/api/v1/auth/recovery-key",
		map[string]any{"login_key": itLoginKey(7), "recovery_wrapped_private_key": ""}, token).Code)
	w = sendAuthJSON(t, deps.Router, http.MethodPut, "/api/v1/auth/recovery-key",
		map[string]any{"login_key": itLoginKey(7), "recovery_wrapped_private_key": "copy-under-phrase"}, token)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	assert.Equal(t, http.StatusUnauthorized, sendAuthJSON(t, deps.Router, http.MethodPut, "/api/v1/auth/encrypted-private-key",
		map[string]any{"encrypted_private_key": "swapped-copy"}, token).Code, "a session alone cannot swap the copy")
	assert.Equal(t, http.StatusBadRequest, sendAuthJSON(t, deps.Router, http.MethodPut, "/api/v1/auth/encrypted-private-key",
		map[string]any{"login_key": itLoginKey(7), "encrypted_private_key": ""}, token).Code)
	w = sendAuthJSON(t, deps.Router, http.MethodPut, "/api/v1/auth/encrypted-private-key",
		map[string]any{"login_key": itLoginKey(7), "encrypted_private_key": "copy-under-wrap-key"}, token)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	assert.Equal(t, http.StatusUnauthorized, sendAuthJSON(t, deps.Router, http.MethodPut, "/api/v1/auth/public-key",
		map[string]any{"public_key": "attackers-public-key"}, token).Code, "a session alone cannot swap the public key")
	w = sendAuthJSON(t, deps.Router, http.MethodPut, "/api/v1/auth/public-key",
		map[string]any{"login_key": itLoginKey(7), "public_key": "own-public-key"}, token)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	published, err := deps.UserRepo.GetByID(t.Context(), user.ID)
	require.NoError(t, err)
	require.NotNil(t, published.PublicKey)
	assert.Equal(t, "own-public-key", *published.PublicKey)

	w = sendAuthJSON(t, deps.Router, http.MethodGet, "/api/v1/auth/key-backup", nil, token)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var backup map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &backup))
	assert.Equal(t, map[string]any{"auth_scheme": float64(2), "has_password": true,
		"kdf_salt": itKDFSalt, "kdf_iterations": float64(600000),
		"encrypted_private_key": "copy-under-wrap-key", "recovery_wrapped_private_key": "copy-under-phrase"}, backup)
}

func TestAppPasswordOverHTTP(t *testing.T) {
	deps := newTestDeps(t)
	oauthOnly := &models.User{Username: uniqueRLUsername("googleuser"), PasswordHash: ""}
	require.NoError(t, deps.UserRepo.Create(t.Context(), oauthOnly))
	token, err := deps.AuthService.GenerateJWT(oauthOnly.ID, oauthOnly.Username, "user")
	require.NoError(t, err)

	set := func(rounds int, copy string) int {
		return postAuthJSON(t, deps.Router, "/api/v1/auth/app-password", map[string]any{
			"login_key": itLoginKey(4), "kdf_salt": itKDFSalt, "kdf_iterations": rounds, "encrypted_private_key": copy,
		}, token).Code
	}
	assert.Equal(t, http.StatusBadRequest, set(1000, "copy-under-app-password"))
	assert.Equal(t, http.StatusBadRequest, set(600000, ""))
	require.Equal(t, http.StatusOK, set(600000, "copy-under-app-password"))

	assert.Equal(t, http.StatusOK, postAuthJSON(t, deps.Router, "/api/v1/auth/login",
		map[string]any{"username": oauthOnly.Username, "login_key": itLoginKey(4)}, "").Code, "the app password also signs in")
	assert.Equal(t, http.StatusConflict, set(600000, "another-copy"), "once set, change-password applies")

	withPassword := createUser(t, deps.UserRepo, uniqueRLUsername("haspassword"), "user")
	passwordToken, err := deps.AuthService.GenerateJWT(withPassword.ID, withPassword.Username, withPassword.Role)
	require.NoError(t, err)
	assert.Equal(t, http.StatusConflict, postAuthJSON(t, deps.Router, "/api/v1/auth/app-password", map[string]any{
		"login_key": itLoginKey(4), "kdf_salt": itKDFSalt, "kdf_iterations": 600000, "encrypted_private_key": "copy",
	}, passwordToken).Code)
}

func TestPreLoginHasItsOwnLimit(t *testing.T) {
	deps := newRateLimitedTestDeps(t)
	user := createUser(t, deps.UserRepo, uniqueRLUsername("limited"), "user")

	firstRefused := 0
	for i := 1; i <= 31; i++ {
		if postAuthJSON(t, deps.Router, "/api/v1/auth/prelogin", map[string]any{"username": user.Username}, "").Code == http.StatusTooManyRequests {
			firstRefused = i
			break
		}
	}
	assert.Equal(t, 31, firstRefused, "30 pre-logins a minute, the 31st refused")

	w := postAuthJSON(t, deps.Router, "/api/v1/auth/login", map[string]any{"username": user.Username, "password": "password123"}, "")
	assert.Equal(t, http.StatusOK, w.Code, "pre-login must not spend the sign-in limit")
}
