package models

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Conversation represents a 1-on-1 chat between two users, a mod mail thread, or a group conversation
type Conversation struct {
	ID               int        `json:"id"`
	User1ID          *int       `json:"user1_id,omitempty"` // NULL for mod_mail and group
	User2ID          *int       `json:"user2_id,omitempty"` // NULL for mod_mail and group
	User1            *User      `json:"user1,omitempty"`    // Optional populated user info
	User2            *User      `json:"user2,omitempty"`    // Optional populated user info
	CreatedAt        time.Time  `json:"created_at"`
	LastMessageAt    time.Time  `json:"last_message_at"`
	ConversationType string     `json:"conversation_type"` // 'dm', 'mod_mail', or 'group'
	HubID            *int       `json:"hub_id,omitempty"`  // For mod_mail conversations
	Subject          *string    `json:"subject,omitempty"` // For mod_mail conversations
	Status           *string    `json:"status,omitempty"`  // For mod_mail: 'open', 'archived', 'resolved'
	ArchivedAt       *time.Time `json:"archived_at"`       // When conversation was archived (explicit null when active)
	ArchivedBy       *int       `json:"archived_by"`       // User who archived it (explicit null when active)
	Muted            bool       `json:"muted"`             // Whether this conversation is muted for current user

	// Phase 2 features
	User1AutoDeleteAfter *time.Duration `json:"user1_auto_delete_after,omitempty"`
	User2AutoDeleteAfter *time.Duration `json:"user2_auto_delete_after,omitempty"`
	User1Pseudonym       *string `json:"user1_pseudonym,omitempty"`
	User2Pseudonym       *string `json:"user2_pseudonym,omitempty"`

	// Group conversation fields (populated when conversation_type = 'group')
	IsGroup          bool    `json:"is_group"`
	GroupName        *string `json:"group_name,omitempty"`
	GroupAvatarURL   *string `json:"group_avatar_url,omitempty"`
	GroupDescription *string `json:"group_description,omitempty"`
	CurrentUserRole  *string `json:"current_user_role,omitempty"` // computed: role of requesting user
	ParticipantCount *int    `json:"participant_count,omitempty"` // computed
}

// ConversationRepository handles database operations for conversations
type ConversationRepository struct {
	pool *pgxpool.Pool
}

// NewConversationRepository creates a new conversation repository
func NewConversationRepository(pool *pgxpool.Pool) *ConversationRepository {
	return &ConversationRepository{pool: pool}
}

// Create creates a new conversation between two users
// Ensures user1_id < user2_id for uniqueness
// Re-adds users if they previously deleted the conversation
func (r *ConversationRepository) Create(ctx context.Context, user1ID, user2ID int) (*Conversation, error) {
	// Ensure user1_id < user2_id
	if user1ID > user2ID {
		user1ID, user2ID = user2ID, user1ID
	}

	conversation := &Conversation{
		User1ID:          &user1ID,
		User2ID:          &user2ID,
		ConversationType: "dm",
	}

	query := `
		INSERT INTO conversations (user1_id, user2_id)
		VALUES ($1, $2)
		ON CONFLICT (user1_id, user2_id) DO UPDATE
		SET last_message_at = CURRENT_TIMESTAMP,
		    deleted_for_user1 = FALSE,
		    deleted_for_user2 = FALSE
		RETURNING id, created_at, last_message_at
	`

	err := r.pool.QueryRow(ctx, query, user1ID, user2ID).Scan(
		&conversation.ID,
		&conversation.CreatedAt,
		&conversation.LastMessageAt,
	)

	return conversation, err
}

// GetByID retrieves a conversation by its ID
func (r *ConversationRepository) GetByID(ctx context.Context, id int) (*Conversation, error) {
	conversation := &Conversation{}

	query := `
		SELECT id, user1_id, user2_id, created_at, last_message_at,
		       user1_auto_delete_after, user2_auto_delete_after,
		       user1_pseudonym, user2_pseudonym
		FROM conversations
		WHERE id = $1
	`

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&conversation.ID,
		&conversation.User1ID,
		&conversation.User2ID,
		&conversation.CreatedAt,
		&conversation.LastMessageAt,
		&conversation.User1AutoDeleteAfter,
		&conversation.User2AutoDeleteAfter,
		&conversation.User1Pseudonym,
		&conversation.User2Pseudonym,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return conversation, nil
}

