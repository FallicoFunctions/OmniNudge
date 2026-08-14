package repository

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
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

// personaSanctionCase is one state a character can be in, and the verdict both
// eligibility paths owe it. Everything below is driven from this table so that
// "admission refuses it" and "its life stops accumulating" are never asserted
// from different lists.
type personaSanctionCase struct {
	name       string
	slug       string
	action     string
	expiresIn  time.Duration
	sanctioned bool
	admissible bool
}

func personaSanctionCases() []personaSanctionCase {
	return []personaSanctionCase{
		// The no-regression case: adding a table nobody has written to must
		// not close the door on an ordinary platform character.
		{name: "unsanctioned", slug: "sanction-none", admissible: true},
		// Withdrawal is indefinite by nature: the platform has taken the
		// character out of circulation and named no date it comes back.
		{name: "withdrawn indefinitely", slug: "sanction-withdrawn", action: "withdrawn", sanctioned: true},
		{name: "suspended until later", slug: "sanction-suspended", action: "suspended", expiresIn: time.Hour, sanctioned: true},
		// A lapsed suspension readmits with nothing to run: the predicate
		// stops matching the row the moment now() passes expires_at, so there
		// is no sweep to schedule and no state to reconcile.
		{name: "suspension expired", slug: "sanction-lapsed", action: "suspended", expiresIn: -time.Hour, sanctioned: true, admissible: true},
	}
}

func TestPostgresPersonaRepository_RefusesSanctionedPersona(t *testing.T) {
	ctx := context.Background()
	repo, pool := newPersonaRepositoryForTest(t)

	for _, testCase := range personaSanctionCases() {
		t.Run(testCase.name, func(t *testing.T) {
			personaID := insertPersonaForTest(t, ctx, pool, testCase.slug, "Sanctioned", nil, "public", true)
			if testCase.sanctioned {
				insertPersonaSanctionForTest(t, ctx, pool, personaID, testCase.action, testCase.expiresIn)
			}

			persona, err := repo.FindAdmissiblePersona(ctx, personaID)
			require.NoError(t, err)
			if testCase.admissible {
				require.NotNil(t, persona)
			} else {
				require.Nil(t, persona)
			}
		})
	}
}

// TestPostgresPersonaRepository_EligibilityPathsAgree is the test that makes the
// duplication safe.
//
// Admission and the world-event write ask the same question in two packages. A
// shared predicate is what keeps them identical, but a shared constant only
// proves they read the same string -- it cannot prove both queries feed it the
// persona id as $1, alias the table as p, or even still use it. This runs the
// two paths over every state a character can be in and requires the same
// verdict from each, so the day someone inlines one of them the disagreement is
// caught here rather than by a withdrawn character quietly still living a life.
func TestPostgresPersonaRepository_EligibilityPathsAgree(t *testing.T) {
	ctx := context.Background()
	repo, pool := newPersonaRepositoryForTest(t)
	memory := models.NewOmniChatMemoryRepository(pool)

	ownerID := insertPersonaOwnerForTest(t, ctx, pool)

	type agreementCase struct {
		name       string
		slug       string
		owner      *int
		visibility string
		isActive   bool
		action     string
		expiresIn  time.Duration
		sanctioned bool
		admissible bool
	}

	cases := []agreementCase{
		{name: "owned by a user", slug: "agree-owned", owner: &ownerID, visibility: "public", isActive: true},
		{name: "private", slug: "agree-private", visibility: "private", isActive: true},
		{name: "inactive", slug: "agree-inactive", visibility: "public", isActive: false},
	}
	for _, sanctionCase := range personaSanctionCases() {
		cases = append(cases, agreementCase{
			name:       sanctionCase.name,
			slug:       "agree-" + sanctionCase.slug,
			visibility: "public",
			isActive:   true,
			action:     sanctionCase.action,
			expiresIn:  sanctionCase.expiresIn,
			sanctioned: sanctionCase.sanctioned,
			admissible: sanctionCase.admissible,
		})
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			personaID := insertPersonaForTest(t, ctx, pool, testCase.slug, "Agreement", testCase.owner, testCase.visibility, testCase.isActive)
			if testCase.sanctioned {
				insertPersonaSanctionForTest(t, ctx, pool, personaID, testCase.action, testCase.expiresIn)
			}

			persona, err := repo.FindAdmissiblePersona(ctx, personaID)
			require.NoError(t, err)
			admitted := persona != nil

			_, err = memory.RecordWorldEvent(ctx, models.OmniChatWorldEvent{
				PersonaID: int(personaID),
				Title:     "Came third on the Moon Circuit",
				Summary:   "Whether this is remembered must match whether it could have happened.",
			})
			recorded := err == nil
			if !recorded {
				require.ErrorIs(t, err, models.ErrOmniChatMemoryNotResident)
			}

			require.Equal(t, testCase.admissible, admitted, "admission disagreed with the expected verdict")
			require.Equal(t, admitted, recorded, "admission and the world-event write disagreed")
		})
	}
}

// A sanction names one character. Nothing about the query or the index would
// obviously widen it, which is exactly why it is worth pinning: a missing
// persona_id in a future rewrite of the NOT EXISTS would lock everyone out at
// once, and every other test here would still pass.
func TestPostgresPersonaRepository_SanctionIsScopedToOnePersona(t *testing.T) {
	ctx := context.Background()
	repo, pool := newPersonaRepositoryForTest(t)

	sanctionedID := insertPersonaForTest(t, ctx, pool, "scope-sanctioned", "Withdrawn", nil, "public", true)
	otherID := insertPersonaForTest(t, ctx, pool, "scope-other", "Untouched", nil, "public", true)
	insertPersonaSanctionForTest(t, ctx, pool, sanctionedID, "withdrawn", 0)

	sanctioned, err := repo.FindAdmissiblePersona(ctx, sanctionedID)
	require.NoError(t, err)
	require.Nil(t, sanctioned)

	other, err := repo.FindAdmissiblePersona(ctx, otherID)
	require.NoError(t, err)
	require.NotNil(t, other)
}

// A deleted character takes its sanctions with it. There is no such thing as a
// sanction on a character that does not exist -- admission already refuses it
// for being absent -- and an orphaned row would outlive the only id that gives
// it meaning, ready to attach itself to whatever reuses that id.
func TestPostgresPersonaRepository_DeletingPersonaRemovesItsSanctions(t *testing.T) {
	ctx := context.Background()
	_, pool := newPersonaRepositoryForTest(t)

	personaID := insertPersonaForTest(t, ctx, pool, "cascade-sanctioned", "Doomed", nil, "public", true)
	insertPersonaSanctionForTest(t, ctx, pool, personaID, "withdrawn", 0)

	_, err := pool.Exec(ctx, `DELETE FROM bot_personas WHERE id = $1`, personaID)
	require.NoError(t, err)

	var remaining int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM omnirave_persona_sanctions WHERE persona_id = $1`, personaID).Scan(&remaining))
	require.Zero(t, remaining)
}

// insertPersonaSanctionForTest writes a sanction. A zero expiresIn means no
// expiry at all, which is the indefinite case, not "expires now".
func insertPersonaSanctionForTest(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	personaID int64,
	action string,
	expiresIn time.Duration,
) {
	t.Helper()

	var expiresAt *time.Time
	if expiresIn != 0 {
		at := time.Now().Add(expiresIn)
		expiresAt = &at
	}

	_, err := pool.Exec(ctx, `
		INSERT INTO omnirave_persona_sanctions (persona_id, action, expires_at, reason)
		VALUES ($1, $2, $3, 'test')
	`, personaID, action, expiresAt)
	require.NoError(t, err)
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
