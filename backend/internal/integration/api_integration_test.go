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
	"time"

	"github.com/omninudge/backend/internal/models"
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

func TestHubCreation(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "bob", "user")
	userToken, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	body := []byte(`{"name":"cats","description":"all cats"}`)
	req, _ := http.NewRequest("POST", "/api/v1/hubs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+userToken)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code)
}

func TestHubCreationAsAdminAllowed(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	admin := createUser(t, deps.UserRepo, "adminuser", "admin")
	adminToken, _ := deps.AuthService.GenerateJWT(admin.ID, "", admin.Username, admin.Role)

	body := []byte(`{"name":"dogs","description":"all dogs"}`)
	req, _ := http.NewRequest("POST", "/api/v1/hubs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w := doRequest(t, deps.Router, req)
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

	// Add as hub moderator
	modBody := []byte(`{"user_id":` + fmt.Sprint(user.ID) + `}`)
	req, _ := http.NewRequest("POST", "/api/v1/admin/hubs/general/moderators", bytes.NewReader(modBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w := doRequest(t, deps.Router, req)
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
	require.Equal(t, http.StatusUnsupportedMediaType, w.Code)
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
	require.Equal(t, http.StatusRequestEntityTooLarge, w.Code)
	require.True(t, strings.Contains(strings.ToLower(w.Body.String()), "too large"))
}

func TestMediaUpload_AllowsPDFDocument(t *testing.T) {
	defer os.RemoveAll("uploads")
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "media_pdf", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	var b bytes.Buffer
	writer := multipart.NewWriter(&b)
	part, _ := writer.CreateFormFile("file", "doc.pdf")
	part.Write([]byte("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"))
	writer.Close()

	req, _ := http.NewRequest("POST", "/api/v1/media/upload", &b)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
}

func TestSearchMessagesAuthAndResults(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user1 := createUser(t, deps.UserRepo, "searchmsg_user1", "user")
	user2 := createUser(t, deps.UserRepo, "searchmsg_user2", "user")
	token, _ := deps.AuthService.GenerateJWT(user1.ID, "", user1.Username, user1.Role)

	conv, err := deps.ConversationRepo.Create(context.Background(), user1.ID, user2.ID)
	require.NoError(t, err)

	msg := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "integration-search-token",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), msg))

	// Unauthenticated request should fail
	req, _ := http.NewRequest("GET", "/api/v1/search/messages?q=integration-search-token", nil)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusUnauthorized, w.Code)

	// Authenticated request should return result
	req, _ = http.NewRequest("GET", "/api/v1/search/messages?q=integration-search-token", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var response struct {
		Total    int                      `json:"total"`
		Messages []map[string]interface{} `json:"messages"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.Equal(t, 1, response.Total)
	require.Len(t, response.Messages, 1)
	require.Equal(t, user2.Username, response.Messages[0]["sender_username"])
}

func TestSearchMessagesFilterOnlyHasFiles(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user1 := createUser(t, deps.UserRepo, "searchmsg_filter_user1", "user")
	user2 := createUser(t, deps.UserRepo, "searchmsg_filter_user2", "user")
	token, _ := deps.AuthService.GenerateJWT(user1.ID, "", user1.Username, user1.Role)

	conv, err := deps.ConversationRepo.Create(context.Background(), user1.ID, user2.ID)
	require.NoError(t, err)

	withFileURL := "/uploads/integration-test.png"
	withFile := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "message-with-file",
		MessageType:       "image",
		EncryptionVersion: "v1",
		MediaURL:          &withFileURL,
	}
	withoutFile := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "message-without-file",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), withFile))
	require.NoError(t, deps.MessageRepo.Create(context.Background(), withoutFile))

	req, _ := http.NewRequest("GET", "/api/v1/search/messages?has_files=true", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var response struct {
		Total    int                      `json:"total"`
		Messages []map[string]interface{} `json:"messages"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.Equal(t, 1, response.Total)
	require.Len(t, response.Messages, 1)
	require.Equal(t, float64(withFile.ID), response.Messages[0]["id"])
}

func TestSearchMessagesSortOldIntegration(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user1 := createUser(t, deps.UserRepo, "searchmsg_sort_user1", "user")
	user2 := createUser(t, deps.UserRepo, "searchmsg_sort_user2", "user")
	token, _ := deps.AuthService.GenerateJWT(user1.ID, "", user1.Username, user1.Role)

	conv, err := deps.ConversationRepo.Create(context.Background(), user1.ID, user2.ID)
	require.NoError(t, err)

	older := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "sort-int-token-older",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	newer := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "sort-int-token-newer",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), older))
	require.NoError(t, deps.MessageRepo.Create(context.Background(), newer))

	_, err = deps.DB.Pool.Exec(context.Background(), `UPDATE messages SET sent_at = NOW() - INTERVAL '2 hours' WHERE id = $1`, older.ID)
	require.NoError(t, err)
	_, err = deps.DB.Pool.Exec(context.Background(), `UPDATE messages SET sent_at = NOW() - INTERVAL '1 hour' WHERE id = $1`, newer.ID)
	require.NoError(t, err)

	req, _ := http.NewRequest("GET", "/api/v1/search/messages?q=sort-int-token&sort=old", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var response struct {
		Sort     string                   `json:"sort"`
		Messages []map[string]interface{} `json:"messages"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.Equal(t, "old", response.Sort)
	require.Len(t, response.Messages, 2)
	require.Equal(t, float64(older.ID), response.Messages[0]["id"])
}

func TestSearchMessagesHasLinksFilterIntegration(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user1 := createUser(t, deps.UserRepo, "searchmsg_links_user1", "user")
	user2 := createUser(t, deps.UserRepo, "searchmsg_links_user2", "user")
	token, _ := deps.AuthService.GenerateJWT(user1.ID, "", user1.Username, user1.Role)

	conv, err := deps.ConversationRepo.Create(context.Background(), user1.ID, user2.ID)
	require.NoError(t, err)

	withLink := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "check this link https://example.com/test",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	withoutLink := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "plain text message",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), withLink))
	require.NoError(t, deps.MessageRepo.Create(context.Background(), withoutLink))

	req, _ := http.NewRequest("GET", "/api/v1/search/messages?has_links=true", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var response struct {
		Total    int                      `json:"total"`
		Messages []map[string]interface{} `json:"messages"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.Equal(t, 1, response.Total)
	require.Len(t, response.Messages, 1)
	require.Equal(t, float64(withLink.ID), response.Messages[0]["id"])
}

func TestSearchMessagesDateRangeFilterIntegration(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user1 := createUser(t, deps.UserRepo, "searchmsg_date_user1", "user")
	user2 := createUser(t, deps.UserRepo, "searchmsg_date_user2", "user")
	token, _ := deps.AuthService.GenerateJWT(user1.ID, "", user1.Username, user1.Role)

	conv, err := deps.ConversationRepo.Create(context.Background(), user1.ID, user2.ID)
	require.NoError(t, err)

	oldMessage := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "older-range-token",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	newMessage := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "newer-range-token",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), oldMessage))
	require.NoError(t, deps.MessageRepo.Create(context.Background(), newMessage))

	_, err = deps.DB.Pool.Exec(context.Background(), `UPDATE messages SET sent_at = NOW() - INTERVAL '10 days' WHERE id = $1`, oldMessage.ID)
	require.NoError(t, err)
	_, err = deps.DB.Pool.Exec(context.Background(), `UPDATE messages SET sent_at = NOW() - INTERVAL '1 day' WHERE id = $1`, newMessage.ID)
	require.NoError(t, err)

	startDate := time.Now().Add(-72 * time.Hour).UTC().Format(time.RFC3339)
	req, _ := http.NewRequest("GET", "/api/v1/search/messages?start_date="+startDate, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var response struct {
		Total    int                      `json:"total"`
		Messages []map[string]interface{} `json:"messages"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.Equal(t, 1, response.Total)
	require.Len(t, response.Messages, 1)
	require.Equal(t, float64(newMessage.ID), response.Messages[0]["id"])
}

func TestSearchMessagesConversationFilterIntegration(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user1 := createUser(t, deps.UserRepo, "searchmsg_conv_user1", "user")
	user2 := createUser(t, deps.UserRepo, "searchmsg_conv_user2", "user")
	user3 := createUser(t, deps.UserRepo, "searchmsg_conv_user3", "user")
	token, _ := deps.AuthService.GenerateJWT(user1.ID, "", user1.Username, user1.Role)

	convA, err := deps.ConversationRepo.Create(context.Background(), user1.ID, user2.ID)
	require.NoError(t, err)
	convB, err := deps.ConversationRepo.Create(context.Background(), user1.ID, user3.ID)
	require.NoError(t, err)

	msgA := &models.Message{
		ConversationID:    convA.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "conversation-filter-token",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	msgB := &models.Message{
		ConversationID:    convB.ID,
		SenderID:          user3.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "conversation-filter-token",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), msgA))
	require.NoError(t, deps.MessageRepo.Create(context.Background(), msgB))

	req, _ := http.NewRequest(
		"GET",
		fmt.Sprintf("/api/v1/search/messages?q=conversation-filter-token&conversation_id=%d", convA.ID),
		nil,
	)
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var response struct {
		Total    int                      `json:"total"`
		Messages []map[string]interface{} `json:"messages"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.Equal(t, 1, response.Total)
	require.Len(t, response.Messages, 1)
	require.Equal(t, float64(msgA.ID), response.Messages[0]["id"])
}

func TestSearchMessagesSenderFilterIntegration(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user1 := createUser(t, deps.UserRepo, "searchmsg_sender_user1", "user")
	user2 := createUser(t, deps.UserRepo, "searchmsg_sender_user2", "user")
	user3 := createUser(t, deps.UserRepo, "searchmsg_sender_user3", "user")
	token, _ := deps.AuthService.GenerateJWT(user1.ID, "", user1.Username, user1.Role)

	convA, err := deps.ConversationRepo.Create(context.Background(), user1.ID, user2.ID)
	require.NoError(t, err)
	convB, err := deps.ConversationRepo.Create(context.Background(), user1.ID, user3.ID)
	require.NoError(t, err)

	msgFromUser2 := &models.Message{
		ConversationID:    convA.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "sender-filter-token",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	msgFromUser3 := &models.Message{
		ConversationID:    convB.ID,
		SenderID:          user3.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "sender-filter-token",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), msgFromUser2))
	require.NoError(t, deps.MessageRepo.Create(context.Background(), msgFromUser3))

	req, _ := http.NewRequest(
		"GET",
		fmt.Sprintf("/api/v1/search/messages?q=sender-filter-token&sender_id=%d", user2.ID),
		nil,
	)
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var response struct {
		Total    int                      `json:"total"`
		Messages []map[string]interface{} `json:"messages"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.Equal(t, 1, response.Total)
	require.Len(t, response.Messages, 1)
	require.Equal(t, float64(msgFromUser2.ID), response.Messages[0]["id"])
}

func TestSearchMessagesInvalidDateRangeIntegration(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "searchmsg_invalid_range", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	startDate := time.Now().UTC().Format(time.RFC3339)
	endDate := time.Now().Add(-24 * time.Hour).UTC().Format(time.RFC3339)

	req, _ := http.NewRequest(
		"GET",
		"/api/v1/search/messages?start_date="+startDate+"&end_date="+endDate,
		nil,
	)
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)

	require.Equal(t, http.StatusBadRequest, w.Code)
}

func TestSearchMessagesRespectsPerUserDeleteVisibilityIntegration(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user1 := createUser(t, deps.UserRepo, "searchmsg_delete_user1", "user")
	user2 := createUser(t, deps.UserRepo, "searchmsg_delete_user2", "user")
	tokenUser1, _ := deps.AuthService.GenerateJWT(user1.ID, "", user1.Username, user1.Role)
	tokenUser2, _ := deps.AuthService.GenerateJWT(user2.ID, "", user2.Username, user2.Role)

	conv, err := deps.ConversationRepo.Create(context.Background(), user1.ID, user2.ID)
	require.NoError(t, err)

	msg := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          user1.ID,
		RecipientID:       user2.ID,
		EncryptedContent:  "delete-visibility-token",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), msg))

	searchAsUser1, _ := http.NewRequest("GET", "/api/v1/search/messages?q=delete-visibility-token", nil)
	searchAsUser1.Header.Set("Authorization", "Bearer "+tokenUser1)
	w := doRequest(t, deps.Router, searchAsUser1)
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var beforeDelete struct {
		Total int `json:"total"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &beforeDelete))
	require.Equal(t, 1, beforeDelete.Total)

	deleteReq, _ := http.NewRequest("DELETE", fmt.Sprintf("/api/v1/messages/%d?delete_for=self", msg.ID), nil)
	deleteReq.Header.Set("Authorization", "Bearer "+tokenUser1)
	w = doRequest(t, deps.Router, deleteReq)
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	searchAsUser1After, _ := http.NewRequest("GET", "/api/v1/search/messages?q=delete-visibility-token", nil)
	searchAsUser1After.Header.Set("Authorization", "Bearer "+tokenUser1)
	w = doRequest(t, deps.Router, searchAsUser1After)
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var afterDeleteUser1 struct {
		Total int `json:"total"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &afterDeleteUser1))
	require.Equal(t, 0, afterDeleteUser1.Total)

	searchAsUser2After, _ := http.NewRequest("GET", "/api/v1/search/messages?q=delete-visibility-token", nil)
	searchAsUser2After.Header.Set("Authorization", "Bearer "+tokenUser2)
	w = doRequest(t, deps.Router, searchAsUser2After)
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var afterDeleteUser2 struct {
		Total int `json:"total"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &afterDeleteUser2))
	require.Equal(t, 1, afterDeleteUser2.Total)
}

