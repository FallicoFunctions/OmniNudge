package repository_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestPostgresFeedRepository_GetUnifiedFeed(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresFeedRepository(db.Pool)
	ctx := context.Background()

	tests := []struct {
		name         string
		sortBy       string
		sourceFilter string
	}{
		{"sort by new, all sources", "new", "all"},
		{"sort by top, platform only", "top", "platform"},
		{"sort by hot, reddit only", "hot", "reddit"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			items, err := repo.GetUnifiedFeed(ctx, tc.sortBy, 10, 0, tc.sourceFilter)
			require.NoError(t, err)
			_ = items // May be empty in test DB; we verify no error.
		})
	}
}