// GetByUsers retrieves or creates a conversation between two users
func (r *ConversationRepository) GetByUsers(ctx context.Context, user1ID, user2ID int) (*Conversation, error) {
	// Ensure user1_id < user2_id
	if user1ID > user2ID {
		user1ID, user2ID = user2ID, user1ID
	}

	conversation := &Conversation{}

	query := `
		SELECT id, user1_id, user2_id, created_at, last_message_at,
		       user1_auto_delete_after, user2_auto_delete_after,
		       user1_pseudonym, user2_pseudonym
		FROM conversations
		WHERE user1_id = $1 AND user2_id = $2
	`

	err := r.pool.QueryRow(ctx, query, user1ID, user2ID).Scan(
		&conversation.ID,
		&conversation.User1ID,
		&conversation.User2ID,
		&conversation.CreatedAt,
		&conversation.LastMessageAt,
		&conversation.User1AutoDeleteAfter,
		&conversation.User2AutoDeleteAfter,
		&conversation.User1Pseudonym,
		&conversation.User2Pseudonym,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return conversation, nil
}

// GetByUserID retrieves all conversations for a specific user
// includeArchived: if true, includes archived conversations
func (r *ConversationRepository) GetByUserID(ctx context.Context, userID int, limit, offset int, includeArchived bool) ([]*Conversation, error) {
	query := `
		SELECT conversations.id, conversations.user1_id, conversations.user2_id, conversations.created_at, conversations.last_message_at,
		       user1_auto_delete_after, user2_auto_delete_after,
		       user1_pseudonym, user2_pseudonym,
		       conversation_type, hub_id, subject, status, archived_at, archived_by,
		       COALESCE(cns.muted, false) AS muted,
		       COALESCE(conversations.is_group, false) AS is_group,
		       conversations.group_name, conversations.group_avatar_url, conversations.group_description,
		       cp_me.role AS current_user_role,
		       (SELECT COUNT(*) FROM conversation_participants cp2 WHERE cp2.conversation_id = conversations.id) AS participant_count
		FROM conversations
		LEFT JOIN conversation_notification_settings cns
		       ON cns.conversation_id = conversations.id AND cns.user_id = $1
		LEFT JOIN conversation_participants cp_me
		       ON cp_me.conversation_id = conversations.id AND cp_me.user_id = $1
		WHERE (
			-- DM conversations (including legacy conversations with NULL conversation_type)
			(
				(conversation_type = 'dm' OR conversation_type IS NULL) AND
				(user1_id = $1 OR user2_id = $1) AND
				NOT ((user1_id = $1 AND deleted_for_user1 = TRUE) OR (user2_id = $1 AND deleted_for_user2 = TRUE))
			)
			OR
			-- Mod mail conversations where user is a participant but NOT a moderator
			(conversation_type = 'mod_mail' AND conversations.id IN (
				SELECT conversation_id
				FROM conversation_participants
				WHERE user_id = $1 AND is_moderator = FALSE
			))
			OR
			-- Group conversations where user is a participant
			(conversation_type = 'group' AND conversations.id IN (
				SELECT conversation_id
				FROM conversation_participants
				WHERE user_id = $1
			))
		)
	`

	if !includeArchived {
		query += ` AND (
			(conversation_type = 'dm' AND NOT (
				(user1_id = $1 AND archived_for_user1 = TRUE) OR
				(user2_id = $1 AND archived_for_user2 = TRUE) OR
				archived_at IS NOT NULL
			))
			OR (conversation_type = 'mod_mail' AND archived_at IS NULL)
			OR (conversation_type = 'group' AND archived_at IS NULL)
		)`
	}

	query += ` ORDER BY conversations.last_message_at DESC LIMIT $2 OFFSET $3`

	rows, err := r.pool.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conversations []*Conversation
	for rows.Next() {
		conversation := &Conversation{}

		err := rows.Scan(
			&conversation.ID,
			&conversation.User1ID,
			&conversation.User2ID,
			&conversation.CreatedAt,
			&conversation.LastMessageAt,
			&conversation.User1AutoDeleteAfter,
			&conversation.User2AutoDeleteAfter,
			&conversation.User1Pseudonym,
			&conversation.User2Pseudonym,
			&conversation.ConversationType,
			&conversation.HubID,
			&conversation.Subject,
			&conversation.Status,
			&conversation.ArchivedAt,
			&conversation.ArchivedBy,
			&conversation.Muted,
			&conversation.IsGroup,
			&conversation.GroupName,
			&conversation.GroupAvatarURL,
			&conversation.GroupDescription,
			&conversation.CurrentUserRole,
			&conversation.ParticipantCount,
		)
		if err != nil {
			return nil, err
		}
		conversations = append(conversations, conversation)
	}

	return conversations, rows.Err()
}

// GetByUserIDWithCursor retrieves conversations using cursor pagination (by last_message_at desc).
func (r *ConversationRepository) GetByUserIDWithCursor(
	ctx context.Context,
	userID int,
	limit int,
	includeArchived bool,
	cursor *TimeCursor,
) ([]*Conversation, error) {
	query := `
		SELECT conversations.id, conversations.user1_id, conversations.user2_id, conversations.created_at, conversations.last_message_at,
		       user1_auto_delete_after, user2_auto_delete_after,
		       user1_pseudonym, user2_pseudonym,
		       conversation_type, hub_id, subject, status, archived_at, archived_by,
		       COALESCE(cns.muted, false) AS muted,
		       COALESCE(conversations.is_group, false) AS is_group,
		       conversations.group_name, conversations.group_avatar_url, conversations.group_description,
		       cp_me.role AS current_user_role,
		       (SELECT COUNT(*) FROM conversation_participants cp2 WHERE cp2.conversation_id = conversations.id) AS participant_count
		FROM conversations
		LEFT JOIN conversation_notification_settings cns
		       ON cns.conversation_id = conversations.id AND cns.user_id = $1
		LEFT JOIN conversation_participants cp_me
		       ON cp_me.conversation_id = conversations.id AND cp_me.user_id = $1
		WHERE (
			(
				(conversation_type = 'dm' OR conversation_type IS NULL) AND
				(user1_id = $1 OR user2_id = $1) AND
				NOT ((user1_id = $1 AND deleted_for_user1 = TRUE) OR (user2_id = $1 AND deleted_for_user2 = TRUE))
			)
			OR
			(conversation_type = 'mod_mail' AND conversations.id IN (
				SELECT conversation_id
				FROM conversation_participants
				WHERE user_id = $1 AND is_moderator = FALSE
			))
			OR
			(conversation_type = 'group' AND conversations.id IN (
				SELECT conversation_id
				FROM conversation_participants
				WHERE user_id = $1
			))
		)
	`

	args := []interface{}{userID}
	paramIdx := 2

	if !includeArchived {
		query += ` AND (
			(conversation_type = 'dm' AND NOT (
				(user1_id = $1 AND archived_for_user1 = TRUE) OR
				(user2_id = $1 AND archived_for_user2 = TRUE) OR
				archived_at IS NOT NULL
			))
			OR (conversation_type = 'mod_mail' AND archived_at IS NULL)
			OR (conversation_type = 'group' AND archived_at IS NULL)
		)`
	}

	if cursor != nil {
		query += fmt.Sprintf(" AND (conversations.last_message_at, conversations.id) < ($%d, $%d)", paramIdx, paramIdx+1)
		args = append(args, cursor.Timestamp, cursor.ID)
		paramIdx += 2
	}

	query += fmt.Sprintf(" ORDER BY conversations.last_message_at DESC, conversations.id DESC LIMIT $%d", paramIdx)
	args = append(args, limit)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conversations []*Conversation
	for rows.Next() {
		conversation := &Conversation{}

		err := rows.Scan(
			&conversation.ID,
			&conversation.User1ID,
			&conversation.User2ID,
			&conversation.CreatedAt,
			&conversation.LastMessageAt,
			&conversation.User1AutoDeleteAfter,
			&conversation.User2AutoDeleteAfter,
			&conversation.User1Pseudonym,
			&conversation.User2Pseudonym,
			&conversation.ConversationType,
			&conversation.HubID,
			&conversation.Subject,
			&conversation.Status,
			&conversation.ArchivedAt,
			&conversation.ArchivedBy,
			&conversation.Muted,
			&conversation.IsGroup,
			&conversation.GroupName,
			&conversation.GroupAvatarURL,
			&conversation.GroupDescription,
			&conversation.CurrentUserRole,
			&conversation.ParticipantCount,
		)
		if err != nil {
			return nil, err
		}
		conversations = append(conversations, conversation)
	}

	return conversations, rows.Err()
}

// GetArchivedByUserID retrieves only archived conversations for a specific user.
func (r *ConversationRepository) GetArchivedByUserID(ctx context.Context, userID int, limit, offset int) ([]*Conversation, error) {
	query := `
		SELECT conversations.id, conversations.user1_id, conversations.user2_id, conversations.created_at, conversations.last_message_at,
		       user1_auto_delete_after, user2_auto_delete_after,
		       user1_pseudonym, user2_pseudonym,
		       conversation_type, hub_id, subject, status, archived_at, archived_by,
		       COALESCE(cns.muted, false) AS muted,
		       COALESCE(conversations.is_group, false) AS is_group,
		       conversations.group_name, conversations.group_avatar_url, conversations.group_description,
		       cp_me.role AS current_user_role,
		       (SELECT COUNT(*) FROM conversation_participants cp2 WHERE cp2.conversation_id = conversations.id) AS participant_count
		FROM conversations
		LEFT JOIN conversation_notification_settings cns
		       ON cns.conversation_id = conversations.id AND cns.user_id = $1
		LEFT JOIN conversation_participants cp_me
		       ON cp_me.conversation_id = conversations.id AND cp_me.user_id = $1
		WHERE (
			(
				(conversation_type = 'dm' OR conversation_type IS NULL) AND
				(user1_id = $1 OR user2_id = $1) AND
				NOT ((user1_id = $1 AND deleted_for_user1 = TRUE) OR (user2_id = $1 AND deleted_for_user2 = TRUE)) AND
				(
					(user1_id = $1 AND archived_for_user1 = TRUE) OR
					(user2_id = $1 AND archived_for_user2 = TRUE) OR
					archived_at IS NOT NULL
				)
			)
			OR
			(
				conversation_type = 'mod_mail' AND
				conversations.id IN (
					SELECT conversation_id
					FROM conversation_participants
					WHERE user_id = $1 AND is_moderator = FALSE
				) AND
				archived_at IS NOT NULL
			)
			OR
			(
				conversation_type = 'group' AND
				conversations.id IN (
					SELECT conversation_id
					FROM conversation_participants
					WHERE user_id = $1
				) AND
				archived_at IS NOT NULL
			)
		)
		ORDER BY conversations.last_message_at DESC, conversations.id DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conversations []*Conversation
	for rows.Next() {
		conversation := &Conversation{}
		err := rows.Scan(
			&conversation.ID,
			&conversation.User1ID,
			&conversation.User2ID,
			&conversation.CreatedAt,
			&conversation.LastMessageAt,
			&conversation.User1AutoDeleteAfter,
			&conversation.User2AutoDeleteAfter,
			&conversation.User1Pseudonym,
			&conversation.User2Pseudonym,
			&conversation.ConversationType,
			&conversation.HubID,
			&conversation.Subject,
			&conversation.Status,
			&conversation.ArchivedAt,
			&conversation.ArchivedBy,
			&conversation.Muted,
			&conversation.IsGroup,
			&conversation.GroupName,
			&conversation.GroupAvatarURL,
			&conversation.GroupDescription,
			&conversation.CurrentUserRole,
			&conversation.ParticipantCount,
		)
		if err != nil {
			return nil, err
		}
		conversations = append(conversations, conversation)
	}
	return conversations, rows.Err()
}

// GetArchivedByUserIDWithCursor retrieves only archived conversations using cursor pagination.
func (r *ConversationRepository) GetArchivedByUserIDWithCursor(
	ctx context.Context,
	userID int,
	limit int,
	cursor *TimeCursor,
) ([]*Conversation, error) {
	query := `
		SELECT conversations.id, conversations.user1_id, conversations.user2_id, conversations.created_at, conversations.last_message_at,
		       user1_auto_delete_after, user2_auto_delete_after,
		       user1_pseudonym, user2_pseudonym,
		       conversation_type, hub_id, subject, status, archived_at, archived_by,
		       COALESCE(cns.muted, false) AS muted,
		       COALESCE(conversations.is_group, false) AS is_group,
		       conversations.group_name, conversations.group_avatar_url, conversations.group_description,
		       cp_me.role AS current_user_role,
		       (SELECT COUNT(*) FROM conversation_participants cp2 WHERE cp2.conversation_id = conversations.id) AS participant_count
		FROM conversations
		LEFT JOIN conversation_notification_settings cns
		       ON cns.conversation_id = conversations.id AND cns.user_id = $1
		LEFT JOIN conversation_participants cp_me
		       ON cp_me.conversation_id = conversations.id AND cp_me.user_id = $1
		WHERE (
			(
				(conversation_type = 'dm' OR conversation_type IS NULL) AND
				(user1_id = $1 OR user2_id = $1) AND
				NOT ((user1_id = $1 AND deleted_for_user1 = TRUE) OR (user2_id = $1 AND deleted_for_user2 = TRUE)) AND
				(
					(user1_id = $1 AND archived_for_user1 = TRUE) OR
					(user2_id = $1 AND archived_for_user2 = TRUE) OR
					archived_at IS NOT NULL
				)
			)
			OR
			(
				conversation_type = 'mod_mail' AND
				conversations.id IN (
					SELECT conversation_id
					FROM conversation_participants
					WHERE user_id = $1 AND is_moderator = FALSE
				) AND
				archived_at IS NOT NULL
			)
			OR
			(
				conversation_type = 'group' AND
				conversations.id IN (
					SELECT conversation_id
					FROM conversation_participants
					WHERE user_id = $1
				) AND
				archived_at IS NOT NULL
			)
		)
	`

	args := []interface{}{userID}
	paramIdx := 2
	if cursor != nil {
		query += fmt.Sprintf(" AND (conversations.last_message_at, conversations.id) < ($%d, $%d)", paramIdx, paramIdx+1)
		args = append(args, cursor.Timestamp, cursor.ID)
		paramIdx += 2
	}

	query += fmt.Sprintf(" ORDER BY conversations.last_message_at DESC, conversations.id DESC LIMIT $%d", paramIdx)
	args = append(args, limit)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conversations []*Conversation
	for rows.Next() {
		conversation := &Conversation{}
		err := rows.Scan(
			&conversation.ID,
			&conversation.User1ID,
			&conversation.User2ID,
			&conversation.CreatedAt,
			&conversation.LastMessageAt,
			&conversation.User1AutoDeleteAfter,
			&conversation.User2AutoDeleteAfter,
			&conversation.User1Pseudonym,
			&conversation.User2Pseudonym,
			&conversation.ConversationType,
			&conversation.HubID,
			&conversation.Subject,
			&conversation.Status,
			&conversation.ArchivedAt,
			&conversation.ArchivedBy,
			&conversation.Muted,
			&conversation.IsGroup,
			&conversation.GroupName,
			&conversation.GroupAvatarURL,
			&conversation.GroupDescription,
			&conversation.CurrentUserRole,
			&conversation.ParticipantCount,
		)
		if err != nil {
			return nil, err
		}
		conversations = append(conversations, conversation)
	}
	return conversations, rows.Err()
}

// UpdateLastMessageAt updates the last_message_at timestamp
func (r *ConversationRepository) UpdateLastMessageAt(ctx context.Context, conversationID int) error {
	query := `UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, conversationID)
	return err
}

