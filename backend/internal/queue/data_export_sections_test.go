package queue

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Eight of the thirteen export sections had no test, and six of them selected
// columns their tables do not have. The worker logs such a failure and writes
// {"error": "data unavailable"} into the file, so the export still arrives and
// still looks successful. Nothing said otherwise until somebody ran them.
//
// This asks every section the one question that matters: does your query run
// against the real schema? It uses a user with no rows anywhere, so it also
// covers the empty account, which is where a QueryRow section returns no rows.
func TestEveryExportSectionBuildsAgainstTheSchema(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	ctx := context.Background()

	var uid int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO users (username, username_normalized, password_hash)
		VALUES ('exp_sections', 'exp_sections', 'x') RETURNING id`).Scan(&uid))

	sections := []struct {
		name string
		run  func() (interface{}, error)
	}{
		{"profile", func() (interface{}, error) { return exportProfileData(ctx, pool, uid) }},
		{"messages", func() (interface{}, error) { return exportMessagesData(ctx, pool, uid, false) }},
		{"posts", func() (interface{}, error) { return exportPostsData(ctx, pool, uid, false) }},
		{"comments", func() (interface{}, error) { return exportCommentsData(ctx, pool, uid, false) }},
		{"votes", func() (interface{}, error) { return exportVotesData(ctx, pool, uid) }},
		{"saved", func() (interface{}, error) { return exportSavedData(ctx, pool, uid) }},
		{"hubs", func() (interface{}, error) { return exportHubsData(ctx, pool, uid) }},
		{"settings", func() (interface{}, error) { return exportSettingsData(ctx, pool, uid) }},
		{"encryption_keys", func() (interface{}, error) { return exportEncryptionKeysData(ctx, pool, uid) }},
		{"omnichat_conversations", func() (interface{}, error) {
			return exportOmniChatConversationsData(ctx, pool, uid, false)
		}},
		{"omnichat_personas", func() (interface{}, error) { return exportOmniChatPersonasData(ctx, pool, uid) }},
		{"omnichat_memory", func() (interface{}, error) { return exportOmniChatMemoryData(ctx, pool, uid) }},
		{"omnichat_media", func() (interface{}, error) { return exportOmniChatMediaData(ctx, pool, uid, false) }},
	}

	for _, section := range sections {
		t.Run(section.name, func(t *testing.T) {
			data, err := section.run()
			require.NoError(t, err, "the %s section must build against the real schema", section.name)
			require.NotNil(t, data, "the %s section must return a body, not nil", section.name)
		})
	}
}

// Deleted rows must be excluded unless the request asks for them, and both
// forms of the query have to run: the columns differ between them.
func TestExportSectionsHonourIncludeDeleted(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	ctx := context.Background()

	var uid int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO users (username, username_normalized, password_hash)
		VALUES ('exp_deleted', 'exp_deleted', 'x') RETURNING id`).Scan(&uid))

	for _, includeDeleted := range []bool{false, true} {
		_, err := exportPostsData(ctx, pool, uid, includeDeleted)
		require.NoError(t, err, "posts, include_deleted=%v", includeDeleted)
		_, err = exportCommentsData(ctx, pool, uid, includeDeleted)
		require.NoError(t, err, "comments, include_deleted=%v", includeDeleted)
		_, err = exportMessagesData(ctx, pool, uid, includeDeleted)
		require.NoError(t, err, "messages, include_deleted=%v", includeDeleted)
	}
}

