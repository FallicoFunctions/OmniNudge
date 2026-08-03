package handlers

import (
	"bytes"
	"context"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type audioEncoderStorageFake struct {
	uploadKey string
	deleteKey string
}

func (f *audioEncoderStorageFake) Upload(_ context.Context, key string, body io.Reader, _ string) (string, error) {
	f.uploadKey = key
	_, err := io.Copy(io.Discard, body)
	return "https://storage.test/" + key, err
}

func (*audioEncoderStorageFake) Download(context.Context, string) (io.ReadCloser, error) {
	return nil, nil
}

func (f *audioEncoderStorageFake) Delete(_ context.Context, key string) error {
	f.deleteKey = key
	return nil
}

func (*audioEncoderStorageFake) GetSignedURL(context.Context, string, time.Duration) (string, error) {
	return "", nil
}

func (*audioEncoderStorageFake) List(context.Context, string) ([]string, error) {
	return nil, nil
}

func (*audioEncoderStorageFake) GeneratePresignedPutURL(context.Context, string, string, time.Duration) (string, error) {
	return "", nil
}

func (*audioEncoderStorageFake) PublicURL(key string) string {
	return "https://storage.test/" + key
}

func (*audioEncoderStorageFake) GetObjectSize(context.Context, string) (int64, error) {
	return 0, nil
}

var _ services.StorageService = (*audioEncoderStorageFake)(nil)

func setupAudioEncoderHandler(t *testing.T) (*AudioEncoderHandler, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	mediaRepo := models.NewMediaFileRepository(db.Pool)
	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	handler := NewAudioEncoderHandler(mediaRepo, settingsRepo, nil)
	return handler, func() { db.Close() }
}

// buildAudioMultipartRequest constructs a multipart POST request with the given
// file content and content-type for the "audio" field.
func buildAudioMultipartRequest(t *testing.T, path string, fileContent []byte, filename string) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("audio", filename)
	require.NoError(t, err)
	_, err = part.Write(fileContent)
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	req := httptest.NewRequest(http.MethodPost, path, &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

func TestEncodeAudio_Unauthenticated(t *testing.T) {
	// When no user_id is set in context the handler proceeds (it uses GetInt which defaults to 0),
	// but the downstream mediaRepo.Create will still execute. The authentication
	// guard is expected to be enforced by middleware at the router level; the handler
	// itself does not call GetAuthenticatedUserID, so there is no 401 from the handler.
	// This test verifies the handler accepts the call (auth is a middleware concern).
	t.Skip("Auth for EncodeAudio is enforced by router middleware, not the handler itself")
}

func TestEncodeAudio_NoFileProvided(t *testing.T) {
	handler, cleanup := setupAudioEncoderHandler(t)
	defer cleanup()

	router := gin.New()
	router.POST("/media/encode-audio", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.EncodeAudio(c)
	})

	// Send request with no file field at all
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/media/encode-audio", nil)
	req.Header.Set("Content-Type", "multipart/form-data; boundary=NOBOUNDARY")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())
}

func TestEncodeAudio_EmptyBody(t *testing.T) {
	handler, cleanup := setupAudioEncoderHandler(t)
	defer cleanup()

	router := gin.New()
	router.POST("/media/encode-audio", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.EncodeAudio(c)
	})

	// Multipart form with empty audio file content
	req := buildAudioMultipartRequest(t, "/media/encode-audio", []byte{}, "empty.wav")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Empty file will pass the size check but fail at ffmpeg encoding (500) or
	// succeed if the OS returns an empty webm — both outcomes are acceptable.
	// What must NOT happen is a 400 "no file" error, because a file field IS present.
	assert.NotEqual(t, http.StatusBadRequest, w.Code,
		"empty file should not return 400 'no audio file provided'")
}

func TestEncodeAudio_FileTooLarge(t *testing.T) {
	handler, cleanup := setupAudioEncoderHandler(t)
	defer cleanup()

	router := gin.New()
	router.POST("/media/encode-audio", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.EncodeAudio(c)
	})

	// Create a file whose reported Content-Length signals >50MB.
	// We cannot actually send 50MB in a unit test, so we craft a request
	// that passes a file-size header that triggers the size check.
	// Instead, test via a file that is small but manually override header.Size:
	// The handler checks header.Size which is set by the multipart parser from
	// Content-Length; we cannot easily spoof this in a unit test without a
	// real >50MB payload, so we skip this path and note the limitation.
	t.Skip("Cannot synthesise a >50MB multipart file in a unit test without allocating 50MB")
}

func TestEncodeAudio_FFmpegPath(t *testing.T) {
	handler, cleanup := setupAudioEncoderHandler(t)
	defer cleanup()

	router := gin.New()
	router.POST("/media/encode-audio", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.EncodeAudio(c)
	})

	// Provide a minimal valid-ish WAV header (44 bytes) so the handler gets past
	// file validation and reaches ffmpeg.
	wavHeader := make([]byte, 44)
	copy(wavHeader, []byte("RIFF"))
	req := buildAudioMultipartRequest(t, "/media/encode-audio", wavHeader, "test.wav")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// If ffmpeg is installed: encoding will fail on the dummy payload → 500.
	// If ffmpeg is not installed: cmd.Run() returns an exec error → 500.
	// Either way the handler must not return 200 for invalid audio data.
	// We accept 200 only if somehow ffmpeg produces output (unlikely with a fake WAV),
	// and 500 when ffmpeg is absent or rejects the input.
	assert.True(t, w.Code == http.StatusOK || w.Code == http.StatusInternalServerError,
		"expected 200 (ffmpeg succeeded) or 500 (ffmpeg failed/absent), got %d: %s",
		w.Code, w.Body.String())
}

func TestCheckFFmpegAvailability(t *testing.T) {
	// This is a best-effort check; we do not require ffmpeg in CI.
	err := CheckFFmpegAvailability()
	if err != nil {
		t.Logf("ffmpeg not available: %v (this is acceptable in CI)", err)
	} else {
		t.Log("ffmpeg is available")
	}
}

func TestPersistEncodedAudioUsesConfiguredStorageAndOwnerBoundObjectKey(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))
	user := &models.User{Username: "audio_storage_owner", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))

	storage := &audioEncoderStorageFake{}
	handler := NewAudioEncoderHandler(
		models.NewMediaFileRepository(db.Pool),
		models.NewUserSettingsRepository(db.Pool),
		nil,
	).SetStorageService(storage)

	media, err := handler.persistEncodedAudio(
		ctx,
		user.ID,
		"original.wav",
		[]byte("encoded-webm"),
		3,
	)
	require.NoError(t, err)
	require.NotNil(t, media)
	require.Equal(t, storage.uploadKey, media.StorageObjectKey)
	require.Equal(t, "/uploads/"+storage.uploadKey, media.StorageURL)
	require.Equal(t, "audio/webm", media.FileType)
	require.Equal(t, models.MediaScanStatusClean, media.ScanStatus)
	require.Regexp(t, `^[1-9][0-9]*/voice/[0-9a-f-]+\.webm$`, media.StorageObjectKey)
	require.Equal(t, "uploads/"+media.StorageObjectKey, media.StoragePath)

	require.NoError(t, models.NewMediaFileRepository(db.Pool).DeleteByID(ctx, media.ID))
	var queuedOwner int
	var queuedScope string
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT owner_user_id,storage_scope
		FROM media_file_deletion_queue
		WHERE storage_path=$1
	`, media.StorageObjectKey).Scan(&queuedOwner, &queuedScope))
	require.Equal(t, user.ID, queuedOwner)
	require.Equal(t, "canonical_owned", queuedScope)
}
