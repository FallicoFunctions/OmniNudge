package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/chatreddit/backend/internal/models"
	"github.com/stretchr/testify/require"
)

type authResp struct {
	Token string       `json:"token"`
	User  *models.User `json:"user"`
}

func TestAuthRegisterLoginMe(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	// Register
	regBody := []byte(`{"username":"alice","password":"password123"}`)
	req, _ := http.NewRequest("POST", "/api/v1/auth/register", bytes.NewReader(regBody))
	req.Header.Set("Content-Type", "application/json")
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code)

	var reg authResp
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &reg))
	require.NotEmpty(t, reg.Token)

	// Login
	loginBody := []byte(`{"username":"alice","password":"password123"}`)
	req, _ = http.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginBody))
	req.Header.Set("Content-Type", "application/json")
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code)
	var login authResp
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &login))
	require.NotEmpty(t, login.Token)

	// Me
	req, _ = http.NewRequest("GET", "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+login.Token)
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code)
}

func TestSubredditCreationRequiresRole(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "bob", "user")
	userToken, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	body := []byte(`{"name":"cats","description":"all cats"}`)
	req, _ := http.NewRequest("POST", "/api/v1/subreddits", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+userToken)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusForbidden, w.Code)

	// promote to admin and retry
	require.NoError(t, deps.UserRepo.UpdateRole(context.Background(), user.ID, "admin"))
	user.Role = "admin"
	adminToken, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	req, _ = http.NewRequest("POST", "/api/v1/subreddits", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code)
}

func TestPostsAndCommentsFlow(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "carl", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	// Create post
	postBody := []byte(`{"title":"hi","body":"body"}`)
	req, _ := http.NewRequest("POST", "/api/v1/posts", bytes.NewReader(postBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code)

	var post models.PlatformPost
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &post))

	// Create comment
	commentBody := []byte(`{"body":"comment"}`)
	req, _ = http.NewRequest("POST", "/api/v1/posts/"+json.Number(fmt.Sprint(post.ID)).String()+"/comments", bytes.NewReader(commentBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code)
}

func TestReportsRoleEnforcement(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "dana", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	// Create report
	body := []byte(`{"target_type":"post","target_id":1,"reason":"spam"}`)
	req, _ := http.NewRequest("POST", "/api/v1/reports", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code)

	// List as user -> forbidden
	req, _ = http.NewRequest("GET", "/api/v1/mod/reports", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusForbidden, w.Code)

	// Promote to admin and list
	require.NoError(t, deps.UserRepo.UpdateRole(context.Background(), user.ID, "admin"))
	adminToken, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, "admin")
	req, _ = http.NewRequest("GET", "/api/v1/mod/reports", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code)
}

func TestMessagingFlow(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	alice := createUser(t, deps.UserRepo, "alice_msg", "user")
	bob := createUser(t, deps.UserRepo, "bob_msg", "user")
	aliceToken, _ := deps.AuthService.GenerateJWT(alice.ID, "", alice.Username, alice.Role)
	bobToken, _ := deps.AuthService.GenerateJWT(bob.ID, "", bob.Username, bob.Role)

	// Create conversation as alice
	body := []byte(`{"other_user_id":` + fmt.Sprint(bob.ID) + `}`)
	req, _ := http.NewRequest("POST", "/api/v1/conversations", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code)
	var conv models.Conversation
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &conv))

	// Send message
	msgBody := []byte(`{"conversation_id":` + fmt.Sprint(conv.ID) + `,"encrypted_content":"hi","message_type":"text","encryption_version":"v1"}`)
	req, _ = http.NewRequest("POST", "/api/v1/messages", bytes.NewReader(msgBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code)

	// Fetch messages as bob
	req, _ = http.NewRequest("GET", "/api/v1/conversations/"+fmt.Sprint(conv.ID)+"/messages", nil)
	req.Header.Set("Authorization", "Bearer "+bobToken)
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code)

	// Mark read as bob
	req, _ = http.NewRequest("POST", "/api/v1/conversations/"+fmt.Sprint(conv.ID)+"/read", nil)
	req.Header.Set("Authorization", "Bearer "+bobToken)
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code)
}
