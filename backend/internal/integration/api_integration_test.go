package integration

import (
	"archive/zip"
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

func stringPtr(value string) *string {
	return &value
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

func TestMediaUpload_AllowsExpandedDocumentAndArchiveTypes(t *testing.T) {
	defer os.RemoveAll("uploads")
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "media_docs", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	cases := []struct {
		name     string
		filename string
		content  []byte
	}{
		{
			name:     "text file",
			filename: "notes.txt",
			content:  []byte("plain text document"),
		},
		{
			name:     "word doc",
			filename: "document.doc",
			content:  []byte{0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0x00, 0x00, 0x00, 0x00},
		},
		{
			name:     "word docx",
			filename: "document.docx",
			content:  buildDocxPayload(t, true),
		},
		{
			name:     "zip archive",
			filename: "archive.zip",
			content:  []byte{'P', 'K', 0x03, 0x04, 0x14, 0x00, 0x00, 0x00},
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			var b bytes.Buffer
			writer := multipart.NewWriter(&b)
			part, err := writer.CreateFormFile("file", tc.filename)
			require.NoError(t, err)
			_, err = part.Write(tc.content)
			require.NoError(t, err)
			require.NoError(t, writer.Close())

			req, err := http.NewRequest("POST", "/api/v1/media/upload", &b)
			require.NoError(t, err)
			req.Header.Set("Authorization", "Bearer "+token)
			req.Header.Set("Content-Type", writer.FormDataContentType())

			w := doRequest(t, deps.Router, req)
			require.Equal(t, http.StatusCreated, w.Code, "body=%s", w.Body.String())
		})
	}
}

func TestMediaUpload_RejectsRenamedZipAsDocx(t *testing.T) {
	defer os.RemoveAll("uploads")
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "media_bad_docx", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	var b bytes.Buffer
	writer := multipart.NewWriter(&b)
	part, err := writer.CreateFormFile("file", "fake.docx")
	require.NoError(t, err)
	_, err = part.Write(buildDocxPayload(t, false))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	req, err := http.NewRequest("POST", "/api/v1/media/upload", &b)
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusUnsupportedMediaType, w.Code, "body=%s", w.Body.String())
	require.Contains(t, strings.ToLower(w.Body.String()), "invalid document structure")
}

func buildDocxPayload(t *testing.T, includeWordDocument bool) []byte {
	t.Helper()
	var b bytes.Buffer
	zw := zip.NewWriter(&b)

	writeZipEntry := func(name, body string) {
		w, err := zw.Create(name)
		require.NoError(t, err)
		_, err = w.Write([]byte(body))
		require.NoError(t, err)
	}

	writeZipEntry("[Content_Types].xml", "<Types></Types>")
	writeZipEntry("_rels/.rels", "<Relationships></Relationships>")
	if includeWordDocument {
		writeZipEntry("word/document.xml", "<w:document></w:document>")
	}
	require.NoError(t, zw.Close())

	return b.Bytes()
}

func TestSendMessage_RespectsRecipientAutoUnarchiveSetting_Integration(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "msg_sender", "user")
	recipient := createUser(t, deps.UserRepo, "msg_recipient", "user")
	senderToken, _ := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)
	recipientToken, _ := deps.AuthService.GenerateJWT(recipient.ID, "", recipient.Username, recipient.Role)

	conversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)

	archiveReq, _ := http.NewRequest("PUT", fmt.Sprintf("/api/v1/conversations/%d/archive", conversation.ID), nil)
	archiveReq.Header.Set("Authorization", "Bearer "+recipientToken)
	archiveResp := doRequest(t, deps.Router, archiveReq)
	require.Equal(t, http.StatusOK, archiveResp.Code, "archive body=%s", archiveResp.Body.String())

	settingsBody := []byte(`{"auto_unarchive_on_message": false}`)
	settingsReq, _ := http.NewRequest("PUT", "/api/v1/settings", bytes.NewReader(settingsBody))
	settingsReq.Header.Set("Authorization", "Bearer "+recipientToken)
	settingsReq.Header.Set("Content-Type", "application/json")
	settingsResp := doRequest(t, deps.Router, settingsReq)
	require.Equal(t, http.StatusOK, settingsResp.Code, "settings body=%s", settingsResp.Body.String())

	sendBody := []byte(fmt.Sprintf(
		`{"conversation_id":%d,"encrypted_content":"integration auto-unarchive check","message_type":"text","encryption_version":"v1"}`,
		conversation.ID,
	))
	sendReq, _ := http.NewRequest("POST", "/api/v1/messages", bytes.NewReader(sendBody))
	sendReq.Header.Set("Authorization", "Bearer "+senderToken)
	sendReq.Header.Set("Content-Type", "application/json")
	sendResp := doRequest(t, deps.Router, sendReq)
	require.Equal(t, http.StatusCreated, sendResp.Code, "send body=%s", sendResp.Body.String())

	var user1ID int
	var user2ID int
	var archivedForUser1 bool
	var archivedForUser2 bool
	err = deps.DB.Pool.QueryRow(context.Background(), `
		SELECT user1_id, user2_id,
		       COALESCE(archived_for_user1, FALSE),
		       COALESCE(archived_for_user2, FALSE)
		FROM conversations
		WHERE id = $1
	`, conversation.ID).Scan(&user1ID, &user2ID, &archivedForUser1, &archivedForUser2)
	require.NoError(t, err)

	recipientArchived := archivedForUser2
	if recipient.ID == user1ID {
		recipientArchived = archivedForUser1
	} else {
		require.Equal(t, recipient.ID, user2ID)
	}
	require.True(t, recipientArchived, "recipient archive flag should stay true when auto-unarchive is disabled")
}