// Delete deletes a conversation and all its messages
func (r *ConversationRepository) Delete(ctx context.Context, conversationID int) error {
	query := `DELETE FROM conversations WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, conversationID)
	return err
}

// GetOtherUserID returns the ID of the other user in the conversation
// Returns 0 for mod_mail conversations (not applicable)
func (c *Conversation) GetOtherUserID(currentUserID int) int {
	if c.User1ID != nil && *c.User1ID == currentUserID && c.User2ID != nil {
		return *c.User2ID
	}
	if c.User1ID != nil {
		return *c.User1ID
	}
	return 0
}

// IsParticipant checks if a user is a participant in the conversation
// For DM conversations only (mod_mail uses conversation_participants table)
func (c *Conversation) IsParticipant(userID int) bool {
	return (c.User1ID != nil && *c.User1ID == userID) || (c.User2ID != nil && *c.User2ID == userID)
}

// Archive archives a conversation
// For DMs: sets archived_for_user1 or archived_for_user2 (per-user archiving)
// For mod_mail: sets status to 'archived', archived_at, and archived_by (conversation-level archiving)
func (r *ConversationRepository) Archive(ctx context.Context, conversationID int, userID int) error {
	// Get conversation to determine type and user position
	var conversationType string
	var user1ID, user2ID *int
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(conversation_type, 'dm') AS conversation_type, user1_id, user2_id
		FROM conversations
		WHERE id = $1
	`, conversationID).Scan(&conversationType, &user1ID, &user2ID)
	if err != nil {
		return err
	}

	if conversationType == "dm" || conversationType == "" {
		// For DMs: per-user archive
		var query string
		if user1ID != nil && *user1ID == userID {
			query = `UPDATE conversations SET archived_for_user1 = TRUE WHERE id = $1`
		} else if user2ID != nil && *user2ID == userID {
			query = `UPDATE conversations SET archived_for_user2 = TRUE WHERE id = $1`
		} else {
			return pgx.ErrNoRows // User is not a participant
		}
		result, err := r.pool.Exec(ctx, query, conversationID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return pgx.ErrNoRows
		}
		return nil
	} else if conversationType == "mod_mail" {
		// For mod_mail: conversation-level archive
		query := `
			UPDATE conversations
			SET archived_at = CURRENT_TIMESTAMP,
			    archived_by = $2,
			    status = 'archived'::varchar
			WHERE id = $1
		`
		_, err := r.pool.Exec(ctx, query, conversationID, userID)
		return err
	}

	return nil
}

