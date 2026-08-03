package handlers

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

type stubMediaJobEnqueuer struct {
	virusCalls     int
	thumbnailCalls int
}

func (s *stubMediaJobEnqueuer) EnqueueVirusScan(ctx context.Context, fileID int, filePath, s3Key string, uploadedBy int) error {
	s.virusCalls++
	return nil
}

func (s *stubMediaJobEnqueuer) EnqueueThumbnailGeneration(ctx context.Context, fileID int, sourceURL, sourceS3Key, fileType string) error {
	s.thumbnailCalls++
	return nil
}

func TestSchedulePostUploadJobs_EnqueuesVirusScanOnly(t *testing.T) {
	enqueuer := &stubMediaJobEnqueuer{}
	handler := &MediaHandler{
		queueClient:      enqueuer,
		virusScanEnabled: true,
	}

	media := &models.MediaFile{
		ID:         42,
		UserID:     7,
		FileType:   "image/jpeg",
		StorageURL: "https://cdn.omninudge.local/image.jpg",
		Filename:   "image.jpg",
	}

	err := handler.schedulePostUploadJobs(context.Background(), media)
	require.NoError(t, err)
	require.Equal(t, 1, enqueuer.virusCalls)
	require.Equal(t, 0, enqueuer.thumbnailCalls)
}

func TestUploadMediaUsesOwnerBoundCanonicalStorageObjectKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))
	t.Chdir(t.TempDir())

	user := &models.User{Username: "canonical_upload_owner", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, user))
	mediaRepo := models.NewMediaFileRepository(db.Pool)
	storage := &audioEncoderStorageFake{}
	handler := NewMediaHandler(
		mediaRepo,
		nil,
		nil,
		MediaQuotaConfig{},
		false,
		false,
	)
	handler.SetStorageService(storage)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "note.txt")
	require.NoError(t, err)
	_, err = part.Write([]byte("hello"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	request := httptest.NewRequest(http.MethodPost, "/media/upload", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	router := gin.New()
	router.POST("/media/upload", func(c *gin.Context) {
		c.Set("user_id", user.ID)
		c.Set("role", user.Role)
		handler.UploadMedia(c)
	})
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusCreated, response.Code, response.Body.String())
	require.Regexp(t, `^[1-9][0-9]*/[0-9]+_note\.txt$`, storage.uploadKey)
	media, err := mediaRepo.GetByPublicURL(ctx, "/uploads/"+storage.uploadKey)
	require.NoError(t, err)
	require.NotNil(t, media)
	require.Equal(t, storage.uploadKey, media.StorageObjectKey)
	require.Equal(t, "uploads/"+storage.uploadKey, media.StoragePath)
}
