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
	"github.com/omninudge/backend/internal/repository"
	"github.com/stretchr/testify/require"
)

// Every other gateway test builds the handler on models.MediaFileRepository.
// The server builds it on the repository adapter, which never delegated
// CanUserAccessMedia, so the gateway's access check silently fell through to
// the public one and even the owner of a private file got 404. This test uses
// the adapter the server uses.
func TestServeUpload_ThroughTheServerRepositoryTheOwnerCanRead(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "gateway_owner", PasswordHash: "hash"}
	stranger := &models.User{Username: "gateway_stranger", PasswordHash: "hash"}
	require.NoError(t, users.Create(ctx, owner))
	require.NoError(t, users.Create(ctx, stranger))

	uploadsRoot := t.TempDir()
	path := filepath.Join(uploadsRoot, "private_photo.png")
	content := realPNG(t)
	require.NoError(t, os.WriteFile(path, content, 0o644))
	media := &models.MediaFile{
		UserID: owner.ID, Filename: "private_photo.png", OriginalFilename: "private_photo.png",
		FileType: "image/png", FileSize: int64(len(content)),
		StorageURL: "/uploads/private_photo.png", StoragePath: path,
	}
	mediaRepo := models.NewMediaFileRepository(db.Pool)
	require.NoError(t, mediaRepo.Create(ctx, media))
	require.NoError(t, mediaRepo.MarkScanClean(ctx, media.ID))

	handler := NewUploadsHandler(repository.NewPostgresMediaFileRepository(db.Pool), uploadsRoot)

	tests := []struct {
		name   string
		userID int
		want   int
	}{
		{name: "the owner reads their own file", userID: owner.ID, want: http.StatusOK},
		{name: "a stranger still cannot", userID: stranger.ID, want: http.StatusNotFound},
		{name: "nor can an anonymous request", userID: 0, want: http.StatusNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router := gin.New()
			serveUploadsAs(router, handler, tt.userID)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/uploads/private_photo.png", nil))
			require.Equal(t, tt.want, response.Code)
		})
	}
}
