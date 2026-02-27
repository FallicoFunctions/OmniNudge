package repository_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresUserThemeOverrideRepository_SetAndGet(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserThemeOverrideRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("uto_owner")
	user := fx.CreateUniqueUser("uto_user")
	theme := themeFixture(t, db, owner.ID)

	override, err := repo.SetOverride(ctx, user.ID, "home", theme.ID)
	require.NoError(t, err)
	require.NotNil(t, override)

	got, err := repo.GetOverride(ctx, user.ID, "home")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, theme.ID, got.ThemeID)
}

func TestPostgresUserThemeOverrideRepository_GetAllOverrides(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserThemeOverrideRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("uto_all_owner")
	user := fx.CreateUniqueUser("uto_all_user")
	theme := themeFixture(t, db, owner.ID)

	_, _ = repo.SetOverride(ctx, user.ID, "home", theme.ID)
	_, _ = repo.SetOverride(ctx, user.ID, "feed", theme.ID)

	overrides, err := repo.GetAllOverrides(ctx, user.ID)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(overrides), 2)
}

func TestPostgresUserThemeOverrideRepository_DeleteOverride(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserThemeOverrideRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("uto_del_owner")
	user := fx.CreateUniqueUser("uto_del_user")
	theme := themeFixture(t, db, owner.ID)

	_, _ = repo.SetOverride(ctx, user.ID, "profile", theme.ID)

	err := repo.DeleteOverride(ctx, user.ID, "profile")
	require.NoError(t, err)

	got, err := repo.GetOverride(ctx, user.ID, "profile")
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestPostgresUserThemeOverrideRepository_DeleteAllOverrides(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserThemeOverrideRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("uto_delall_owner")
	user := fx.CreateUniqueUser("uto_delall_user")
	theme := themeFixture(t, db, owner.ID)

	_, _ = repo.SetOverride(ctx, user.ID, "home", theme.ID)
	_, _ = repo.SetOverride(ctx, user.ID, "feed", theme.ID)

	err := repo.DeleteAllOverrides(ctx, user.ID)
	require.NoError(t, err)

	overrides, err := repo.GetAllOverrides(ctx, user.ID)
	require.NoError(t, err)
	assert.Empty(t, overrides)
}
