package handlers

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

type remoteUploadStorageFake struct{ objects map[string][]byte }

func (*remoteUploadStorageFake) Upload(context.Context, string, io.Reader, string) (string, error) {
	return "", nil
}
func (s *remoteUploadStorageFake) Download(_ context.Context, key string) (io.ReadCloser, error) {
	value, ok := s.objects[key]
	if !ok {
		return nil, os.ErrNotExist
	}
	return io.NopCloser(bytes.NewReader(value)), nil
}
func (*remoteUploadStorageFake) Delete(context.Context, string) error { return nil }
func (*remoteUploadStorageFake) GetSignedURL(context.Context, string, time.Duration) (string, error) {
	return "", nil
}
func (*remoteUploadStorageFake) List(context.Context, string) ([]string, error) { return nil, nil }
func (*remoteUploadStorageFake) GeneratePresignedPutURL(context.Context, string, string, time.Duration) (string, error) {
	return "", nil
}
func (*remoteUploadStorageFake) PublicURL(string) string { return "" }
func (s *remoteUploadStorageFake) GetObjectSize(_ context.Context, key string) (int64, error) {
	value, ok := s.objects[key]
	if !ok {
		return 0, os.ErrNotExist
	}
	return int64(len(value)), nil
}

func uploadsStringPtr(value string) *string {
	return &value
}

func serveUploadsAs(router *gin.Engine, handler *UploadsHandler, userID int) {
	router.GET("/uploads/*filepath", func(c *gin.Context) {
		if userID > 0 {
			c.Set("user_id", userID)
		}
		handler.ServeUpload(c)
	})
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
	serveUploadsAs(router, handler, user.ID)

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
	serveUploadsAs(router, handler, user.ID)

	req := httptest.NewRequest(http.MethodGet, "/uploads/clean.txt", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, "clean", w.Body.String())
	require.Equal(t, "private, no-store", w.Header().Get("Cache-Control"))
}

func TestUploadsHandler_ServeUpload_HidesTrackedMediaFromAnonymousAndOtherUsers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(context.Background()))
	require.NoError(t, database.ResetTestData(context.Background(), db))

	uploadsRoot := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(uploadsRoot, "private.txt"), []byte("private"), 0o644))
	userRepo := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "uploads_private_owner", PasswordHash: "hash"}
	viewer := &models.User{Username: "uploads_private_viewer", PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(context.Background(), owner))
	require.NoError(t, userRepo.Create(context.Background(), viewer))
	mediaRepo := models.NewMediaFileRepository(db.Pool)
	media := &models.MediaFile{
		UserID: owner.ID, Filename: "private.txt", OriginalFilename: "private.txt",
		FileType: "text/plain", FileSize: 7, StorageURL: "/uploads/private.txt",
		StoragePath: filepath.Join(uploadsRoot, "private.txt"),
	}
	require.NoError(t, mediaRepo.Create(context.Background(), media))
	require.NoError(t, mediaRepo.MarkScanClean(context.Background(), media.ID))

	for name, userID := range map[string]int{"anonymous": 0, "other_user": viewer.ID} {
		t.Run(name, func(t *testing.T) {
			router := gin.New()
			serveUploadsAs(router, NewUploadsHandler(mediaRepo, uploadsRoot), userID)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/uploads/private.txt", nil))
			require.Equal(t, http.StatusNotFound, w.Code, w.Body.String())
			require.Equal(t, "private, no-store", w.Header().Get("Cache-Control"))
		})
	}
}

func TestUploadsHandler_ServeUpload_AllowsOnlyExplicitPublicPersonaMediaAnonymously(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(context.Background()))
	require.NoError(t, database.ResetTestData(context.Background(), db))

	uploadsRoot := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(uploadsRoot, "persona.png"), []byte("persona"), 0o644))
	userRepo := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "uploads_persona_media_owner", PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(context.Background(), owner))
	mediaRepo := models.NewMediaFileRepository(db.Pool)
	media := &models.MediaFile{
		UserID: owner.ID, Filename: "persona.png", OriginalFilename: "persona.png",
		FileType: "image/png", FileSize: 7, StorageURL: "/uploads/persona.png",
		StoragePath: filepath.Join(uploadsRoot, "persona.png"),
	}
	require.NoError(t, mediaRepo.Create(context.Background(), media))
	require.NoError(t, mediaRepo.MarkScanClean(context.Background(), media.ID))
	var personaID int
	err = db.Pool.QueryRow(context.Background(), `
		INSERT INTO bot_personas (slug, name, description, category, visibility, source_format, system_prompt, is_nsfw, is_active)
		VALUES ('uploads-public-persona', 'Public Persona', 'test persona', 'original', 'public', 'native', 'test prompt', FALSE, TRUE)
		RETURNING id
	`).Scan(&personaID)
	require.NoError(t, err)
	commandTag, err := db.Pool.Exec(context.Background(), `UPDATE bot_personas SET avatar_url=$1 WHERE id=$2`, media.StorageURL, personaID)
	require.NoError(t, err)
	require.Equal(t, int64(1), commandTag.RowsAffected())

	router := gin.New()
	serveUploadsAs(router, NewUploadsHandler(mediaRepo, uploadsRoot), 0)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/uploads/persona.png", nil))
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, "persona", w.Body.String())
	require.Equal(t, "private, no-store", w.Header().Get("Cache-Control"))
}

