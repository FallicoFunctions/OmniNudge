package queue

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/hibiken/asynq"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

type mockThumbnailEnqueuer struct {
	calls []ThumbnailGenerationPayload
	err   error
}

func (m *mockThumbnailEnqueuer) EnqueueThumbnailGeneration(ctx context.Context, fileID int, sourceURL, sourceS3Key, fileType string) error {
	if m.err != nil {
		return m.err
	}
	m.calls = append(m.calls, ThumbnailGenerationPayload{
		FileID:      fileID,
		SourceURL:   sourceURL,
		SourceS3Key: sourceS3Key,
		FileType:    fileType,
	})
	return nil
}

type mockVirusScanner struct {
	result services.VirusScanResult
	err    error
}

type promotableTestStorage struct {
	*services.LocalStorageService
	copies [][2]string
}

func (s *promotableTestStorage) CopyObject(ctx context.Context, sourceKey, destinationKey string) (string, error) {
	body, err := s.Download(ctx, sourceKey)
	if err != nil {
		return "", err
	}
	defer body.Close()
	payload, err := io.ReadAll(body)
	if err != nil {
		return "", err
	}
	s.copies = append(s.copies, [2]string{sourceKey, destinationKey})
	return s.Upload(ctx, destinationKey, bytes.NewReader(payload), "application/octet-stream")
}

func (m *mockVirusScanner) Ping(ctx context.Context) error {
	return nil
}

func (m *mockVirusScanner) ScanFile(ctx context.Context, filePath string) (services.VirusScanResult, error) {
	if m.err != nil {
		return services.VirusScanResult{}, m.err
	}
	return m.result, nil
}

func createMediaForScanTest(t *testing.T, repo *models.MediaFileRepository, userID int, rootDir, filename string) *models.MediaFile {
	t.Helper()

	fullPath := filepath.Join(rootDir, filename)
	require.NoError(t, os.WriteFile(fullPath, []byte("test file"), 0o644))

	media := &models.MediaFile{
		UserID:           userID,
		Filename:         filename,
		OriginalFilename: filename,
		FileType:         "text/plain",
		FileSize:         9,
		StorageURL:       "/uploads/" + filename,
		StoragePath:      fullPath,
	}
	require.NoError(t, repo.Create(context.Background(), media))
	return media
}

func setupVirusScanDB(t *testing.T) (*database.Database, *models.MediaFileRepository, int) {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(context.Background()))
	require.NoError(t, database.ResetTestData(context.Background(), db))

	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     fmt.Sprintf("virus_scan_user_%d", time.Now().UnixNano()),
		PasswordHash: "hash",
	}
	require.NoError(t, userRepo.Create(context.Background(), user))

	return db, models.NewMediaFileRepository(db.Pool), user.ID
}

func TestVirusScanHandler_MarksMediaClean(t *testing.T) {
	_, mediaRepo, userID := setupVirusScanDB(t)
	dir := t.TempDir()
	media := createMediaForScanTest(t, mediaRepo, userID, dir, "clean.txt")

	handler := NewVirusScanHandler(mediaRepo, &mockVirusScanner{
		result: services.VirusScanResult{Infected: false},
	}, true, nil, nil)

	task := asynq.NewTask(string(JobTypeVirusScan), []byte(`{"file_id":`+itoa(media.ID)+`,"file_path":"`+media.StoragePath+`","uploaded_by":1}`))
	require.NoError(t, handler(context.Background(), task))

	updated, err := mediaRepo.GetByID(context.Background(), media.ID)
	require.NoError(t, err)
	require.Equal(t, models.MediaScanStatusClean, updated.ScanStatus)
	require.Nil(t, updated.ScanError)
}

func TestVirusScanHandler_MarksMediaInfectedAndDeletesFile(t *testing.T) {
	_, mediaRepo, userID := setupVirusScanDB(t)
	dir := t.TempDir()
	media := createMediaForScanTest(t, mediaRepo, userID, dir, "infected.txt")

	handler := NewVirusScanHandler(mediaRepo, &mockVirusScanner{
		result: services.VirusScanResult{
			Infected:  true,
			Signature: "Eicar-Test-Signature",
		},
	}, true, nil, nil)

	task := asynq.NewTask(string(JobTypeVirusScan), []byte(`{"file_id":`+itoa(media.ID)+`,"file_path":"`+media.StoragePath+`","uploaded_by":1}`))
	err := handler(context.Background(), task)
	require.Error(t, err)
	require.True(t, errors.Is(err, asynq.SkipRetry))

	updated, err := mediaRepo.GetByID(context.Background(), media.ID)
	require.NoError(t, err)
	require.Equal(t, models.MediaScanStatusInfected, updated.ScanStatus)
	require.NotNil(t, updated.QuarantinedAt)

	_, statErr := os.Stat(media.StoragePath)
	require.True(t, os.IsNotExist(statErr))
}

func TestVirusScanHandler_MarksScanErrorWhenScannerFails(t *testing.T) {
	_, mediaRepo, userID := setupVirusScanDB(t)
	dir := t.TempDir()
	media := createMediaForScanTest(t, mediaRepo, userID, dir, "error.txt")

	handler := NewVirusScanHandler(mediaRepo, &mockVirusScanner{
		err: errors.New("scanner timeout"),
	}, true, nil, nil)

	task := asynq.NewTask(string(JobTypeVirusScan), []byte(`{"file_id":`+itoa(media.ID)+`,"file_path":"`+media.StoragePath+`","uploaded_by":1}`))
	err := handler(context.Background(), task)
	require.Error(t, err)
	require.False(t, errors.Is(err, asynq.SkipRetry))

	updated, getErr := mediaRepo.GetByID(context.Background(), media.ID)
	require.NoError(t, getErr)
	require.Equal(t, models.MediaScanStatusError, updated.ScanStatus)
	require.NotNil(t, updated.ScanError)
}

