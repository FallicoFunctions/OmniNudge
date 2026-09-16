package queue

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The messages section had never been run by anything: it selected created_at
// from a table whose column is sent_at, so every export that asked for
// messages failed. This exercises the real query against the real schema.
func TestExportMessagesSectionCarriesCiphertext(t *testing.T) {
	pool := setupOmniChatExportDB(t)
	ctx := context.Background()

	var me, other int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO users (username, username_normalized, password_hash)
		VALUES ('exp_msg_me', 'exp_msg_me', 'x') RETURNING id`).Scan(&me))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO users (username, username_normalized, password_hash)
		VALUES ('exp_msg_other', 'exp_msg_other', 'x') RETURNING id`).Scan(&other))

	var dm, grp int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO conversations (conversation_type, is_group, created_by, last_message_at)
		VALUES ('dm', FALSE, $1, CURRENT_TIMESTAMP) RETURNING id`, me).Scan(&dm))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO conversations (conversation_type, is_group, group_name, created_by, max_participants, last_message_at)
		VALUES ('group', TRUE, 'export group', $1, 250, CURRENT_TIMESTAMP) RETURNING id`, me).Scan(&grp))

	// Two materially different inputs, along the dimension the code branches
	// on: one message this user sent, one it received.
	for _, r := range []struct {
		conv                 int
		sender, recipient    int
		body, senderBody, iv string
	}{
		{dm, me, other, "DM-CIPHERTEXT-FOR-RECIPIENT", "DM-CIPHERTEXT-FOR-SENDER", "dm-iv"},
		{grp, other, me, "GROUP-CIPHERTEXT-SHARED", "GROUP-CIPHERTEXT-SENDER", "grp-iv"},
	} {
		_, err := pool.Exec(ctx, `
			INSERT INTO messages (conversation_id, sender_id, recipient_id, encrypted_content,
				sender_encrypted_content, shared_encryption_iv, encryption_version, message_type)
			VALUES ($1,$2,$3,$4,$5,$6,'v1','text')`,
			r.conv, r.sender, r.recipient, r.body, r.senderBody, r.iv)
		require.NoError(t, err)
	}

	data, err := exportMessagesData(ctx, pool, me, false)
	require.NoError(t, err, "the section must build at all: it selected a column the table does not have")

	section := encodeExport(t, data)
	assert.Equal(t, float64(2), section["total"])
	messages, ok := section["messages"].([]interface{})
	require.True(t, ok)
	require.Len(t, messages, 2)

	byCipher := map[string]map[string]interface{}{}
	for _, m := range messages {
		entry, ok := m.(map[string]interface{})
		require.True(t, ok)
		byCipher[entry["content_encrypted_base64"].(string)] = entry
	}

	// A message this user sent travels as its own sender copy; one it received
	// travels as the shared ciphertext.
	sent, ok := byCipher["DM-CIPHERTEXT-FOR-SENDER"]
	require.True(t, ok, "the sender's own copy must be the ciphertext for a message it sent")
	received, ok := byCipher["GROUP-CIPHERTEXT-SHARED"]
	require.True(t, ok, "the shared ciphertext must travel for a message it received")

	for _, entry := range []map[string]interface{}{sent, received} {
		assert.Equal(t, "[Encrypted Content - Key Unavailable]", entry["content"],
			"the server holds no key, so it never writes plaintext into an export")
		assert.NotEmpty(t, entry["sent_at"], "each message carries when it was sent")
	}
}
