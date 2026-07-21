package models

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type OmniChatGroup struct {
	ID            uuid.UUID               `json:"id"`
	OwnerUserID   int                     `json:"owner_user_id"`
	Name          string                  `json:"name"`
	Description   string                  `json:"description"`
	AvatarURL     *string                 `json:"avatar_url,omitempty"`
	Visibility    string                  `json:"visibility"`
	ViewerRole    string                  `json:"viewer_role"`
	Members       []*OmniChatGroupMember  `json:"members"`
	Personas      []*OmniChatGroupPersona `json:"personas"`
	CreatedAt     time.Time               `json:"created_at"`
	UpdatedAt     time.Time               `json:"updated_at"`
	LastMessageAt time.Time               `json:"last_message_at"`
}

type OmniChatGroupMember struct {
	UserID    int       `json:"user_id"`
	Username  string    `json:"username"`
	AvatarURL *string   `json:"avatar_url,omitempty"`
	Role      string    `json:"role"`
	JoinedAt  time.Time `json:"joined_at"`
}

type OmniChatGroupPersona struct {
	PersonaID    int       `json:"persona_id"`
	Name         string    `json:"name"`
	AvatarURL    *string   `json:"avatar_url,omitempty"`
	DisplayOrder int       `json:"display_order"`
	JoinedAt     time.Time `json:"joined_at"`
}

type OmniChatGroupMessage struct {
	ID              uuid.UUID  `json:"id"`
	GroupID         uuid.UUID  `json:"group_id"`
	SenderType      string     `json:"sender_type"`
	SenderUserID    *int       `json:"sender_user_id,omitempty"`
	SenderPersonaID *int       `json:"sender_persona_id,omitempty"`
	SenderName      string     `json:"sender_name"`
	SenderAvatarURL *string    `json:"sender_avatar_url,omitempty"`
	ReplyToID       *uuid.UUID `json:"reply_to_id,omitempty"`
	Content         string     `json:"content"`
	Failed          bool       `json:"failed"`
	CreatedAt       time.Time  `json:"created_at"`
}

type OmniChatGroupInvite struct {
	ID            uuid.UUID `json:"id"`
	GroupID       uuid.UUID `json:"group_id"`
	InviteeUserID *int      `json:"invitee_user_id,omitempty"`
	MaxUses       int       `json:"max_uses"`
	UseCount      int       `json:"use_count"`
	ExpiresAt     time.Time `json:"expires_at"`
	CreatedAt     time.Time `json:"created_at"`
}

type OmniChatGroupMessageCursor struct {
	CreatedAt time.Time
	ID        uuid.UUID
}

type OmniChatGroupCursor struct {
	LastMessageAt time.Time
	ID            uuid.UUID
}

type OmniChatGroupRepository struct{ pool *pgxpool.Pool }

func NewOmniChatGroupRepository(pool *pgxpool.Pool) *OmniChatGroupRepository {
	return &OmniChatGroupRepository{pool: pool}
}