func TestSendMessage_AutoUnarchivesRecipientWhenEnabled_Integration(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "msg_sender_enabled", "user")
	recipient := createUser(t, deps.UserRepo, "msg_recipient_enabled", "user")
	senderToken, _ := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)
	recipientToken, _ := deps.AuthService.GenerateJWT(recipient.ID, "", recipient.Username, recipient.Role)

	conversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)

	archiveReq, _ := http.NewRequest("PUT", fmt.Sprintf("/api/v1/conversations/%d/archive", conversation.ID), nil)
	archiveReq.Header.Set("Authorization", "Bearer "+recipientToken)
	archiveResp := doRequest(t, deps.Router, archiveReq)
	require.Equal(t, http.StatusOK, archiveResp.Code, "archive body=%s", archiveResp.Body.String())

	settingsBody := []byte(`{"auto_unarchive_on_message": true}`)
	settingsReq, _ := http.NewRequest("PUT", "/api/v1/settings", bytes.NewReader(settingsBody))
	settingsReq.Header.Set("Authorization", "Bearer "+recipientToken)
	settingsReq.Header.Set("Content-Type", "application/json")
	settingsResp := doRequest(t, deps.Router, settingsReq)
	require.Equal(t, http.StatusOK, settingsResp.Code, "settings body=%s", settingsResp.Body.String())

	sendBody := []byte(fmt.Sprintf(
		`{"conversation_id":%d,"encrypted_content":"integration auto-unarchive enabled","message_type":"text","encryption_version":"v1"}`,
		conversation.ID,
	))
	sendReq, _ := http.NewRequest("POST", "/api/v1/messages", bytes.NewReader(sendBody))
	sendReq.Header.Set("Authorization", "Bearer "+senderToken)
	sendReq.Header.Set("Content-Type", "application/json")
	sendResp := doRequest(t, deps.Router, sendReq)
	require.Equal(t, http.StatusCreated, sendResp.Code, "send body=%s", sendResp.Body.String())

	var user1ID int
	var user2ID int
	var archivedForUser1 bool
	var archivedForUser2 bool
	err = deps.DB.Pool.QueryRow(context.Background(), `
		SELECT user1_id, user2_id,
		       COALESCE(archived_for_user1, FALSE),
		       COALESCE(archived_for_user2, FALSE)
		FROM conversations
		WHERE id = $1
	`, conversation.ID).Scan(&user1ID, &user2ID, &archivedForUser1, &archivedForUser2)
	require.NoError(t, err)

	recipientArchived := archivedForUser2
	if recipient.ID == user1ID {
		recipientArchived = archivedForUser1
	} else {
		require.Equal(t, recipient.ID, user2ID)
	}
	require.False(t, recipientArchived, "recipient archive flag should be cleared when auto-unarchive is enabled")
}

func TestSendMessage_ReplyToSetsThreadFieldsAndParentReplyCount_Integration(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "thread_sender_api", "user")
	recipient := createUser(t, deps.UserRepo, "thread_recipient_api", "user")
	senderToken, _ := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)
	recipientToken, _ := deps.AuthService.GenerateJWT(recipient.ID, "", recipient.Username, recipient.Role)

	conversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)

	rootBody := []byte(fmt.Sprintf(
		`{"conversation_id":%d,"encrypted_content":"root-message","message_type":"text","encryption_version":"v1"}`,
		conversation.ID,
	))
	rootReq, _ := http.NewRequest("POST", "/api/v1/messages", bytes.NewReader(rootBody))
	rootReq.Header.Set("Authorization", "Bearer "+senderToken)
	rootReq.Header.Set("Content-Type", "application/json")
	rootResp := doRequest(t, deps.Router, rootReq)
	require.Equal(t, http.StatusCreated, rootResp.Code, "root body=%s", rootResp.Body.String())

	var rootMessage models.Message
	require.NoError(t, json.Unmarshal(rootResp.Body.Bytes(), &rootMessage))
	require.Nil(t, rootMessage.ReplyTo)
	require.Nil(t, rootMessage.ThreadRoot)
	require.Equal(t, 0, rootMessage.ReplyCount)

	replyBody := []byte(fmt.Sprintf(
		`{"conversation_id":%d,"encrypted_content":"reply-message","message_type":"text","encryption_version":"v1","reply_to":%d}`,
		conversation.ID,
		rootMessage.ID,
	))
	replyReq, _ := http.NewRequest("POST", "/api/v1/messages", bytes.NewReader(replyBody))
	replyReq.Header.Set("Authorization", "Bearer "+recipientToken)
	replyReq.Header.Set("Content-Type", "application/json")
	replyResp := doRequest(t, deps.Router, replyReq)
	require.Equal(t, http.StatusCreated, replyResp.Code, "reply body=%s", replyResp.Body.String())

	var replyMessage models.Message
	require.NoError(t, json.Unmarshal(replyResp.Body.Bytes(), &replyMessage))
	require.NotNil(t, replyMessage.ReplyTo)
	require.Equal(t, rootMessage.ID, *replyMessage.ReplyTo)
	require.NotNil(t, replyMessage.ThreadRoot)
	require.Equal(t, rootMessage.ID, *replyMessage.ThreadRoot)

	updatedRoot, err := deps.MessageRepo.GetByID(context.Background(), rootMessage.ID)
	require.NoError(t, err)
	require.Equal(t, 1, updatedRoot.ReplyCount)
}

