package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresHubSubscriptionRepository_SubscribeAndUnsubscribe(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubSubscriptionRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("sub_u")
	hub := fx.CreateHub(fmt.Sprintf("sub_%d", time.Now().UnixNano()), user.ID)

	err := repo.Subscribe(ctx, user.ID, hub.ID)
	require.NoError(t, err)

	subscribed, err := repo.IsSubscribed(ctx, user.ID, hub.ID)
	require.NoError(t, err)
	assert.True(t, subscribed)

	err = repo.Unsubscribe(ctx, user.ID, hub.ID)
	require.NoError(t, err)

	subscribed2, err := repo.IsSubscribed(ctx, user.ID, hub.ID)
	require.NoError(t, err)
	assert.False(t, subscribed2)
}

func TestPostgresHubSubscriptionRepository_IsSubscribed_NonExistent(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubSubscriptionRepository(db.Pool)
	ctx := context.Background()

	subscribed, err := repo.IsSubscribed(ctx, 999999, 999999)
	require.NoError(t, err)
	assert.False(t, subscribed)
}

func TestPostgresHubSubscriptionRepository_GetUserSubscriptions(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubSubscriptionRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("sublist_u")
	hub := fx.CreateHub(fmt.Sprintf("sublist_%d", time.Now().UnixNano()), user.ID)
	_ = repo.Subscribe(ctx, user.ID, hub.ID)

	subs, err := repo.GetUserSubscriptions(ctx, user.ID)
	require.NoError(t, err)
	assert.NotEmpty(t, subs)
}

func TestPostgresHubSubscriptionRepository_GetSubscriberCount(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubSubscriptionRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("subcount_u1")
	u2 := fx.CreateUniqueUser("subcount_u2")
	hub := fx.CreateHub(fmt.Sprintf("subcount_%d", time.Now().UnixNano()), u1.ID)
	_ = repo.Subscribe(ctx, u1.ID, hub.ID)
	_ = repo.Subscribe(ctx, u2.ID, hub.ID)

	count, err := repo.GetSubscriberCount(ctx, hub.ID)
	require.NoError(t, err)
	assert.Equal(t, 2, count)
}

func TestPostgresHubSubscriptionRepository_GetSubscribedHubIDs(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubSubscriptionRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("subids_u")
	hub := fx.CreateHub(fmt.Sprintf("subids_%d", time.Now().UnixNano()), user.ID)
	_ = repo.Subscribe(ctx, user.ID, hub.ID)

	ids, err := repo.GetSubscribedHubIDs(ctx, user.ID)
	require.NoError(t, err)
	assert.Contains(t, ids, hub.ID)
}
