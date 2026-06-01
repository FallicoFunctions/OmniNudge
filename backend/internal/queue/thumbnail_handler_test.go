package queue

import (
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

type mockThumbnailStorageService struct {
	baseDir string
	baseURL string
}

func (m *mockThumbnailStorageService) Upload(ctx context.Context, key string, body io.Reader, contentType string) (string, error) {
	return "", fmt.Errorf("not implemented")
}

func (m *mockThumbnailStorageService) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	return os.Open(filepath.Join(m.baseDir, key))
}

func (m *mockThumbnailStorageService) Delete(ctx context.Context, key string) error {
	return fmt.Errorf("not implemented")
}

func (m *mockThumbnailStorageService) GetSignedURL(ctx context.Context, key string, expires time.Duration) (string, error) {
	return "", fmt.Errorf("not implemented")
}

func (m *mockThumbnailStorageService) List(ctx context.Context, prefix string) ([]string, error) {
	return nil, fmt.Errorf("not implemented")
}

func (m *mockThumbnailStorageService) GeneratePresignedPutURL(ctx context.Context, key, contentType string, expiresIn time.Duration) (string, error) {
	return "", fmt.Errorf("not implemented")
}

func (m *mockThumbnailStorageService) PublicURL(key string) string {
	return m.baseURL + "/" + key
}

func (m *mockThumbnailStorageService) GetObjectSize(ctx context.Context, key string) (int64, error) {
	info, err := os.Stat(filepath.Join(m.baseDir, key))
	if err != nil {
		return 0, err
	}
	return info.Size(), nil
}

func setupThumbnailDB(t *testing.T) (*database.Database, *models.MediaFileRepository, int) {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(context.Background()))
	require.NoError(t, database.ResetTestData(context.Background(), db))

	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     fmt.Sprintf("thumb_user_%d", time.Now().UnixNano()),
		PasswordHash: "hash",
	}
	require.NoError(t, userRepo.Create(context.Background(), user))

	return db, models.NewMediaFileRepository(db.Pool), user.ID
}

func createThumbnailTestMedia(t *testing.T, repo *models.MediaFileRepository, userID int, path, fileType string) *models.MediaFile {
	t.Helper()
	media := &models.MediaFile{
		UserID:           userID,
		Filename:         filepath.Base(path),
		OriginalFilename: filepath.Base(path),
		FileType:         fileType,
		FileSize:         64,
		StorageURL:       "/uploads/" + filepath.Base(path),
		StoragePath:      path,
	}
	require.NoError(t, repo.Create(context.Background(), media))
	return media
}

func TestThumbnailGenerationHandler_RejectsPendingScan(t *testing.T) {
	_, mediaRepo, userID := setupThumbnailDB(t)
	dir := t.TempDir()
	imagePath := filepath.Join(dir, "pending.png")
	require.NoError(t, os.WriteFile(imagePath, []byte{0x89, 0x50, 0x4E, 0x47}, 0o644))

	media := createThumbnailTestMedia(t, mediaRepo, userID, imagePath, "image/png")
	handler := NewThumbnailGenerationHandler(mediaRepo, services.NewThumbnailService(), nil)
	task := asynq.NewTask(string(JobTypeThumbnailGeneration), []byte(fmt.Sprintf(`{"file_id":%d}`, media.ID)))

	err := handler(context.Background(), task)
	require.Error(t, err)
	require.False(t, errors.Is(err, asynq.SkipRetry))
}

