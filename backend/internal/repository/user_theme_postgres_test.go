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

func newTheme(userID int) *domain.UserTheme {
	return &domain.UserTheme{
		UserID:       userID,
		ThemeName:    fmt.Sprintf("Theme_%d", time.Now().UnixNano()),
		ThemeType:    "variable_customization",
		ScopeType:    "global",
		IsPublic:     true,
		CSSVariables: map[string]interface{}{"primary": "#3b82f6"},
	}
}

func TestPostgresUserThemeRepository_CreateAndGetByID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserThemeRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("ut_create_u")

	created, err := repo.Create(ctx, newTheme(user.ID))
	require.NoError(t, err)
	require.NotNil(t, created)
	assert.NotZero(t, created.ID)

	got, err := repo.GetByID(ctx, created.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, created.ID, got.ID)
}

func TestPostgresUserThemeRepository_GetByUserID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserThemeRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("ut_byuser_u")
	created, _ := repo.Create(ctx, newTheme(user.ID))

	themes, err := repo.GetByUserID(ctx, user.ID, 10, 0)
	require.NoError(t, err)

	ids := make([]int, len(themes))
	for i, t2 := range themes {
		ids[i] = t2.ID
	}
	assert.Contains(t, ids, created.ID)
}

func TestPostgresUserThemeRepository_GetPublicThemes(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserThemeRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("ut_public_u")
	created, _ := repo.Create(ctx, newTheme(user.ID))

	themes, err := repo.GetPublicThemes(ctx, 100, 0, nil)
	require.NoError(t, err)

	ids := make([]int, len(themes))
	for i, t2 := range themes {
		ids[i] = t2.ID
	}
	assert.Contains(t, ids, created.ID)
}

func TestPostgresUserThemeRepository_Update(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserThemeRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("ut_update_u")
	created, _ := repo.Create(ctx, newTheme(user.ID))

	desc := "Updated description"
	created.ThemeDescription = &desc
	err := repo.Update(ctx, created)
	require.NoError(t, err)
}

func TestPostgresUserThemeRepository_Delete(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserThemeRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("ut_del_u")
	theme := newTheme(user.ID)
	theme.IsPublic = false
	created, _ := repo.Create(ctx, theme)

	err := repo.Delete(ctx, created.ID, user.ID)
	require.NoError(t, err)

	got, err := repo.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestPostgresUserThemeRepository_GetPredefinedThemes(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserThemeRepository(db.Pool)
	ctx := context.Background()

	themes, err := repo.GetPredefinedThemes(ctx)
	require.NoError(t, err)
	_ = themes
}
