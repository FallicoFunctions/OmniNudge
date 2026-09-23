package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

// An encrypted image was stored as application/octet-stream, SendMessage copied
// that onto the message, and the app drew every encrypted photo as a download
// card. Found by sending one from a real browser.
func TestSendMessage_EncryptedMediaKeepsTheTypeTheSenderNames(t *testing.T) {
	handler, db, userID, _, convID, _, cleanup := setupMessagesHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/messages", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.SendMessage(c)
	})
	mediaRepo := models.NewMediaFileRepository(db.Pool)

	tests := []struct {
		name       string
		filename   string
		storedType string
		declared   any
		wantStatus int
		wantType   string
	}{
		{
			name:       "an encrypted image is rendered as the image it is",
			filename:   "photo.png",
			storedType: encryptedMediaFileType,
			declared:   "image/png",
			wantStatus: http.StatusCreated,
			wantType:   "image/png",
		},
		{
			name:       "an encrypted file with no named type stays opaque",
			filename:   "photo.png",
			storedType: encryptedMediaFileType,
			declared:   nil,
			wantStatus: http.StatusCreated,
			wantType:   encryptedMediaFileType,
		},
		{
			name:       "an active document type is refused",
			filename:   "photo.png",
			storedType: encryptedMediaFileType,
			declared:   "text/html",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "a type that disagrees with the extension is refused",
			filename:   "photo.png",
			storedType: encryptedMediaFileType,
			declared:   "video/mp4",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "a plain file keeps the type the server found, whatever the sender claims",
			filename:   "photo.jpg",
			storedType: "image/jpeg",
			declared:   "application/pdf",
			wantStatus: http.StatusCreated,
			wantType:   "image/jpeg",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			media := &models.MediaFile{
				UserID: userID, Filename: tt.filename, OriginalFilename: tt.filename,
				FileType: tt.storedType, FileSize: 128, StorageURL: "/uploads/" + tt.name,
				StoragePath: "uploads/" + tt.filename, ScanStatus: models.MediaScanStatusClean,
			}
			require.NoError(t, mediaRepo.Create(context.Background(), media))

			body := map[string]any{
				"conversation_id":    convID,
				"message_type":       "image",
				"media_file_id":      media.ID,
				"encryption_version": "none",
			}
			if tt.declared != nil {
				body["media_type"] = tt.declared
			}
			payload, err := json.Marshal(body)
			require.NoError(t, err)
			request := httptest.NewRequest(http.MethodPost, "/messages", bytes.NewReader(payload))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)

			require.Equal(t, tt.wantStatus, response.Code, response.Body.String())
			if tt.wantType != "" {
				var message map[string]any
				require.NoError(t, json.Unmarshal(response.Body.Bytes(), &message))
				require.Equal(t, tt.wantType, message["media_type"])
			}
		})
	}
}
