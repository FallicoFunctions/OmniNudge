package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newPrivateHub(t *testing.T, fx *testutil.Fixtures, ownerID int) *domain.Hub {
	t.Helper()
	hub := fx.CreateHub(fmt.Sprintf("private_%d", time.Now().UnixNano()), ownerID)
	return hub
}

func TestPostgresHubAccessRequestRepository_Create(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubAccessRequestRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("har_owner")
	requester := fx.CreateUniqueUser("har_requester")
	hub := newPrivateHub(t, fx, owner.ID)

	req := &domain.HubAccessRequest{
		HubID:  hub.ID,
		UserID: requester.ID,
		Status: "pending",
	}

	err := repo.Create(ctx, req)
	require.NoError(t, err)
	assert.NotZero(t, req.ID)
}

func TestPostgresHubAccessRequestRepository_GetByID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubAccessRequestRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("har_byid_o")
	requester := fx.CreateUniqueUser("har_byid_r")
	hub := newPrivateHub(t, fx, owner.ID)

	req := &domain.HubAccessRequest{HubID: hub.ID, UserID: requester.ID, Status: "pending"}
	_ = repo.Create(ctx, req)

	tests := []struct {
		name    string
		id      int
		wantNil bool
	}{
		{"existing", req.ID, false},
		{"non-existent", 999999, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := repo.GetByID(ctx, tc.id)
			require.NoError(t, err)
			if tc.wantNil {
				assert.Nil(t, got)
			} else {
				require.NotNil(t, got)
				assert.Equal(t, req.ID, got.ID)
			}
		})
	}
}

func TestPostgresHubAccessRequestRepository_GetPendingByHub(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubAccessRequestRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("har_pending_o")
	requester := fx.CreateUniqueUser("har_pending_r")
	hub := newPrivateHub(t, fx, owner.ID)

	req := &domain.HubAccessRequest{HubID: hub.ID, UserID: requester.ID, Status: "pending"}
	_ = repo.Create(ctx, req)

	reqs, err := repo.GetPendingByHub(ctx, hub.ID)
	require.NoError(t, err)

	ids := make([]int, len(reqs))
	for i, r := range reqs {
		ids[i] = r.ID
	}
	assert.Contains(t, ids, req.ID)
}

func TestPostgresHubAccessRequestRepository_ApproveAndDeny(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubAccessRequestRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("har_approve_o")
	r1 := fx.CreateUniqueUser("har_approve_r1")
	r2 := fx.CreateUniqueUser("har_approve_r2")
	hub := newPrivateHub(t, fx, owner.ID)

	req1 := &domain.HubAccessRequest{HubID: hub.ID, UserID: r1.ID, Status: "pending"}
	req2 := &domain.HubAccessRequest{HubID: hub.ID, UserID: r2.ID, Status: "pending"}
	_ = repo.Create(ctx, req1)
	_ = repo.Create(ctx, req2)

	err := repo.Approve(ctx, req1.ID)
	require.NoError(t, err)

	err = repo.Deny(ctx, req2.ID)
	require.NoError(t, err)
}

func TestPostgresHubAccessRequestRepository_HasPendingRequest(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresHubAccessRequestRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("har_haspend_o")
	requester := fx.CreateUniqueUser("har_haspend_r")
	hub := newPrivateHub(t, fx, owner.ID)

	has, err := repo.HasPendingRequest(ctx, hub.ID, requester.ID)
	require.NoError(t, err)
	assert.False(t, has)

	req := &domain.HubAccessRequest{HubID: hub.ID, UserID: requester.ID, Status: "pending"}
	_ = repo.Create(ctx, req)

	has2, err := repo.HasPendingRequest(ctx, hub.ID, requester.ID)
	require.NoError(t, err)
	assert.True(t, has2)
}
