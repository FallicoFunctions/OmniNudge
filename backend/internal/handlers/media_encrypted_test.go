package handlers

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"image"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

// Every end-to-end encrypted file a client ever sent was refused here. The
// upload handler sniffs the bytes rather than trusting the declared type, and
// ciphertext never sniffs as an image: it came back application/octet-stream,
// which is not an allowed media type, so the answer was always 415. These tests
// pin the encrypted mode that accepts it, and pin that the rules for plaintext
// are exactly what they were.

func realPNG(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 4, 4))))
	return buf.Bytes()
}

func randomBytes(t *testing.T, n int) []byte {
	t.Helper()
	b := make([]byte, n)
	_, err := rand.Read(b)
	require.NoError(t, err)
	return b
}

func postUpload(t *testing.T, router *gin.Engine, filename string, content []byte, encrypted bool) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filename)
	require.NoError(t, err)
	_, err = part.Write(content)
	require.NoError(t, err)
	if encrypted {
		require.NoError(t, writer.WriteField("encrypted", "true"))
	}
	require.NoError(t, writer.Close())

	request := httptest.NewRequest(http.MethodPost, "/media/upload", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

func TestUploadMedia_EncryptedFiles(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))
	t.Chdir(t.TempDir())

	user := &models.User{Username: "encrypted_upload_owner", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	handler := NewMediaHandler(models.NewMediaFileRepository(db.Pool), nil, nil, MediaQuotaConfig{}, false, false)
	router := gin.New()
	router.POST("/media/upload", func(c *gin.Context) {
		c.Set("user_id", user.ID)
		c.Set("role", user.Role)
		handler.UploadMedia(c)
	})

	ciphertext := randomBytes(t, 4096)
	const imageLimit = 10 * 1024 * 1024

	tests := []struct {
		name        string
		filename    string
		content     []byte
		encrypted   bool
		wantStatus  int
		wantType    string
		wantMessage string
	}{
		{
			name:       "ciphertext marked encrypted is stored, under the opaque type",
			filename:   "photo.png",
			content:    ciphertext,
			encrypted:  true,
			wantStatus: http.StatusCreated,
			wantType:   encryptedMediaFileType,
		},
		{
			name:        "the same ciphertext unmarked is still refused",
			filename:    "photo.png",
			content:     ciphertext,
			encrypted:   false,
			wantStatus:  http.StatusUnsupportedMediaType,
			wantMessage: "Unsupported file type",
		},
		{
			name:       "a plain image is unchanged",
			filename:   "photo.png",
			content:    realPNG(t),
			encrypted:  false,
			wantStatus: http.StatusCreated,
			wantType:   "image/png",
		},
		{
			name:        "an encrypted file still needs an allowed extension",
			filename:    "payload.html",
			content:     ciphertext,
			encrypted:   true,
			wantStatus:  http.StatusUnsupportedMediaType,
			wantMessage: "Unsupported file extension",
		},
		{
			name:       "an encrypted image may be its class limit plus the GCM tag",
			filename:   "photo.png",
			content:    randomBytes(t, imageLimit+encryptedMediaOverheadBytes),
			encrypted:  true,
			wantStatus: http.StatusCreated,
			wantType:   encryptedMediaFileType,
		},
		{
			name:        "an encrypted image one byte past that is refused, for its type",
			filename:    "photo.png",
			content:     randomBytes(t, imageLimit+encryptedMediaOverheadBytes+1),
			encrypted:   true,
			wantStatus:  http.StatusRequestEntityTooLarge,
			wantMessage: "File size exceeds limit for this file type",
		},
		{
			name:       "an encrypted webm is held to the video limit, not the audio one",
			filename:   "clip.webm",
			content:    randomBytes(t, imageLimit+1),
			encrypted:  true,
			wantStatus: http.StatusCreated,
			wantType:   encryptedMediaFileType,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			response := postUpload(t, router, tt.filename, tt.content, tt.encrypted)
			require.Equal(t, tt.wantStatus, response.Code, response.Body.String())

			var body map[string]any
			require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
			if tt.wantType != "" {
				require.Equal(t, tt.wantType, body["file_type"])
			}
			if tt.wantMessage != "" {
				// Asserted, not only the status: two different refusals can share
				// a code, and the test must fail for the reason it names.
				require.Equal(t, tt.wantMessage, body["error"])
			}
		})
	}
}

func TestServeUpload_EncryptedFileIsADownload(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	uploadsRoot := t.TempDir()
	user := &models.User{Username: "encrypted_serve_owner", PasswordHash: "hash"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	mediaRepo := models.NewMediaFileRepository(db.Pool)

	store := func(name, fileType string, content []byte) {
		path := filepath.Join(uploadsRoot, name)
		require.NoError(t, os.WriteFile(path, content, 0o644))
		media := &models.MediaFile{
			UserID:           user.ID,
			Filename:         name,
			OriginalFilename: name,
			FileType:         fileType,
			FileSize:         int64(len(content)),
			StorageURL:       "/uploads/" + name,
			StoragePath:      path,
		}
		require.NoError(t, mediaRepo.Create(ctx, media))
		require.NoError(t, mediaRepo.MarkScanClean(ctx, media.ID))
	}
	store("sealed_photo.png", encryptedMediaFileType, randomBytes(t, 512))
	store("plain_photo.png", "image/png", realPNG(t))

	router := gin.New()
	serveUploadsAs(router, NewUploadsHandler(mediaRepo, uploadsRoot), user.ID)

	tests := []struct {
		name            string
		path            string
		wantType        string
		wantDisposition string
	}{
		{
			// The name still ends in .png, so without this c.File would label
			// ciphertext image/png and hand it to a browser to render.
			name:            "an encrypted file is served as an opaque download",
			path:            "/uploads/sealed_photo.png",
			wantType:        encryptedMediaFileType,
			wantDisposition: "attachment",
		},
		{
			name:            "a plain image is still served as an image",
			path:            "/uploads/plain_photo.png",
			wantType:        "image/png",
			wantDisposition: "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, tt.path, nil))
			require.Equal(t, http.StatusOK, response.Code, response.Body.String())
			require.Equal(t, tt.wantType, response.Header().Get("Content-Type"))
			require.Equal(t, tt.wantDisposition, response.Header().Get("Content-Disposition"))
		})
	}
}
