package models

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type OmniChatPublicationKind string

const (
	OmniChatPublicationKindImage OmniChatPublicationKind = "image"
	OmniChatPublicationKindVideo OmniChatPublicationKind = "video"
	OmniChatPublicationKindChat  OmniChatPublicationKind = "chat"
)

type OmniChatPublicAuthor struct {
	ID        int     `json:"id"`
	Username  string  `json:"username"`
	AvatarURL *string `json:"avatar_url,omitempty"`
}

// OmniChatPublicMediaAsset is the deliberately minimal media representation
// exposed by Explore. Private gallery records also contain conversation IDs,
// generation-job provenance, prompts, and scene history; none of that belongs
// in a published response.
type OmniChatPublicMediaAsset struct {
	ID              uuid.UUID               `json:"id"`
	Kind            OmniChatMediaKind       `json:"kind"`
	Visibility      OmniChatAssetVisibility `json:"visibility"`
	Width           *int                    `json:"width,omitempty"`
	Height          *int                    `json:"height,omitempty"`
	DurationSeconds *int                    `json:"duration_seconds,omitempty"`
	FileType        string                  `json:"file_type"`
	ContentURL      string                  `json:"content_url"`
	CreatedAt       time.Time               `json:"created_at"`
}

type OmniChatSnapshotMessage struct {
	Position    int                         `json:"position"`
	Role        string                      `json:"role"`
	Content     string                      `json:"content"`
	Attachments []*OmniChatPublicMediaAsset `json:"attachments,omitempty"`
	CreatedAt   time.Time                   `json:"created_at"`
}

type OmniChatChatSnapshot struct {
	ID           uuid.UUID                  `json:"id"`
	OwnerUserID  int                        `json:"owner_user_id,omitempty"`
	PersonaID    int                        `json:"persona_id"`
	Title        string                     `json:"title"`
	Excerpt      string                     `json:"excerpt"`
	MessageCount int                        `json:"message_count"`
	Messages     []*OmniChatSnapshotMessage `json:"messages,omitempty"`
	CreatedAt    time.Time                  `json:"created_at"`
}

type OmniChatPublication struct {
	ID               uuid.UUID                 `json:"id"`
	AuthorUserID     int                       `json:"author_user_id"`
	Author           OmniChatPublicAuthor      `json:"author"`
	PersonaID        int                       `json:"persona_id"`
	PersonaName      string                    `json:"persona_name"`
	PersonaAvatar    *string                   `json:"persona_avatar_url,omitempty"`
	ContentKind      OmniChatPublicationKind   `json:"content_kind"`
	Caption          string                    `json:"caption"`
	Visibility       string                    `json:"visibility"`
	Status           string                    `json:"status"`
	IsNSFW           bool                      `json:"is_nsfw"`
	LikeCount        int                       `json:"like_count"`
	CommentCount     int                       `json:"comment_count"`
	ShareCount       int                       `json:"share_count"`
	RemixCount       int                       `json:"remix_count"`
	ViewerLiked      bool                      `json:"viewer_liked"`
	ViewerBookmarked bool                      `json:"viewer_bookmarked"`
	ViewerFollowing  bool                      `json:"viewer_following"`
	Asset            *OmniChatPublicMediaAsset `json:"asset,omitempty"`
	Snapshot         *OmniChatChatSnapshot     `json:"snapshot,omitempty"`
	PublishedAt      time.Time                 `json:"published_at"`
	UpdatedAt        time.Time                 `json:"updated_at"`
}

type OmniChatPublicationComment struct {
	ID            uuid.UUID            `json:"id"`
	PublicationID uuid.UUID            `json:"publication_id"`
	AuthorUserID  int                  `json:"author_user_id"`
	Author        OmniChatPublicAuthor `json:"author"`
	ParentID      *uuid.UUID           `json:"parent_id,omitempty"`
	Body          string               `json:"body"`
	CreatedAt     time.Time            `json:"created_at"`
	UpdatedAt     time.Time            `json:"updated_at"`
}

type OmniChatExploreCursor struct {
	PublishedAt time.Time
	ID          uuid.UUID
}

type OmniChatCommentCursor struct {
	CreatedAt time.Time
	ID        uuid.UUID
}

type OmniChatSocialRepository struct{ pool *pgxpool.Pool }

