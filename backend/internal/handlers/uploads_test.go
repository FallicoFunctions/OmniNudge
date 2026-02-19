package handlers

import (
	"context"
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

func uploadsStringPtr(value string) *string {
	return &value
}

func TestUploadsHandler_ServeUpload_BlocksPendingMedia(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(context.Background()))
	require.NoError(t, database.ResetTestData(context.Background(), db))

	uploadsRoot := t.TempDir()
	filePath := filepath.Join(uploadsRoot, "pending.txt")
	require.NoError(t, os.WriteFile(filePath, []byte("pending"), 0o644))

	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{Username: "uploads_pending_user", PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(context.Background(), user))

	mediaRepo := models.NewMediaFileRepository(db.Pool)
	media := &models.MediaFile{
		UserID:           user.ID,
		Filename:         "pending.txt",
		OriginalFilename: "pending.txt",
		FileType:         "text/plain",
		FileSize:         7,
		StorageURL:       "/uploads/pending.txt",
		StoragePath:      filePath,
	}
	require.NoError(t, mediaRepo.Create(context.Background(), media))

	handler := NewUploadsHandler(mediaRepo, uploadsRoot)
	router := gin.New()
	router.GET("/uploads/*filepath", handler.ServeUpload)

	req := httptest.NewRequest(http.MethodGet, "/uploads/pending.txt", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusLocked, w.Code, w.Body.String())
}

func TestUploadsHandler_ServeUpload_AllowsCleanMedia(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(context.Background()))
	require.NoError(t, database.ResetTestData(context.Background(), db))

	uploadsRoot := t.TempDir()
	filePath := filepath.Join(uploadsRoot, "clean.txt")
	require.NoError(t, os.WriteFile(filePath, []byte("clean"), 0o644))

	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{Username: "uploads_clean_user", PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(context.Background(), user))

	mediaRepo := models.NewMediaFileRepository(db.Pool)
	media := &models.MediaFile{
		UserID:           user.ID,
		Filename:         "clean.txt",
		OriginalFilename: "clean.txt",
		FileType:         "text/plain",
		FileSize:         5,
		StorageURL:       "/uploads/clean.txt",
		StoragePath:      filePath,
	}
	require.NoError(t, mediaRepo.Create(context.Background(), media))
	require.NoError(t, mediaRepo.MarkScanClean(context.Background(), media.ID))

	handler := NewUploadsHandler(mediaRepo, uploadsRoot)
	router := gin.New()
	router.GET("/uploads/*filepath", handler.ServeUpload)

	req := httptest.NewRequest(http.MethodGet, "/uploads/clean.txt", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, "clean", w.Body.String())
}

func TestUploadsHandler_ServeUpload_AllowsNonMediaFiles(t *testing.T) {
	gin.SetMode(gin.TestMode)
	uploadsRoot := t.TempDir()
	avatarsDir := filepath.Join(uploadsRoot, "avatars")
	require.NoError(t, os.MkdirAll(avatarsDir, 0o755))
	filePath := filepath.Join(avatarsDir, "avatar.txt")
	require.NoError(t, os.WriteFile(filePath, []byte("avatar"), 0o644))

	handler := NewUploadsHandler(nil, uploadsRoot)
	router := gin.New()
	router.GET("/uploads/*filepath", handler.ServeUpload)

	req := httptest.NewRequest(http.MethodGet, "/uploads/avatars/avatar.txt", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, "avatar", w.Body.String())
}

func TestUploadsHandler_ServeUpload_BlocksUntrackedTopLevelUploadPath(t *testing.T) {
	gin.SetMode(gin.TestMode)
	uploadsRoot := t.TempDir()
	filePath := filepath.Join(uploadsRoot, "orphan.bin")
	require.NoError(t, os.WriteFile(filePath, []byte("orphan"), 0o644))

	handler := NewUploadsHandler(nil, uploadsRoot)
	router := gin.New()
	router.GET("/uploads/*filepath", handler.ServeUpload)

	req := httptest.NewRequest(http.MethodGet, "/uploads/orphan.bin", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusServiceUnavailable, w.Code, w.Body.String())
}

func TestUploadsHandler_ServeUpload_AddsCacheHeaderForThumbnails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(context.Background()))
	require.NoError(t, database.ResetTestData(context.Background(), db))

	uploadsRoot := t.TempDir()
	filePath := filepath.Join(uploadsRoot, "demo_thumb.jpg")
	require.NoError(t, os.WriteFile(filePath, []byte("thumb"), 0o644))

	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{Username: "uploads_thumb_user", PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(context.Background(), user))

	mediaRepo := models.NewMediaFileRepository(db.Pool)
	media := &models.MediaFile{
		UserID:           user.ID,
		Filename:         "demo_thumb.jpg",
		OriginalFilename: "demo.jpg",
		FileType:         "image/jpeg",
		FileSize:         5,
		StorageURL:       "/uploads/demo.jpg",
		ThumbnailURL:     uploadsStringPtr("/uploads/demo_thumb.jpg"),
		StoragePath:      filepath.Join(uploadsRoot, "demo.jpg"),
	}
	require.NoError(t, mediaRepo.Create(context.Background(), media))
	require.NoError(t, mediaRepo.MarkScanClean(context.Background(), media.ID))

	handler := NewUploadsHandler(mediaRepo, uploadsRoot)
	router := gin.New()
	router.GET("/uploads/*filepath", handler.ServeUpload)

	req := httptest.NewRequest(http.MethodGet, "/uploads/demo_thumb.jpg", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, "public, max-age=2592000", w.Header().Get("Cache-Control"))
}

func TestUploadsHandler_ServeUpload_AllowsDerivedSmallThumbnailFromTrackedPrimary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(context.Background()))
	require.NoError(t, database.ResetTestData(context.Background(), db))

	uploadsRoot := t.TempDir()
	primaryPath := filepath.Join(uploadsRoot, "demo_thumb.jpg")
	smallPath := filepath.Join(uploadsRoot, "demo_thumb_sm.jpg")
	require.NoError(t, os.WriteFile(primaryPath, []byte("primary"), 0o644))
	require.NoError(t, os.WriteFile(smallPath, []byte("small"), 0o644))

	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{Username: "uploads_thumb_small_user", PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(context.Background(), user))

	mediaRepo := models.NewMediaFileRepository(db.Pool)
	media := &models.MediaFile{
		UserID:           user.ID,
		Filename:         "demo_thumb.jpg",
		OriginalFilename: "demo.jpg",
		FileType:         "image/jpeg",
		FileSize:         7,
		StorageURL:       "/uploads/demo.jpg",
		ThumbnailURL:     uploadsStringPtr("/uploads/demo_thumb.jpg"),
		StoragePath:      filepath.Join(uploadsRoot, "demo.jpg"),
	}
	require.NoError(t, mediaRepo.Create(context.Background(), media))
	require.NoError(t, mediaRepo.MarkScanClean(context.Background(), media.ID))

	handler := NewUploadsHandler(mediaRepo, uploadsRoot)
	router := gin.New()
	router.GET("/uploads/*filepath", handler.ServeUpload)

	req := httptest.NewRequest(http.MethodGet, "/uploads/demo_thumb_sm.jpg", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, "public, max-age=2592000", w.Header().Get("Cache-Control"))
	require.Equal(t, "small", w.Body.String())
}
