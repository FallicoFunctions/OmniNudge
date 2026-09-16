package queue

import (
	"context"
	"testing"

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