func NewOmniChatSocialRepository(pool *pgxpool.Pool) *OmniChatSocialRepository {
	return &OmniChatSocialRepository{pool: pool}
}

const omniChatPublicationSelect = `
	p.id, p.author_user_id, u.username, u.avatar_url, p.persona_id, bp.name, bp.avatar_url,
	p.content_kind, p.caption, p.visibility, p.status, p.like_count, p.comment_count,
	p.share_count, p.remix_count, p.is_nsfw, p.published_at, p.updated_at,
	a.id, a.kind, a.width, a.height, a.duration_seconds, mf.file_type, a.created_at,
	s.id, s.owner_user_id, s.title, s.excerpt, s.message_count, s.created_at,
	EXISTS (SELECT 1 FROM omnichat_publication_reactions r WHERE r.publication_id = p.id AND r.user_id = $1),
	EXISTS (SELECT 1 FROM omnichat_publication_bookmarks b WHERE b.publication_id = p.id AND b.user_id = $1),
	EXISTS (SELECT 1 FROM omnichat_follows f WHERE f.follower_user_id = $1 AND f.followed_user_id = p.author_user_id)
`

func scanOmniChatPublication(scanner interface{ Scan(...any) error }) (*OmniChatPublication, error) {
	p := &OmniChatPublication{}
	var assetID *uuid.UUID
	var assetKind *OmniChatMediaKind
	var assetWidth, assetHeight, assetDuration *int
	var assetFileType *string
	var assetCreated *time.Time
	var snapshotID *uuid.UUID
	var snapshotOwner *int
	var snapshotTitle, snapshotExcerpt *string
	var snapshotCount *int
	var snapshotCreated *time.Time
	err := scanner.Scan(
		&p.ID, &p.AuthorUserID, &p.Author.Username, &p.Author.AvatarURL,
		&p.PersonaID, &p.PersonaName, &p.PersonaAvatar, &p.ContentKind, &p.Caption,
		&p.Visibility, &p.Status, &p.LikeCount, &p.CommentCount, &p.ShareCount,
		&p.RemixCount, &p.IsNSFW, &p.PublishedAt, &p.UpdatedAt,
		&assetID, &assetKind, &assetWidth, &assetHeight, &assetDuration, &assetFileType, &assetCreated,
		&snapshotID, &snapshotOwner, &snapshotTitle, &snapshotExcerpt, &snapshotCount, &snapshotCreated,
		&p.ViewerLiked, &p.ViewerBookmarked, &p.ViewerFollowing,
	)
	if err != nil {
		return nil, err
	}
	p.Author.ID = p.AuthorUserID
	if assetID != nil {
		p.Asset = &OmniChatPublicMediaAsset{
			ID: *assetID, Kind: *assetKind, Visibility: OmniChatAssetVisibilityPublic,
			Width: assetWidth, Height: assetHeight, DurationSeconds: assetDuration, FileType: *assetFileType, CreatedAt: *assetCreated,
		}
	}
	if snapshotID != nil {
		p.Snapshot = &OmniChatChatSnapshot{
			ID: *snapshotID, OwnerUserID: *snapshotOwner, PersonaID: p.PersonaID,
			Title: *snapshotTitle, Excerpt: *snapshotExcerpt, MessageCount: *snapshotCount, CreatedAt: *snapshotCreated,
		}
	}
	return p, nil
}