func TestBatchMediaUpload_RejectsTooManyFiles(t *testing.T) {
	defer os.RemoveAll("uploads")
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "media_batch_limit", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	var b bytes.Buffer
	writer := multipart.NewWriter(&b)
	for i := 0; i < 11; i++ {
		part, err := writer.CreateFormFile("files", fmt.Sprintf("img%d.png", i))
		require.NoError(t, err)
		_, err = part.Write([]byte{0x89, 0x50, 0x4E, 0x47, 'D', 'A', 'T', 'A'})
		require.NoError(t, err)
	}
	require.NoError(t, writer.Close())

	req, _ := http.NewRequest("POST", "/api/v1/media/batch-upload", &b)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())
	require.Contains(t, w.Body.String(), "Too many files")
}

func TestMediaUpload_RejectsUnsupportedExtension(t *testing.T) {
	defer os.RemoveAll("uploads")
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "media_ext", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	var b bytes.Buffer
	writer := multipart.NewWriter(&b)
	part, _ := writer.CreateFormFile("file", "photo.exe")
	// PNG magic bytes with forbidden extension should still be rejected.
	part.Write([]byte{0x89, 0x50, 0x4E, 0x47, 'D', 'A', 'T', 'A'})
	writer.Close()

	req, _ := http.NewRequest("POST", "/api/v1/media/upload", &b)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusUnsupportedMediaType, w.Code)
	require.Contains(t, w.Body.String(), "Unsupported file extension")
}