func TestGetMessageThreadEndpoint_ReturnsRepliesWithPagination_Integration(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "thread_page_sender", "user")
	recipient := createUser(t, deps.UserRepo, "thread_page_recipient", "user")
	senderToken, _ := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)
	recipientToken, _ := deps.AuthService.GenerateJWT(recipient.ID, "", recipient.Username, recipient.Role)

	conversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)

	rootBody := []byte(fmt.Sprintf(
		`{"conversation_id":%d,"encrypted_content":"thread-root","message_type":"text","encryption_version":"v1"}`,
		conversation.ID,
	))
	rootReq, _ := http.NewRequest("POST", "/api/v1/messages", bytes.NewReader(rootBody))
	rootReq.Header.Set("Authorization", "Bearer "+senderToken)
	rootReq.Header.Set("Content-Type", "application/json")
	rootResp := doRequest(t, deps.Router, rootReq)
	require.Equal(t, http.StatusCreated, rootResp.Code, "root body=%s", rootResp.Body.String())

	var rootMessage models.Message
	require.NoError(t, json.Unmarshal(rootResp.Body.Bytes(), &rootMessage))

	for i := 0; i < 3; i++ {
		replyBody := []byte(fmt.Sprintf(
			`{"conversation_id":%d,"encrypted_content":"thread-reply-%d","message_type":"text","encryption_version":"v1","reply_to":%d}`,
			conversation.ID,
			i,
			rootMessage.ID,
		))
		replyReq, _ := http.NewRequest("POST", "/api/v1/messages", bytes.NewReader(replyBody))
		replyReq.Header.Set("Authorization", "Bearer "+recipientToken)
		replyReq.Header.Set("Content-Type", "application/json")
		replyResp := doRequest(t, deps.Router, replyReq)
		require.Equal(t, http.StatusCreated, replyResp.Code, "reply %d body=%s", i, replyResp.Body.String())
		time.Sleep(5 * time.Millisecond)
	}

	threadReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/v1/messages/%d/thread?limit=2&offset=0", rootMessage.ID), nil)
	threadReq.Header.Set("Authorization", "Bearer "+senderToken)
	threadResp := doRequest(t, deps.Router, threadReq)
	require.Equal(t, http.StatusOK, threadResp.Code, "thread body=%s", threadResp.Body.String())

	var threadPayload struct {
		RootMessage models.Message   `json:"root_message"`
		Replies     []models.Message `json:"replies"`
		ReplyCount  int              `json:"reply_count"`
		Limit       int              `json:"limit"`
		Offset      int              `json:"offset"`
	}
	require.NoError(t, json.Unmarshal(threadResp.Body.Bytes(), &threadPayload))
	require.Equal(t, rootMessage.ID, threadPayload.RootMessage.ID)
	require.Len(t, threadPayload.Replies, 2)
	require.Equal(t, 3, threadPayload.ReplyCount)
	require.Equal(t, 2, threadPayload.Limit)
	require.Equal(t, 0, threadPayload.Offset)
	require.True(t, threadPayload.Replies[0].SentAt.Before(threadPayload.Replies[1].SentAt) || threadPayload.Replies[0].SentAt.Equal(threadPayload.Replies[1].SentAt))

	threadReqPage2, _ := http.NewRequest("GET", fmt.Sprintf("/api/v1/messages/%d/thread?limit=2&offset=2", rootMessage.ID), nil)
	threadReqPage2.Header.Set("Authorization", "Bearer "+senderToken)
	threadRespPage2 := doRequest(t, deps.Router, threadReqPage2)
	require.Equal(t, http.StatusOK, threadRespPage2.Code, "thread page2 body=%s", threadRespPage2.Body.String())

	var threadPayloadPage2 struct {
		Replies    []models.Message `json:"replies"`
		ReplyCount int              `json:"reply_count"`
		Limit      int              `json:"limit"`
		Offset     int              `json:"offset"`
	}
	require.NoError(t, json.Unmarshal(threadRespPage2.Body.Bytes(), &threadPayloadPage2))
	require.Len(t, threadPayloadPage2.Replies, 1)
	require.Equal(t, 3, threadPayloadPage2.ReplyCount)
	require.Equal(t, 2, threadPayloadPage2.Limit)
	require.Equal(t, 2, threadPayloadPage2.Offset)
}

func TestGetMessageThreadEndpoint_RejectsUnauthorizedAndOutsider_Integration(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "thread_auth_sender", "user")
	recipient := createUser(t, deps.UserRepo, "thread_auth_recipient", "user")
	outsider := createUser(t, deps.UserRepo, "thread_auth_outsider", "user")
	senderToken, _ := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)
	outsiderToken, _ := deps.AuthService.GenerateJWT(outsider.ID, "", outsider.Username, outsider.Role)

	conversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)

	rootBody := []byte(fmt.Sprintf(
		`{"conversation_id":%d,"encrypted_content":"thread-auth-root","message_type":"text","encryption_version":"v1"}`,
		conversation.ID,
	))
	rootReq, _ := http.NewRequest("POST", "/api/v1/messages", bytes.NewReader(rootBody))
	rootReq.Header.Set("Authorization", "Bearer "+senderToken)
	rootReq.Header.Set("Content-Type", "application/json")
	rootResp := doRequest(t, deps.Router, rootReq)
	require.Equal(t, http.StatusCreated, rootResp.Code, "root body=%s", rootResp.Body.String())

	var rootMessage models.Message
	require.NoError(t, json.Unmarshal(rootResp.Body.Bytes(), &rootMessage))

	unauthReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/v1/messages/%d/thread", rootMessage.ID), nil)
	unauthResp := doRequest(t, deps.Router, unauthReq)
	require.Equal(t, http.StatusUnauthorized, unauthResp.Code)

	outsiderReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/v1/messages/%d/thread", rootMessage.ID), nil)
	outsiderReq.Header.Set("Authorization", "Bearer "+outsiderToken)
	outsiderResp := doRequest(t, deps.Router, outsiderReq)
	require.Equal(t, http.StatusForbidden, outsiderResp.Code, "body=%s", outsiderResp.Body.String())
}

