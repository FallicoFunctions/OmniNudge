package services

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Group messages use one shared AES-256 key per group, in numbered versions.
// The server never sees a key: it stores one copy of each version per member,
// wrapped with that member's public key, and decides only who gets a copy. A
// join or a leave marks the active version out of date (MarkGroupKeyStale);
// the next member who sends makes the next version and wraps it for exactly
// the current members. With the group's history setting on, that member also
// wraps every older version a member lacks, so a newcomer reads the history.

var (
	// ErrNotGroupMember is returned to anyone who is not in the group now.
	ErrNotGroupMember = errors.New("not a member of this group")
	// ErrGroupKeyCurrent refuses a new version while the active one is current.
	ErrGroupKeyCurrent = errors.New("the group key is current")
	// ErrGroupKeyVersion is returned when another member made the version first.
	ErrGroupKeyVersion = errors.New("the group key version is not the next one")
	// ErrGroupKeyCopies is returned unless copies go to exactly the current members.
	ErrGroupKeyCopies = errors.New("the key copies do not match the group's members")
	// ErrGroupKeyHistory refuses older-version copies the rules do not allow.
	ErrGroupKeyHistory = errors.New("these older key copies are not allowed")
)

// A 32-byte key wrapped with RSA-OAEP 2048 is 256 bytes, 344 in base64.
const maxGroupKeyCopyBytes = 2048

type GroupKeyCopy struct {
	KeyVersion int    `json:"key_version"`
	WrappedKey string `json:"wrapped_key"`
}

// GroupKeyState is what a member needs to read and to send: its own copies,
// and, when ActiveVersion is 0, what the next version must cover.
type GroupKeyState struct {
	ActiveVersion  int            `json:"active_version"`
	LatestVersion  int            `json:"latest_version"`
	HistoryVisible bool           `json:"history_visible"`
	Members        []int          `json:"members"`
	MissingHistory map[int][]int  `json:"missing_history"`
	MyCopies       []GroupKeyCopy `json:"my_copies"`
}

// GroupKeyRotation makes the next version: Copies maps every current member to
// the new key wrapped for them; History maps an older version to members who
// lack it and their wrapped copy of it.
type GroupKeyRotation struct {
	KeyVersion int                    `json:"key_version"`
	Copies     map[int]string         `json:"copies"`
	History    map[int]map[int]string `json:"history,omitempty"`
}

type groupKeyQuerier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// GroupKeyExecer is a pool or a transaction; membership changes pass theirs.
type GroupKeyExecer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

type GroupKeyService struct {
	pool *pgxpool.Pool
}

func NewGroupKeyService(pool *pgxpool.Pool) *GroupKeyService {
	return &GroupKeyService{pool: pool}
}

// MarkGroupKeyStale ends the active version after a join or a leave, so no
// message goes out under a key a former member holds or a newcomer lacks.
func MarkGroupKeyStale(ctx context.Context, db GroupKeyExecer, conversationID int) error {
	_, err := db.Exec(ctx, `
		UPDATE group_encryption_keys SET is_active = FALSE
		WHERE conversation_id = $1 AND is_active = TRUE
	`, conversationID)
	return err
}

func (s *GroupKeyService) State(ctx context.Context, conversationID, userID int) (*GroupKeyState, error) {
	return groupKeyState(ctx, s.pool, conversationID, userID)
}

