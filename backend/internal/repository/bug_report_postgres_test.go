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

func bugReport(userID int) *domain.BugReport {
	return &domain.BugReport{
		UserID:       &userID,
		Description:  "Something broke",
		FeedbackType: "report",
		Category:     "other",
		Status:       "new",
	}
}

func TestPostgresBugReportRepository_Create(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresBugReportRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("br_create_u")

	r := bugReport(user.ID)
	err := repo.Create(ctx, r)
	require.NoError(t, err)
	assert.NotZero(t, r.ID)
}

func TestPostgresBugReportRepository_GetByID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresBugReportRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("br_byid_u")
	r := bugReport(user.ID)
	_ = repo.Create(ctx, r)

	tests := []struct {
		name    string
		id      int
		wantNil bool
	}{
		{"existing", r.ID, false},
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
				assert.Equal(t, r.ID, got.ID)
			}
		})
	}
}

func TestPostgresBugReportRepository_GetAll(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresBugReportRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("br_list_u")
	r := bugReport(user.ID)
	_ = repo.Create(ctx, r)

	// Status defaults to 'new' from the DB.
	status := "new"
	reports, err := repo.GetAll(ctx, &status, nil, nil, 10, 0)
	require.NoError(t, err)

	ids := make([]int, len(reports))
	for i, rep := range reports {
		ids[i] = rep.ID
	}
	assert.Contains(t, ids, r.ID)
}

func TestPostgresBugReportRepository_Update(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresBugReportRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("br_update_u")
	r := bugReport(user.ID)
	_ = repo.Create(ctx, r)

	notes := "admin reviewed"
	err := repo.Update(ctx, r.ID, "investigating", &notes)
	require.NoError(t, err)

	got, err := repo.GetByID(ctx, r.ID)
	require.NoError(t, err)
	assert.Equal(t, "investigating", got.Status)
}