func TestSendMessage_ThreadDepthLimitFlattensToRoot_Integration(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "thread_depth_sender", "user")
	recipient := createUser(t, deps.UserRepo, "thread_depth_recipient", "user")
	senderToken, _ := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)
	recipientToken, _ := deps.AuthService.GenerateJWT(recipient.ID, "", recipient.Username, recipient.Role)

	conversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)

	rootBody := []byte(fmt.Sprintf(
		`{"conversation_id":%d,"encrypted_content":"depth-root","message_type":"text","encryption_version":"v1"}`,
		conversation.ID,
	))
	rootReq, _ := http.NewRequest("POST", "/api/v1/messages", bytes.NewReader(rootBody))
	rootReq.Header.Set("Authorization", "Bearer "+senderToken)
	rootReq.Header.Set("Content-Type", "application/json")
	rootResp := doRequest(t, deps.Router, rootReq)
	require.Equal(t, http.StatusCreated, rootResp.Code, "root body=%s", rootResp.Body.String())

	var rootMessage models.Message
	require.NoError(t, json.Unmarshal(rootResp.Body.Bytes(), &rootMessage))

	parentID := rootMessage.ID
	for i := 1; i <= 10; i++ {
		token := senderToken
		if i%2 == 0 {
			token = recipientToken
		}
		replyBody := []byte(fmt.Sprintf(
			`{"conversation_id":%d,"encrypted_content":"depth-%d","message_type":"text","encryption_version":"v1","reply_to":%d}`,
			conversation.ID,
			i,
			parentID,
		))
		replyReq, _ := http.NewRequest("POST", "/api/v1/messages", bytes.NewReader(replyBody))
		replyReq.Header.Set("Authorization", "Bearer "+token)
		replyReq.Header.Set("Content-Type", "application/json")
		replyResp := doRequest(t, deps.Router, replyReq)
		require.Equal(t, http.StatusCreated, replyResp.Code, "depth %d body=%s", i, replyResp.Body.String())

		var replyMessage models.Message
		require.NoError(t, json.Unmarshal(replyResp.Body.Bytes(), &replyMessage))
		parentID = replyMessage.ID
	}

	flattenBody := []byte(fmt.Sprintf(
		`{"conversation_id":%d,"encrypted_content":"depth-flatten","message_type":"text","encryption_version":"v1","reply_to":%d}`,
		conversation.ID,
		parentID,
	))
	flattenReq, _ := http.NewRequest("POST", "/api/v1/messages", bytes.NewReader(flattenBody))
	flattenReq.Header.Set("Authorization", "Bearer "+senderToken)
	flattenReq.Header.Set("Content-Type", "application/json")
	flattenResp := doRequest(t, deps.Router, flattenReq)
	require.Equal(t, http.StatusCreated, flattenResp.Code, "flatten body=%s", flattenResp.Body.String())
	require.Equal(t, "true", flattenResp.Header().Get("X-Thread-Flattened"))

	var flattenedMessage models.Message
	require.NoError(t, json.Unmarshal(flattenResp.Body.Bytes(), &flattenedMessage))
	require.NotNil(t, flattenedMessage.ReplyTo)
	require.Equal(t, rootMessage.ID, *flattenedMessage.ReplyTo)
	require.NotNil(t, flattenedMessage.ThreadRoot)
	require.Equal(t, rootMessage.ID, *flattenedMessage.ThreadRoot)

	deepestMessage, err := deps.MessageRepo.GetByID(context.Background(), parentID)
	require.NoError(t, err)
	require.Equal(t, 0, deepestMessage.ReplyCount)

	updatedRoot, err := deps.MessageRepo.GetByID(context.Background(), rootMessage.ID)
	require.NoError(t, err)
	require.Equal(t, 2, updatedRoot.ReplyCount)
}

func TestEditMessageEndpoint_UpdatesMessageAndHistory(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "edit_sender", "user")
	recipient := createUser(t, deps.UserRepo, "edit_recipient", "user")
	senderToken, _ := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)

	conversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)

	message := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          sender.ID,
		RecipientID:       recipient.ID,
		EncryptedContent:  "original-ciphertext",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), message))

	editBody := []byte(`{
		"encrypted_content": "updated-ciphertext",
		"sender_encrypted_content": "updated-sender-copy",
		"content": "updated plaintext",
		"encryption_version": "v1"
	}`)
	req, _ := http.NewRequest("PATCH", fmt.Sprintf("/api/v1/messages/%d", message.ID), bytes.NewReader(editBody))
	req.Header.Set("Authorization", "Bearer "+senderToken)
	req.Header.Set("Content-Type", "application/json")
	resp := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, resp.Code, "body=%s", resp.Body.String())

	var edited bool
	var historyCount int
	var historyContent *string
	err = deps.DB.Pool.QueryRow(context.Background(), `
		SELECT edited FROM messages WHERE id = $1
	`, message.ID).Scan(&edited)
	require.NoError(t, err)
	require.True(t, edited)

	err = deps.DB.Pool.QueryRow(context.Background(), `
		SELECT COUNT(*), MIN(content) FROM message_edit_history WHERE message_id = $1
	`, message.ID).Scan(&historyCount, &historyContent)
	require.NoError(t, err)
	require.Equal(t, 1, historyCount)
	require.NotNil(t, historyContent)
	require.Equal(t, "original-ciphertext", *historyContent)
}

func TestForwardMessageEndpoint_Success(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "forward_sender", "user")
	recipient := createUser(t, deps.UserRepo, "forward_recipient", "user")
	senderToken, _ := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)

	sourceConversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)
	targetConversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)

	original := &models.Message{
		ConversationID:         sourceConversation.ID,
		SenderID:               recipient.ID,
		RecipientID:            sender.ID,
		EncryptedContent:       "forward-original-content",
		SenderEncryptedContent: stringPtr("forward-original-content-sender"),
		MessageType:            "text",
		EncryptionVersion:      "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), original))

	forwardBody := []byte(fmt.Sprintf(`{"message_id":%d,"conversation_ids":[%d],"include_media":true,"encrypted_content":"forward-new-recipient-cipher","sender_encrypted_content":"forward-new-sender-cipher","encryption_version":"v1"}`, original.ID, targetConversation.ID))
	req, _ := http.NewRequest("POST", "/api/v1/messages/forward", bytes.NewReader(forwardBody))
	req.Header.Set("Authorization", "Bearer "+senderToken)
	req.Header.Set("Content-Type", "application/json")
	resp := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, resp.Code, "body=%s", resp.Body.String())

	var payload struct {
		ForwardedMessageIDs []int `json:"forwarded_message_ids"`
		ForwardedCount      int   `json:"forwarded_count"`
	}
	require.NoError(t, json.Unmarshal(resp.Body.Bytes(), &payload))
	require.Equal(t, 1, payload.ForwardedCount)
	require.Len(t, payload.ForwardedMessageIDs, 1)

	var forwardedFrom *int
	var forwardCount int
	err = deps.DB.Pool.QueryRow(context.Background(), `
		SELECT forwarded_from
		FROM messages
		WHERE id = $1
	`, payload.ForwardedMessageIDs[0]).Scan(&forwardedFrom)
	require.NoError(t, err)
	require.NotNil(t, forwardedFrom)
	require.Equal(t, original.ID, *forwardedFrom)

	err = deps.DB.Pool.QueryRow(context.Background(), `
		SELECT forward_count
		FROM messages
		WHERE id = $1
	`, original.ID).Scan(&forwardCount)
	require.NoError(t, err)
	require.Equal(t, 1, forwardCount)

	var forwardedEncryptedContent string
	var forwardedSenderEncryptedContent *string
	err = deps.DB.Pool.QueryRow(context.Background(), `
		SELECT encrypted_content, sender_encrypted_content
		FROM messages
		WHERE id = $1
	`, payload.ForwardedMessageIDs[0]).Scan(&forwardedEncryptedContent, &forwardedSenderEncryptedContent)
	require.NoError(t, err)
	require.Equal(t, "forward-new-recipient-cipher", forwardedEncryptedContent)
	require.NotNil(t, forwardedSenderEncryptedContent)
	require.Equal(t, "forward-new-sender-cipher", *forwardedSenderEncryptedContent)
}