func (r *OmniChatSocialRepository) PublishAssetOwned(ctx context.Context, ownerUserID int, assetID uuid.UUID, caption string) (*OmniChatPublication, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var personaID int
	var kind OmniChatPublicationKind
	err = tx.QueryRow(ctx, `
		SELECT persona_id, kind FROM omnichat_media_assets
		WHERE id = $1 AND owner_user_id = $2 AND safety_status = 'approved' AND deleted_at IS NULL
		FOR UPDATE
	`, assetID, ownerUserID).Scan(&personaID, &kind)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var existingPublicationID uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id FROM omnichat_publications WHERE asset_id=$1 AND status='published'`, assetID).Scan(&existingPublicationID)
	if err == nil {
		if err = tx.Commit(ctx); err != nil {
			return nil, err
		}
		return r.GetPublicationAccessible(ctx, existingPublicationID, &ownerUserID)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	publicationID := uuid.New()
	_, err = tx.Exec(ctx, `
		INSERT INTO omnichat_publications (id, author_user_id, persona_id, content_kind, asset_id, caption, is_nsfw)
		SELECT $1,$2,$3,$4,$5,$6,p.is_nsfw FROM bot_personas p WHERE p.id=$3
	`, publicationID, ownerUserID, personaID, kind, assetID, caption)
	if err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, `UPDATE omnichat_media_assets SET visibility = 'public' WHERE id = $1`, assetID); err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.GetPublicationAccessible(ctx, publicationID, &ownerUserID)
}

// ReadChatShareTextOwned returns the exact text to moderate and a digest that
// PublishChatSnapshotOwned verifies under a transaction. This closes the race
// where an editable message could change after moderation but before publish.
func (r *OmniChatSocialRepository) ReadChatShareTextOwned(ctx context.Context, ownerUserID, conversationID int, messageIDs []int) (string, string, error) {
	if len(messageIDs) < 1 || len(messageIDs) > 200 {
		return "", "", nil
	}
	rows, err := r.pool.Query(ctx, `
		SELECT m.id, m.role, m.content, m.created_at
		FROM bot_messages m JOIN bot_conversations c ON c.id=m.conversation_id
		WHERE m.conversation_id=$1 AND c.user_id=$2 AND c.archived_at IS NULL AND m.id=ANY($3)
		ORDER BY m.id
	`, conversationID, ownerUserID, messageIDs)
	if err != nil {
		return "", "", err
	}
	defer rows.Close()
	var text strings.Builder
	hash := sha256.New()
	count := 0
	for rows.Next() {
		var id int
		var role, content string
		var created time.Time
		if err := rows.Scan(&id, &role, &content, &created); err != nil {
			return "", "", err
		}
		fmt.Fprintf(hash, "%d\x00%s\x00%s\x00%s\n", id, role, content, created.UTC().Format(time.RFC3339Nano))
		fmt.Fprintf(&text, "%s: %s\n", role, content)
		count++
	}
	if err := rows.Err(); err != nil {
		return "", "", err
	}
	if count != len(messageIDs) {
		return "", "", nil
	}
	return text.String(), hex.EncodeToString(hash.Sum(nil)), nil
}

func (r *OmniChatSocialRepository) PublishChatSnapshotOwned(ctx context.Context, ownerUserID, conversationID int, messageIDs []int, title, caption, expectedDigest string) (*OmniChatPublication, error) {
	if len(messageIDs) < 1 || len(messageIDs) > 200 {
		return nil, nil
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var personaID int
	err = tx.QueryRow(ctx, `SELECT persona_id FROM bot_conversations WHERE id = $1 AND user_id = $2 AND archived_at IS NULL FOR SHARE`, conversationID, ownerUserID).Scan(&personaID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `
		SELECT id, role, content, created_at FROM bot_messages
		WHERE conversation_id = $1 AND id = ANY($2) ORDER BY id
	`, conversationID, messageIDs)
	if err != nil {
		return nil, err
	}
	type selectedMessage struct {
		id            int
		role, content string
		created       time.Time
	}
	selected := make([]selectedMessage, 0, len(messageIDs))
	for rows.Next() {
		var m selectedMessage
		if err := rows.Scan(&m.id, &m.role, &m.content, &m.created); err != nil {
			rows.Close()
			return nil, err
		}
		selected = append(selected, m)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(selected) != len(messageIDs) {
		return nil, nil
	}
	hash := sha256.New()
	for _, message := range selected {
		fmt.Fprintf(hash, "%d\x00%s\x00%s\x00%s\n", message.id, message.role, message.content, message.created.UTC().Format(time.RFC3339Nano))
	}
	if expectedDigest == "" || !strings.EqualFold(expectedDigest, hex.EncodeToString(hash.Sum(nil))) {
		return nil, nil
	}
	excerpt := selected[0].content
	if len([]rune(excerpt)) > 500 {
		excerpt = string([]rune(excerpt)[:500])
	}
	snapshotID := uuid.New()
	_, err = tx.Exec(ctx, `
		INSERT INTO omnichat_chat_snapshots (id, owner_user_id, source_conversation_id, persona_id, title, excerpt, message_count, moderation_status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'approved')
	`, snapshotID, ownerUserID, conversationID, personaID, title, excerpt, len(selected))
	if err != nil {
		return nil, err
	}
	for position, message := range selected {
		_, err = tx.Exec(ctx, `
			INSERT INTO omnichat_chat_snapshot_messages (snapshot_id, position, original_message_id, role, content, created_at)
			VALUES ($1,$2,$3,$4,$5,$6)
		`, snapshotID, position, message.id, message.role, message.content, message.created)
		if err != nil {
			return nil, err
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO omnichat_chat_snapshot_attachments (snapshot_id, message_position, asset_position, asset_id)
			SELECT $1, $2, ROW_NUMBER() OVER (ORDER BY ma.position) - 1, ma.asset_id
			FROM bot_message_attachments ma
			JOIN omnichat_media_assets a ON a.id = ma.asset_id
			WHERE ma.message_id = $3 AND a.owner_user_id = $4 AND a.safety_status = 'approved' AND a.deleted_at IS NULL
			ORDER BY ma.position LIMIT 10
		`, snapshotID, position, message.id, ownerUserID)
		if err != nil {
			return nil, err
		}
	}
	publicationID := uuid.New()
	_, err = tx.Exec(ctx, `
		INSERT INTO omnichat_publications (id, author_user_id, persona_id, content_kind, snapshot_id, caption, is_nsfw)
		SELECT $1,$2,$3,'chat',$4,$5,p.is_nsfw FROM bot_personas p WHERE p.id=$3
	`, publicationID, ownerUserID, personaID, snapshotID, caption)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.GetPublicationAccessible(ctx, publicationID, &ownerUserID)
}