func TestMediaUpload_RejectsEmptyFile(t *testing.T) {
	defer os.RemoveAll("uploads")
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "media_empty", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	var b bytes.Buffer
	writer := multipart.NewWriter(&b)
	_, _ = writer.CreateFormFile("file", "empty.png")
	writer.Close()

	req, _ := http.NewRequest("POST", "/api/v1/media/upload", &b)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusBadRequest, w.Code)
	require.Contains(t, strings.ToLower(w.Body.String()), "empty file")
}

func TestMediaUpload_RejectsExtensionMimeMismatch(t *testing.T) {
	defer os.RemoveAll("uploads")
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "media_mismatch", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	var b bytes.Buffer
	writer := multipart.NewWriter(&b)
	part, _ := writer.CreateFormFile("file", "image.jpg")
	// PDF magic bytes with jpg extension.
	part.Write([]byte("%PDF-1.4\n1 0 obj\n"))
	writer.Close()

	req, _ := http.NewRequest("POST", "/api/v1/media/upload", &b)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusUnsupportedMediaType, w.Code)
	require.Contains(t, w.Body.String(), "extension does not match")
}

func TestMediaUpload_RejectsStorageQuotaExceeded(t *testing.T) {
	defer os.RemoveAll("uploads")
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "media_quota", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	// Pre-fill near 5GB free-tier quota.
	_, err := deps.DB.Pool.Exec(context.Background(), `
		INSERT INTO media_files (user_id, filename, original_filename, file_type, file_size, storage_url, storage_path)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, user.ID, "existing.bin", "existing.bin", "video/mp4", int64(5*1024*1024*1024-1024), "/uploads/existing.bin", "uploads/existing.bin")
	require.NoError(t, err)

	var b bytes.Buffer
	writer := multipart.NewWriter(&b)
	part, _ := writer.CreateFormFile("file", "clip.mp4")
	part.Write([]byte{0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 'D', 'A', 'T', 'A'})
	writer.Close()

	req, _ := http.NewRequest("POST", "/api/v1/media/upload", &b)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusRequestEntityTooLarge, w.Code)
	require.Contains(t, w.Body.String(), "Storage quota exceeded")
}

func TestMediaUpload_RejectsSuspiciousEmbeddedZipSignature(t *testing.T) {
	defer os.RemoveAll("uploads")
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "media_polyglot", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	var b bytes.Buffer
	writer := multipart.NewWriter(&b)
	part, _ := writer.CreateFormFile("file", "photo.png")
	// PNG header + embedded ZIP local file header marker.
	payload := []byte{0x89, 0x50, 0x4E, 0x47, 'D', 'A', 'T', 'A', 'P', 'K', 0x03, 0x04}
	part.Write(payload)
	writer.Close()

	req, _ := http.NewRequest("POST", "/api/v1/media/upload", &b)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusBadRequest, w.Code)
	require.Contains(t, strings.ToLower(w.Body.String()), "suspicious")
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

func TestReports_AutoSuspendAfterThreeDistinctUserReports(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	target := createUser(t, deps.UserRepo, "report_target_http", "user")
	reporterOne := createUser(t, deps.UserRepo, "reporter_one_http", "user")
	reporterTwo := createUser(t, deps.UserRepo, "reporter_two_http", "user")
	reporterThree := createUser(t, deps.UserRepo, "reporter_three_http", "user")

	reporterOneToken, _ := deps.AuthService.GenerateJWT(reporterOne.ID, "", reporterOne.Username, reporterOne.Role)
	reporterTwoToken, _ := deps.AuthService.GenerateJWT(reporterTwo.ID, "", reporterTwo.Username, reporterTwo.Role)
	reporterThreeToken, _ := deps.AuthService.GenerateJWT(reporterThree.ID, "", reporterThree.Username, reporterThree.Role)

	for _, token := range []string{reporterOneToken, reporterTwoToken, reporterThreeToken} {
		body := []byte(`{"target_type":"user","target_id":` + fmt.Sprint(target.ID) + `,"reason":"harassment"}`)
		req, _ := http.NewRequest("POST", "/api/v1/reports", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		w := doRequest(t, deps.Router, req)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	}

	status, err := deps.UserRepo.GetBanStatus(context.Background(), target.ID)
	require.NoError(t, err)
	require.NotNil(t, status)
	require.True(t, status.Banned)
	require.NotNil(t, status.BanReason)
	require.Equal(t, "Auto-suspended pending moderation review", *status.BanReason)
}

func TestReports_HighPriorityCreatesModeratorNotifications(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	reporter := createUser(t, deps.UserRepo, "reporter_hp_http", "user")
	target := createUser(t, deps.UserRepo, "target_hp_http", "user")
	admin := createUser(t, deps.UserRepo, "admin_hp_http", "admin")
	moderator := createUser(t, deps.UserRepo, "moderator_hp_http", "moderator")

	reporterToken, _ := deps.AuthService.GenerateJWT(reporter.ID, "", reporter.Username, reporter.Role)
	adminToken, _ := deps.AuthService.GenerateJWT(admin.ID, "", admin.Username, admin.Role)
	moderatorToken, _ := deps.AuthService.GenerateJWT(moderator.ID, "", moderator.Username, moderator.Role)

	body := []byte(`{"target_type":"user","target_id":` + fmt.Sprint(target.ID) + `,"reason":"csam"}`)
	req, _ := http.NewRequest("POST", "/api/v1/reports", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+reporterToken)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	req, _ = http.NewRequest("GET", "/api/v1/notifications?limit=20&offset=0", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Contains(t, w.Body.String(), `"notification_type":"moderation_report_high_priority"`)

	req, _ = http.NewRequest("GET", "/api/v1/notifications?limit=20&offset=0", nil)
	req.Header.Set("Authorization", "Bearer "+moderatorToken)
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Contains(t, w.Body.String(), `"notification_type":"moderation_report_high_priority"`)
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

func TestPostVoteLifecycleHTTP(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "vote_user", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	postBody := []byte(`{"title":"vote","body":"body"}`)
	req, _ := http.NewRequest("POST", "/api/v1/posts", bytes.NewReader(postBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code)
	var post models.PlatformPost
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &post))

	vote := []byte(`{"is_upvote":true}`)
	req, _ = http.NewRequest("POST", "/api/v1/posts/"+fmt.Sprint(post.ID)+"/vote", bytes.NewReader(vote))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w = doRequest(t, deps.Router, req)
	require.Less(t, w.Code, 500)
	require.Contains(t, w.Body.String(), `"score":1`)

	unvote := []byte(`{"is_upvote":null}`)
	req, _ = http.NewRequest("POST", "/api/v1/posts/"+fmt.Sprint(post.ID)+"/vote", bytes.NewReader(unvote))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w = doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code)
	require.Contains(t, w.Body.String(), `"score":0`)
}

func TestUnauthorizedPostCreate(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	body := []byte(`{"title":"noauth","body":"x"}`)
	req, _ := http.NewRequest("POST", "/api/v1/posts", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestCommentInvalidPostID(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "cid", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	body := []byte(`{"body":"comment"}`)
	req, _ := http.NewRequest("POST", "/api/v1/posts/99999/comments", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)
	require.GreaterOrEqual(t, w.Code, 400)
	require.Contains(t, strings.ToLower(w.Body.String()), "post")
}

func TestMessagingUnauthorized(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	body := []byte(`{"other_user_id":1}`)
	req, _ := http.NewRequest("POST", "/api/v1/conversations", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestMessageSendInvalidConversation(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "msender", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	body := []byte(`{"conversation_id":9999,"encrypted_content":"x","message_type":"text","encryption_version":"v1"}`)
	req, _ := http.NewRequest("POST", "/api/v1/messages", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)
	require.GreaterOrEqual(t, w.Code, 400)
	require.Contains(t, strings.ToLower(w.Body.String()), "conversation")
}
