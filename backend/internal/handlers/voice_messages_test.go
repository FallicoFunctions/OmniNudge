package handlers

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var voiceMessagesTestCounter int64

func uniqueVoiceUsername(base string) string {
	id := atomic.AddInt64(&voiceMessagesTestCounter, 1)
	return fmt.Sprintf("%s_voice_%d_%d", base, time.Now().UnixNano(), id)
}

// mockStorage implements services.StorageService in-memory.
type mockStorage struct{}

func (m *mockStorage) Upload(_ context.Context, _ string, _ io.Reader, _ string) (string, error) {
	return "https://storage.test/fake-url", nil
}
func (m *mockStorage) Download(_ context.Context, _ string) (io.ReadCloser, error) {
	return io.NopCloser(bytes.NewReader([]byte("audio"))), nil
}
func (m *mockStorage) Delete(_ context.Context, _ string) error { return nil }
func (m *mockStorage) GetSignedURL(_ context.Context, _ string, _ time.Duration) (string, error) {
	return "https://storage.test/signed-url", nil
}
func (m *mockStorage) List(_ context.Context, _ string) ([]string, error) { return nil, nil }
func (m *mockStorage) GeneratePresignedPutURL(_ context.Context, _, _ string, _ time.Duration) (string, error) {
	return "https://storage.test/presigned", nil
}
func (m *mockStorage) PublicURL(key string) string { return "https://storage.test/" + key }
func (m *mockStorage) GetObjectSize(_ context.Context, _ string) (int64, error) { return 1024, nil }

func setupVoiceHandlerTest(t *testing.T) (*VoiceMessagesHandler, *database.Database, int, int, int, func()) {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	sender := &models.User{Username: uniqueVoiceUsername("sender"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, sender))
	recipient := &models.User{Username: uniqueVoiceUsername("recipient"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, recipient))

	// Create conversation.
	var convID int
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO conversations (user1_id, user2_id) VALUES ($1, $2) RETURNING id
	`, sender.ID, recipient.ID).Scan(&convID)
	require.NoError(t, err)

	// Add participants.
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id, is_moderator) VALUES ($1, $2, false), ($1, $3, false)
	`, convID, sender.ID, recipient.ID)
	require.NoError(t, err)

	// Create a message owned by sender.
	var msgID int
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO messages (conversation_id, sender_id, recipient_id, encrypted_content, message_type)
		VALUES ($1, $2, $3, 'encrypted', 'voice') RETURNING id
	`, convID, sender.ID, recipient.ID).Scan(&msgID)
	require.NoError(t, err)

	handler := NewVoiceMessagesHandler(db.Pool, &mockStorage{}, nil, &mockHub{}, nil)

	return handler, db, sender.ID, recipient.ID, msgID, func() {}
}

func buildVoiceUploadRequest(t *testing.T, url string, contentType string, durationStr string) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	// Add duration field.
	require.NoError(t, writer.WriteField("duration_seconds", durationStr))

	// Add audio file part with specific content-type.
	partHeader := textproto.MIMEHeader{}
	partHeader.Set("Content-Disposition", `form-data; name="audio"; filename="test.webm"`)
	partHeader.Set("Content-Type", contentType)
	part, err := writer.CreatePart(partHeader)
	require.NoError(t, err)
	_, err = part.Write([]byte("fake audio bytes"))
	require.NoError(t, err)
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, url, &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

func TestUploadVoice_Success(t *testing.T) {
	handler, _, senderID, _, msgID, _ := setupVoiceHandlerTest(t)

	req := buildVoiceUploadRequest(t, fmt.Sprintf("/messages/%d/voice", msgID), "audio/webm", "3.5")

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", senderID)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", msgID)}}

	handler.UploadVoice(c)

	assert.Equal(t, http.StatusCreated, w.Code)
}

func TestUploadVoice_NotOwner(t *testing.T) {
	handler, _, _, recipientID, msgID, _ := setupVoiceHandlerTest(t)

	req := buildVoiceUploadRequest(t, fmt.Sprintf("/messages/%d/voice", msgID), "audio/webm", "3.5")

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", recipientID) // recipient does not own the message
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", msgID)}}

	handler.UploadVoice(c)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestUploadVoice_MessageNotFound(t *testing.T) {
	handler, _, senderID, _, _, _ := setupVoiceHandlerTest(t)

	req := buildVoiceUploadRequest(t, "/messages/999999/voice", "audio/webm", "3.5")

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", senderID)
	c.Params = gin.Params{{Key: "id", Value: "999999"}}

	handler.UploadVoice(c)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestUploadVoice_InvalidFormat(t *testing.T) {
	handler, _, senderID, _, msgID, _ := setupVoiceHandlerTest(t)

	req := buildVoiceUploadRequest(t, fmt.Sprintf("/messages/%d/voice", msgID), "image/png", "3.5")

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", senderID)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", msgID)}}

	handler.UploadVoice(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestUploadVoice_MissingDuration(t *testing.T) {
	handler, _, senderID, _, msgID, _ := setupVoiceHandlerTest(t)

	// Build without duration field.
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	partHeader := textproto.MIMEHeader{}
	partHeader.Set("Content-Disposition", `form-data; name="audio"; filename="test.webm"`)
	partHeader.Set("Content-Type", "audio/webm")
	part, err := writer.CreatePart(partHeader)
	require.NoError(t, err)
	_, err = part.Write([]byte("fake audio"))
	require.NoError(t, err)
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/messages/%d/voice", msgID), &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", senderID)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", msgID)}}

	handler.UploadVoice(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGetVoiceMessage_NotFound(t *testing.T) {
	handler, _, senderID, _, _, _ := setupVoiceHandlerTest(t)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/messages/999999/voice", nil)
	c.Set("user_id", senderID)
	c.Params = gin.Params{{Key: "id", Value: "999999"}}

	handler.GetVoiceMessage(c)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestGetVoiceMessage_InvalidID(t *testing.T) {
	handler, _, senderID, _, _, _ := setupVoiceHandlerTest(t)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/messages/abc/voice", nil)
	c.Set("user_id", senderID)
	c.Params = gin.Params{{Key: "id", Value: "abc"}}

	handler.GetVoiceMessage(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}