func (r *OmniChatSocialRepository) ListExplore(ctx context.Context, viewerUserID *int, kind string, before *OmniChatExploreCursor, limit int) ([]*OmniChatPublication, error) {
	if limit < 1 || limit > 50 {
		limit = 20
	}
	var beforeTime *time.Time
	var beforeID *uuid.UUID
	if before != nil {
		beforeTime = &before.PublishedAt
		beforeID = &before.ID
	}
	rows, err := r.pool.Query(ctx, `
		SELECT `+omniChatPublicationSelect+`
		FROM omnichat_publications p
		JOIN users u ON u.id = p.author_user_id
		JOIN bot_personas bp ON bp.id = p.persona_id
		LEFT JOIN omnichat_media_assets a ON a.id = p.asset_id
		LEFT JOIN media_files mf ON mf.id = a.media_file_id
		LEFT JOIN omnichat_chat_snapshots s ON s.id = p.snapshot_id
		WHERE p.status = 'published' AND p.visibility = 'public'
		  AND ($2 = '' OR p.content_kind = $2)
		  AND ($3::timestamptz IS NULL OR (p.published_at, p.id) < ($3, $4))
		  AND u.deleted = FALSE AND u.banned = FALSE
		  AND (p.is_nsfw = FALSE OR ($1::int IS NOT NULL AND EXISTS (SELECT 1 FROM users viewer WHERE viewer.id=$1 AND viewer.nsfw=TRUE)))
		  AND ($1::int IS NULL OR NOT EXISTS (
			SELECT 1 FROM blocked_users bu
			WHERE (bu.blocker_id = $1 AND bu.blocked_id = p.author_user_id)
			   OR (bu.blocker_id = p.author_user_id AND bu.blocked_id = $1)
		  ))
		ORDER BY p.published_at DESC, p.id DESC LIMIT $5
	`, viewerUserID, kind, beforeTime, beforeID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	publications := make([]*OmniChatPublication, 0, limit)
	for rows.Next() {
		publication, err := scanOmniChatPublication(rows)
		if err != nil {
			return nil, err
		}
		publications = append(publications, publication)
	}
	return publications, rows.Err()
}

func (r *OmniChatSocialRepository) GetPublicationAccessible(ctx context.Context, id uuid.UUID, viewerUserID *int) (*OmniChatPublication, error) {
	publication, err := scanOmniChatPublication(r.pool.QueryRow(ctx, `
		SELECT `+omniChatPublicationSelect+`
		FROM omnichat_publications p
		JOIN users u ON u.id = p.author_user_id
		JOIN bot_personas bp ON bp.id = p.persona_id
		LEFT JOIN omnichat_media_assets a ON a.id = p.asset_id
		LEFT JOIN media_files mf ON mf.id = a.media_file_id
		LEFT JOIN omnichat_chat_snapshots s ON s.id = p.snapshot_id
		WHERE p.id = $2 AND p.status = 'published' AND u.deleted = FALSE AND u.banned = FALSE
		  AND (p.is_nsfw = FALSE OR ($1::int IS NOT NULL AND EXISTS (SELECT 1 FROM users viewer WHERE viewer.id=$1 AND viewer.nsfw=TRUE)))
		  AND ($1::int IS NULL OR NOT EXISTS (
			SELECT 1 FROM blocked_users bu
			WHERE (bu.blocker_id = $1 AND bu.blocked_id = p.author_user_id)
			   OR (bu.blocker_id = p.author_user_id AND bu.blocked_id = $1)
		  ))
	`, viewerUserID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if publication.Snapshot != nil {
		messages, err := r.listSnapshotMessages(ctx, publication.Snapshot.ID)
		if err != nil {
			return nil, err
		}
		publication.Snapshot.Messages = messages
	}
	return publication, nil
}

func (r *OmniChatSocialRepository) listSnapshotMessages(ctx context.Context, snapshotID uuid.UUID) ([]*OmniChatSnapshotMessage, error) {
	rows, err := r.pool.Query(ctx, `SELECT position, role, content, created_at FROM omnichat_chat_snapshot_messages WHERE snapshot_id = $1 ORDER BY position`, snapshotID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	messages := make([]*OmniChatSnapshotMessage, 0)
	for rows.Next() {
		message := &OmniChatSnapshotMessage{}
		if err := rows.Scan(&message.Position, &message.Role, &message.Content, &message.CreatedAt); err != nil {
			return nil, err
		}
		assetRows, err := r.pool.Query(ctx, `
			SELECT `+omniChatAssetSelect+`
			FROM omnichat_chat_snapshot_attachments sa
			JOIN omnichat_media_assets a ON a.id = sa.asset_id
			JOIN media_files mf ON mf.id = a.media_file_id
			WHERE sa.snapshot_id = $1 AND sa.message_position = $2 AND a.safety_status = 'approved' AND a.deleted_at IS NULL
			ORDER BY sa.asset_position
		`, snapshotID, message.Position)
		if err != nil {
			return nil, err
		}
		for assetRows.Next() {
			asset, err := scanOmniChatMediaAsset(assetRows)
			if err != nil {
				assetRows.Close()
				return nil, err
			}
			message.Attachments = append(message.Attachments, &OmniChatPublicMediaAsset{
				ID: asset.ID, Kind: asset.Kind, Visibility: OmniChatAssetVisibilityPublic,
				Width: asset.Width, Height: asset.Height, DurationSeconds: asset.DurationSeconds,
				FileType: asset.FileType, CreatedAt: asset.CreatedAt,
			})
		}
		assetRows.Close()
		messages = append(messages, message)
	}
	return messages, rows.Err()
}

func (r *OmniChatSocialRepository) SetPublicationLiked(ctx context.Context, publicationID uuid.UUID, userID int, liked bool) error {
	if !liked {
		_, err := r.pool.Exec(ctx, `DELETE FROM omnichat_publication_reactions WHERE publication_id = $1 AND user_id = $2`, publicationID, userID)
		return err
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO omnichat_publication_reactions (publication_id, user_id)
		SELECT p.id, $2 FROM omnichat_publications p
		WHERE p.id = $1 AND p.status = 'published' AND NOT EXISTS (
			SELECT 1 FROM blocked_users bu WHERE
			(bu.blocker_id = $2 AND bu.blocked_id = p.author_user_id) OR
			(bu.blocker_id = p.author_user_id AND bu.blocked_id = $2)
		) ON CONFLICT DO NOTHING
	`, publicationID, userID)
	return err
}

func (r *OmniChatSocialRepository) AddPublicationComment(ctx context.Context, publicationID uuid.UUID, authorUserID int, parentID *uuid.UUID, body string) (*OmniChatPublicationComment, error) {
	comment := &OmniChatPublicationComment{ID: uuid.New(), PublicationID: publicationID, AuthorUserID: authorUserID, ParentID: parentID, Body: body}
	err := r.pool.QueryRow(ctx, `
		INSERT INTO omnichat_publication_comments (id, publication_id, author_user_id, parent_id, body)
		SELECT $1, p.id, $3, $4, $5 FROM omnichat_publications p
		WHERE p.id = $2 AND p.status = 'published' AND NOT EXISTS (
			SELECT 1 FROM blocked_users bu WHERE
			(bu.blocker_id = $3 AND bu.blocked_id = p.author_user_id) OR
			(bu.blocker_id = p.author_user_id AND bu.blocked_id = $3)
		) AND ($4::UUID IS NULL OR EXISTS (
			SELECT 1 FROM omnichat_publication_comments parent
			WHERE parent.id=$4 AND parent.publication_id=p.id AND parent.status='active'
		))
		RETURNING created_at, updated_at
	`, comment.ID, publicationID, authorUserID, parentID, body).Scan(&comment.CreatedAt, &comment.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	err = r.pool.QueryRow(ctx, `SELECT username, avatar_url FROM users WHERE id = $1`, authorUserID).Scan(&comment.Author.Username, &comment.Author.AvatarURL)
	comment.Author.ID = authorUserID
	return comment, err
}

func (r *OmniChatSocialRepository) ListPublicationComments(ctx context.Context, publicationID uuid.UUID, viewerUserID *int, after *OmniChatCommentCursor, limit int) ([]*OmniChatPublicationComment, error) {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	var afterTime *time.Time
	var afterID *uuid.UUID
	if after != nil {
		afterTime = &after.CreatedAt
		afterID = &after.ID
	}
	rows, err := r.pool.Query(ctx, `
		SELECT c.id, c.publication_id, c.author_user_id, u.username, u.avatar_url, c.parent_id, c.body, c.created_at, c.updated_at
		FROM omnichat_publication_comments c JOIN users u ON u.id = c.author_user_id
		WHERE c.publication_id = $1 AND c.status = 'active' AND u.deleted = FALSE AND u.banned = FALSE
		  AND ($2::INTEGER IS NULL OR NOT EXISTS (
			SELECT 1 FROM blocked_users bu WHERE
			(bu.blocker_id=$2 AND bu.blocked_id=c.author_user_id) OR
			(bu.blocker_id=c.author_user_id AND bu.blocked_id=$2)
		  ))
		  AND ($3::timestamptz IS NULL OR (c.created_at, c.id) > ($3, $4))
		ORDER BY c.created_at, c.id LIMIT $5
	`, publicationID, viewerUserID, afterTime, afterID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	comments := make([]*OmniChatPublicationComment, 0, limit)
	for rows.Next() {
		comment := &OmniChatPublicationComment{}
		if err := rows.Scan(&comment.ID, &comment.PublicationID, &comment.AuthorUserID, &comment.Author.Username, &comment.Author.AvatarURL, &comment.ParentID, &comment.Body, &comment.CreatedAt, &comment.UpdatedAt); err != nil {
			return nil, err
		}
		comment.Author.ID = comment.AuthorUserID
		comments = append(comments, comment)
	}
	return comments, rows.Err()
}

func (r *OmniChatSocialRepository) RecordPublicationShare(ctx context.Context, publicationID uuid.UUID, userID int) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO omnichat_publication_shares (publication_id, user_id)
		SELECT p.id, $2 FROM omnichat_publications p
		WHERE p.id = $1 AND p.status = 'published' AND NOT EXISTS (
			SELECT 1 FROM blocked_users bu WHERE
			(bu.blocker_id=$2 AND bu.blocked_id=p.author_user_id) OR
			(bu.blocker_id=p.author_user_id AND bu.blocked_id=$2)
		)
		ON CONFLICT DO NOTHING
	`, publicationID, userID)
	return err
}

func (r *OmniChatSocialRepository) SetPublicationBookmarked(ctx context.Context, publicationID uuid.UUID, userID int, bookmarked bool) error {
	if !bookmarked {
		_, err := r.pool.Exec(ctx, `DELETE FROM omnichat_publication_bookmarks WHERE publication_id = $1 AND user_id = $2`, publicationID, userID)
		return err
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO omnichat_publication_bookmarks (publication_id, user_id)
		SELECT p.id, $2 FROM omnichat_publications p
		WHERE p.id=$1 AND p.status='published' AND NOT EXISTS (
			SELECT 1 FROM blocked_users bu WHERE
			(bu.blocker_id=$2 AND bu.blocked_id=p.author_user_id) OR
			(bu.blocker_id=p.author_user_id AND bu.blocked_id=$2)
		)
		ON CONFLICT DO NOTHING
	`, publicationID, userID)
	return err
}

func (r *OmniChatSocialRepository) CanFollow(ctx context.Context, followerUserID, followedUserID int) (bool, error) {
	if followerUserID == followedUserID {
		return false, nil
	}
	var allowed bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM users followed
			WHERE followed.id=$2 AND followed.deleted=FALSE AND followed.banned=FALSE
			  AND NOT EXISTS (
				SELECT 1 FROM blocked_users
				WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)
			  )
		)
	`, followerUserID, followedUserID).Scan(&allowed)
	return allowed, err
}

func (r *OmniChatSocialRepository) SetFollowing(ctx context.Context, followerUserID, followedUserID int, following bool) error {
	if followerUserID == followedUserID {
		return nil
	}
	if !following {
		_, err := r.pool.Exec(ctx, `DELETE FROM omnichat_follows WHERE follower_user_id = $1 AND followed_user_id = $2`, followerUserID, followedUserID)
		return err
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO omnichat_follows (follower_user_id, followed_user_id)
		SELECT $1, followed.id FROM users followed
		WHERE followed.id=$2 AND followed.deleted=FALSE AND followed.banned=FALSE
		  AND NOT EXISTS (SELECT 1 FROM blocked_users WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1))
		ON CONFLICT DO NOTHING
	`, followerUserID, followedUserID)
	return err
}

func (r *OmniChatSocialRepository) ContinueChatSnapshot(ctx context.Context, publicationID uuid.UUID, userID int) (*BotConversation, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var snapshotID uuid.UUID
	var personaID int
	var snapshotTitle string
	err = tx.QueryRow(ctx, `
		SELECT p.snapshot_id, p.persona_id, s.title
		FROM omnichat_publications p
		JOIN omnichat_chat_snapshots s ON s.id = p.snapshot_id
		JOIN bot_personas bp ON bp.id = p.persona_id
		JOIN users author ON author.id = p.author_user_id
		WHERE p.id = $1 AND p.content_kind = 'chat' AND p.status = 'published'
		  AND author.deleted = FALSE AND author.banned = FALSE
		  AND (p.is_nsfw = FALSE OR EXISTS (SELECT 1 FROM users viewer WHERE viewer.id=$2 AND viewer.nsfw=TRUE))
		  AND bp.is_active = TRUE
		  AND ((bp.owner_user_id IS NULL AND bp.visibility = 'public') OR bp.owner_user_id = $2)
		  AND NOT EXISTS (SELECT 1 FROM blocked_users bu WHERE
			(bu.blocker_id=$2 AND bu.blocked_id=p.author_user_id) OR (bu.blocker_id=p.author_user_id AND bu.blocked_id=$2))
		FOR SHARE
	`, publicationID, userID).Scan(&snapshotID, &personaID, &snapshotTitle)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	title := "Continued from " + snapshotTitle
	if len([]rune(title)) > 200 {
		title = string([]rune(title)[:200])
	}
	conversation := &BotConversation{UserID: userID, PersonaID: personaID, Title: &title, Settings: &ConversationSettings{}}
	err = tx.QueryRow(ctx, `
		INSERT INTO bot_conversations (user_id, persona_id, title, remixed_from_publication_id)
		VALUES ($1,$2,$3,$4) RETURNING id, created_at, last_message_at
	`, userID, personaID, title, publicationID).Scan(&conversation.ID, &conversation.CreatedAt, &conversation.LastMessageAt)
	if err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `SELECT position, role, content FROM omnichat_chat_snapshot_messages WHERE snapshot_id = $1 ORDER BY position`, snapshotID)
	if err != nil {
		return nil, err
	}
	type snapshotTurn struct {
		position int
		role     string
		content  string
	}
	turns := make([]snapshotTurn, 0)
	for rows.Next() {
		var turn snapshotTurn
		if err := rows.Scan(&turn.position, &turn.role, &turn.content); err != nil {
			rows.Close()
			return nil, err
		}
		turns = append(turns, turn)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, turn := range turns {
		var newMessageID int
		if err := tx.QueryRow(ctx, `INSERT INTO bot_messages (conversation_id, role, content, failed) VALUES ($1,$2,$3,FALSE) RETURNING id`, conversation.ID, turn.role, turn.content).Scan(&newMessageID); err != nil {
			return nil, err
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO bot_message_attachments (message_id, asset_id, position)
			SELECT $1, asset_id, asset_position FROM omnichat_chat_snapshot_attachments
			WHERE snapshot_id = $2 AND message_position = $3
		`, newMessageID, snapshotID, turn.position)
		if err != nil {
			return nil, err
		}
	}
	if _, err = tx.Exec(ctx, `UPDATE bot_conversations SET last_message_at = NOW() WHERE id = $1`, conversation.ID); err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, `UPDATE omnichat_publications SET remix_count = remix_count + 1, updated_at = NOW() WHERE id = $1`, publicationID); err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return conversation, nil
}

func (r *OmniChatSocialRepository) ReportPublication(ctx context.Context, publicationID uuid.UUID, reporterUserID int, reason, details string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO omnichat_publication_reports (id, publication_id, reporter_user_id, reason, details)
		SELECT $1, id, $3, $4, $5 FROM omnichat_publications WHERE id = $2 AND status = 'published' AND author_user_id <> $3
		ON CONFLICT (publication_id, reporter_user_id) DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details, status = 'open', created_at = NOW()
	`, uuid.New(), publicationID, reporterUserID, reason, details)
	return err
}

func (r *OmniChatSocialRepository) RemovePublicationOwned(ctx context.Context, publicationID uuid.UUID, ownerUserID int) (bool, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	var assetID *uuid.UUID
	err = tx.QueryRow(ctx, `
		UPDATE omnichat_publications
		SET status='removed', removed_at=NOW(), updated_at=NOW()
		WHERE id=$1 AND author_user_id=$2 AND status <> 'removed'
		RETURNING asset_id
	`, publicationID, ownerUserID).Scan(&assetID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if assetID != nil {
		if _, err = tx.Exec(ctx, `
			UPDATE omnichat_media_assets a SET visibility='private'
			WHERE a.id=$1 AND NOT EXISTS (
				SELECT 1 FROM omnichat_publications p
				WHERE p.asset_id=a.id AND p.status='published'
			)
		`, *assetID); err != nil {
			return false, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

func (r *OmniChatSocialRepository) PublicAssetStoragePath(ctx context.Context, assetID uuid.UUID, viewerUserID *int) (string, string, error) {
	var path, fileType string
	err := r.pool.QueryRow(ctx, `
		SELECT mf.storage_path, mf.file_type
		FROM omnichat_media_assets a JOIN media_files mf ON mf.id=a.media_file_id
		WHERE a.id=$1 AND a.safety_status='approved' AND a.deleted_at IS NULL AND mf.scan_status='clean'
		  AND EXISTS (
			SELECT 1 FROM omnichat_publications p
			JOIN users author ON author.id=p.author_user_id
			WHERE p.status='published' AND author.deleted=FALSE AND author.banned=FALSE
			AND (p.is_nsfw=FALSE OR ($2::int IS NOT NULL AND EXISTS(SELECT 1 FROM users viewer WHERE viewer.id=$2 AND viewer.nsfw=TRUE))) AND (
				p.asset_id=a.id OR EXISTS (SELECT 1 FROM omnichat_chat_snapshot_attachments sa WHERE sa.snapshot_id=p.snapshot_id AND sa.asset_id=a.id)
			)
			AND ($2::int IS NULL OR NOT EXISTS (
				SELECT 1 FROM blocked_users bu WHERE
				(bu.blocker_id=$2 AND bu.blocked_id=p.author_user_id) OR
				(bu.blocker_id=p.author_user_id AND bu.blocked_id=$2)
			))
		  )
	`, assetID, viewerUserID).Scan(&path, &fileType)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", nil
	}
	return path, fileType, err
}

func (r *OmniChatSocialRepository) DeleteCommentOwned(ctx context.Context, id uuid.UUID, userID int, moderator bool) (bool, error) {
	query := `UPDATE omnichat_publication_comments SET status='deleted', body='[deleted]', updated_at=NOW() WHERE id=$1 AND author_user_id=$2 AND status='active'`
	args := []any{id, userID}
	if moderator {
		query = `UPDATE omnichat_publication_comments SET status='removed', body='[removed]', updated_at=NOW() WHERE id=$1 AND status='active'`
		args = []any{id}
	}
	tag, err := r.pool.Exec(ctx, query, args...)
	return tag.RowsAffected() > 0, err
}