func TestUploadsHandler_ServeUpload_ProxiesAuthorizedRemoteMediaWithoutRedirect(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(context.Background()))
	require.NoError(t, database.ResetTestData(context.Background(), db))
	userRepo := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "uploads_remote_private_owner", PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(context.Background(), owner))
	mediaRepo := models.NewMediaFileRepository(db.Pool)
	media := &models.MediaFile{
		UserID: owner.ID, Filename: "remote.txt", OriginalFilename: "remote.txt",
		FileType: "text/plain", FileSize: 7, StorageURL: "/uploads/9/remote.txt",
		StoragePath: "uploads/9/remote.txt", StorageObjectKey: "9/remote.txt",
	}
	require.NoError(t, mediaRepo.Create(context.Background(), media))
	require.NoError(t, mediaRepo.MarkScanClean(context.Background(), media.ID))

	storage := &remoteUploadStorageFake{objects: map[string][]byte{"9/remote.txt": []byte("private")}}
	router := gin.New()
	serveUploadsAs(router, NewUploadsHandler(mediaRepo, t.TempDir(), storage), owner.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/uploads/9/remote.txt", nil))

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, "private", w.Body.String())
	require.Empty(t, w.Header().Get("Location"))
	require.Equal(t, "private, no-store", w.Header().Get("Cache-Control"))
}

func TestUploadsHandler_ServeUpload_FailsClosedWhenRemoteStorageIsUnavailable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(context.Background()))
	require.NoError(t, database.ResetTestData(context.Background(), db))

	uploadsRoot := t.TempDir()

	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{Username: "uploads_remote_user", PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(context.Background(), user))

	mediaRepo := models.NewMediaFileRepository(db.Pool)
	media := &models.MediaFile{
		UserID:           user.ID,
		Filename:         "remote.png",
		OriginalFilename: "remote.png",
		FileType:         "image/png",
		FileSize:         5,
		StorageURL:       "https://cdn.omninudge.com/remote.png",
		StoragePath:      "uploads/remote.png",
	}
	require.NoError(t, mediaRepo.Create(context.Background(), media))
	require.NoError(t, mediaRepo.MarkScanClean(context.Background(), media.ID))

	handler := NewUploadsHandler(mediaRepo, uploadsRoot)
	router := gin.New()
	serveUploadsAs(router, handler, user.ID)

	req := httptest.NewRequest(http.MethodGet, "/uploads/remote.png", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusServiceUnavailable, w.Code, w.Body.String())
	require.Empty(t, w.Header().Get("Location"))
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
	serveUploadsAs(router, handler, 0)

	req := httptest.NewRequest(http.MethodGet, "/uploads/avatars/avatar.txt", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, "avatar", w.Body.String())
	require.Equal(t, "public, max-age=604800, immutable", w.Header().Get("Cache-Control"))
}

func TestUploadsHandler_ServeUpload_BlocksUntrackedTopLevelUploadPath(t *testing.T) {
	gin.SetMode(gin.TestMode)
	uploadsRoot := t.TempDir()
	filePath := filepath.Join(uploadsRoot, "orphan.bin")
	require.NoError(t, os.WriteFile(filePath, []byte("orphan"), 0o644))

	handler := NewUploadsHandler(nil, uploadsRoot)
	router := gin.New()
	serveUploadsAs(router, handler, 0)

	req := httptest.NewRequest(http.MethodGet, "/uploads/orphan.bin", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusServiceUnavailable, w.Code, w.Body.String())
}

func TestUploadsHandler_ServeUpload_KeepsTrackedThumbnailsPrivate(t *testing.T) {
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
	serveUploadsAs(router, handler, user.ID)

	req := httptest.NewRequest(http.MethodGet, "/uploads/demo_thumb.jpg", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, "private, no-store", w.Header().Get("Cache-Control"))
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
	serveUploadsAs(router, handler, user.ID)

	req := httptest.NewRequest(http.MethodGet, "/uploads/demo_thumb_sm.jpg", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Equal(t, "private, no-store", w.Header().Get("Cache-Control"))
	require.Equal(t, "small", w.Body.String())
}

func TestUploadsHandler_ServeUpload_BlocksDerivedSmallThumbnailWhenPrimaryPending(t *testing.T) {
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
	user := &models.User{Username: "uploads_thumb_small_pending", PasswordHash: "hash"}
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

	handler := NewUploadsHandler(mediaRepo, uploadsRoot)
	router := gin.New()
	serveUploadsAs(router, handler, user.ID)

	req := httptest.NewRequest(http.MethodGet, "/uploads/demo_thumb_sm.jpg", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusLocked, w.Code, w.Body.String())
}

func TestUploadsHandler_ServeUpload_BlocksDerivedSmallThumbnailWhenPrimaryInfected(t *testing.T) {
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
	user := &models.User{Username: "uploads_thumb_small_infected", PasswordHash: "hash"}
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
	require.NoError(t, mediaRepo.MarkScanInfected(context.Background(), media.ID, "infected"))

	handler := NewUploadsHandler(mediaRepo, uploadsRoot)
	router := gin.New()
	serveUploadsAs(router, handler, user.ID)

	req := httptest.NewRequest(http.MethodGet, "/uploads/demo_thumb_sm.jpg", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusGone, w.Code, w.Body.String())
}
