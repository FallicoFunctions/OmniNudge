package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/queue"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

// The voice routes granted access through participant rows alone. Direct
// messages have none -- the older voice tests passed only because their fixture
// inserted rows no real direct message has -- so a voice message was refused to
// its own sender and recipient. The conversation here is made the way the app
// makes one. The routes also had no way to take an end-to-end encrypted
// recording.

type voiceJobsStub struct{ enqueued []queue.JobType }

func (s *voiceJobsStub) EnqueueJob(_ context.Context, jobType queue.JobType, _ interface{}, _ ...asynq.Option) (*asynq.TaskInfo, error) {
	s.enqueued = append(s.enqueued, jobType)
	return &asynq.TaskInfo{}, nil
}

// A WAV header: the only audio signature http.DetectContentType names as audio.
var plainVoice = append([]byte("RIFF\x24\x00\x00\x00WAVEfmt "), make([]byte, 64)...)

type voiceFixture struct {
	db                          *database.Database
	handler                     *VoiceMessagesHandler
	jobs                        *voiceJobsStub
	sender, recipient, stranger int
	conversationID              int
}

func newVoiceFixture(t *testing.T) *voiceFixture {
	t.Helper()
	gin.SetMode(gin.TestMode)
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	ids := make([]int, 3)
	for i, name := range []string{"voice_sender", "voice_recipient", "voice_stranger"} {
		user := &models.User{Username: uniqueMessagesUsername(name), PasswordHash: "hash"}
		require.NoError(t, users.Create(ctx, user))
		ids[i] = user.ID
	}
	conversation, err := models.NewConversationRepository(db.Pool).Create(ctx, ids[0], ids[1])
	require.NoError(t, err)

	storage, err := services.NewLocalStorageService(t.TempDir(), "http://storage.test")
	require.NoError(t, err)
	jobs := &voiceJobsStub{}
	handler := NewVoiceMessagesHandler(db.Pool, storage, nil, nil, nil, false)
	handler.jobs = jobs

	return &voiceFixture{db: db, handler: handler, jobs: jobs, sender: ids[0], recipient: ids[1], stranger: ids[2], conversationID: conversation.ID}
}

// audioMessage stores the audio message a voice upload attaches to. A sealed
// file key on it is what makes the recording end-to-end encrypted.
func (f *voiceFixture) audioMessage(t *testing.T, sealedKey *string) int {
	t.Helper()
	message := &models.Message{
		ConversationID:     f.conversationID,
		SenderID:           f.sender,
		RecipientID:        f.recipient,
		MessageType:        "audio",
		EncryptionVersion:  "none",
		MediaEncryptionKey: sealedKey,
	}
	require.NoError(t, models.NewMessageRepository(f.db.Pool).Create(context.Background(), message))
	return message.ID
}

func (f *voiceFixture) as(userID int) *gin.Engine {
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", userID); c.Next() })
	router.POST("/messages/:id/voice", f.handler.UploadVoice)
	router.GET("/messages/:id/voice", f.handler.GetVoiceMessage)
	router.GET("/voice/:id/download", f.handler.DownloadVoice)
	return router
}

func (f *voiceFixture) upload(t *testing.T, messageID int, content []byte, declaredType string) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", `form-data; name="audio"; filename="voice.webm"`)
	header.Set("Content-Type", declaredType)
	part, err := writer.CreatePart(header)
	require.NoError(t, err)
	_, err = part.Write(content)
	require.NoError(t, err)
	require.NoError(t, writer.WriteField("duration_seconds", "3"))
	require.NoError(t, writer.Close())
	request := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/messages/%d/voice", messageID), &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	f.as(f.sender).ServeHTTP(response, request)
	return response
}

func (f *voiceFixture) get(userID int, path string) *httptest.ResponseRecorder {
	response := httptest.NewRecorder()
	f.as(userID).ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
	return response
}

