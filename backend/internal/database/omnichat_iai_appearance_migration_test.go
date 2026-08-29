package database_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
)

// Migration 200 against real rows.
//
// The migration is one long UPDATE over JSONB, and reading it is not the same as
// running it. Every case below is an appearance somebody could already have
// stored, so a mapping that quietly produces nothing shows up here rather than
// as a character who lost her hair on the next deploy.

func migrateAppearances(t *testing.T, direction string, rows map[string]map[string]any) map[string]map[string]any {
	t.Helper()
	ctx := context.Background()

	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "iai_migration_" + direction, PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, owner))

	// Every row goes in first and the migration runs once over all of them,
	// which is how it will actually run.
	for slug, stored := range rows {
		encoded, err := json.Marshal(stored)
		require.NoError(t, err)
		_, err = db.Pool.Exec(ctx,
			`INSERT INTO bot_personas (name, slug, description, personality, system_prompt,
				owner_user_id, response_style_profile, iai_appearance)
			 VALUES ($1, $1, 'd', 'p', 'sp', $2, $3, $4)`,
			slug, owner.ID, models.ResponseStyleProfileDirectMessage, encoded)
		require.NoError(t, err)
	}

	// The migration has already run as part of Migrate, so it is applied to
	// these rows by hand. That is the point: this runs the shipped SQL rather
	// than a copy of it.
	statement, err := os.ReadFile(filepath.Join("migrations", "200_iai_appearance_schema."+direction+".sql"))
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, string(statement))
	require.NoError(t, err)

	migrated := make(map[string]map[string]any, len(rows))
	for slug := range rows {
		var raw []byte
		require.NoError(t, db.Pool.QueryRow(ctx,
			`SELECT iai_appearance FROM bot_personas WHERE slug = $1`, slug).Scan(&raw))
		var out map[string]any
		require.NoError(t, json.Unmarshal(raw, &out))
		migrated[slug] = out
	}
	return migrated
}

func migrateOne(t *testing.T, direction string, stored map[string]any) map[string]any {
	t.Helper()
	return migrateAppearances(t, direction, map[string]map[string]any{"only": stored})["only"]
}

func TestOneHairFieldBecomesTheThreeItAlwaysWas(t *testing.T) {
	migrated := migrateOne(t, "up", map[string]any{
		"style": "anime", "gender": "woman", "age": 27, "hair": "curly",
	})

	require.Equal(t, "curly", migrated["hair_texture"], "curly was always a texture")
	require.NotContains(t, migrated, "hair")
	require.Equal(t, "anime", migrated["style"], "and everything else is left alone")
	require.Equal(t, float64(27), migrated["age"])
}

func TestEveryOldHairAnswerLandsOnTheAxisItBelongedTo(t *testing.T) {
	expected := map[string]struct {
		gender string
		hair   string
		field  string
		value  string
	}{
		"straight": {"woman", "straight", "hair_texture", "straight"},
		"curly":    {"woman", "curly", "hair_texture", "curly"},
		"short":    {"woman", "short", "hair_length", "short"},
		"bangs":    {"woman", "bangs", "hair_style", "bangs"},
		"ponytail": {"woman", "ponytail", "hair_style", "ponytail"},
		"bun":      {"woman", "bun", "hair_style", "bun"},
		// The men's set has no plain bun, so his lands on the shape he can wear.
		"mans-bun": {"man", "bun", "hair_style", "man_bun"},
	}

	rows := make(map[string]map[string]any, len(expected))
	for slug, want := range expected {
		rows[slug] = map[string]any{"gender": want.gender, "hair": want.hair}
	}

	migrated := migrateAppearances(t, "up", rows)

	for slug, want := range expected {
		require.Equal(t, want.value, migrated[slug][want.field],
			"%s hair %q", want.gender, want.hair)
		require.NotContains(t, migrated[slug], "hair")
	}
}

func TestAnAnswerWithNoEqualIsDroppedRatherThanGuessed(t *testing.T) {
	// "dyed" never said which colour, and "asian" has no equal in a list that
	// asks for East, South or Southeast. Choosing one would put an answer in
	// somebody's mouth they were never offered.
	migrated := migrateOne(t, "up", map[string]any{
		"gender": "woman", "ethnicity": "asian", "hair_colour": "dyed", "eyes": "brown",
	})

	require.NotContains(t, migrated, "ethnicity")
	require.NotContains(t, migrated, "hair_colour")
	require.Equal(t, "brown", migrated["eyes"], "an eye colour that still exists is untouched")
}

