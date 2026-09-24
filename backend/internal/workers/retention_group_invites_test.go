package workers

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/require"
)

// An invite carries the group's older keys wrapped for the invitee. Answering
// it drops them; an invite nobody answers only expires, and its keys went on
// being stored for someone who can no longer join.
func TestRetentionWorkerDropsTheKeysOfAnExpiredGroupInvite(t *testing.T) {
	ctx := context.Background()
	db := testutil.NewTestDatabase(t)
	fixtures := testutil.NewFixtures(t, db)
	owner := fixtures.CreateUniqueUser("rw_owner")

	var group int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO conversations (conversation_type, is_group, group_name, created_by, max_participants, last_message_at)
		VALUES ('group', TRUE, 'retention', $1, 250, CURRENT_TIMESTAMP) RETURNING id
	`, owner.ID).Scan(&group))
	invite := func(expiry string) int {
		invitee := fixtures.CreateUniqueUser("rw_invitee")
		var id int
		require.NoError(t, db.Pool.QueryRow(ctx, `
			INSERT INTO group_invites (conversation_id, invited_user_id, invited_by, expires_at)
			VALUES ($1, $2, $3, NOW() + $4::interval) RETURNING id
		`, group, invitee.ID, owner.ID, expiry).Scan(&id))
		_, err := db.Pool.Exec(ctx, `
			INSERT INTO group_invite_key_copies (invite_id, key_version, wrapped_key) VALUES ($1, 1, 'wrapped')
		`, id)
		require.NoError(t, err)
		return id
	}
	expired, open := invite("-1 hour"), invite("6 days")

	NewRetentionWorker(db.Pool, nil, nil, config.RetentionConfig{}).cleanupExpiredGroupInviteKeyCopies(ctx)

	copies := func(id int) int {
		var n int
		require.NoError(t, db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM group_invite_key_copies WHERE invite_id = $1`, id).Scan(&n))
		return n
	}
	require.Zero(t, copies(expired), "an expired invite keeps no keys")
	require.Equal(t, 1, copies(open), "an invite that can still be accepted keeps its keys")
}
