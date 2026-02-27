package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresNotificationBatchRepository_Create(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresNotificationBatchRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("nb_create_u")

	batch := &domain.NotificationBatch{
		UserID:           user.ID,
		ContentType:      "post",
		ContentID:        1,
		NotificationType: "upvote_milestone",
		ScheduledFor:     time.Now().Add(5 * time.Minute),
		Status:           "pending",
	}

	err := repo.Create(ctx, batch)
	require.NoError(t, err)
	assert.NotZero(t, batch.ID)
}

func TestPostgresNotificationBatchRepository_GetPendingBatches(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresNotificationBatchRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("nb_pending_u")
	batch := &domain.NotificationBatch{
		UserID:           user.ID,
		ContentType:      "post",
		ContentID:        2,
		NotificationType: "upvote_milestone",
		ScheduledFor:     time.Now().Add(-1 * time.Minute), // already due
		Status:           "pending",
	}
	_ = repo.Create(ctx, batch)

	batches, err := repo.GetPendingBatches(ctx, time.Now())
	require.NoError(t, err)

	ids := make([]int, len(batches))
	for i, b := range batches {
		ids[i] = b.ID
	}
	assert.Contains(t, ids, batch.ID)
}

func TestPostgresNotificationBatchRepository_MarkAsProcessed(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresNotificationBatchRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("nb_proc_u")
	batch := &domain.NotificationBatch{
		UserID: user.ID, ContentType: "post", ContentID: 3,
		NotificationType: "upvote_milestone",
		ScheduledFor:     time.Now().Add(-1 * time.Minute),
		Status:           "pending",
	}
	_ = repo.Create(ctx, batch)

	err := repo.MarkAsProcessed(ctx, batch.ID)
	require.NoError(t, err)

	batches, err := repo.GetPendingBatches(ctx, time.Now())
	require.NoError(t, err)
	for _, b := range batches {
		assert.NotEqual(t, batch.ID, b.ID)
	}
}

func TestPostgresNotificationBatchRepository_CancelBatch(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresNotificationBatchRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("nb_cancel_u")
	batch := &domain.NotificationBatch{
		UserID: user.ID, ContentType: "post", ContentID: 4,
		NotificationType: "upvote_milestone",
		ScheduledFor:     time.Now().Add(10 * time.Minute),
		Status:           "pending",
	}
	_ = repo.Create(ctx, batch)

	err := repo.CancelBatch(ctx, user.ID, "post", 4)
	require.NoError(t, err)
}

func TestPostgresNotificationBatchRepository_CleanupOldBatches(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresNotificationBatchRepository(db.Pool)
	ctx := context.Background()

	err := repo.CleanupOldBatches(ctx)
	require.NoError(t, err)
}