func TestForwardMessageEndpoint_RejectsMoreThanTenTargets(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "forward_limit_sender", "user")
	recipient := createUser(t, deps.UserRepo, "forward_limit_recipient", "user")
	senderToken, _ := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)

	sourceConversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)
	original := &models.Message{
		ConversationID:         sourceConversation.ID,
		SenderID:               recipient.ID,
		RecipientID:            sender.ID,
		EncryptedContent:       "forward-original-content",
		SenderEncryptedContent: stringPtr("forward-original-content-sender"),
		MessageType:            "text",
		EncryptionVersion:      "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), original))

	forwardBody := []byte(fmt.Sprintf(`{"message_id":%d,"conversation_ids":[1,2,3,4,5,6,7,8,9,10,11],"include_media":true}`, original.ID))
	req, _ := http.NewRequest("POST", "/api/v1/messages/forward", bytes.NewReader(forwardBody))
	req.Header.Set("Authorization", "Bearer "+senderToken)
	req.Header.Set("Content-Type", "application/json")
	resp := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusBadRequest, resp.Code, "body=%s", resp.Body.String())
}

func TestForwardMessageEndpoint_RejectsEncryptedForwardWithoutNewPayload(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "forward_payload_sender", "user")
	recipient := createUser(t, deps.UserRepo, "forward_payload_recipient", "user")
	senderToken, _ := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)

	sourceConversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)
	targetConversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)

	original := &models.Message{
		ConversationID:         sourceConversation.ID,
		SenderID:               recipient.ID,
		RecipientID:            sender.ID,
		EncryptedContent:       "forward-original-content",
		SenderEncryptedContent: stringPtr("forward-original-content-sender"),
		MessageType:            "text",
		EncryptionVersion:      "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), original))

	forwardBody := []byte(fmt.Sprintf(`{"message_id":%d,"conversation_ids":[%d],"include_media":true}`, original.ID, targetConversation.ID))
	req, _ := http.NewRequest("POST", "/api/v1/messages/forward", bytes.NewReader(forwardBody))
	req.Header.Set("Authorization", "Bearer "+senderToken)
	req.Header.Set("Content-Type", "application/json")
	resp := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusUnprocessableEntity, resp.Code, "body=%s", resp.Body.String())
	require.Contains(t, resp.Body.String(), "Encrypted forwards require new encrypted_content")
}

func TestForwardMessageEndpoint_RejectsEncryptedDMForwardWithoutSenderCopy(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "forward_sender_copy_sender", "user")
	recipient := createUser(t, deps.UserRepo, "forward_sender_copy_recipient", "user")
	senderToken, _ := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)

	sourceConversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)
	targetConversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)

	original := &models.Message{
		ConversationID:         sourceConversation.ID,
		SenderID:               recipient.ID,
		RecipientID:            sender.ID,
		EncryptedContent:       "forward-original-content",
		SenderEncryptedContent: stringPtr("forward-original-content-sender"),
		MessageType:            "text",
		EncryptionVersion:      "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), original))

	forwardBody := []byte(fmt.Sprintf(`{"message_id":%d,"conversation_ids":[%d],"include_media":true,"encrypted_content":"forward-new-recipient-cipher","encryption_version":"v1"}`, original.ID, targetConversation.ID))
	req, _ := http.NewRequest("POST", "/api/v1/messages/forward", bytes.NewReader(forwardBody))
	req.Header.Set("Authorization", "Bearer "+senderToken)
	req.Header.Set("Content-Type", "application/json")
	resp := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusUnprocessableEntity, resp.Code, "body=%s", resp.Body.String())
	require.Contains(t, resp.Body.String(), "Encrypted DM forwards require new sender_encrypted_content")
}

func TestForwardMessageEndpoint_RejectsEncryptedForwardDowngrade(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "forward_downgrade_sender", "user")
	recipient := createUser(t, deps.UserRepo, "forward_downgrade_recipient", "user")
	senderToken, _ := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)

	sourceConversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)
	targetConversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)

	original := &models.Message{
		ConversationID:         sourceConversation.ID,
		SenderID:               recipient.ID,
		RecipientID:            sender.ID,
		EncryptedContent:       "forward-original-content",
		SenderEncryptedContent: stringPtr("forward-original-content-sender"),
		MessageType:            "text",
		EncryptionVersion:      "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), original))

	forwardBody := []byte(fmt.Sprintf(`{"message_id":%d,"conversation_ids":[%d],"include_media":true,"encrypted_content":"forward-new-recipient-cipher","sender_encrypted_content":"forward-new-sender-cipher","encryption_version":"plaintext"}`, original.ID, targetConversation.ID))
	req, _ := http.NewRequest("POST", "/api/v1/messages/forward", bytes.NewReader(forwardBody))
	req.Header.Set("Authorization", "Bearer "+senderToken)
	req.Header.Set("Content-Type", "application/json")
	resp := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusUnprocessableEntity, resp.Code, "body=%s", resp.Body.String())
	require.Contains(t, resp.Body.String(), "Encrypted forwards cannot downgrade encryption_version")
}

