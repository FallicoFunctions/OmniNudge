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
	// Later migrations sort after the expansion. Roll them back before
	// exercising the speech-outbox rollback guardrail.
	for _, expected := range []string{
		// The head of this list must be the newest migration in the tree:
		// the loop asserts it is what schema_migrations reports before
		// rolling it back, so adding a migration without adding it here
		// fails on the first iteration.
		"196_retire_chat_billing_deliveries",
		"195_retire_ultra_fast_profile",
		"194_omnichat_commitments",
		"193_baseline_firmness",
		"192_blocks_carry_the_exchange",
		"191_bot_messages_are_searchable",
		"190_omnichat_persona_user_blocks",
		"189_character_kind_is_immutable",
		"188_unified_memory_for_free_characters",
		"187_free_characters_may_be_private",
		"186_direct_message_personas_are_platform_owned",
		"185_omnichat_direct_message_style",
		"184_omnichat_persona_disposition_baseline",
		"183_omnichat_character_traits",
		"182_omnichat_memory_recurrences",
		"181_omnirave_withdrawal_has_no_expiry",
		"180_omnirave_persona_sanctions",
		"179_omnirave_profiles_account_subject_matches_user",
		"178_omnirave_profiles_by_subject",
		"177_failed_login_lookup_indexes",
		"176_omnichat_memory_retellings",
		"175_omnichat_character_memory",
		"174_omnichat_generation_allow_nsfw",
		"173_omnichat_video_intermediate_assets",
		"172_omnichat_media_command_idempotency_scope",
		"171_omnichat_media_only_messages",
		"170_omnichat_livekit_avatar_calls",
		"169_omnichat_paid_request_idempotency",
		"168_omnichat_chat_billing_operations",
		"167_media_storage_object_keys",
		"166_billing_integrity_and_checkout",
		"165_omnichat_social_integrity",
		"164_media_file_deletion_outbox",
		"163_omnichat_media_deletion_retry_state",
		"162_omnichat_generation_billing_operation",
		"161_omnichat_media_deletion_outbox",
		"160_omnicredits_usage_reservations",
		"159_omnichat_response_feedback",
		"158_omnichat_conversation_scene_state",
		"157_omnichat_model_profiles",
		"156_omnicredits_wallet_ledger",
		"155_omnichat_model_preferences",
		"154_omnichat_conversational_persona_examples",
		"153_omnichat_default_persona_voices",
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
		if expected == "170_omnichat_livekit_avatar_calls" {
			var legacyVoiceColumns bool
			require.NoError(t, db.Pool.QueryRow(ctx, `
				SELECT COUNT(*) = 2
				FROM information_schema.columns
				WHERE table_schema='public' AND table_name='omnichat_persona_voices'
				  AND column_name IN ('live_video_replica_id','live_video_persona_id')
			`).Scan(&legacyVoiceColumns))
			require.True(t, legacyVoiceColumns)
			var legacyProviderConstraint bool
			require.NoError(t, db.Pool.QueryRow(ctx, `
				SELECT pg_get_constraintdef(oid) LIKE '%tavus%'
				FROM pg_constraint
				WHERE conname='omnichat_call_sessions_provider_check'
			`).Scan(&legacyProviderConstraint))
			require.True(t, legacyProviderConstraint)
		}
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
		"omnicredits_ledger",
		"omnicredits_wallets",
		"omnichat_checkout_sessions",
		"omnichat_billing_events",
		"omnichat_chat_billing_deliveries",
		"omnichat_request_idempotency",
		"omnichat_model_preferences",
		"auth_sessions",
		"media_upload_intents",
		"omnichat_generation_jobs",
		"omnichat_media_assets",
		"omnichat_publications",
		"omnichat_groups",
		"omnichat_persona_voices",
		"omnichat_call_sessions",
		"omnichat_speech_deletion_queue",
		"omnichat_conversation_scene_states",
		"omnichat_conversation_scene_state_checkpoints",
		"omnichat_response_feedback",
		"omnicredits_usage_reservations",
		"omnichat_media_deletion_queue",
		"media_file_deletion_queue",
	} {
		var exists bool
		require.NoError(t, db.Pool.QueryRow(ctx, `SELECT to_regclass('public.' || $1) IS NOT NULL`, table).Scan(&exists))
		require.Falsef(t, exists, "%s should be removed after rollback", table)
	}

	require.NoError(t, db.Migrate(ctx))
	for _, table := range []string{
		"omnicredits_ledger",
		"omnicredits_wallets",
		"omnichat_checkout_sessions",
		"omnichat_billing_events",
		"omnichat_request_idempotency",
		"omnichat_model_preferences",
		"auth_sessions",
		"media_upload_intents",
		"omnichat_generation_jobs",
		"omnichat_media_assets",
		"omnichat_publications",
		"omnichat_groups",
		"omnichat_persona_voices",
		"omnichat_call_sessions",
		"omnichat_speech_deletion_queue",
		"omnichat_conversation_scene_states",
		"omnichat_conversation_scene_state_checkpoints",
		"omnichat_response_feedback",
		"omnicredits_usage_reservations",
		"omnichat_media_deletion_queue",
		"media_file_deletion_queue",
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
	var profileConstraint bool
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT pg_get_constraintdef(oid) LIKE '%premium_quick%'
			AND pg_get_constraintdef(oid) LIKE '%premium_deep%'
		FROM pg_constraint
		WHERE conname='omnichat_model_preferences_key_check'
	`).Scan(&profileConstraint))
	require.True(t, profileConstraint)
	var requestIdempotencyColumn bool
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema='public' AND table_name='bot_messages'
			  AND column_name='client_request_id'
		)
	`).Scan(&requestIdempotencyColumn))
	require.True(t, requestIdempotencyColumn)
}