// ArchiveBatch archives multiple conversations for a user in a single transaction.
// If any conversation is invalid or unauthorized, no updates are committed.
func (r *ConversationRepository) ArchiveBatch(ctx context.Context, conversationIDs []int, userID int) error {
	if len(conversationIDs) == 0 {
		return nil
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, conversationID := range conversationIDs {
		var conversationType string
		var user1ID, user2ID *int
		err := tx.QueryRow(ctx, `
			SELECT COALESCE(conversation_type, 'dm') AS conversation_type, user1_id, user2_id
			FROM conversations
			WHERE id = $1
		`, conversationID).Scan(&conversationType, &user1ID, &user2ID)
		if err != nil {
			return err
		}

		if conversationType == "dm" || conversationType == "" {
			var query string
			if user1ID != nil && *user1ID == userID {
				query = `UPDATE conversations SET archived_for_user1 = TRUE WHERE id = $1`
			} else if user2ID != nil && *user2ID == userID {
				query = `UPDATE conversations SET archived_for_user2 = TRUE WHERE id = $1`
			} else {
				return pgx.ErrNoRows
			}

			result, execErr := tx.Exec(ctx, query, conversationID)
			if execErr != nil {
				return execErr
			}
			if result.RowsAffected() == 0 {
				return pgx.ErrNoRows
			}
			continue
		}

		if conversationType == "mod_mail" {
			var isParticipant bool
			checkErr := tx.QueryRow(ctx, `
				SELECT EXISTS(
					SELECT 1 FROM conversation_participants
					WHERE conversation_id = $1 AND user_id = $2
				)
			`, conversationID, userID).Scan(&isParticipant)
			if checkErr != nil {
				return checkErr
			}
			if !isParticipant {
				return pgx.ErrNoRows
			}

			_, execErr := tx.Exec(ctx, `
				UPDATE conversations
				SET archived_at = CURRENT_TIMESTAMP,
				    archived_by = $2,
				    status = 'archived'::varchar
				WHERE id = $1
			`, conversationID, userID)
			if execErr != nil {
				return execErr
			}
			continue
		}

		return pgx.ErrNoRows
	}

	return tx.Commit(ctx)
}

// Unarchive unarchives a conversation
// For DMs: clears archived_for_user1 or archived_for_user2 (per-user archiving)
// For mod_mail: sets status to 'open', clears archived_at and archived_by (conversation-level archiving)
func (r *ConversationRepository) Unarchive(ctx context.Context, conversationID int, userID int) error {
	// Get conversation to determine type and user position
	var conversationType string
	var user1ID, user2ID *int
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(conversation_type, 'dm') AS conversation_type, user1_id, user2_id
		FROM conversations
		WHERE id = $1
	`, conversationID).Scan(&conversationType, &user1ID, &user2ID)
	if err != nil {
		return err
	}

	if conversationType == "dm" {
		// For DMs: per-user unarchive
		var query string
		if user1ID != nil && *user1ID == userID {
			query = `
				UPDATE conversations
				SET archived_for_user1 = FALSE,
				    archived_at = NULL,
				    archived_by = NULL
				WHERE id = $1
			`
		} else if user2ID != nil && *user2ID == userID {
			query = `
				UPDATE conversations
				SET archived_for_user2 = FALSE,
				    archived_at = NULL,
				    archived_by = NULL
				WHERE id = $1
			`
		} else {
			return pgx.ErrNoRows // User is not a participant
		}
		result, err := r.pool.Exec(ctx, query, conversationID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return pgx.ErrNoRows
		}
		return nil
	} else if conversationType == "mod_mail" {
		// For mod_mail: conversation-level unarchive
		query := `
			UPDATE conversations
			SET archived_at = NULL,
			    archived_by = NULL,
			    status = 'open'::varchar
			WHERE id = $1
		`
		result, err := r.pool.Exec(ctx, query, conversationID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return pgx.ErrNoRows
		}
		return nil
	}

	return pgx.ErrNoRows
}

// SoftDeleteForUser marks a conversation as deleted for a specific user
func (r *ConversationRepository) SoftDeleteForUser(ctx context.Context, conversationID int, userID int) error {
	// First get user1_id and user2_id
	var user1ID, user2ID *int
	err := r.pool.QueryRow(ctx, `SELECT user1_id, user2_id FROM conversations WHERE id = $1`, conversationID).Scan(&user1ID, &user2ID)
	if err != nil {
		return err
	}

	// Determine which column to update
	var query string
	if user1ID != nil && *user1ID == userID {
		query = `UPDATE conversations SET deleted_for_user1 = TRUE WHERE id = $1`
	} else if user2ID != nil && *user2ID == userID {
		query = `UPDATE conversations SET deleted_for_user2 = TRUE WHERE id = $1`
	} else {
		return nil // User is not a participant
	}

	_, err = r.pool.Exec(ctx, query, conversationID)
	return err
}

// HardDeleteMessages deletes all messages from a user in a conversation
func (r *ConversationRepository) HardDeleteMessages(ctx context.Context, conversationID int, senderID int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		UPDATE messages
		SET reply_to = NULL,
		    thread_root = NULL
		WHERE conversation_id = $1
		  AND (
		    reply_to IN (
		      SELECT id FROM messages
		      WHERE conversation_id = $1 AND sender_id = $2
		    )
		    OR thread_root IN (
		      SELECT id FROM messages
		      WHERE conversation_id = $1 AND sender_id = $2
		    )
		  )
	`, conversationID, senderID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `DELETE FROM messages WHERE conversation_id = $1 AND sender_id = $2`, conversationID, senderID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// HardDeleteIfBothDeleted permanently deletes a conversation if both users have soft-deleted it
func (r *ConversationRepository) HardDeleteIfBothDeleted(ctx context.Context, conversationID int) error {
	query := `
		DELETE FROM conversations
		WHERE id = $1
		  AND deleted_for_user1 = TRUE
		  AND deleted_for_user2 = TRUE
	`
	_, err := r.pool.Exec(ctx, query, conversationID)
	return err
}

// GetEffectiveAutoDelete returns the auto-delete interval that governs messages sent by userID
// in conversationID. Resolution order: per-chat override → global user setting → nil (Never).
func (r *ConversationRepository) GetEffectiveAutoDelete(ctx context.Context, userID, conversationID int) (*time.Duration, error) {
	var duration *time.Duration
	err := r.pool.QueryRow(ctx, `
		SELECT CASE
			-- mod_mail is moderation infrastructure; never auto-delete regardless of user settings.
			WHEN c.conversation_type = 'mod_mail' THEN NULL
			ELSE COALESCE(
				CASE
					WHEN c.conversation_type = 'dm' AND c.user1_id = $1 THEN c.user1_auto_delete_after
					WHEN c.conversation_type = 'dm' AND c.user2_id = $1 THEN c.user2_auto_delete_after
					WHEN c.conversation_type = 'group'                   THEN cp.auto_delete_after
					ELSE NULL
				END,
				us.default_auto_delete_after
			)
		END
		FROM conversations c
		LEFT JOIN conversation_participants cp
			ON cp.conversation_id = c.id AND cp.user_id = $1
		LEFT JOIN user_settings us ON us.user_id = $1
		WHERE c.id = $2
	`, userID, conversationID).Scan(&duration)
	if err != nil {
		return nil, err
	}
	return duration, nil
}

// SetMuted toggles per-conversation mute for a specific user.
func (r *ConversationRepository) SetMuted(ctx context.Context, conversationID int, userID int, muted bool) error {
	query := `
		INSERT INTO conversation_notification_settings (conversation_id, user_id, muted, updated_at)
		VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
		ON CONFLICT (conversation_id, user_id)
		DO UPDATE SET muted = EXCLUDED.muted, updated_at = CURRENT_TIMESTAMP
	`
	_, err := r.pool.Exec(ctx, query, conversationID, userID, muted)
	return err
}
