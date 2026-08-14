package models_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestMediaFileRepositoryPublicPersonaMediaMatchesUploadPathAndCDNURL(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	owner := &models.User{Username: "public_persona_media_owner", PasswordHash: "hash", Role: "user"}
	require.NoError(t, models.NewUserRepository(db.Pool).Create(ctx, owner))

	const filename = "sadie.png"
	var mediaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO media_files (
			user_id, filename, original_filename, file_type, file_size,
			storage_url, storage_path, storage_object_key, scan_status
		) VALUES ($1, $2, $2, 'image/png', 10, $3, $4, $5, 'clean')
		RETURNING id
	`, owner.ID, filename, "https://cdn.example.test/"+filename, "uploads/"+filename, filename).Scan(&mediaID))
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO bot_personas (slug, name, category, system_prompt, avatar_url, is_active)
		VALUES ('public-sadie', 'Sadie', 'romance', 'Stay in character.', $1, TRUE)
	`, "/uploads/"+filename)
	require.NoError(t, err)

	allowed, err := models.NewMediaFileRepository(db.Pool).IsMediaPubliclyAccessible(ctx, mediaID)
	require.NoError(t, err)
	require.True(t, allowed)
}