func TestBillingIntegrityMigrationGrandfathersLegacyImageJobs(t *testing.T) {
	db, err := NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	ctx := context.Background()
	require.NoError(t, DropSchema(ctx, db))
	t.Cleanup(func() {
		require.NoError(t, DropSchema(ctx, db))
		require.NoError(t, db.Migrate(ctx))
	})
	require.NoError(t, db.Migrate(ctx))

	for _, expected := range []string{
		// The head of this list must be the newest migration in the tree:
		// the loop asserts it is what schema_migrations reports before
		// rolling it back, so adding a migration without adding it here
		// fails on the first iteration.
		"196_retire_chat_billing_deliveries",
		"195_retire_ultra_fast_profile",
		"194_omnichat_commitments",
		"193_baseline_firmness",
		"192_blocks_carry_the_exchange",
		"191_bot_messages_are_searchable",
		"190_omnichat_persona_user_blocks",
		"189_character_kind_is_immutable",
		"188_unified_memory_for_free_characters",
		"187_free_characters_may_be_private",
		"186_direct_message_personas_are_platform_owned",
		"185_omnichat_direct_message_style",
		"184_omnichat_persona_disposition_baseline",
		"183_omnichat_character_traits",
		"182_omnichat_memory_recurrences",
		"181_omnirave_withdrawal_has_no_expiry",
		"180_omnirave_persona_sanctions",
		"179_omnirave_profiles_account_subject_matches_user",
		"178_omnirave_profiles_by_subject",
		"177_failed_login_lookup_indexes",
		"176_omnichat_memory_retellings",
		"175_omnichat_character_memory",
		"174_omnichat_generation_allow_nsfw",
		"173_omnichat_video_intermediate_assets",
		"172_omnichat_media_command_idempotency_scope",
		"171_omnichat_media_only_messages",
		"170_omnichat_livekit_avatar_calls",
		"169_omnichat_paid_request_idempotency",
		"168_omnichat_chat_billing_operations",
		"167_media_storage_object_keys",
		"166_billing_integrity_and_checkout",
	} {
		var latest string
		require.NoError(t, db.Pool.QueryRow(ctx, `
			SELECT version
			FROM schema_migrations
			ORDER BY applied_at DESC, version DESC
			LIMIT 1
		`).Scan(&latest))
		require.Equal(t, expected, latest)
		require.NoError(t, db.MigrateDown(ctx))
	}

	var userID, personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO users(username,username_normalized,password_hash)
		VALUES('legacy_generation_owner','legacy_generation_owner','test-hash')
		RETURNING id
	`).Scan(&userID))
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas(slug,name,description,category,system_prompt,is_nsfw,is_active)
		VALUES('legacy-generation-persona','Legacy Generation','test','original','test',FALSE,TRUE)
		RETURNING id
	`).Scan(&personaID))

	var legacyID string
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO omnichat_generation_jobs(
			id,owner_user_id,persona_id,kind,mode,status,prompt,
			effective_prompt,aspect_ratio
		)
		VALUES(gen_random_uuid(),$1,$2,'image','create','failed','legacy prompt',
		       'legacy prompt','1:1')
		RETURNING id::text
	`, userID, personaID).Scan(&legacyID))

	require.NoError(t, db.Migrate(ctx))

	var billingRequired bool
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT billing_required
		FROM omnichat_generation_jobs
		WHERE id=$1::uuid
	`, legacyID).Scan(&billingRequired))
	require.False(t, billingRequired)

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO omnichat_generation_jobs(
			id,owner_user_id,persona_id,kind,mode,status,prompt,
			effective_prompt,aspect_ratio
		)
		VALUES(gen_random_uuid(),$1,$2,'image','create','failed','unbilled new prompt',
		       'unbilled new prompt','1:1')
	`, userID, personaID)
	require.ErrorContains(t, err, "omnichat_generation_jobs_billing_check")
}