func TestTheRenamedAnswersSurviveTheRename(t *testing.T) {
	migrated := migrateOne(t, "up", map[string]any{
		"gender": "woman", "ethnicity": "latina", "hair_colour": "brunette", "build": "heavy",
	})

	require.Equal(t, "latino", migrated["ethnicity"])
	require.Equal(t, "brown", migrated["hair_colour"], "brunette described the person, not the hair")
	require.Equal(t, "plus_size", migrated["build"], "heavy judges her body; plus size describes it")
}

func TestABuildHisSetNoLongerOffersIsDropped(t *testing.T) {
	// Curvy said nothing useful about a man's shape, so the men's set does not
	// carry it. Keeping it would store a value his own form cannot show him.
	migrated := migrateAppearances(t, "up", map[string]map[string]any{
		"his-curvy": {"gender": "man", "build": "curvy", "age": 40},
		"his-heavy": {"gender": "man", "build": "heavy"},
	})

	require.NotContains(t, migrated["his-curvy"], "build")
	require.Equal(t, float64(40), migrated["his-curvy"]["age"])
	require.Equal(t, "heavy", migrated["his-heavy"]["build"], "which his set does offer")
}

func TestGoingBackKeepsWhatTheOldFormCouldHold(t *testing.T) {
	// Lossy on purpose: three hair answers become one, and the old slider
	// stopped at 55. The shape is the most specific thing the old field held, so
	// it is what survives.
	migrated := migrateOne(t, "down", map[string]any{
		"gender": "woman", "age": 82, "height_inches": 65,
		"hair_length": "long", "hair_texture": "wavy", "hair_style": "high_ponytail",
		"ethnicity": "south_asian", "hair_colour": "auburn", "build": "plus_size",
	})

	require.Equal(t, "ponytail", migrated["hair"])
	require.NotContains(t, migrated, "hair_length")
	require.NotContains(t, migrated, "height_inches", "the old form never asked")
	require.Equal(t, "asian", migrated["ethnicity"])
	require.Equal(t, "red", migrated["hair_colour"])
	require.Equal(t, "heavy", migrated["build"])
	require.Equal(t, float64(55), migrated["age"], "the old slider stopped there")
}

func TestAnAppearanceNobodyGaveIsLeftAlone(t *testing.T) {
	migrated := migrateOne(t, "up", map[string]any{})
	require.Empty(t, migrated, "an empty object is not an answer to rewrite")
}

func TestRunningTheMigrationTwiceChangesNothingTheSecondTime(t *testing.T) {
	// A migration runs once, tracked in schema_migrations. It is still worth
	// being safe to repeat: a botched deploy, a restored snapshot or a hand-run
	// statement all put a row through twice, and the failure mode here is silent
	// -- an answer that survived the first pass and vanished on the second.
	ctx := context.Background()

	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "iai_twice", PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, owner))

	encoded, err := json.Marshal(map[string]any{
		"style": "realistic", "gender": "woman", "age": 34,
		"hair": "curly", "ethnicity": "latina", "hair_colour": "brunette",
		"eyes": "hazel", "build": "heavy",
	})
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx,
		`INSERT INTO bot_personas (name, slug, description, personality, system_prompt,
			owner_user_id, response_style_profile, iai_appearance)
		 VALUES ('Twice', 'twice', 'd', 'p', 'sp', $1, $2, $3)`,
		owner.ID, models.ResponseStyleProfileDirectMessage, encoded)
	require.NoError(t, err)

	statement, err := os.ReadFile(filepath.Join("migrations", "200_iai_appearance_schema.up.sql"))
	require.NoError(t, err)

	read := func() map[string]any {
		var raw []byte
		require.NoError(t, db.Pool.QueryRow(ctx,
			`SELECT iai_appearance FROM bot_personas WHERE slug = 'twice'`).Scan(&raw))
		var out map[string]any
		require.NoError(t, json.Unmarshal(raw, &out))
		return out
	}

	_, err = db.Pool.Exec(ctx, string(statement))
	require.NoError(t, err)
	once := read()

	require.Equal(t, "curly", once["hair_texture"])
	require.Equal(t, "latino", once["ethnicity"])
	require.Equal(t, "brown", once["hair_colour"])
	require.Equal(t, "plus_size", once["build"])

	_, err = db.Pool.Exec(ctx, string(statement))
	require.NoError(t, err)

	require.Equal(t, once, read(), "the second pass must be a no-op, not a second translation")
}