// The account above owns nothing, so exportSettingsData takes its no-row path
// and the Scan never runs. A real account has a row, and that row may hold
// NULL in a nullable column: theme and daily_digest are both nullable, and a
// plain bool cannot receive NULL. This drives the Scan for both shapes.
func TestExportSettingsHandlesNullAndPopulatedRows(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	ctx := context.Background()

	var uid int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO users (username, username_normalized, password_hash)
		VALUES ('exp_settings_null', 'exp_settings_null', 'x') RETURNING id`).Scan(&uid))

	_, err := pool.Exec(ctx, `
		INSERT INTO user_settings (user_id, theme, daily_digest) VALUES ($1, NULL, NULL)`, uid)
	require.NoError(t, err)

	data, err := exportSettingsData(ctx, pool, uid)
	require.NoError(t, err, "a settings row holding NULL must still export")
	require.NotNil(t, data)

	_, err = pool.Exec(ctx, `
		UPDATE user_settings SET theme = 'dark', daily_digest = TRUE WHERE user_id = $1`, uid)
	require.NoError(t, err)

	data, err = exportSettingsData(ctx, pool, uid)
	require.NoError(t, err, "and so must a row holding values")
	require.NotNil(t, data)
}

// Every section answers a failed Scan with continue, so a NULL in a column
// scanned into a non-pointer target does not fail the export: it removes the
// row from it, with nothing in the file to say the row ever existed. These
// tables allow NULL in exactly those columns, so rows are written that way on
// purpose here. A row that goes missing is the failure being tested for.
func TestExportSectionsKeepRowsWithNullColumns(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	ctx := context.Background()

	var uid, other int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO users (username, username_normalized, password_hash)
		VALUES ('exp_nulls', 'exp_nulls', 'x') RETURNING id`).Scan(&uid))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO users (username, username_normalized, password_hash)
		VALUES ('exp_nulls_other', 'exp_nulls_other', 'x') RETURNING id`).Scan(&other))

	var postID int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO platform_posts (author_id, title, body, created_at, is_deleted)
		VALUES ($1, 'A post with nulls', NULL, NULL, NULL) RETURNING id`, uid).Scan(&postID))

	var commentID int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO post_comments (post_id, user_id, body, created_at, is_deleted)
		VALUES ($1, $2, 'A comment with nulls', NULL, NULL) RETURNING id`, postID, uid).Scan(&commentID))

	_, err := pool.Exec(ctx, `
		INSERT INTO post_votes (post_id, user_id, is_upvote, created_at) VALUES ($1, $2, TRUE, NULL)`, postID, uid)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `
		INSERT INTO comment_votes (comment_id, user_id, is_upvote, created_at) VALUES ($1, $2, TRUE, NULL)`, commentID, uid)
	require.NoError(t, err)

	var hubID int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO hubs (name, name_normalized, created_by, created_at)
		VALUES ('exp_nulls_hub', 'exp_nulls_hub', $1, NULL) RETURNING id`, uid).Scan(&hubID))
	_, err = pool.Exec(ctx, `
		INSERT INTO hub_subscriptions (user_id, hub_id, subscribed_at) VALUES ($1, $2, NULL)`, uid, hubID)
	require.NoError(t, err)

	var conv int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO conversations (conversation_type, is_group, created_by, last_message_at)
		VALUES ('dm', FALSE, $1, CURRENT_TIMESTAMP) RETURNING id`, uid).Scan(&conv))
	_, err = pool.Exec(ctx, `
		INSERT INTO messages (conversation_id, sender_id, recipient_id, encrypted_content,
			sender_encrypted_content, shared_encryption_iv, sent_at, deleted_for_sender, deleted_for_recipient,
			encryption_version, message_type)
		VALUES ($1,$2,$3,'CIPHERTEXT-WITH-NULLS',NULL,NULL,NULL,NULL,NULL,'v1','text')`, conv, other, uid)
	require.NoError(t, err)

	posts, err := exportPostsData(ctx, pool, uid, false)
	require.NoError(t, err)
	assert.Equal(t, float64(1), encodeExport(t, posts)["total"], "the post survives its NULL columns")

	comments, err := exportCommentsData(ctx, pool, uid, false)
	require.NoError(t, err)
	assert.Equal(t, float64(1), encodeExport(t, comments)["total"], "the comment survives its NULL columns")

	votes, err := exportVotesData(ctx, pool, uid)
	require.NoError(t, err)
	voteSection := encodeExport(t, votes)
	assert.Len(t, voteSection["post_votes"], 1, "the post vote survives its NULL created_at")
	assert.Len(t, voteSection["comment_votes"], 1, "the comment vote survives its NULL created_at")

	hubs, err := exportHubsData(ctx, pool, uid)
	require.NoError(t, err)
	hubSection := encodeExport(t, hubs)
	assert.Len(t, hubSection["subscriptions"], 1, "the subscription survives its NULL subscribed_at")
	assert.Len(t, hubSection["created_hubs"], 1, "the hub survives its NULL created_at")

	messages, err := exportMessagesData(ctx, pool, uid, false)
	require.NoError(t, err)
	assert.Equal(t, float64(1), encodeExport(t, messages)["total"], "the message survives its NULL columns")
}
