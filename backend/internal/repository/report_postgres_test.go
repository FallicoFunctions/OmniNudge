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

func TestPostgresReportRepository_Create(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresReportRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	reporter := fx.CreateUniqueUser("report_r")
	target := fx.CreateUniqueUser("report_t")

	r := &domain.Report{
		ReporterID: reporter.ID,
		TargetType: "user",
		TargetID:   target.ID,
		Reason:     "spam",
		Status:     "pending",
	}

	err := repo.Create(ctx, r)
	require.NoError(t, err)
	assert.NotZero(t, r.ID)
}

func TestPostgresReportRepository_GetByID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresReportRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	reporter := fx.CreateUniqueUser("rbyid_r")
	target := fx.CreateUniqueUser("rbyid_t")
	r := &domain.Report{
		ReporterID: reporter.ID, TargetType: "user", TargetID: target.ID,
		Reason: "test", Status: "pending",
	}
	_ = repo.Create(ctx, r)

	tests := []struct {
		name    string
		id      int
		wantNil bool
	}{
		{"existing report", r.ID, false},
		{"non-existent report", 999999, true},
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

func TestPostgresReportRepository_UpdateStatus(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresReportRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	reporter := fx.CreateUniqueUser("rupdate_r")
	target := fx.CreateUniqueUser("rupdate_t")
	r := &domain.Report{
		ReporterID: reporter.ID, TargetType: "user", TargetID: target.ID,
		Reason: "test", Status: "pending",
	}
	_ = repo.Create(ctx, r)

	err := repo.UpdateStatus(ctx, r.ID, "resolved")
	require.NoError(t, err)

	got, err := repo.GetByID(ctx, r.ID)
	require.NoError(t, err)
	assert.Equal(t, "resolved", got.Status)
}

func TestPostgresReportRepository_CountByReporterSince(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresReportRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	reporter := fx.CreateUniqueUser("rcount_r")
	target := fx.CreateUniqueUser("rcount_t")

	since := time.Now().Add(-1 * time.Hour)

	r := &domain.Report{
		ReporterID: reporter.ID, TargetType: "user", TargetID: target.ID,
		Reason: "test", Status: "pending",
	}
	_ = repo.Create(ctx, r)

	count, err := repo.CountByReporterSince(ctx, reporter.ID, since)
	require.NoError(t, err)
	assert.Equal(t, 1, count)
}

func TestPostgresReportRepository_ListByStatus(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresReportRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	reporter := fx.CreateUniqueUser("rlist_r")
	target := fx.CreateUniqueUser("rlist_t")

	r := &domain.Report{
		ReporterID: reporter.ID, TargetType: "user", TargetID: target.ID,
		Reason: "test", Status: "pending",
	}
	_ = repo.Create(ctx, r)

	// Reports default to status='open' from the DB; 'pending' was the input but RETURNING overwrites it.
	reports, err := repo.ListByStatus(ctx, "open", 10, 0)
	require.NoError(t, err)

	ids := make([]int, len(reports))
	for i, rep := range reports {
		ids[i] = rep.ID
	}
	assert.Contains(t, ids, r.ID)
}