func TestGoingBackAndForwardTwiceIsStable(t *testing.T) {
	// Down is lossy by design -- three hair answers become one -- so a round
	// trip is not expected to return the original. What it must do is settle:
	// whatever survives the first trip has to survive every trip after it.
	ctx := context.Background()

	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "iai_round_trip", PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, owner))

	encoded, err := json.Marshal(map[string]any{
		"style": "realistic", "gender": "woman", "age": 34, "height_inches": 65,
		"ethnicity": "latino", "hair_length": "long", "hair_texture": "wavy",
		"hair_style": "high_ponytail", "hair_colour": "auburn", "eyes": "hazel", "build": "plus_size",
	})
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx,
		`INSERT INTO bot_personas (name, slug, description, personality, system_prompt,
			owner_user_id, response_style_profile, iai_appearance)
		 VALUES ('Round', 'round-trip', 'd', 'p', 'sp', $1, $2, $3)`,
		owner.ID, models.ResponseStyleProfileDirectMessage, encoded)
	require.NoError(t, err)

	run := func(direction string) map[string]any {
		statement, err := os.ReadFile(filepath.Join("migrations", "200_iai_appearance_schema."+direction+".sql"))
		require.NoError(t, err)
		_, err = db.Pool.Exec(ctx, string(statement))
		require.NoError(t, err)

		var raw []byte
		require.NoError(t, db.Pool.QueryRow(ctx,
			`SELECT iai_appearance FROM bot_personas WHERE slug = 'round-trip'`).Scan(&raw))
		var out map[string]any
		require.NoError(t, json.Unmarshal(raw, &out))
		return out
	}

	down := run("down")
	require.Equal(t, "ponytail", down["hair"], "the shape is the most specific thing the old field held")
	require.Equal(t, "latina", down["ethnicity"])
	require.NotContains(t, down, "height_inches")

	firstReturn := run("up")
	require.Equal(t, "ponytail", firstReturn["hair_style"])
	require.Equal(t, "latino", firstReturn["ethnicity"])
	require.NotContains(t, firstReturn, "hair_length", "the length did not survive the trip down, and does not come back")

	// And now it must hold still -- including twice in the same direction, which
	// alternating never exercises. Removing an identity clause from the rollback
	// left this test green until the repeats were made consecutive.
	require.Equal(t, down, run("down"))
	require.Equal(t, down, run("down"), "a repeated rollback is a no-op, not a second translation")
	require.Equal(t, firstReturn, run("up"))
	require.Equal(t, firstReturn, run("up"), "and the same going forward")
}

func TestTheBaselineMigrationsAreSafeToRunTwice(t *testing.T) {
	// The state that cost an afternoon: a migration whose effects are in the
	// database but whose row is not in schema_migrations, so `migrate up`
	// replays it. 193 could not survive that -- it cleared three of its four
	// baseline columns and left the fourth set, which is exactly the partial
	// reading the constraint it then creates refuses.
	//
	// The rollback ladder cannot catch this. Rolling back clears everything, so
	// re-applying always meets NULLs and the partial case never arises.
	ctx := context.Background()

	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "iai_replay", PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, owner))

	// A character with a complete reading, which is what makes the UPDATE fire.
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO bot_personas (name, slug, description, personality, system_prompt,
			owner_user_id, response_style_profile,
			baseline_mood, baseline_trust, baseline_warmth, baseline_firmness,
			baseline_talkativeness, baseline_expressiveness)
		VALUES ('Replay', 'replay', 'd', 'p', 'sp', $1, $2, 0.2, 0.3, 0.4, 0.5, -0.1, -0.2)`,
		owner.ID, models.ResponseStyleProfileDirectMessage)
	require.NoError(t, err)

	for _, name := range []string{
		"201_baseline_speech",
		"202_relationship_attachment_attraction",
		"203_relationship_kind",
		"204_nursery_home",
		"205_relationship_ended",
	} {
		statement, err := os.ReadFile(filepath.Join("migrations", name+".up.sql"))
		require.NoError(t, err)
		_, err = db.Pool.Exec(ctx, string(statement))
		require.NoError(t, err, "%s could not be replayed onto its own result", name)
	}
}
