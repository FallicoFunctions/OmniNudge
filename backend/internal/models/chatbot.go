package models

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Persona categories for OmniChat bots — a genre/content tag shown in the
// Discover grid, not a behavioral role (behavior is driven by SystemPrompt).
const (
	PersonaCategoryRoleplay     = "roleplay"
	PersonaCategoryHelper       = "helper"
	PersonaCategoryRomance      = "romance"
	PersonaCategoryOriginal     = "original"
	PersonaCategoryAnimeGame    = "anime_game"
	PersonaCategoryFictionMedia = "fiction_media"
)

// Message roles within a bot conversation.
const (
	BotMessageRoleUser      = "user"
	BotMessageRoleAssistant = "assistant"
)

// BotPersona is a catalog entry for an OmniChat character.
type BotPersona struct {
	ID           int       `json:"id"`
	Slug         string    `json:"slug"`
	Name         string    `json:"name"`
	Description  *string   `json:"description,omitempty"`
	Category     string    `json:"category"` // genre/content tag: see PersonaCategory* constants
	SystemPrompt string    `json:"system_prompt"`
	AvatarURL    *string   `json:"avatar_url,omitempty"`
	IsNSFW       bool      `json:"is_nsfw"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// BotConversation is a chat session between a user and a BotPersona.
type BotConversation struct {
	ID            int         `json:"id"`
	UserID        int         `json:"user_id"`
	PersonaID     int         `json:"persona_id"`
	Persona       *BotPersona `json:"persona,omitempty"` // Optional populated persona info
	Title         *string     `json:"title,omitempty"`
	CreatedAt     time.Time   `json:"created_at"`
	LastMessageAt time.Time   `json:"last_message_at"`
	ArchivedAt    *time.Time  `json:"archived_at,omitempty"`
}

// BotMessage is a single turn (user or assistant) within a BotConversation.
type BotMessage struct {
	ID             int       `json:"id"`
	ConversationID int       `json:"conversation_id"`
	Role           string    `json:"role"` // 'user' or 'assistant'
	Content        string    `json:"content"`
	Failed         bool      `json:"failed"`
	CreatedAt      time.Time `json:"created_at"`
}

// BotPersonaRepository handles database operations for bot personas.
type BotPersonaRepository struct {
	pool *pgxpool.Pool
}

// NewBotPersonaRepository creates a new bot persona repository.
func NewBotPersonaRepository(pool *pgxpool.Pool) *BotPersonaRepository {
	return &BotPersonaRepository{pool: pool}
}

// maxPersonaListSize caps ListActive's result set; the persona catalog is
// admin-curated and expected to stay small, but every list query gets a
// LIMIT regardless of expected size.
const maxPersonaListSize = 500

// ListActive returns all active personas, optionally filtered by category.
func (r *BotPersonaRepository) ListActive(ctx context.Context, category string) ([]*BotPersona, error) {
	query := `
		SELECT id, slug, name, description, category, system_prompt, avatar_url, is_nsfw, is_active, created_at, updated_at
		FROM bot_personas
		WHERE is_active
	`
	args := []interface{}{}
	if category != "" {
		query += " AND category = $1"
		args = append(args, category)
	}
	args = append(args, maxPersonaListSize)
	query += fmt.Sprintf(" ORDER BY name LIMIT $%d", len(args))

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	personas := []*BotPersona{}
	for rows.Next() {
		p := &BotPersona{}
		if err := rows.Scan(
			&p.ID, &p.Slug, &p.Name, &p.Description, &p.Category,
			&p.SystemPrompt, &p.AvatarURL, &p.IsNSFW, &p.IsActive,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		personas = append(personas, p)
	}
	return personas, rows.Err()
}

// GetByID retrieves a persona by its ID.
func (r *BotPersonaRepository) GetByID(ctx context.Context, id int) (*BotPersona, error) {
	p := &BotPersona{}
	query := `
		SELECT id, slug, name, description, category, system_prompt, avatar_url, is_nsfw, is_active, created_at, updated_at
		FROM bot_personas
		WHERE id = $1
	`
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.Slug, &p.Name, &p.Description, &p.Category,
		&p.SystemPrompt, &p.AvatarURL, &p.IsNSFW, &p.IsActive,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return p, nil
}

// BotConversationRepository handles database operations for bot conversations.
type BotConversationRepository struct {
	pool *pgxpool.Pool
}

// NewBotConversationRepository creates a new bot conversation repository.
func NewBotConversationRepository(pool *pgxpool.Pool) *BotConversationRepository {
	return &BotConversationRepository{pool: pool}
}

// Create starts a new conversation between a user and a persona.
func (r *BotConversationRepository) Create(ctx context.Context, userID, personaID int, title *string) (*BotConversation, error) {
	c := &BotConversation{UserID: userID, PersonaID: personaID, Title: title}
	query := `
		INSERT INTO bot_conversations (user_id, persona_id, title)
		VALUES ($1, $2, $3)
		RETURNING id, created_at, last_message_at
	`
	err := r.pool.QueryRow(ctx, query, userID, personaID, title).Scan(&c.ID, &c.CreatedAt, &c.LastMessageAt)
	if err != nil {
		return nil, err
	}
	return c, nil
}

// GetActiveByUserAndPersonaID returns the user's most recently active
// non-archived conversation with the given persona, if one exists.
func (r *BotConversationRepository) GetActiveByUserAndPersonaID(ctx context.Context, userID, personaID int) (*BotConversation, error) {
	c := &BotConversation{}
	query := `
		SELECT id, user_id, persona_id, title, created_at, last_message_at, archived_at
		FROM bot_conversations
		WHERE user_id = $1 AND persona_id = $2 AND archived_at IS NULL
		ORDER BY last_message_at DESC
		LIMIT 1
	`
	err := r.pool.QueryRow(ctx, query, userID, personaID).Scan(
		&c.ID, &c.UserID, &c.PersonaID, &c.Title, &c.CreatedAt, &c.LastMessageAt, &c.ArchivedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return c, nil
}

// GetByID retrieves a conversation by ID, scoped to the owning user.
func (r *BotConversationRepository) GetByID(ctx context.Context, id, userID int) (*BotConversation, error) {
	c := &BotConversation{}
	query := `
		SELECT id, user_id, persona_id, title, created_at, last_message_at, archived_at
		FROM bot_conversations
		WHERE id = $1 AND user_id = $2
	`
	err := r.pool.QueryRow(ctx, query, id, userID).Scan(
		&c.ID, &c.UserID, &c.PersonaID, &c.Title, &c.CreatedAt, &c.LastMessageAt, &c.ArchivedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return c, nil
}

// ListByUserID retrieves a user's conversations, most recently active first,
// with each conversation's persona populated for the Discover "Continue
// Chatting" row.
func (r *BotConversationRepository) ListByUserID(ctx context.Context, userID, limit, offset int) ([]*BotConversation, error) {
	query := `
		SELECT
			c.id, c.user_id, c.persona_id, c.title, c.created_at, c.last_message_at, c.archived_at,
			p.id, p.slug, p.name, p.description, p.category, p.system_prompt, p.avatar_url,
			p.is_nsfw, p.is_active, p.created_at, p.updated_at
		FROM bot_conversations c
		INNER JOIN bot_personas p ON p.id = c.persona_id
		WHERE c.user_id = $1 AND c.archived_at IS NULL
		ORDER BY c.last_message_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.pool.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	conversations := []*BotConversation{}
	for rows.Next() {
		c := &BotConversation{}
		p := &BotPersona{}
		if err := rows.Scan(
			&c.ID, &c.UserID, &c.PersonaID, &c.Title, &c.CreatedAt, &c.LastMessageAt, &c.ArchivedAt,
			&p.ID, &p.Slug, &p.Name, &p.Description, &p.Category, &p.SystemPrompt, &p.AvatarURL,
			&p.IsNSFW, &p.IsActive, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		c.Persona = p
		conversations = append(conversations, c)
	}
	return conversations, rows.Err()
}

// UpdateLastMessageAt bumps the conversation's last_message_at to now.
func (r *BotConversationRepository) UpdateLastMessageAt(ctx context.Context, conversationID int) error {
	_, err := r.pool.Exec(ctx, `UPDATE bot_conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1`, conversationID)
	return err
}

// BotMessageRepository handles database operations for bot messages.
type BotMessageRepository struct {
	pool *pgxpool.Pool
}

// NewBotMessageRepository creates a new bot message repository.
func NewBotMessageRepository(pool *pgxpool.Pool) *BotMessageRepository {
	return &BotMessageRepository{pool: pool}
}

// Create inserts a new message (user or assistant turn) into a conversation.
func (r *BotMessageRepository) Create(ctx context.Context, conversationID int, role, content string, failed bool) (*BotMessage, error) {
	m := &BotMessage{ConversationID: conversationID, Role: role, Content: content, Failed: failed}
	query := `
		INSERT INTO bot_messages (conversation_id, role, content, failed)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at
	`
	err := r.pool.QueryRow(ctx, query, conversationID, role, content, failed).Scan(&m.ID, &m.CreatedAt)
	if err != nil {
		return nil, err
	}
	return m, nil
}

// ListByConversationID retrieves messages for a conversation in chronological order.
func (r *BotMessageRepository) ListByConversationID(ctx context.Context, conversationID int, limit int) ([]*BotMessage, error) {
	query := `
		SELECT id, conversation_id, role, content, failed, created_at
		FROM bot_messages
		WHERE conversation_id = $1
		ORDER BY id
		LIMIT $2
	`
	rows, err := r.pool.Query(ctx, query, conversationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Initialized (not nil) so a conversation with zero messages serializes as
	// "messages": [] rather than null — the frontend calls .map() on this directly.
	messages := []*BotMessage{}
	for rows.Next() {
		m := &BotMessage{}
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.Role, &m.Content, &m.Failed, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	return messages, rows.Err()
}