func (r *OmniChatGroupRepository) CreateGroup(ctx context.Context, ownerUserID int, name, description string, personaIDs []int) (*OmniChatGroup, error) {
	if len(personaIDs) > 10 {
		return nil, nil
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	groupID := uuid.New()
	_, err = tx.Exec(ctx, `INSERT INTO omnichat_groups (id,owner_user_id,name,description) VALUES ($1,$2,$3,$4)`, groupID, ownerUserID, name, description)
	if err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO omnichat_group_members (group_id,user_id,role) VALUES ($1,$2,'owner')`, groupID, ownerUserID); err != nil {
		return nil, err
	}
	if len(personaIDs) > 0 {
		rows, err := tx.Query(ctx, `
			SELECT id FROM bot_personas WHERE id=ANY($1) AND is_active=TRUE
			AND ((owner_user_id IS NULL AND visibility='public') OR owner_user_id=$2)
			ORDER BY array_position($1::int[], id)
		`, personaIDs, ownerUserID)
		if err != nil {
			return nil, err
		}
		validated := make([]int, 0, len(personaIDs))
		for rows.Next() {
			var id int
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return nil, err
			}
			validated = append(validated, id)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
		if len(validated) != len(personaIDs) {
			return nil, nil
		}
		for position, personaID := range validated {
			if _, err := tx.Exec(ctx, `INSERT INTO omnichat_group_personas (group_id,persona_id,added_by,display_order) VALUES ($1,$2,$3,$4)`, groupID, personaID, ownerUserID, position); err != nil {
				return nil, err
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.GetGroupForMember(ctx, groupID, ownerUserID)
}

func (r *OmniChatGroupRepository) GetGroupForMember(ctx context.Context, groupID uuid.UUID, userID int) (*OmniChatGroup, error) {
	group := &OmniChatGroup{ID: groupID}
	err := r.pool.QueryRow(ctx, `
		SELECT g.owner_user_id,g.name,g.description,g.avatar_url,g.visibility,m.role,g.created_at,g.updated_at,g.last_message_at
		FROM omnichat_groups g JOIN omnichat_group_members m ON m.group_id=g.id AND m.user_id=$2
		WHERE g.id=$1 AND g.archived_at IS NULL
		  AND NOT EXISTS (SELECT 1 FROM blocked_users bu WHERE
			(bu.blocker_id=$2 AND bu.blocked_id=g.owner_user_id) OR
			(bu.blocker_id=g.owner_user_id AND bu.blocked_id=$2))
	`, groupID, userID).Scan(&group.OwnerUserID, &group.Name, &group.Description, &group.AvatarURL, &group.Visibility, &group.ViewerRole, &group.CreatedAt, &group.UpdatedAt, &group.LastMessageAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	group.Members, err = r.listMembers(ctx, groupID, userID)
	if err != nil {
		return nil, err
	}
	group.Personas, err = r.ListGroupPersonas(ctx, groupID)
	return group, err
}

func (r *OmniChatGroupRepository) ListGroupsForUser(ctx context.Context, userID int, before *OmniChatGroupCursor, limit int) ([]*OmniChatGroup, error) {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	var beforeTime *time.Time
	var beforeID *uuid.UUID
	if before != nil {
		beforeTime = &before.LastMessageAt
		beforeID = &before.ID
	}
	rows, err := r.pool.Query(ctx, `
		SELECT g.id,g.owner_user_id,g.name,g.description,g.avatar_url,g.visibility,m.role,g.created_at,g.updated_at,g.last_message_at
		FROM omnichat_groups g JOIN omnichat_group_members m ON m.group_id=g.id AND m.user_id=$1
		WHERE g.archived_at IS NULL
		  AND ($2::timestamptz IS NULL OR (g.last_message_at,g.id) < ($2,$3))
		  AND NOT EXISTS (SELECT 1 FROM blocked_users bu WHERE
			(bu.blocker_id=$1 AND bu.blocked_id=g.owner_user_id) OR
			(bu.blocker_id=g.owner_user_id AND bu.blocked_id=$1))
		ORDER BY g.last_message_at DESC,g.id DESC LIMIT $4
	`, userID, beforeTime, beforeID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	groups := make([]*OmniChatGroup, 0, limit)
	for rows.Next() {
		group := &OmniChatGroup{}
		if err := rows.Scan(&group.ID, &group.OwnerUserID, &group.Name, &group.Description, &group.AvatarURL, &group.Visibility, &group.ViewerRole, &group.CreatedAt, &group.UpdatedAt, &group.LastMessageAt); err != nil {
			return nil, err
		}
		groups = append(groups, group)
	}
	return groups, rows.Err()
}

func (r *OmniChatGroupRepository) listMembers(ctx context.Context, groupID uuid.UUID, viewerUserID int) ([]*OmniChatGroupMember, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT m.user_id,u.username,u.avatar_url,m.role,m.joined_at FROM omnichat_group_members m
		JOIN users u ON u.id=m.user_id JOIN omnichat_groups g ON g.id=m.group_id
		WHERE m.group_id=$1 AND (m.user_id=$2 OR NOT EXISTS (SELECT 1 FROM blocked_users bu WHERE
			(bu.blocker_id=m.user_id AND bu.blocked_id=$2) OR
			(bu.blocker_id=$2 AND bu.blocked_id=m.user_id)))
		AND NOT EXISTS (SELECT 1 FROM blocked_users bu WHERE
			(bu.blocker_id=m.user_id AND bu.blocked_id=g.owner_user_id) OR
			(bu.blocker_id=g.owner_user_id AND bu.blocked_id=m.user_id))
		ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,m.joined_at
	`, groupID, viewerUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	members := make([]*OmniChatGroupMember, 0)
	for rows.Next() {
		member := &OmniChatGroupMember{}
		if err := rows.Scan(&member.UserID, &member.Username, &member.AvatarURL, &member.Role, &member.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, member)
	}
	return members, rows.Err()
}

func (r *OmniChatGroupRepository) ListGroupPersonas(ctx context.Context, groupID uuid.UUID) ([]*OmniChatGroupPersona, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT gp.persona_id,p.name,p.avatar_url,gp.display_order,gp.joined_at
		FROM omnichat_group_personas gp
		JOIN omnichat_groups g ON g.id=gp.group_id
		JOIN bot_personas p ON p.id=gp.persona_id
		WHERE gp.group_id=$1 AND p.is_active=TRUE
		  AND ((p.owner_user_id IS NULL AND p.visibility='public') OR p.owner_user_id=g.owner_user_id)
		ORDER BY gp.display_order
	`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	personas := make([]*OmniChatGroupPersona, 0)
	for rows.Next() {
		persona := &OmniChatGroupPersona{}
		if err := rows.Scan(&persona.PersonaID, &persona.Name, &persona.AvatarURL, &persona.DisplayOrder, &persona.JoinedAt); err != nil {
			return nil, err
		}
		personas = append(personas, persona)
	}
	return personas, rows.Err()
}

func (r *OmniChatGroupRepository) CreateInvite(ctx context.Context, groupID uuid.UUID, creatorUserID int, inviteeUserID *int, tokenDigest string, maxUses int, expiresAt time.Time) (*OmniChatGroupInvite, error) {
	invite := &OmniChatGroupInvite{ID: uuid.New(), GroupID: groupID, InviteeUserID: inviteeUserID, MaxUses: maxUses, ExpiresAt: expiresAt}
	err := r.pool.QueryRow(ctx, `
		INSERT INTO omnichat_group_invites (id,group_id,created_by,invitee_user_id,token_digest,max_uses,expires_at)
		SELECT $1,$2,$3,$4,$5,$6,$7
		FROM omnichat_group_members m
		JOIN omnichat_groups g ON g.id=m.group_id
		WHERE m.group_id=$2 AND m.user_id=$3 AND m.role IN ('owner','admin')
		  AND g.archived_at IS NULL
		  AND ($4::int IS NULL OR EXISTS (
			SELECT 1 FROM users invitee
			WHERE invitee.id=$4 AND invitee.deleted=FALSE AND invitee.banned=FALSE
			  AND NOT EXISTS (
				SELECT 1 FROM blocked_users bu
				WHERE (bu.blocker_id=$4 AND bu.blocked_id=g.owner_user_id)
				   OR (bu.blocker_id=g.owner_user_id AND bu.blocked_id=$4)
			  )
		  ))
		RETURNING use_count,created_at
	`, invite.ID, groupID, creatorUserID, inviteeUserID, tokenDigest, maxUses, expiresAt).Scan(&invite.UseCount, &invite.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return invite, err
}

func (r *OmniChatGroupRepository) AcceptInvite(ctx context.Context, tokenDigest string, userID int) (*OmniChatGroup, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var groupID uuid.UUID
	var invitee *int
	err = tx.QueryRow(ctx, `SELECT group_id,invitee_user_id FROM omnichat_group_invites WHERE token_digest=$1 AND revoked_at IS NULL AND expires_at>NOW() AND use_count<max_uses FOR UPDATE`, tokenDigest).Scan(&groupID, &invitee)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if invitee != nil && *invitee != userID {
		return nil, nil
	}
	var ownerID, memberCount int
	if err = tx.QueryRow(ctx, `
		SELECT g.owner_user_id,(SELECT COUNT(*) FROM omnichat_group_members m WHERE m.group_id=g.id)
		FROM omnichat_groups g WHERE g.id=$1 AND g.archived_at IS NULL FOR UPDATE
	`, groupID).Scan(&ownerID, &memberCount); err != nil {
		return nil, err
	}
	if memberCount >= 50 {
		return nil, nil
	}
	var blocked bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM blocked_users WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1))`, userID, ownerID).Scan(&blocked); err != nil {
		return nil, err
	}
	if blocked {
		return nil, nil
	}
	tag, err := tx.Exec(ctx, `INSERT INTO omnichat_group_members (group_id,user_id,role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING`, groupID, userID)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() > 0 {
		if _, err = tx.Exec(ctx, `UPDATE omnichat_group_invites SET use_count=use_count+1 WHERE token_digest=$1`, tokenDigest); err != nil {
			return nil, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.GetGroupForMember(ctx, groupID, userID)
}

func (r *OmniChatGroupRepository) CreateUserMessage(ctx context.Context, groupID uuid.UUID, userID int, content string, replyToID *uuid.UUID) (*OmniChatGroupMessage, error) {
	message := &OmniChatGroupMessage{ID: uuid.New(), GroupID: groupID, SenderType: "user", SenderUserID: &userID, ReplyToID: replyToID, Content: content}
	err := r.pool.QueryRow(ctx, `
		WITH inserted AS (INSERT INTO omnichat_group_messages(id,group_id,sender_type,sender_user_id,reply_to_id,content)
		SELECT $1,$2,'user',$3,$4,$5 FROM omnichat_group_members m JOIN omnichat_groups g ON g.id=m.group_id
		WHERE m.group_id=$2 AND m.user_id=$3 AND g.archived_at IS NULL
		  AND NOT EXISTS (SELECT 1 FROM blocked_users bu WHERE
			(bu.blocker_id=$3 AND bu.blocked_id=g.owner_user_id) OR
			(bu.blocker_id=g.owner_user_id AND bu.blocked_id=$3))
		RETURNING created_at)
		SELECT i.created_at,u.username,u.avatar_url FROM inserted i JOIN users u ON u.id=$3
	`, message.ID, groupID, userID, replyToID, content).Scan(&message.CreatedAt, &message.SenderName, &message.SenderAvatarURL)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_, err = r.pool.Exec(ctx, `UPDATE omnichat_groups SET last_message_at=NOW(),updated_at=NOW() WHERE id=$1`, groupID)
	return message, err
}

func (r *OmniChatGroupRepository) CreatePersonaMessage(ctx context.Context, groupID uuid.UUID, personaID int, content string, replyToID *uuid.UUID, failed bool) (*OmniChatGroupMessage, error) {
	message := &OmniChatGroupMessage{ID: uuid.New(), GroupID: groupID, SenderType: "persona", SenderPersonaID: &personaID, ReplyToID: replyToID, Content: content, Failed: failed}
	err := r.pool.QueryRow(ctx, `
		WITH inserted AS (INSERT INTO omnichat_group_messages(id,group_id,sender_type,sender_persona_id,reply_to_id,content,failed)
		SELECT $1,$2,'persona',$3,$4,$5,$6
		FROM omnichat_group_personas gp
		JOIN omnichat_groups g ON g.id=gp.group_id
		JOIN bot_personas p ON p.id=gp.persona_id
		WHERE gp.group_id=$2 AND gp.persona_id=$3 AND g.archived_at IS NULL AND p.is_active=TRUE
		  AND ((p.owner_user_id IS NULL AND p.visibility='public') OR p.owner_user_id=g.owner_user_id)
		RETURNING created_at)
		SELECT i.created_at,p.name,p.avatar_url FROM inserted i JOIN bot_personas p ON p.id=$3
	`, message.ID, groupID, personaID, replyToID, content, failed).Scan(&message.CreatedAt, &message.SenderName, &message.SenderAvatarURL)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_, err = r.pool.Exec(ctx, `UPDATE omnichat_groups SET last_message_at=NOW(),updated_at=NOW() WHERE id=$1`, groupID)
	return message, err
}

func (r *OmniChatGroupRepository) ListMessagesForMember(ctx context.Context, groupID uuid.UUID, userID int, before *OmniChatGroupMessageCursor, limit int) ([]*OmniChatGroupMessage, error) {
	if limit < 1 || limit > 200 {
		limit = 100
	}
	var member bool
	if err := r.pool.QueryRow(ctx, `SELECT EXISTS(
		SELECT 1 FROM omnichat_group_members m JOIN omnichat_groups g ON g.id=m.group_id
		WHERE m.group_id=$1 AND m.user_id=$2 AND g.archived_at IS NULL
		  AND NOT EXISTS (SELECT 1 FROM blocked_users bu WHERE
			(bu.blocker_id=$2 AND bu.blocked_id=g.owner_user_id) OR
			(bu.blocker_id=g.owner_user_id AND bu.blocked_id=$2))
	)`, groupID, userID).Scan(&member); err != nil {
		return nil, err
	}
	if !member {
		return nil, nil
	}
	var beforeTime *time.Time
	var beforeID *uuid.UUID
	if before != nil {
		beforeTime = &before.CreatedAt
		beforeID = &before.ID
	}
	rows, err := r.pool.Query(ctx, `
		SELECT gm.id,gm.group_id,gm.sender_type,gm.sender_user_id,gm.sender_persona_id,
		COALESCE(u.username,p.name,'System'),COALESCE(u.avatar_url,p.avatar_url),gm.reply_to_id,gm.content,gm.failed,gm.created_at
		FROM omnichat_group_messages gm
		JOIN omnichat_group_members viewer ON viewer.group_id=gm.group_id AND viewer.user_id=$2
		JOIN omnichat_groups g ON g.id=gm.group_id AND g.archived_at IS NULL
		LEFT JOIN users u ON u.id=gm.sender_user_id LEFT JOIN bot_personas p ON p.id=gm.sender_persona_id
		WHERE gm.group_id=$1 AND gm.deleted_at IS NULL
		  AND NOT EXISTS (SELECT 1 FROM blocked_users owner_block WHERE
			(owner_block.blocker_id=$2 AND owner_block.blocked_id=g.owner_user_id) OR
			(owner_block.blocker_id=g.owner_user_id AND owner_block.blocked_id=$2))
		  AND ($3::timestamptz IS NULL OR (gm.created_at,gm.id)<($3,$4))
		  AND (gm.sender_user_id IS NULL OR gm.sender_user_id=$2 OR NOT EXISTS (
			SELECT 1 FROM blocked_users bu WHERE
			(bu.blocker_id=$2 AND bu.blocked_id=gm.sender_user_id) OR
			(bu.blocker_id=gm.sender_user_id AND bu.blocked_id=$2)
		  ))
		ORDER BY gm.created_at DESC,gm.id DESC LIMIT $5
	`, groupID, userID, beforeTime, beforeID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	messages := make([]*OmniChatGroupMessage, 0, limit)
	for rows.Next() {
		m := &OmniChatGroupMessage{}
		if err := rows.Scan(&m.ID, &m.GroupID, &m.SenderType, &m.SenderUserID, &m.SenderPersonaID, &m.SenderName, &m.SenderAvatarURL, &m.ReplyToID, &m.Content, &m.Failed, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	return messages, nil
}

func (r *OmniChatGroupRepository) ListMemberIDsForSender(ctx context.Context, groupID uuid.UUID, senderUserID *int) ([]int, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT m.user_id FROM omnichat_group_members m JOIN omnichat_groups g ON g.id=m.group_id
		WHERE m.group_id=$1 AND g.archived_at IS NULL
		  AND ($2::int IS NULL OR m.user_id=$2 OR NOT EXISTS (SELECT 1 FROM blocked_users sender_block WHERE
			(sender_block.blocker_id=m.user_id AND sender_block.blocked_id=$2) OR
			(sender_block.blocker_id=$2 AND sender_block.blocked_id=m.user_id)))
		  AND NOT EXISTS (SELECT 1 FROM blocked_users bu WHERE
			(bu.blocker_id=m.user_id AND bu.blocked_id=g.owner_user_id) OR
			(bu.blocker_id=g.owner_user_id AND bu.blocked_id=m.user_id))
	`, groupID, senderUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int{}
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *OmniChatGroupRepository) GetPersonaInGroup(ctx context.Context, groupID uuid.UUID, personaID int) (*BotPersona, error) {
	persona, err := scanBotPersona(r.pool.QueryRow(ctx, `
		SELECT `+qualifySelectColumns("p", botPersonaSelectColumns)+`
		FROM bot_personas p
		JOIN omnichat_group_personas gp ON gp.persona_id=p.id
		JOIN omnichat_groups g ON g.id=gp.group_id
		WHERE gp.group_id=$1 AND p.id=$2 AND g.archived_at IS NULL AND p.is_active=TRUE
		  AND ((p.owner_user_id IS NULL AND p.visibility='public') OR p.owner_user_id=g.owner_user_id)
	`, groupID, personaID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return persona, err
}
