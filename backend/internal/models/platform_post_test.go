package models

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/stretchr/testify/require"
)

func TestPlatformPostRepositoryGetByAuthorIncludesHubMetadata(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := NewUserRepository(db.Pool)
	user := &User{
		Username:     fmt.Sprintf("author_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, user))

	hubRepo := NewHubRepository(db.Pool)
	hubTitle := "Readable Hub"
	hubDesc := "Hub for author posts"
	hub := &Hub{
		Name:        fmt.Sprintf("authorhub_%d", time.Now().UnixNano()),
		Title:       &hubTitle,
		Description: &hubDesc,
		CreatedBy:   &user.ID,
	}
	require.NoError(t, hubRepo.Create(ctx, hub))

	postRepo := NewPlatformPostRepository(db.Pool)
	post := &PlatformPost{
		AuthorID: user.ID,
		HubID:    &hub.ID,
		Title:    "Normal hub-created post",
	}
	require.NoError(t, postRepo.Create(ctx, post))

	posts, err := postRepo.GetByAuthor(ctx, user.ID, 10, 0)
	require.NoError(t, err)
	require.Len(t, posts, 1)
	require.Equal(t, hub.ID, *posts[0].HubID)
	require.Equal(t, hub.Name, posts[0].HubName)
	require.NotNil(t, posts[0].Hub)
	require.Equal(t, hub.Name, posts[0].Hub.Name)
	require.NotNil(t, posts[0].Hub.Title)
	require.Equal(t, hubTitle, *posts[0].Hub.Title)
	require.NotNil(t, posts[0].HubDisplayTitle)
	require.Equal(t, hubTitle, *posts[0].HubDisplayTitle)
}

func TestPlatformPostRepository_PersistsLinkPreviewFields(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := NewUserRepository(db.Pool)
	user := &User{
		Username:     fmt.Sprintf("preview_%d", time.Now().UnixNano()),
		PasswordHash: "hash",
	}
	require.NoError(t, userRepo.Create(ctx, user))

	repo := NewPlatformPostRepository(db.Pool)
	mediaURL := "https://example.com/article"
	mediaType := "link"
	thumbnailURL := "/uploads/link-preview.jpg"
	siteName := "Example"
	post := &PlatformPost{
		AuthorID:            user.ID,
		Title:               "Link",
		MediaURL:            &mediaURL,
		MediaType:           &mediaType,
		ThumbnailURL:        &thumbnailURL,
		LinkPreviewSiteName: &siteName,
	}
	require.NoError(t, repo.Create(ctx, post))

	got, err := repo.GetByID(ctx, post.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, thumbnailURL, *got.ThumbnailURL)
	require.Equal(t, siteName, *got.LinkPreviewSiteName)
}