func TestVirusScanHandler_SkipRetryWhenMediaRecordMissing(t *testing.T) {
	_, mediaRepo, _ := setupVirusScanDB(t)
	handler := NewVirusScanHandler(mediaRepo, &mockVirusScanner{}, true, nil, nil)

	task := asynq.NewTask(string(JobTypeVirusScan), []byte(`{"file_id":999999,"file_path":"/tmp/missing","uploaded_by":1}`))
	err := handler(context.Background(), task)
	require.Error(t, err)
	require.True(t, errors.Is(err, asynq.SkipRetry))
}

func TestVirusScanHandler_EnqueuesThumbnailAfterCleanScanForImage(t *testing.T) {
	_, mediaRepo, userID := setupVirusScanDB(t)
	dir := t.TempDir()
	fullPath := filepath.Join(dir, "clean-image.png")
	require.NoError(t, os.WriteFile(fullPath, []byte("image payload"), 0o644))
	media := &models.MediaFile{
		UserID:           userID,
		Filename:         "clean-image.png",
		OriginalFilename: "clean-image.png",
		FileType:         "image/png",
		FileSize:         13,
		StorageURL:       "https://cdn.omninudge.local/clean-image.png",
		StoragePath:      fullPath,
	}
	require.NoError(t, mediaRepo.Create(context.Background(), media))

	enqueuer := &mockThumbnailEnqueuer{}
	handler := NewVirusScanHandler(mediaRepo, &mockVirusScanner{
		result: services.VirusScanResult{Infected: false},
	}, true, nil, enqueuer)

	task := asynq.NewTask(string(JobTypeVirusScan), []byte(`{"file_id":`+itoa(media.ID)+`,"file_path":"`+media.StoragePath+`","uploaded_by":1}`))
	require.NoError(t, handler(context.Background(), task))

	require.Len(t, enqueuer.calls, 1)
	require.Equal(t, media.ID, enqueuer.calls[0].FileID)
	require.Equal(t, media.StorageURL, enqueuer.calls[0].SourceURL)
	require.Equal(t, media.Filename, enqueuer.calls[0].SourceS3Key)
	require.Equal(t, "image", enqueuer.calls[0].FileType)
}

func TestVirusScanHandler_PromotesCleanDirectUploadBeforePublishing(t *testing.T) {
	_, mediaRepo, userID := setupVirusScanDB(t)
	local, err := services.NewLocalStorageService(t.TempDir(), "https://cdn.example")
	require.NoError(t, err)
	storage := &promotableTestStorage{LocalStorageService: local}
	stagingKey := fmt.Sprintf("pending-uploads/%d/upload-id/clean.png", userID)
	var pngBuffer bytes.Buffer
	pixel := image.NewRGBA(image.Rect(0, 0, 1, 1))
	pixel.Set(0, 0, color.RGBA{R: 1, A: 255})
	require.NoError(t, png.Encode(&pngBuffer, pixel))
	pngPayload := pngBuffer.Bytes()
	_, err = storage.Upload(context.Background(), stagingKey, bytes.NewReader(pngPayload), "image/png")
	require.NoError(t, err)

	media := &models.MediaFile{
		UserID: userID, Filename: "clean.png", OriginalFilename: "clean.png",
		FileType: "image/png", FileSize: int64(len(pngPayload)), StorageURL: "", StoragePath: stagingKey,
	}
	require.NoError(t, mediaRepo.Create(context.Background(), media))
	handler := NewVirusScanHandler(mediaRepo, &mockVirusScanner{}, true, storage, nil)
	task := asynq.NewTask(string(JobTypeVirusScan), []byte(fmt.Sprintf(
		`{"file_id":%d,"file_path":%q,"s3_key":%q,"uploaded_by":%d}`,
		media.ID, stagingKey, stagingKey, userID,
	)))
	require.NoError(t, handler(context.Background(), task))

	updated, err := mediaRepo.GetByID(context.Background(), media.ID)
	require.NoError(t, err)
	require.Equal(t, models.MediaScanStatusClean, updated.ScanStatus)
	require.Equal(t, fmt.Sprintf("uploads/%d/upload-id/clean.png", userID), updated.StoragePath)
	require.Equal(t, "https://cdn.example/"+updated.StoragePath, updated.StorageURL)
	require.Equal(t, [][2]string{{stagingKey, updated.StoragePath}}, storage.copies)
	_, err = storage.GetObjectSize(context.Background(), stagingKey)
	require.Error(t, err)
}

func TestValidateStagedUploadRejectsDeclaredImageWithExecutableBytes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "payload.png")
	require.NoError(t, os.WriteFile(path, []byte("MZ executable payload"), 0o600))
	err := validateStagedUpload(path, &models.MediaFile{
		OriginalFilename: "payload.png",
		FileType:         "image/png",
	})
	require.Error(t, err)
}

func itoa(v int) string {
	return fmt.Sprintf("%d", v)
}
