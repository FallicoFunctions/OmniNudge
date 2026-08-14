package repository

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/database"
	"github.com/stretchr/testify/require"
)

func TestPostgresPersonaRepository_FindsPlatformPersona(t *testing.T) {
	ctx := context.Background()
	repo, pool := newPersonaRepositoryForTest(t)

	personaID := insertPersonaForTest(t, ctx, pool, "admit-platform", "Platform Narrator", nil, "public", true)

	persona, err := repo.FindAdmissiblePersona(ctx, personaID)
	require.NoError(t, err)
	require.NotNil(t, persona)
	require.Equal(t, personaID, persona.ID)
	require.Equal(t, "Platform Narrator", persona.Name)
}

func TestPostgresPersonaRepository_RefusesIneligiblePersonas(t *testing.T) {
	ctx := context.Background()
	repo, pool := newPersonaRepositoryForTest(t)

	ownerID := insertPersonaOwnerForTest(t, ctx, pool)

	testCases := []struct {
		name       string
		slug       string
		owner      *int
		visibility string
		isActive   bool
	}{
		// A character belonging to a user never roams, however public and
		// active it is.
		{name: "owned by a user", slug: "admit-owned", owner: &ownerID, visibility: "public", isActive: true},
		{name: "private", slug: "admit-private", owner: nil, visibility: "private", isActive: true},
		{name: "inactive", slug: "admit-inactive", owner: nil, visibility: "public", isActive: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			personaID := insertPersonaForTest(t, ctx, pool, testCase.slug, "Rejected", testCase.owner, testCase.visibility, testCase.isActive)

			persona, err := repo.FindAdmissiblePersona(ctx, personaID)
			require.NoError(t, err)
			require.Nil(t, persona)
		})
	}
}

func TestPostgresPersonaRepository_MissingPersonaIsIndistinguishableFromIneligible(t *testing.T) {
	ctx := context.Background()
	repo, _ := newPersonaRepositoryForTest(t)

	persona, err := repo.FindAdmissiblePersona(ctx, 9_000_001)
	require.NoError(t, err)
	require.Nil(t, persona)
}

func newPersonaRepositoryForTest(t *testing.T) (*PostgresPersonaRepository, *pgxpool.Pool) {
	t.Helper()

	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	return NewPostgresPersonaRepository(db.Pool), db.Pool
}

func insertPersonaForTest(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	slug, name string,
	ownerUserID *int,
	visibility string,
	isActive bool,
) int64 {
	t.Helper()

	var personaID int64
	err := pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, system_prompt, owner_user_id, visibility, is_active)
		VALUES ($1, $2, 'test prompt', $3, $4, $5)
		RETURNING id
	`, slug, name, ownerUserID, visibility, isActive).Scan(&personaID)
	require.NoError(t, err)

	return personaID
}

func insertPersonaOwnerForTest(t *testing.T, ctx context.Context, pool *pgxpool.Pool) int {
	t.Helper()

	var userID int
	err := pool.QueryRow(ctx, `
		INSERT INTO users (username, username_normalized, password_hash)
		VALUES ('persona_owner', 'persona_owner', 'x')
		RETURNING id
	`).Scan(&userID)
	require.NoError(t, err)

	return userID
}
