package repository_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresNotificationRepository_Create(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresNotificationRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("notif_u")

	n := &domain.Notification{
		UserID:           user.ID,
		NotificationType: "test_notification",
		Message:          "Hello from test",
	}

	err := repo.Create(ctx, n)
	require.NoError(t, err)
	assert.NotZero(t, n.ID)
}

func TestPostgresNotificationRepository_GetByUserID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresNotificationRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("notiflist_u")
	n := &domain.Notification{
		UserID: user.ID, NotificationType: "t", Message: "m",
	}
	_ = repo.Create(ctx, n)

	tests := []struct {
		name       string
		unreadOnly bool
		wantMin    int
	}{
		{"all notifications", false, 1},
		{"unread only", true, 1},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			notifs, err := repo.GetByUserID(ctx, user.ID, 10, 0, tc.unreadOnly)
			require.NoError(t, err)
			assert.GreaterOrEqual(t, len(notifs), tc.wantMin)
		})
	}
}

func TestPostgresNotificationRepository_GetUnreadCount(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresNotificationRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("notifunread_u")
	n := &domain.Notification{
		UserID: user.ID, NotificationType: "t", Message: "m",
	}
	_ = repo.Create(ctx, n)

	count, err := repo.GetUnreadCount(ctx, user.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, count)
}

func TestPostgresNotificationRepository_MarkAsRead(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresNotificationRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("notifread_u")
	n := &domain.Notification{
		UserID: user.ID, NotificationType: "t", Message: "m",
	}
	_ = repo.Create(ctx, n)

	err := repo.MarkAsRead(ctx, n.ID, user.ID)
	require.NoError(t, err)

	count, err := repo.GetUnreadCount(ctx, user.ID)
	require.NoError(t, err)
	assert.Equal(t, 0, count)
}

func TestPostgresNotificationRepository_MarkAllAsRead(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresNotificationRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("notifreadall_u")
	for i := 0; i < 3; i++ {
		n := &domain.Notification{
			UserID: user.ID, NotificationType: "t", Message: "m",
		}
		_ = repo.Create(ctx, n)
	}

	err := repo.MarkAllAsRead(ctx, user.ID)
	require.NoError(t, err)

	count, err := repo.GetUnreadCount(ctx, user.ID)
	require.NoError(t, err)
	assert.Equal(t, 0, count)
}

func TestPostgresNotificationRepository_Delete(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresNotificationRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("notifdel_u")
	n := &domain.Notification{
		UserID: user.ID, NotificationType: "t", Message: "m",
	}
	_ = repo.Create(ctx, n)

	err := repo.Delete(ctx, n.ID, user.ID)
	require.NoError(t, err)

	got, err := repo.GetByID(ctx, n.ID, user.ID)
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestPostgresNotificationRepository_GetByID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresNotificationRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("notifbyid_u")
	n := &domain.Notification{
		UserID: user.ID, NotificationType: "t", Message: "m",
	}
	_ = repo.Create(ctx, n)

	tests := []struct {
		name    string
		id      int
		wantNil bool
	}{
		{"existing", n.ID, false},
		{"non-existent", 999999, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := repo.GetByID(ctx, tc.id, user.ID)
			require.NoError(t, err)
			if tc.wantNil {
				assert.Nil(t, got)
			} else {
				require.NotNil(t, got)
				assert.Equal(t, n.ID, got.ID)
			}
		})
	}
}
