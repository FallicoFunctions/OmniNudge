package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestStorageHandler_GetMyStorage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(context.Background()))
	require.NoError(t, database.ResetTestData(context.Background(), db))

	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{Username: "storage_handler_user", PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(context.Background(), user))

	_, err = db.Pool.Exec(context.Background(), `
		INSERT INTO media_files (user_id, filename, original_filename, file_type, file_size, storage_url, storage_path)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, user.ID, "handler.bin", "handler.bin", "video/mp4", int64(2048), "/uploads/handler.bin", "uploads/handler.bin")
	require.NoError(t, err)

	handler := NewStorageHandler(models.NewMediaFileRepository(db.Pool), MediaQuotaConfig{
		FreeTierBytes: 1 * 1024 * 1024 * 1024,
		ProTierBytes:  50 * 1024 * 1024 * 1024,
	})

	router := gin.New()
	router.GET("/users/me/storage", func(c *gin.Context) {
		c.Set("user_id", user.ID)
		c.Set("role", "user")
		handler.GetMyStorage(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/users/me/storage", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.Contains(t, w.Body.String(), `"used":2048`)
}
