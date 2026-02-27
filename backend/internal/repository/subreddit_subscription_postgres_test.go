package repository_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresSubredditSubscriptionRepository_SubscribeAndUnsubscribe(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresSubredditSubscriptionRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("rsub_u")

	err := repo.Subscribe(ctx, user.ID, "golang")
	require.NoError(t, err)

	subscribed, err := repo.IsSubscribed(ctx, user.ID, "golang")
	require.NoError(t, err)
	assert.True(t, subscribed)

	err = repo.Unsubscribe(ctx, user.ID, "golang")
	require.NoError(t, err)

	subscribed2, err := repo.IsSubscribed(ctx, user.ID, "golang")
	require.NoError(t, err)
	assert.False(t, subscribed2)
}

func TestPostgresSubredditSubscriptionRepository_GetUserSubscriptions(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresSubredditSubscriptionRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("rsub_list_u")
	_ = repo.Subscribe(ctx, user.ID, "programming")

	subs, err := repo.GetUserSubscriptions(ctx, user.ID)
	require.NoError(t, err)
	assert.NotEmpty(t, subs)
}

func TestPostgresSubredditSubscriptionRepository_GetSubscribedSubredditNames(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresSubredditSubscriptionRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("rsub_names_u")
	_ = repo.Subscribe(ctx, user.ID, "rust")

	names, err := repo.GetSubscribedSubredditNames(ctx, user.ID)
	require.NoError(t, err)
	assert.Contains(t, names, "rust")
}
