package database

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

// A video job owns two artifacts: the still its image phase rendered, and the
// clip animated from it. Migration 137 made omnichat_media_assets.
// generation_job_id UNIQUE, which made the second insert fail outright.
func TestOmniChatVideoTwoPhaseMigrationAllowsTwoAssetsPerJob(t *testing.T) {
	ctx := context.Background()
	db, err := NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))

	var uniqueConstraints int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM pg_constraint
		WHERE conrelid = 'omnichat_media_assets'::regclass
		  AND contype = 'u'
		  AND conkey = ARRAY[(
		      SELECT attnum FROM pg_attribute
		      WHERE attrelid = 'omnichat_media_assets'::regclass AND attname = 'generation_job_id'
		  )]::smallint[]
	`).Scan(&uniqueConstraints))
	require.Zero(t, uniqueConstraints, "generation_job_id must no longer be unique")

	var indexes int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM pg_indexes
		WHERE tablename = 'omnichat_media_assets'
		  AND indexname = 'idx_omnichat_media_assets_generation_job'
	`).Scan(&indexes))
	require.Equal(t, 1, indexes, "the lookup still needs an index, just not a unique one")
}

// The rollback has to survive the data the feature creates. Re-adding UNIQUE
// while a job owns two assets fails, and a down migration that fails halfway is
// worse than one that deletes the surplus deliberately.
func TestOmniChatVideoTwoPhaseRollbackDropsTheSurplusAsset(t *testing.T) {
	ctx := context.Background()
	db, err := NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, ResetTestData(ctx, db))
	// However this test ends, the schema has to be left current for whichever
	// test runs next against the shared database.
	t.Cleanup(func() { _ = db.Migrate(context.Background()) })

	var userID, personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO users(username,username_normalized,password_hash)
		VALUES('two_phase_rollback_owner','two_phase_rollback_owner','test-hash')
		RETURNING id
	`).Scan(&userID))
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas(slug,name,description,category,system_prompt,is_nsfw,is_active)
		VALUES('two-phase-rollback-persona','Two Phase','test','original','test',FALSE,TRUE)
		RETURNING id
	`).Scan(&personaID))

	var jobID string
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO omnichat_generation_jobs(
			id,owner_user_id,persona_id,kind,mode,status,prompt,effective_prompt,
			aspect_ratio,duration_seconds,billing_required
		)
		VALUES(gen_random_uuid(),$1,$2,'video','contextual','running','clip prompt','clip prompt','16:9',5,FALSE)
		RETURNING id::text
	`, userID, personaID).Scan(&jobID))

	insertAsset := func(kind, extension string) string {
		var mediaFileID int
		require.NoError(t, db.Pool.QueryRow(ctx, `
			INSERT INTO media_files(user_id,filename,original_filename,file_type,file_size,storage_url,storage_path,scan_status)
			VALUES($1,$2,$2,$3,2048,$4,$5,'clean')
			RETURNING id
		`, userID, "generated"+extension, kind+"/"+extension[1:],
			"/uploads/omnichat/generated/"+jobID+extension,
			"omnichat/generated/"+jobID+extension).Scan(&mediaFileID))
		var assetID string
		require.NoError(t, db.Pool.QueryRow(ctx, `
			INSERT INTO omnichat_media_assets(
				id,owner_user_id,persona_id,generation_job_id,media_file_id,kind,visibility,prompt,safety_status
			)
			VALUES(gen_random_uuid(),$1,$2,$3::uuid,$4,$5,'private','clip prompt','approved')
			RETURNING id::text
		`, userID, personaID, jobID, mediaFileID, kind).Scan(&assetID))
		return assetID
	}

	stillID := insertAsset("image", ".png")
	clipID := insertAsset("video", ".mp4")
	_, err = db.Pool.Exec(ctx,
		`UPDATE omnichat_generation_jobs SET source_asset_id=$2::uuid, output_asset_id=$3::uuid, status='succeeded' WHERE id=$1::uuid`,
		jobID, stillID, clipID)
	require.NoError(t, err)

	// 174 (allow_nsfw) sits on top of 173, so both come off to reach it.
	require.NoError(t, db.MigrateDown(ctx))
	require.NoError(t, db.MigrateDown(ctx))

	var remaining []string
	rows, err := db.Pool.Query(ctx,
		`SELECT id::text FROM omnichat_media_assets WHERE generation_job_id=$1::uuid`, jobID)
	require.NoError(t, err)
	defer rows.Close()
	for rows.Next() {
		var id string
		require.NoError(t, rows.Scan(&id))
		remaining = append(remaining, id)
	}
	require.NoError(t, rows.Err())
	require.Equal(t, []string{clipID}, remaining,
		"the job's recorded output survives and the intermediate still is dropped")

	var restored int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM pg_constraint
		WHERE conrelid = 'omnichat_media_assets'::regclass AND contype = 'u'
		  AND conname = 'omnichat_media_assets_generation_job_id_key'
	`).Scan(&restored))
	require.Equal(t, 1, restored, "the rollback must actually restore the constraint")

	require.NoError(t, db.Migrate(ctx))
}