func TestForwardMessageEndpoint_RejectsDMForwardMarkedMultiRecipient(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "forward_dm_multi_sender", "user")
	recipient := createUser(t, deps.UserRepo, "forward_dm_multi_recipient", "user")
	senderToken, _ := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)

	sourceConversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)
	targetConversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)

	original := &models.Message{
		ConversationID:         sourceConversation.ID,
		SenderID:               recipient.ID,
		RecipientID:            sender.ID,
		EncryptedContent:       "forward-original-content",
		SenderEncryptedContent: stringPtr("forward-original-content-sender"),
		MessageType:            "text",
		EncryptionVersion:      "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), original))

	forwardBody := []byte(fmt.Sprintf(`{"message_id":%d,"conversation_ids":[%d],"include_media":true,"encrypted_content":"forward-new-recipient-cipher","sender_encrypted_content":"forward-new-sender-cipher","encryption_version":"v1","is_multi_recipient":true}`, original.ID, targetConversation.ID))
	req, _ := http.NewRequest("POST", "/api/v1/messages/forward", bytes.NewReader(forwardBody))
	req.Header.Set("Authorization", "Bearer "+senderToken)
	req.Header.Set("Content-Type", "application/json")
	resp := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusUnprocessableEntity, resp.Code, "body=%s", resp.Body.String())
	require.Contains(t, resp.Body.String(), "DM forwards cannot be multi-recipient")
}

func TestForwardMessageEndpoint_DeduplicatesBeforeLimit(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "forward_dedupe_sender", "user")
	recipient := createUser(t, deps.UserRepo, "forward_dedupe_recipient", "user")
	senderToken, _ := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)

	sourceConversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)
	original := &models.Message{
		ConversationID:         sourceConversation.ID,
		SenderID:               recipient.ID,
		RecipientID:            sender.ID,
		EncryptedContent:       "forward-original-content",
		SenderEncryptedContent: stringPtr("forward-original-content-sender"),
		MessageType:            "text",
		EncryptionVersion:      "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), original))

	forwardBody := []byte(fmt.Sprintf(`{"message_id":%d,"conversation_ids":[%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d],"include_media":true,"encrypted_content":"forward-new-recipient-cipher","sender_encrypted_content":"forward-new-sender-cipher","encryption_version":"v1"}`,
		original.ID,
		sourceConversation.ID, sourceConversation.ID, sourceConversation.ID, sourceConversation.ID, sourceConversation.ID,
		sourceConversation.ID, sourceConversation.ID, sourceConversation.ID, sourceConversation.ID, sourceConversation.ID, sourceConversation.ID,
	))
	req, _ := http.NewRequest("POST", "/api/v1/messages/forward", bytes.NewReader(forwardBody))
	req.Header.Set("Authorization", "Bearer "+senderToken)
	req.Header.Set("Content-Type", "application/json")
	resp := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, resp.Code, "body=%s", resp.Body.String())
}

func TestForwardMessageEndpoint_IsAtomicOnMixedAccessibleTargets(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "forward_atomic_sender", "user")
	recipient := createUser(t, deps.UserRepo, "forward_atomic_recipient", "user")
	outsider := createUser(t, deps.UserRepo, "forward_atomic_outsider", "user")
	senderToken, _ := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)

	sourceConversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)
	validTarget, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)
	inaccessibleTarget, err := deps.ConversationRepo.Create(context.Background(), outsider.ID, recipient.ID)
	require.NoError(t, err)

	original := &models.Message{
		ConversationID:         sourceConversation.ID,
		SenderID:               recipient.ID,
		RecipientID:            sender.ID,
		EncryptedContent:       "forward-original-content",
		SenderEncryptedContent: stringPtr("forward-original-content-sender"),
		MessageType:            "text",
		EncryptionVersion:      "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), original))

	forwardBody := []byte(fmt.Sprintf(`{"message_id":%d,"conversation_ids":[%d,%d],"include_media":true,"encrypted_content":"forward-new-recipient-cipher","sender_encrypted_content":"forward-new-sender-cipher","encryption_version":"v1"}`, original.ID, validTarget.ID, inaccessibleTarget.ID))
	req, _ := http.NewRequest("POST", "/api/v1/messages/forward", bytes.NewReader(forwardBody))
	req.Header.Set("Authorization", "Bearer "+senderToken)
	req.Header.Set("Content-Type", "application/json")
	resp := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusForbidden, resp.Code, "body=%s", resp.Body.String())

	var forwardedCount int
	err = deps.DB.Pool.QueryRow(context.Background(), `
		SELECT COUNT(*)
		FROM messages
		WHERE forwarded_from = $1
	`, original.ID).Scan(&forwardedCount)
	require.NoError(t, err)
	require.Equal(t, 0, forwardedCount)
}

