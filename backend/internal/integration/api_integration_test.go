package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
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

func TestPostEditForbiddenForNonOwner(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	owner := createUser(t, deps.UserRepo, "owner", "user")
	other := createUser(t, deps.UserRepo, "other", "user")
	ownerToken, _ := deps.AuthService.GenerateJWT(owner.ID, "", owner.Username, owner.Role)
	otherToken, _ := deps.AuthService.GenerateJWT(other.ID, "", other.Username, other.Role)

	postBody := []byte(`{"title":"hi","body":"body"}`)
	req, _ := http.NewRequest("POST", "/api/v1/posts", bytes.NewReader(postBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+ownerToken)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code)
	var post models.PlatformPost
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &post))

	updateBody := []byte(`{"title":"hack","body":"x"}`)
	req, _ = http.NewRequest("PUT", "/api/v1/posts/"+fmt.Sprint(post.ID), bytes.NewReader(updateBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+otherToken)
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusForbidden, w.Code)
}

func TestCommentEditForbiddenForNonOwner(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	owner := createUser(t, deps.UserRepo, "comment_owner", "user")
	other := createUser(t, deps.UserRepo, "comment_other", "user")
	ownerToken, _ := deps.AuthService.GenerateJWT(owner.ID, "", owner.Username, owner.Role)
	otherToken, _ := deps.AuthService.GenerateJWT(other.ID, "", other.Username, other.Role)

	postBody := []byte(`{"title":"hi","body":"body"}`)
	req, _ := http.NewRequest("POST", "/api/v1/posts", bytes.NewReader(postBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+ownerToken)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code)
	var post models.PlatformPost
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &post))

	commentBody := []byte(`{"body":"comment"}`)
	req, _ = http.NewRequest("POST", "/api/v1/posts/"+fmt.Sprint(post.ID)+"/comments", bytes.NewReader(commentBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+ownerToken)
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code)
	var comment models.PostComment
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &comment))

	updateBody := []byte(`{"body":"hack"}`)
	req, _ = http.NewRequest("PUT", "/api/v1/comments/"+fmt.Sprint(comment.ID), bytes.NewReader(updateBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+otherToken)
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusForbidden, w.Code)
}

func TestAdminPromotionAndAddModerator(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	admin := createUser(t, deps.UserRepo, "admin", "admin")
	user := createUser(t, deps.UserRepo, "target", "user")
	adminToken, _ := deps.AuthService.GenerateJWT(admin.ID, "", admin.Username, admin.Role)

	// Promote user to moderator
	body := []byte(`{"role":"moderator"}`)
	req, _ := http.NewRequest("POST", "/api/v1/admin/users/"+fmt.Sprint(user.ID)+"/role", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code)

	// Add as subreddit moderator
	modBody := []byte(`{"user_id":` + fmt.Sprint(user.ID) + `}`)
	req, _ = http.NewRequest("POST", "/api/v1/admin/subreddits/general/moderators", bytes.NewReader(modBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code)
	ok, err := deps.ModRepo.IsModerator(context.Background(), 1, user.ID)
	require.NoError(t, err)
	require.True(t, ok)
}

func TestMediaUploadValidation(t *testing.T) {
	defer os.RemoveAll("uploads")
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "media", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	var b bytes.Buffer
	writer := multipart.NewWriter(&b)
	part, _ := writer.CreateFormFile("file", "bad.txt")
	part.Write([]byte("not an image"))
	writer.Close()

	req, _ := http.NewRequest("POST", "/api/v1/media/upload", &b)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusBadRequest, w.Code)
	require.True(t, strings.Contains(w.Body.String(), "Unsupported file type"))
}

func TestMediaUploadHappyPathAndSizeLimit(t *testing.T) {
	defer os.RemoveAll("uploads")
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "media2", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	// Happy path small PNG
	var b bytes.Buffer
	writer := multipart.NewWriter(&b)
	part, _ := writer.CreateFormFile("file", "image.png")
	part.Write([]byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 'D', 'A', 'T', 'A'})
	writer.Close()

	req, _ := http.NewRequest("POST", "/api/v1/media/upload", &b)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code)

	// Size limit
	var big bytes.Buffer
	bw := multipart.NewWriter(&big)
	p2, _ := bw.CreateFormFile("file", "big.png")
	// Valid PNG header then large payload to trigger size limit
	pngHeader := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 'D', 'A', 'T', 'A'}
	p2.Write(pngHeader)
	p2.Write(bytes.Repeat([]byte("A"), 26*1024*1024)) // >25MB
	bw.Close()
	req, _ = http.NewRequest("POST", "/api/v1/media/upload", &big)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", bw.FormDataContentType())
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusBadRequest, w.Code)
	require.True(t, strings.Contains(strings.ToLower(w.Body.String()), "too large"))
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