func TestVoiceMessage_BothPeopleInADirectMessageCanReadIt(t *testing.T) {
	f := newVoiceFixture(t)
	messageID := f.audioMessage(t, nil)
	uploaded := f.upload(t, messageID, plainVoice, "audio/wav")
	require.Equal(t, http.StatusCreated, uploaded.Code, uploaded.Body.String())
	var created struct {
		VoiceMessageID int `json:"voice_message_id"`
	}
	require.NoError(t, json.Unmarshal(uploaded.Body.Bytes(), &created))

	for _, tt := range []struct {
		name   string
		userID int
		want   int
	}{
		{"the sender", f.sender, http.StatusOK},
		{"the recipient", f.recipient, http.StatusOK},
		{"a stranger", f.stranger, http.StatusForbidden},
	} {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, f.get(tt.userID, fmt.Sprintf("/messages/%d/voice", messageID)).Code)
			require.Equal(t, tt.want, f.get(tt.userID, fmt.Sprintf("/voice/%d/download", created.VoiceMessageID)).Code)
		})
	}
}

func TestVoiceMessage_EncryptedRecording(t *testing.T) {
	f := newVoiceFixture(t)
	sealed := "sealed-file-key"
	ciphertext := bytes.Repeat([]byte{0x9c, 0x13, 0xfe, 0x42}, 64)

	t.Run("is accepted under its declared audio type, with no waveform job", func(t *testing.T) {
		messageID := f.audioMessage(t, &sealed)
		uploaded := f.upload(t, messageID, ciphertext, "audio/webm")
		require.Equal(t, http.StatusCreated, uploaded.Code, uploaded.Body.String())
		require.Empty(t, f.jobs.enqueued, "the worker cannot decode ciphertext")

		var voice struct {
			MimeType  string `json:"mime_type"`
			SignedURL string `json:"signed_url"`
		}
		read := f.get(f.recipient, fmt.Sprintf("/messages/%d/voice", messageID))
		require.Equal(t, http.StatusOK, read.Code)
		require.NoError(t, json.Unmarshal(read.Body.Bytes(), &voice))
		require.Equal(t, "audio/webm", voice.MimeType, "the reader builds the decrypted audio from it")

		download := f.get(f.recipient, voice.SignedURL)
		require.Equal(t, http.StatusOK, download.Code)
		require.Equal(t, encryptedMediaFileType, download.Header().Get("Content-Type"))
		require.Equal(t, "attachment", download.Header().Get("Content-Disposition"))
		body, err := io.ReadAll(download.Body)
		require.NoError(t, err)
		require.Equal(t, ciphertext, body)
	})

	t.Run("must still be declared as audio", func(t *testing.T) {
		messageID := f.audioMessage(t, &sealed)
		refused := f.upload(t, messageID, ciphertext, "text/html")
		require.Equal(t, http.StatusBadRequest, refused.Code)
		require.Contains(t, refused.Body.String(), "File must be an audio file")
	})

	t.Run("a plain recording still gets its waveform and its audio type", func(t *testing.T) {
		f.jobs.enqueued = nil
		messageID := f.audioMessage(t, nil)
		uploaded := f.upload(t, messageID, plainVoice, "audio/wav")
		require.Equal(t, http.StatusCreated, uploaded.Code, uploaded.Body.String())
		require.Equal(t, []queue.JobType{queue.JobTypeWaveform}, f.jobs.enqueued)
		var created struct {
			VoiceMessageID int `json:"voice_message_id"`
		}
		require.NoError(t, json.Unmarshal(uploaded.Body.Bytes(), &created))
		download := f.get(f.recipient, fmt.Sprintf("/voice/%d/download", created.VoiceMessageID))
		require.Equal(t, http.StatusOK, download.Code)
		require.Equal(t, "audio/wave", download.Header().Get("Content-Type"))
		require.Empty(t, download.Header().Get("Content-Disposition"))
	})
}
