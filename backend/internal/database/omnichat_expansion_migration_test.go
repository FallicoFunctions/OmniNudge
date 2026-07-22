package database

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOmniChatExpansionMigrationsRollBackAndReapplyCleanly(t *testing.T) {
	db, err := NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	ctx := context.Background()
	require.NoError(t, DropSchema(ctx, db))
	t.Cleanup(func() {
		// Leave the shared test database fully migrated even if an assertion
		// aborts this test between down migrations.
		require.NoError(t, DropSchema(ctx, db))
		require.NoError(t, db.Migrate(ctx))
	})
	require.NoError(t, db.Migrate(ctx))
	// New non-OmniChat migrations sort after the expansion. Roll them back
	// before exercising the speech-outbox rollback guardrail.
	for _, expected := range []string{
		"152_user_email_lookup_hash",
		"151_encrypt_pending_verification_email",
		"150_invalidate_plaintext_auth_tokens",
		"149_data_export_integrity",
		"148_tracked_presigned_uploads",
		"147_auth_sessions",
	} {
		var latest string
		require.NoError(t, db.Pool.QueryRow(ctx, `SELECT version FROM schema_migrations ORDER BY applied_at DESC, version DESC LIMIT 1`).Scan(&latest))
		require.Equal(t, expected, latest)
		require.NoError(t, db.MigrateDown(ctx))
	}
	_, err = db.Pool.Exec(ctx, `INSERT INTO omnichat_speech_deletion_queue(storage_path) VALUES('omnichat/speech/pending.mp3')`)
	require.NoError(t, err)
	err = db.MigrateDown(ctx)
	require.ErrorContains(t, err, "pending objects remain")
	_, err = db.Pool.Exec(ctx, `DELETE FROM omnichat_speech_deletion_queue`)
	require.NoError(t, err)

	for _, expected := range []string{
		"146_omnichat_speech_deletion_outbox",
		"145_omnichat_voicebox",
		"144_omnichat_live_avatar_calls",
		"143_omnichat_single_active_call",
		"142_omnichat_voice_pitch",
		"141_omnichat_voice_and_calls",
		"140_omnichat_groups_and_nsfw",
		"139_omnichat_social_explore",
		"138_omnichat_generation_output_message",
		"137_omnichat_media_generation",
	} {
		var latest string
		require.NoError(t, db.Pool.QueryRow(ctx, `SELECT version FROM schema_migrations ORDER BY applied_at DESC, version DESC LIMIT 1`).Scan(&latest))
		require.Equal(t, expected, latest)
		require.NoError(t, db.MigrateDown(ctx))
	}

	for _, table := range []string{
		"auth_sessions",
		"media_upload_intents",
		"omnichat_generation_jobs",
		"omnichat_media_assets",
		"omnichat_publications",
		"omnichat_groups",
		"omnichat_persona_voices",
		"omnichat_call_sessions",
		"omnichat_speech_deletion_queue",
	} {
		var exists bool
		require.NoError(t, db.Pool.QueryRow(ctx, `SELECT to_regclass('public.' || $1) IS NOT NULL`, table).Scan(&exists))
		require.Falsef(t, exists, "%s should be removed after rollback", table)
	}

	require.NoError(t, db.Migrate(ctx))
	for _, table := range []string{
		"auth_sessions",
		"media_upload_intents",
		"omnichat_generation_jobs",
		"omnichat_media_assets",
		"omnichat_publications",
		"omnichat_groups",
		"omnichat_persona_voices",
		"omnichat_call_sessions",
		"omnichat_speech_deletion_queue",
	} {
		var exists bool
		require.NoError(t, db.Pool.QueryRow(ctx, `SELECT to_regclass('public.' || $1) IS NOT NULL`, table).Scan(&exists))
		require.Truef(t, exists, "%s should be restored after reapply", table)
	}
	var singleActiveIndex bool
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT to_regclass('public.idx_omnichat_call_sessions_one_active_user') IS NOT NULL`).Scan(&singleActiveIndex))
	require.True(t, singleActiveIndex)
	var providerSessionIndex bool
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT to_regclass('public.idx_omnichat_call_sessions_provider_session') IS NOT NULL`).Scan(&providerSessionIndex))
	require.True(t, providerSessionIndex)
	var voiceboxAllowed bool
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT pg_get_constraintdef(oid) LIKE '%voicebox%'
		FROM pg_constraint
		WHERE conname='omnichat_persona_voices_provider_check'
	`).Scan(&voiceboxAllowed))
	require.True(t, voiceboxAllowed)
	var speechDeletionTrigger bool
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_enqueue_omnichat_speech_object_deletion' AND NOT tgisinternal)`).Scan(&speechDeletionTrigger))
	require.True(t, speechDeletionTrigger)
	var verificationEmailEncrypted bool
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema='public' AND table_name='email_verifications'
			  AND column_name='email_encrypted'
		)
	`).Scan(&verificationEmailEncrypted))
	require.True(t, verificationEmailEncrypted)
	var exportKeyEncrypted bool
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema='public' AND table_name='export_session_keys'
			  AND column_name='encrypted_key'
		)
	`).Scan(&exportKeyEncrypted))
	require.True(t, exportKeyEncrypted)
	var emailLookupHashExists bool
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema='public' AND table_name='users'
			  AND column_name='email_lookup_hash'
		)
	`).Scan(&emailLookupHashExists))
	require.True(t, emailLookupHashExists)
}
