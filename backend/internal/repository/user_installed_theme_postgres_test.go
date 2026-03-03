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

// themeFixture creates a theme in the DB and returns it.
func themeFixture(t *testing.T, db *testutil.TestDatabase, ownerID int) *domain.UserTheme {
	t.Helper()
	themeRepo := repository.NewPostgresUserThemeRepository(db.Pool)
	theme, err := themeRepo.Create(context.Background(), &domain.UserTheme{
		UserID:       ownerID,
		ThemeName:    fmt.Sprintf("theme_%d", time.Now().UnixNano()),
		ThemeType:    "variable_customization",
		ScopeType:    "global",
		IsPublic:     true,
		CSSVariables: map[string]interface{}{"primary": "#3b82f6"},
	})
	require.NoError(t, err)
	return theme
}

func TestPostgresUserInstalledThemeRepository_InstallAndGet(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserInstalledThemeRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("uit_owner")
	user := fx.CreateUniqueUser("uit_user")
	theme := themeFixture(t, db, owner.ID)

	installed, err := repo.Install(ctx, user.ID, theme.ID, 0)
	require.NoError(t, err)
	require.NotNil(t, installed)

	got, err := repo.GetInstalledTheme(ctx, user.ID, theme.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, theme.ID, got.ThemeID)
}

func TestPostgresUserInstalledThemeRepository_HasInstalled(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserInstalledThemeRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("uit_has_owner")
	user := fx.CreateUniqueUser("uit_has_user")
	theme := themeFixture(t, db, owner.ID)

	has, err := repo.HasInstalled(ctx, user.ID, theme.ID)
	require.NoError(t, err)
	assert.False(t, has)

	_, _ = repo.Install(ctx, user.ID, theme.ID, 0)

	has2, err := repo.HasInstalled(ctx, user.ID, theme.ID)
	require.NoError(t, err)
	assert.True(t, has2)
}

func TestPostgresUserInstalledThemeRepository_GetUserInstalledThemes(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserInstalledThemeRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("uit_list_owner")
	user := fx.CreateUniqueUser("uit_list_user")
	theme := themeFixture(t, db, owner.ID)
	_, _ = repo.Install(ctx, user.ID, theme.ID, 0)

	themes, err := repo.GetUserInstalledThemes(ctx, user.ID)
	require.NoError(t, err)
	assert.NotEmpty(t, themes)
}

func TestPostgresUserInstalledThemeRepository_SetActiveAndGetActive(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserInstalledThemeRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("uit_active_owner")
	user := fx.CreateUniqueUser("uit_active_user")
	theme := themeFixture(t, db, owner.ID)
	_, _ = repo.Install(ctx, user.ID, theme.ID, 0)

	err := repo.SetActive(ctx, user.ID, theme.ID)
	require.NoError(t, err)

	active, err := repo.GetActiveTheme(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, active)
	assert.Equal(t, theme.ID, active.ThemeID)
}

func TestPostgresUserInstalledThemeRepository_Uninstall(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserInstalledThemeRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	owner := fx.CreateUniqueUser("uit_uninstall_owner")
	user := fx.CreateUniqueUser("uit_uninstall_user")
	theme := themeFixture(t, db, owner.ID)
	_, _ = repo.Install(ctx, user.ID, theme.ID, 0)

	err := repo.Uninstall(ctx, user.ID, theme.ID)
	require.NoError(t, err)

	has, err := repo.HasInstalled(ctx, user.ID, theme.ID)
	require.NoError(t, err)
	assert.False(t, has)
}