func TestThumbnailGenerationHandler_SkipRetryWhenScanInfected(t *testing.T) {
	_, mediaRepo, userID := setupThumbnailDB(t)
	dir := t.TempDir()
	imagePath := filepath.Join(dir, "infected.png")
	require.NoError(t, os.WriteFile(imagePath, []byte{0x89, 0x50, 0x4E, 0x47}, 0o644))

	media := createThumbnailTestMedia(t, mediaRepo, userID, imagePath, "image/png")
	require.NoError(t, mediaRepo.MarkScanInfected(context.Background(), media.ID, "infected"))

	handler := NewThumbnailGenerationHandler(mediaRepo, services.NewThumbnailService(), nil)
	task := asynq.NewTask(string(JobTypeThumbnailGeneration), []byte(fmt.Sprintf(`{"file_id":%d}`, media.ID)))

	err := handler(context.Background(), task)
	require.Error(t, err)
	require.True(t, errors.Is(err, asynq.SkipRetry))
}

func TestThumbnailGenerationHandler_GeneratesThumbnailForCleanImage(t *testing.T) {
	_, mediaRepo, userID := setupThumbnailDB(t)
	dir := t.TempDir()
	imagePath := filepath.Join(dir, "clean.png")

	img := image.NewRGBA(image.Rect(0, 0, 640, 480))
	for y := 0; y < 480; y++ {
		for x := 0; x < 640; x++ {
			img.Set(x, y, color.RGBA{R: 120, G: 180, B: 220, A: 255})
		}
	}
	file, err := os.Create(imagePath)
	require.NoError(t, err)
	require.NoError(t, png.Encode(file, img))
	require.NoError(t, file.Close())

	media := createThumbnailTestMedia(t, mediaRepo, userID, imagePath, "image/png")
	require.NoError(t, mediaRepo.MarkScanClean(context.Background(), media.ID))

	handler := NewThumbnailGenerationHandler(mediaRepo, services.NewThumbnailService(), nil)
	task := asynq.NewTask(string(JobTypeThumbnailGeneration), []byte(fmt.Sprintf(`{"file_id":%d}`, media.ID)))

	err = handler(context.Background(), task)
	require.NoError(t, err)

	refreshed, err := mediaRepo.GetByID(context.Background(), media.ID)
	require.NoError(t, err)
	require.NotNil(t, refreshed.ThumbnailURL)
	require.Contains(t, *refreshed.ThumbnailURL, "_thumb")
}

func TestThumbnailGenerationHandler_GeneratesThumbnailForRemoteOnlyCleanImage(t *testing.T) {
	_, mediaRepo, userID := setupThumbnailDB(t)
	storageDir := t.TempDir()
	missingLocalPath := filepath.Join(t.TempDir(), "remote-only.png")
	remoteKey := "remote/clean.png"

	img := image.NewRGBA(image.Rect(0, 0, 640, 480))
	for y := 0; y < 480; y++ {
		for x := 0; x < 640; x++ {
			img.Set(x, y, color.RGBA{R: 10, G: 140, B: 220, A: 255})
		}
	}

	require.NoError(t, os.MkdirAll(filepath.Join(storageDir, filepath.Dir(remoteKey)), 0o755))
	remoteFile, err := os.Create(filepath.Join(storageDir, remoteKey))
	require.NoError(t, err)
	require.NoError(t, png.Encode(remoteFile, img))
	require.NoError(t, remoteFile.Close())

	media := createThumbnailTestMedia(t, mediaRepo, userID, missingLocalPath, "image/png")
	media.Filename = remoteKey
	require.NoError(t, mediaRepo.MarkScanClean(context.Background(), media.ID))

	handler := NewThumbnailGenerationHandler(
		mediaRepo,
		services.NewThumbnailService(),
		&mockThumbnailStorageService{baseDir: storageDir, baseURL: "http://storage.local"},
	)
	task := asynq.NewTask(string(JobTypeThumbnailGeneration), []byte(fmt.Sprintf(`{"file_id":%d,"source_s3_key":"%s"}`, media.ID, remoteKey)))

	err = handler(context.Background(), task)
	require.NoError(t, err)

	refreshed, err := mediaRepo.GetByID(context.Background(), media.ID)
	require.NoError(t, err)
	require.NotNil(t, refreshed.ThumbnailURL)
	require.Contains(t, *refreshed.ThumbnailURL, "_thumb")
}