func groupKeyState(ctx context.Context, q groupKeyQuerier, conversationID, userID int) (*GroupKeyState, error) {
	members, err := groupMemberIDs(ctx, q, conversationID)
	if err != nil {
		return nil, err
	}
	if !containsInt(members, userID) {
		return nil, ErrNotGroupMember
	}
	state := &GroupKeyState{Members: members, MissingHistory: map[int][]int{}, MyCopies: []GroupKeyCopy{}}

	if err := q.QueryRow(ctx, `
		SELECT COALESCE(MAX(key_version), 0),
		       COALESCE(MAX(key_version) FILTER (WHERE is_active), 0)
		FROM group_encryption_keys WHERE conversation_id = $1
	`, conversationID).Scan(&state.LatestVersion, &state.ActiveVersion); err != nil {
		return nil, fmt.Errorf("read group key versions: %w", err)
	}
	// A group with no settings row keeps the default: history visible.
	if err := q.QueryRow(ctx, `
		SELECT COALESCE((SELECT message_history_visible FROM group_settings WHERE conversation_id = $1), TRUE)
	`, conversationID).Scan(&state.HistoryVisible); err != nil {
		return nil, fmt.Errorf("read group history setting: %w", err)
	}

	rows, err := q.Query(ctx, `
		SELECT k.key_version, m.encrypted_key_for_user
		FROM group_key_members m
		JOIN group_encryption_keys k ON k.id = m.group_key_id
		WHERE k.conversation_id = $1 AND m.user_id = $2
		ORDER BY k.key_version
	`, conversationID, userID)
	if err != nil {
		return nil, fmt.Errorf("read own group key copies: %w", err)
	}
	for rows.Next() {
		var c GroupKeyCopy
		if err := rows.Scan(&c.KeyVersion, &c.WrappedKey); err != nil {
			rows.Close()
			return nil, err
		}
		state.MyCopies = append(state.MyCopies, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if state.HistoryVisible && state.LatestVersion > 0 {
		rows, err := q.Query(ctx, `
			SELECT p.user_id, k.key_version
			FROM conversation_participants p
			JOIN group_encryption_keys k ON k.conversation_id = p.conversation_id
			WHERE p.conversation_id = $1
			  AND NOT EXISTS (
			      SELECT 1 FROM group_key_members m
			      WHERE m.group_key_id = k.id AND m.user_id = p.user_id)
			ORDER BY p.user_id, k.key_version
		`, conversationID)
		if err != nil {
			return nil, fmt.Errorf("read missing group key copies: %w", err)
		}
		for rows.Next() {
			var member, version int
			if err := rows.Scan(&member, &version); err != nil {
				rows.Close()
				return nil, err
			}
			state.MissingHistory[member] = append(state.MissingHistory[member], version)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	return state, nil
}

// Rotate stores the next version. The conversation row is locked for the
// whole check, so a second member who tries at the same moment waits, then
// finds the version taken (ErrGroupKeyCurrent) and uses the new one instead.
func (s *GroupKeyService) Rotate(ctx context.Context, conversationID, userID int, req *GroupKeyRotation) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var isGroup bool
	err = tx.QueryRow(ctx, `SELECT is_group FROM conversations WHERE id = $1 FOR UPDATE`, conversationID).Scan(&isGroup)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !isGroup) {
		return ErrNotGroupMember
	}
	if err != nil {
		return err
	}

	state, err := groupKeyState(ctx, tx, conversationID, userID)
	if err != nil {
		return err
	}
	if state.ActiveVersion != 0 {
		return ErrGroupKeyCurrent
	}
	if req.KeyVersion != state.LatestVersion+1 {
		return ErrGroupKeyVersion
	}
	if len(req.Copies) != len(state.Members) {
		return ErrGroupKeyCopies
	}
	for _, member := range state.Members {
		if !validGroupKeyCopy(req.Copies[member]) {
			return ErrGroupKeyCopies
		}
	}
	if err := checkGroupKeyHistory(state, req.History); err != nil {
		return err
	}

	var keyID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO group_encryption_keys (conversation_id, key_version, created_by, is_active, member_count)
		VALUES ($1, $2, $3, TRUE, $4)
		RETURNING id
	`, conversationID, req.KeyVersion, userID, len(req.Copies)).Scan(&keyID); err != nil {
		return fmt.Errorf("store group key version: %w", err)
	}
	for member, wrapped := range req.Copies {
		if err := insertGroupKeyCopy(ctx, tx, keyID, member, wrapped); err != nil {
			return err
		}
	}
	for version, copies := range req.History {
		var olderID int
		if err := tx.QueryRow(ctx, `
			SELECT id FROM group_encryption_keys WHERE conversation_id = $1 AND key_version = $2
		`, conversationID, version).Scan(&olderID); err != nil {
			return fmt.Errorf("find group key version %d: %w", version, err)
		}
		for member, wrapped := range copies {
			if err := insertGroupKeyCopy(ctx, tx, olderID, member, wrapped); err != nil {
				return err
			}
		}
	}
	if _, err := tx.Exec(ctx, `
		UPDATE conversations
		SET current_encryption_version = $1, encryption_enabled = TRUE, last_key_rotation_at = CURRENT_TIMESTAMP
		WHERE id = $2
	`, req.KeyVersion, conversationID); err != nil {
		return fmt.Errorf("record group key version: %w", err)
	}
	return tx.Commit(ctx)
}

// Older-version copies go only to members who lack that version, only while
// history is visible, and only for versions the sender itself holds.
func checkGroupKeyHistory(state *GroupKeyState, history map[int]map[int]string) error {
	if len(history) == 0 {
		return nil
	}
	if !state.HistoryVisible {
		return ErrGroupKeyHistory
	}
	held := map[int]bool{}
	for _, c := range state.MyCopies {
		held[c.KeyVersion] = true
	}
	for version, copies := range history {
		if !held[version] {
			return ErrGroupKeyHistory
		}
		for member, wrapped := range copies {
			if !containsInt(state.MissingHistory[member], version) || !validGroupKeyCopy(wrapped) {
				return ErrGroupKeyHistory
			}
		}
	}
	return nil
}

func insertGroupKeyCopy(ctx context.Context, tx pgx.Tx, keyID, member int, wrapped string) error {
	if _, err := tx.Exec(ctx, `
		INSERT INTO group_key_members (group_key_id, user_id, encrypted_key_for_user)
		VALUES ($1, $2, $3)
	`, keyID, member, wrapped); err != nil {
		return fmt.Errorf("store group key copy: %w", err)
	}
	return nil
}

func groupMemberIDs(ctx context.Context, q groupKeyQuerier, conversationID int) ([]int, error) {
	rows, err := q.Query(ctx, `
		SELECT p.user_id
		FROM conversation_participants p
		JOIN conversations c ON c.id = p.conversation_id
		WHERE p.conversation_id = $1 AND c.is_group = TRUE
		ORDER BY p.user_id
	`, conversationID)
	if err != nil {
		return nil, fmt.Errorf("read group members: %w", err)
	}
	defer rows.Close()
	members := []int{}
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		members = append(members, id)
	}
	return members, rows.Err()
}

func validGroupKeyCopy(wrapped string) bool {
	return wrapped != "" && len(wrapped) <= maxGroupKeyCopyBytes
}

func containsInt(values []int, want int) bool {
	for _, v := range values {
		if v == want {
			return true
		}
	}
	return false
}