func TestForwardInfoEndpoint_PrivacyAwareResponse(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "forward_info_user", "user")
	recipient := createUser(t, deps.UserRepo, "forward_info_recipient", "user")
	outsider := createUser(t, deps.UserRepo, "forward_info_outsider", "user")
	userToken, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	visibleConversation, err := deps.ConversationRepo.Create(context.Background(), user.ID, recipient.ID)
	require.NoError(t, err)
	hiddenConversation, err := deps.ConversationRepo.Create(context.Background(), outsider.ID, recipient.ID)
	require.NoError(t, err)

	original := &models.Message{
		ConversationID:    hiddenConversation.ID,
		SenderID:          recipient.ID,
		RecipientID:       outsider.ID,
		EncryptedContent:  "forward-original-content",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), original))

	forwarded := &models.Message{
		ConversationID:    visibleConversation.ID,
		SenderID:          user.ID,
		RecipientID:       recipient.ID,
		EncryptedContent:  "forwarded-content",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), forwarded))

	_, err = deps.DB.Pool.Exec(context.Background(), `
		UPDATE messages
		SET forwarded_from = $2
		WHERE id = $1
	`, forwarded.ID, original.ID)
	require.NoError(t, err)
	_, err = deps.DB.Pool.Exec(context.Background(), `
		UPDATE messages
		SET forward_count = 3
		WHERE id = $1
	`, original.ID)
	require.NoError(t, err)

	req, _ := http.NewRequest("GET", fmt.Sprintf("/api/v1/messages/%d/forward-info", forwarded.ID), nil)
	req.Header.Set("Authorization", "Bearer "+userToken)
	resp := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, resp.Code, "body=%s", resp.Body.String())

	var payload map[string]any
	require.NoError(t, json.Unmarshal(resp.Body.Bytes(), &payload))
	require.Equal(t, float64(original.ID), payload["original_message_id"])
	require.Equal(t, float64(recipient.ID), payload["original_sender_id"])
	require.Equal(t, float64(3), payload["forward_count"])
	require.Nil(t, payload["original_conversation_id"])
}

func TestEditMessageEndpoint_RejectsModMailConversation(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "edit_modmail_sender", "user")
	recipient := createUser(t, deps.UserRepo, "edit_modmail_recipient", "user")
	senderToken, _ := deps.AuthService.GenerateJWT(sender.ID, "", sender.Username, sender.Role)

	conversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)

	_, err = deps.DB.Pool.Exec(context.Background(), `
		UPDATE conversations SET conversation_type = 'mod_mail' WHERE id = $1
	`, conversation.ID)
	require.NoError(t, err)

	message := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          sender.ID,
		RecipientID:       recipient.ID,
		EncryptedContent:  "original-ciphertext",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), message))

	editBody := []byte(`{"encrypted_content":"updated-ciphertext"}`)
	req, _ := http.NewRequest("PATCH", fmt.Sprintf("/api/v1/messages/%d", message.ID), bytes.NewReader(editBody))
	req.Header.Set("Authorization", "Bearer "+senderToken)
	req.Header.Set("Content-Type", "application/json")
	resp := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusForbidden, resp.Code, "body=%s", resp.Body.String())
	require.Contains(t, resp.Body.String(), "Editing mod mail messages is not supported")
}

func TestGetMessageHistoryEndpoint_ReturnsChronologicalHistory(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "history_sender", "user")
	recipient := createUser(t, deps.UserRepo, "history_recipient", "user")
	recipientToken, _ := deps.AuthService.GenerateJWT(recipient.ID, "", recipient.Username, recipient.Role)

	conversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)

	message := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          sender.ID,
		RecipientID:       recipient.ID,
		EncryptedContent:  "history-original",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), message))

	_, err = deps.DB.Pool.Exec(context.Background(), `
		INSERT INTO message_edit_history (message_id, content, encrypted_content, edited_at, edited_by)
		VALUES
		  ($1, $2, $3, NOW() - INTERVAL '3 minutes', $4),
		  ($1, $5, $6, NOW() - INTERVAL '2 minutes', $4)
	`, message.ID, "before", "enc-before", sender.ID, "after", "enc-after")
	require.NoError(t, err)

	req, _ := http.NewRequest("GET", fmt.Sprintf("/api/v1/messages/%d/history?limit=20&offset=0", message.ID), nil)
	req.Header.Set("Authorization", "Bearer "+recipientToken)
	resp := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, resp.Code, "body=%s", resp.Body.String())

	var payload struct {
		History []struct {
			Content *string `json:"content"`
		} `json:"history"`
		Total float64 `json:"total"`
	}
	require.NoError(t, json.Unmarshal(resp.Body.Bytes(), &payload))
	require.Equal(t, float64(2), payload.Total)
	require.Len(t, payload.History, 2)
	require.NotNil(t, payload.History[0].Content)
	require.Equal(t, "before", *payload.History[0].Content)
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

func TestSearchMessagesReflectsContentUpdatesIntegration(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user1 := createUser(t, deps.UserRepo, "searchmsg_update_user1", "user")
	user2 := createUser(t, deps.UserRepo, "searchmsg_update_user2", "user")
	recipientToken, _ := deps.AuthService.GenerateJWT(user1.ID, "", user1.Username, user1.Role)
	senderToken, _ := deps.AuthService.GenerateJWT(user2.ID, "", user2.Username, user2.Role)

	conv, err := deps.ConversationRepo.Create(context.Background(), user1.ID, user2.ID)
	require.NoError(t, err)

	msg := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "old-content-token",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), msg))

	searchOld, _ := http.NewRequest("GET", "/api/v1/search/messages?q=old-content-token", nil)
	searchOld.Header.Set("Authorization", "Bearer "+recipientToken)
	w := doRequest(t, deps.Router, searchOld)
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var beforeUpdate struct {
		Total int `json:"total"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &beforeUpdate))
	require.Equal(t, 1, beforeUpdate.Total)

	editReq, _ := http.NewRequest(
		"PATCH",
		fmt.Sprintf("/api/v1/messages/%d", msg.ID),
		bytes.NewReader([]byte(`{"encrypted_content":"new-content-token","sender_encrypted_content":"new-content-token"}`)),
	)
	editReq.Header.Set("Authorization", "Bearer "+senderToken)
	editReq.Header.Set("Content-Type", "application/json")
	editResp := doRequest(t, deps.Router, editReq)
	require.Equal(t, http.StatusOK, editResp.Code, "body=%s", editResp.Body.String())

	searchOldAfter, _ := http.NewRequest("GET", "/api/v1/search/messages?q=old-content-token", nil)
	searchOldAfter.Header.Set("Authorization", "Bearer "+recipientToken)
	w = doRequest(t, deps.Router, searchOldAfter)
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var afterOldQuery struct {
		Total int `json:"total"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &afterOldQuery))
	require.Equal(t, 0, afterOldQuery.Total)

	searchNew, _ := http.NewRequest("GET", "/api/v1/search/messages?q=new-content-token", nil)
	searchNew.Header.Set("Authorization", "Bearer "+recipientToken)
	w = doRequest(t, deps.Router, searchNew)
	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var afterNewQuery struct {
		Total int `json:"total"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &afterNewQuery))
	require.Equal(t, 1, afterNewQuery.Total)
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

	// Pre-fill near default 1GB free-tier quota.
	_, err := deps.DB.Pool.Exec(context.Background(), `
		INSERT INTO media_files (user_id, filename, original_filename, file_type, file_size, storage_url, storage_path)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, user.ID, "existing.bin", "existing.bin", "video/mp4", int64(1*1024*1024*1024-1024), "/uploads/existing.bin", "uploads/existing.bin")
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

