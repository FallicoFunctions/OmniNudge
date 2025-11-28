package integration

import (
	"bytes"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestBadPostPayload(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "badpost", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	body := []byte(`{"title":""}`) // invalid title
	req, _ := http.NewRequest("POST", "/api/v1/posts", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)
	require.GreaterOrEqual(t, w.Code, 400)
}

func TestBadMessagePayload(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "badmsg", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	body := []byte(`{"conversation_id":0,"encrypted_content":"","message_type":"invalid","encryption_version":"v1"}`)
	req, _ := http.NewRequest("POST", "/api/v1/messages", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)
	require.GreaterOrEqual(t, w.Code, 400)
}

func TestBadMediaUploadMissingFile(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "badmedia", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	req, _ := http.NewRequest("POST", "/api/v1/media/upload", bytes.NewReader(nil))
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)
	require.GreaterOrEqual(t, w.Code, 400)
}
