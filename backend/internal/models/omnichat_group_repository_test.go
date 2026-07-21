package models_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestOmniChatGroupRepositoryMembershipInviteAndMessageLifecycle(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "om_group_owner", PasswordHash: "hash", Role: "user"}
	member := &models.User{Username: "om_group_member", PasswordHash: "hash", Role: "user"}
	outsider := &models.User{Username: "om_group_outsider", PasswordHash: "hash", Role: "user"}
	for _, user := range []*models.User{owner, member, outsider} {
		require.NoError(t, users.Create(ctx, user))
	}

	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug,name,category,system_prompt,visibility,source_format,is_active)
		VALUES ('group-sadie','Sadie','original','Stay in character.','public','native',TRUE) RETURNING id
	`).Scan(&personaID))

	repo := models.NewOmniChatGroupRepository(db.Pool)
	group, err := repo.CreateGroup(ctx, owner.ID, "Park Friends", "Humans and characters together", []int{personaID})
	require.NoError(t, err)
	require.Len(t, group.Personas, 1)
	require.Equal(t, "owner", group.ViewerRole)
	secondGroup, err := repo.CreateGroup(ctx, owner.ID, "Second Group", "Cursor coverage", nil)
	require.NoError(t, err)
	sharedGroupTime := time.Date(2026, 7, 21, 1, 2, 3, 0, time.UTC)
	_, err = db.Pool.Exec(ctx, `UPDATE omnichat_groups SET last_message_at=$1 WHERE id IN ($2,$3)`, sharedGroupTime, group.ID, secondGroup.ID)
	require.NoError(t, err)
	firstGroupPage, err := repo.ListGroupsForUser(ctx, owner.ID, nil, 1)
	require.NoError(t, err)
	require.Len(t, firstGroupPage, 1)
	secondGroupPage, err := repo.ListGroupsForUser(ctx, owner.ID, &models.OmniChatGroupCursor{LastMessageAt: firstGroupPage[0].LastMessageAt, ID: firstGroupPage[0].ID}, 1)
	require.NoError(t, err)
	require.Len(t, secondGroupPage, 1)
	require.NotEqual(t, firstGroupPage[0].ID, secondGroupPage[0].ID, "composite group cursors must not skip equal timestamps")

	missingInviteeID := 2_000_000_000
	missingInvite, err := repo.CreateInvite(ctx, group.ID, owner.ID, &missingInviteeID, hex.EncodeToString(digestBytesForTest("missing-invitee")), 1, time.Now().Add(time.Hour))
	require.NoError(t, err)
	require.Nil(t, missingInvite, "an invite for a nonexistent account must be rejected without surfacing a foreign-key error")

	foreign, err := repo.GetGroupForMember(ctx, group.ID, outsider.ID)
	require.NoError(t, err)
	require.Nil(t, foreign)

	rawToken := "invite-secret-token"
	digestBytes := sha256.Sum256([]byte(rawToken))
	invite, err := repo.CreateInvite(ctx, group.ID, owner.ID, &member.ID, hex.EncodeToString(digestBytes[:]), 1, time.Now().Add(time.Hour))
	require.NoError(t, err)
	require.NotEqual(t, uuid.Nil, invite.ID)

	joined, err := repo.AcceptInvite(ctx, hex.EncodeToString(digestBytes[:]), member.ID)
	require.NoError(t, err)
	require.Equal(t, group.ID, joined.ID)

	message, err := repo.CreateUserMessage(ctx, group.ID, member.ID, "Sadie, welcome to the park!", nil)
	require.NoError(t, err)
	require.NotNil(t, message)
	_, err = repo.CreatePersonaMessage(ctx, group.ID, personaID, "I brought a picnic blanket.", &message.ID, false)
	require.NoError(t, err)

	thread, err := repo.ListMessagesForMember(ctx, group.ID, member.ID, nil, 50)
	require.NoError(t, err)
	require.Len(t, thread, 2)
	require.Equal(t, "Sadie", thread[1].SenderName)
	_, err = db.Pool.Exec(ctx, `UPDATE omnichat_group_messages SET created_at='2026-07-21T00:00:00Z' WHERE group_id=$1`, group.ID)
	require.NoError(t, err)
	firstPage, err := repo.ListMessagesForMember(ctx, group.ID, member.ID, nil, 1)
	require.NoError(t, err)
	require.Len(t, firstPage, 1)
	secondPage, err := repo.ListMessagesForMember(ctx, group.ID, member.ID, &models.OmniChatGroupMessageCursor{CreatedAt: firstPage[0].CreatedAt, ID: firstPage[0].ID}, 1)
	require.NoError(t, err)
	require.Len(t, secondPage, 1)
	require.NotEqual(t, firstPage[0].ID, secondPage[0].ID, "composite group cursors must not skip equal timestamps")

	openTokenDigest := sha256.Sum256([]byte("open-invite-token"))
	_, err = repo.CreateInvite(ctx, group.ID, owner.ID, nil, hex.EncodeToString(openTokenDigest[:]), 1, time.Now().Add(time.Hour))
	require.NoError(t, err)
	_, err = repo.AcceptInvite(ctx, hex.EncodeToString(openTokenDigest[:]), outsider.ID)
	require.NoError(t, err)
	_, err = repo.CreateUserMessage(ctx, group.ID, outsider.ID, "A message member later blocks", nil)
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx, `INSERT INTO blocked_users(blocker_id,blocked_id) VALUES($1,$2)`, member.ID, outsider.ID)
	require.NoError(t, err)
	filteredThread, err := repo.ListMessagesForMember(ctx, group.ID, member.ID, nil, 50)
	require.NoError(t, err)
	require.Len(t, filteredThread, 2, "blocked members' messages must be hidden from one another")
	outsiderRecipients, err := repo.ListMemberIDsForSender(ctx, group.ID, &outsider.ID)
	require.NoError(t, err)
	require.NotContains(t, outsiderRecipients, member.ID, "blocked members must not receive one another's websocket messages")

	accepted, err := repo.CreateUserMessage(ctx, group.ID, outsider.ID, "The blocked member should not see this", nil)
	require.NoError(t, err)
	require.NotNil(t, accepted, "a block between two non-owner members must not expel either member from the group")

	_, err = db.Pool.Exec(ctx, `INSERT INTO blocked_users(blocker_id,blocked_id) VALUES($1,$2)`, owner.ID, member.ID)
	require.NoError(t, err)
	blockedGroup, err := repo.GetGroupForMember(ctx, group.ID, member.ID)
	require.NoError(t, err)
	require.Nil(t, blockedGroup, "blocking must revoke direct group access even if a membership row remains")
	blockedThread, err := repo.ListMessagesForMember(ctx, group.ID, member.ID, nil, 50)
	require.NoError(t, err)
	require.Nil(t, blockedThread)
	blockedMessage, err := repo.CreateUserMessage(ctx, group.ID, member.ID, "I should no longer be here", nil)
	require.NoError(t, err)
	require.Nil(t, blockedMessage)
	recipients, err := repo.ListMemberIDsForSender(ctx, group.ID, nil)
	require.NoError(t, err)
	require.NotContains(t, recipients, member.ID, "blocked members must not receive websocket fan-out")
}

func TestOmniChatGroupRepositoryRechecksPersonaAccess(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "om_group_persona_owner", PasswordHash: "hash", Role: "user"}
	foreignOwner := &models.User{Username: "om_group_persona_foreign", PasswordHash: "hash", Role: "user"}
	for _, user := range []*models.User{owner, foreignOwner} {
		require.NoError(t, users.Create(ctx, user))
	}

	var personaID, foreignPublicPersonaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug,name,category,system_prompt,visibility,source_format,is_active)
		VALUES ('group-access-sadie','Sadie','original','Stay in character.','public','native',TRUE) RETURNING id
	`).Scan(&personaID))
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug,name,category,system_prompt,owner_user_id,visibility,source_format,is_active)
		VALUES ('group-access-foreign','Foreign','original','Stay in character.',$1,'public','native',TRUE) RETURNING id
	`, foreignOwner.ID).Scan(&foreignPublicPersonaID))

	repo := models.NewOmniChatGroupRepository(db.Pool)
	foreignGroup, err := repo.CreateGroup(ctx, owner.ID, "Foreign character", "Must be rejected", []int{foreignPublicPersonaID})
	require.NoError(t, err)
	require.Nil(t, foreignGroup, "another user's custom character must not become accessible merely by being marked public")

	group, err := repo.CreateGroup(ctx, owner.ID, "Lifecycle", "Access is rechecked", []int{personaID})
	require.NoError(t, err)
	require.NotNil(t, group)

	_, err = db.Pool.Exec(ctx, `UPDATE bot_personas SET is_active=FALSE WHERE id=$1`, personaID)
	require.NoError(t, err)
	personas, err := repo.ListGroupPersonas(ctx, group.ID)
	require.NoError(t, err)
	require.Empty(t, personas)
	persona, err := repo.GetPersonaInGroup(ctx, group.ID, personaID)
	require.NoError(t, err)
	require.Nil(t, persona)
	message, err := repo.CreatePersonaMessage(ctx, group.ID, personaID, "I should not be sent.", nil, false)
	require.NoError(t, err)
	require.Nil(t, message)

	_, err = db.Pool.Exec(ctx, `UPDATE bot_personas SET is_active=TRUE,owner_user_id=$1,visibility='private' WHERE id=$2`, foreignOwner.ID, personaID)
	require.NoError(t, err)
	personas, err = repo.ListGroupPersonas(ctx, group.ID)
	require.NoError(t, err)
	require.Empty(t, personas)
	persona, err = repo.GetPersonaInGroup(ctx, group.ID, personaID)
	require.NoError(t, err)
	require.Nil(t, persona)
	message, err = repo.CreatePersonaMessage(ctx, group.ID, personaID, "I still should not be sent.", nil, false)
	require.NoError(t, err)
	require.Nil(t, message)
}

func digestBytesForTest(value string) []byte {
	digest := sha256.Sum256([]byte(value))
	return digest[:]
}