func TestUsersMeStorage_ReturnsTrackedUsageAndQuota(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "storage_user", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	_, err := deps.DB.Pool.Exec(context.Background(), `
		INSERT INTO media_files (user_id, filename, original_filename, file_type, file_size, storage_url, storage_path)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, user.ID, "tracked.bin", "tracked.bin", "video/mp4", int64(10*1024), "/uploads/tracked.bin", "uploads/tracked.bin")
	require.NoError(t, err)

	req, _ := http.NewRequest("GET", "/api/v1/users/me/storage", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var payload map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &payload))

	require.Equal(t, float64(10*1024), payload["used"])
	require.Equal(t, float64(1*1024*1024*1024), payload["quota"])
	require.Greater(t, payload["percentage"].(float64), 0.0)
}

func TestStorageUsedBytes_TriggerTracksInsertAndDelete(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "storage_trigger_user", "user")

	var before int64
	err := deps.DB.Pool.QueryRow(context.Background(), `SELECT storage_used_bytes FROM users WHERE id = $1`, user.ID).Scan(&before)
	require.NoError(t, err)
	require.Equal(t, int64(0), before)

	var mediaID int
	err = deps.DB.Pool.QueryRow(context.Background(), `
		INSERT INTO media_files (user_id, filename, original_filename, file_type, file_size, storage_url, storage_path)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`, user.ID, "trigger.bin", "trigger.bin", "video/mp4", int64(4096), "/uploads/trigger.bin", "uploads/trigger.bin").Scan(&mediaID)
	require.NoError(t, err)

	var afterInsert int64
	err = deps.DB.Pool.QueryRow(context.Background(), `SELECT storage_used_bytes FROM users WHERE id = $1`, user.ID).Scan(&afterInsert)
	require.NoError(t, err)
	require.Equal(t, int64(4096), afterInsert)

	_, err = deps.DB.Pool.Exec(context.Background(), `DELETE FROM media_files WHERE id = $1`, mediaID)
	require.NoError(t, err)

	var afterDelete int64
	err = deps.DB.Pool.QueryRow(context.Background(), `SELECT storage_used_bytes FROM users WHERE id = $1`, user.ID).Scan(&afterDelete)
	require.NoError(t, err)
	require.Equal(t, int64(0), afterDelete)
}

func TestFilesThumbnailRedirect_ReturnsThumbnailURLForOwner(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "thumb_owner", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	var mediaID int
	err := deps.DB.Pool.QueryRow(context.Background(), `
		INSERT INTO media_files (user_id, filename, original_filename, file_type, file_size, storage_url, thumbnail_url, storage_path, scan_status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id
	`, user.ID, "clip.mp4", "clip.mp4", "video/mp4", int64(1024), "/uploads/clip.mp4", "/uploads/clip_thumb.jpg", "uploads/clip.mp4", models.MediaScanStatusClean).Scan(&mediaID)
	require.NoError(t, err)

	req, _ := http.NewRequest("GET", fmt.Sprintf("/api/v1/files/%d/thumbnail", mediaID), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)

	require.Equal(t, http.StatusTemporaryRedirect, w.Code, w.Body.String())
	require.Equal(t, "/uploads/clip_thumb.jpg", w.Header().Get("Location"))
}

func TestFilesThumbnailRedirect_RejectsNonOwner(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	owner := createUser(t, deps.UserRepo, "thumb_owner_2", "user")
	other := createUser(t, deps.UserRepo, "thumb_other", "user")
	token, _ := deps.AuthService.GenerateJWT(other.ID, "", other.Username, other.Role)

	var mediaID int
	err := deps.DB.Pool.QueryRow(context.Background(), `
		INSERT INTO media_files (user_id, filename, original_filename, file_type, file_size, storage_url, thumbnail_url, storage_path, scan_status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id
	`, owner.ID, "clip.mp4", "clip.mp4", "video/mp4", int64(1024), "/uploads/clip.mp4", "/uploads/clip_thumb.jpg", "uploads/clip.mp4", models.MediaScanStatusClean).Scan(&mediaID)
	require.NoError(t, err)

	req, _ := http.NewRequest("GET", fmt.Sprintf("/api/v1/files/%d/thumbnail", mediaID), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)

	require.Equal(t, http.StatusForbidden, w.Code, w.Body.String())
}

func TestFilesThumbnailRedirect_BlocksPendingScan(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	user := createUser(t, deps.UserRepo, "thumb_pending", "user")
	token, _ := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)

	var mediaID int
	err := deps.DB.Pool.QueryRow(context.Background(), `
		INSERT INTO media_files (user_id, filename, original_filename, file_type, file_size, storage_url, thumbnail_url, storage_path, scan_status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id
	`, user.ID, "clip.mp4", "clip.mp4", "video/mp4", int64(1024), "/uploads/clip.mp4", "/uploads/clip_thumb.jpg", "uploads/clip.mp4", models.MediaScanStatusPending).Scan(&mediaID)
	require.NoError(t, err)

	req, _ := http.NewRequest("GET", fmt.Sprintf("/api/v1/files/%d/thumbnail", mediaID), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := doRequest(t, deps.Router, req)

	require.Equal(t, http.StatusLocked, w.Code, w.Body.String())
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
