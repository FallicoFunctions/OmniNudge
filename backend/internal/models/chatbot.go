package models

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
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

// Response style profiles add a platform-level conversational style after the
// character card prompt. "inherit" follows the current platform default while
// "character_only" leaves imported/custom character instructions untouched.
const (
	ResponseStyleProfileInherit         = "inherit"
	ResponseStyleProfileNaturalDialogue = "natural_dialogue"
	ResponseStyleProfileLeanNarrative   = "lean_narrative"
	ResponseStyleProfileProfessional    = "professional"
	ResponseStyleProfileCharacterOnly   = "character_only"
)

// Message roles within a bot conversation.
const (
	BotMessageRoleUser      = "user"
	BotMessageRoleAssistant = "assistant"
)

// BotPersona is a catalog entry for an OmniChat character.
type BotPersona struct {
	ID                      int             `json:"id"`
	Slug                    string          `json:"slug"`
	Name                    string          `json:"name"`
	Description             *string         `json:"description,omitempty"`
	Category                string          `json:"category"` // genre/content tag: see PersonaCategory* constants
	OwnerUserID             *int            `json:"owner_user_id,omitempty"`
	Visibility              string          `json:"visibility,omitempty"`
	SourceFormat            string          `json:"source_format,omitempty"`
	SystemPrompt            string          `json:"-"`
	Personality             string          `json:"-"`
	Scenario                string          `json:"-"`
	FirstMessage            string          `json:"first_message"`
	ExampleDialogue         string          `json:"-"`
	ResponseStyleProfile    string          `json:"response_style_profile,omitempty"`
	PostHistoryInstructions string          `json:"-"`
	AlternateGreetings      []string        `json:"-"`
	CreatorNotes            string          `json:"-"`
	Tags                    []string        `json:"tags,omitempty"`
	CreatorName             string          `json:"creator_name,omitempty"`
	CharacterVersion        string          `json:"character_version,omitempty"`
	ExtensionsJSON          json.RawMessage `json:"-"`
	CharacterBookJSON       json.RawMessage `json:"-"`
	RawCardJSON             json.RawMessage `json:"-"`
	ImportSourceFilename    *string         `json:"import_source_filename,omitempty"`
	AvatarURL               *string         `json:"avatar_url,omitempty"`
	PreviewVideoURL         *string         `json:"preview_video_url,omitempty"`
	GalleryURLs             []string        `json:"gallery_urls,omitempty"`
	IsNSFW                  bool            `json:"is_nsfw"`
	IsActive                bool            `json:"is_active"`
	CreatedAt               time.Time       `json:"created_at"`
	UpdatedAt               time.Time       `json:"updated_at"`
}

// ConversationSettings holds per-conversation user metadata that the persona
// is aware of (name, age, gender). Populated from user defaults on creation
// and can be overridden per conversation in the chat settings modal.
type ConversationSettings struct {
	UserName   string `json:"user_name"`
	UserAge    string `json:"user_age"`
	UserGender string `json:"user_gender"`
}

// BotConversation is a chat session between a user and a BotPersona.
type BotConversation struct {
	ID                 int                   `json:"id"`
	UserID             int                   `json:"user_id"`
	PersonaID          int                   `json:"persona_id"`
	Persona            *BotPersona           `json:"persona,omitempty"` // Optional populated persona info
	Title              *string               `json:"title,omitempty"`
	LastMessagePreview *string               `json:"last_message_preview,omitempty"`
	Settings           *ConversationSettings `json:"settings,omitempty"`
	CreatedAt          time.Time             `json:"created_at"`
	LastMessageAt      time.Time             `json:"last_message_at"`
	ArchivedAt         *time.Time            `json:"archived_at,omitempty"`
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

const botPersonaSelectColumns = `
	id, slug, name, description, category, owner_user_id, visibility, source_format,
	system_prompt, personality, scenario, first_message, example_dialogue, response_style_profile,
	post_history_instructions, alternate_greetings, creator_notes, tags, creator_name,
	character_version, extensions_json, character_book_json, raw_card_json,
	import_source_filename, avatar_url, preview_video_url, gallery_urls,
	is_nsfw, is_active, created_at, updated_at
`

func qualifySelectColumns(alias, columns string) string {
	parts := strings.Split(columns, ",")
	for i, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		parts[i] = alias + "." + trimmed
	}
	return strings.Join(parts, ", ")
}

func scanBotPersona(scanner interface {
	Scan(dest ...interface{}) error
}) (*BotPersona, error) {
	p := &BotPersona{}
	err := scanner.Scan(
		&p.ID, &p.Slug, &p.Name, &p.Description, &p.Category, &p.OwnerUserID, &p.Visibility, &p.SourceFormat,
		&p.SystemPrompt, &p.Personality, &p.Scenario, &p.FirstMessage, &p.ExampleDialogue, &p.ResponseStyleProfile,
		&p.PostHistoryInstructions, &p.AlternateGreetings, &p.CreatorNotes, &p.Tags, &p.CreatorName,
		&p.CharacterVersion, &p.ExtensionsJSON, &p.CharacterBookJSON, &p.RawCardJSON,
		&p.ImportSourceFilename, &p.AvatarURL, &p.PreviewVideoURL, &p.GalleryURLs,
		&p.IsNSFW, &p.IsActive, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if p.Visibility == "" {
		p.Visibility = "public"
	}
	if p.SourceFormat == "" {
		p.SourceFormat = "native"
	}
	if p.ResponseStyleProfile == "" {
		p.ResponseStyleProfile = ResponseStyleProfileInherit
	}
	if p.AlternateGreetings == nil {
		p.AlternateGreetings = []string{}
	}
	if p.Tags == nil {
		p.Tags = []string{}
	}
	if p.GalleryURLs == nil {
		p.GalleryURLs = []string{}
	}
	return p, nil
}

// ListCatalog returns all active public personas plus any personas owned by the
// requesting user. The caller can pass nil when no user is authenticated.
func (r *BotPersonaRepository) ListCatalog(ctx context.Context, category string, viewerUserID *int) ([]*BotPersona, error) {
	query := `
		SELECT ` + botPersonaSelectColumns + `
		FROM bot_personas
		WHERE is_active
	`
	args := []interface{}{}
	if viewerUserID == nil {
		query += " AND owner_user_id IS NULL AND visibility = 'public'"
	} else {
		args = append(args, *viewerUserID)
		query += " AND (owner_user_id IS NULL AND visibility = 'public' OR owner_user_id = $1)"
	}
	if category != "" {
		args = append(args, category)
		query += fmt.Sprintf(" AND category = $%d", len(args))
	}
	args = append(args, maxPersonaListSize)
	query += fmt.Sprintf(" ORDER BY CASE WHEN owner_user_id IS NULL THEN 1 ELSE 0 END, updated_at DESC, name LIMIT $%d", len(args))

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	personas := []*BotPersona{}
	for rows.Next() {
		p, err := scanBotPersona(rows)
		if err != nil {
			return nil, err
		}
		personas = append(personas, p)
	}
	return personas, rows.Err()
}

// ListOwnedByUser returns the active personas created by the given user.
func (r *BotPersonaRepository) ListOwnedByUser(ctx context.Context, userID int) ([]*BotPersona, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+botPersonaSelectColumns+`
		FROM bot_personas
		WHERE owner_user_id = $1 AND is_active
		ORDER BY updated_at DESC, name
		LIMIT $2
	`, userID, maxPersonaListSize)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	personas := []*BotPersona{}
	for rows.Next() {
		p, err := scanBotPersona(rows)
		if err != nil {
			return nil, err
		}
		personas = append(personas, p)
	}
	return personas, rows.Err()
}

// GetByID retrieves a persona by its ID.
func (r *BotPersonaRepository) GetByID(ctx context.Context, id int) (*BotPersona, error) {
	query := `
		SELECT ` + botPersonaSelectColumns + `
		FROM bot_personas
		WHERE id = $1
	`
	p, err := scanBotPersona(r.pool.QueryRow(ctx, query, id))
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return p, nil
}

// GetAccessibleByID retrieves a persona only if it is visible to the caller.
func (r *BotPersonaRepository) GetAccessibleByID(ctx context.Context, id int, viewerUserID *int) (*BotPersona, error) {
	query := `
		SELECT ` + botPersonaSelectColumns + `
		FROM bot_personas
		WHERE id = $1 AND is_active
	`
	args := []interface{}{id}
	if viewerUserID == nil {
		query += " AND owner_user_id IS NULL AND visibility = 'public'"
	} else {
		args = append(args, *viewerUserID)
		query += " AND (owner_user_id IS NULL AND visibility = 'public' OR owner_user_id = $2)"
	}
	p, err := scanBotPersona(r.pool.QueryRow(ctx, query, args...))
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return p, nil
}

// GetOwnedByUserAndID retrieves a persona only when it is owned by the user.
func (r *BotPersonaRepository) GetOwnedByUserAndID(ctx context.Context, userID, id int) (*BotPersona, error) {
	p, err := scanBotPersona(r.pool.QueryRow(ctx, `
		SELECT `+botPersonaSelectColumns+`
		FROM bot_personas
		WHERE id = $1 AND owner_user_id = $2 AND is_active
	`, id, userID))
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return p, nil
}

// ListAll returns all personas, active or inactive, for admin management.
func (r *BotPersonaRepository) ListAll(ctx context.Context) ([]*BotPersona, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+botPersonaSelectColumns+`
		FROM bot_personas
		ORDER BY name
		LIMIT $1
	`, maxPersonaListSize)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	personas := []*BotPersona{}
	for rows.Next() {
		p, err := scanBotPersona(rows)
		if err != nil {
			return nil, err
		}
		personas = append(personas, p)
	}
	return personas, rows.Err()
}

// CreateOwned creates a new persona owned by the given user.
func (r *BotPersonaRepository) CreateOwned(ctx context.Context, userID int, persona *BotPersona) (*BotPersona, error) {
	query := `
		INSERT INTO bot_personas (
			slug, name, description, category, owner_user_id, visibility, source_format,
			system_prompt, personality, scenario, first_message, example_dialogue, response_style_profile,
			post_history_instructions, alternate_greetings, creator_notes, tags,
			creator_name, character_version, extensions_json, character_book_json, raw_card_json,
			import_source_filename, avatar_url, preview_video_url, gallery_urls, is_nsfw, is_active
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7,
			$8, $9, $10, $11, $12, $13,
			$14, $15, $16, $17,
			$18, $19, $20, $21, $22,
			$23, $24, $25, $26, $27, TRUE
		)
		RETURNING ` + botPersonaSelectColumns
	return scanBotPersona(r.pool.QueryRow(
		ctx,
		query,
		persona.Slug, persona.Name, persona.Description, persona.Category, userID, persona.Visibility, persona.SourceFormat,
		persona.SystemPrompt, persona.Personality, persona.Scenario, persona.FirstMessage, persona.ExampleDialogue, responseStyleProfileOrDefault(persona.ResponseStyleProfile),
		persona.PostHistoryInstructions, persona.AlternateGreetings, persona.CreatorNotes, persona.Tags,
		persona.CreatorName, persona.CharacterVersion, emptyRawJSON(persona.ExtensionsJSON), nilIfEmptyRawJSON(persona.CharacterBookJSON), nilIfEmptyRawJSON(persona.RawCardJSON),
		persona.ImportSourceFilename, persona.AvatarURL, persona.PreviewVideoURL, persona.GalleryURLs, persona.IsNSFW,
	))
}

// UpdateOwned updates an existing user-owned persona.
func (r *BotPersonaRepository) UpdateOwned(ctx context.Context, userID, id int, persona *BotPersona) (*BotPersona, error) {
	query := `
		UPDATE bot_personas
		SET name = $3,
		    description = $4,
		    category = $5,
		    visibility = $6,
		    source_format = $7,
		    system_prompt = $8,
		    personality = $9,
		    scenario = $10,
		    first_message = $11,
		example_dialogue = $12,
		response_style_profile = $13,
		post_history_instructions = $14,
		alternate_greetings = $15,
		creator_notes = $16,
		tags = $17,
		creator_name = $18,
		character_version = $19,
		extensions_json = $20,
		character_book_json = $21,
		raw_card_json = $22,
		import_source_filename = $23,
		avatar_url = $24,
		preview_video_url = $25,
		gallery_urls = $26,
		is_nsfw = $27,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND owner_user_id = $2 AND is_active
		RETURNING ` + botPersonaSelectColumns
	return scanBotPersona(r.pool.QueryRow(
		ctx,
		query,
		id, userID,
		persona.Name, persona.Description, persona.Category, persona.Visibility, persona.SourceFormat,
		persona.SystemPrompt, persona.Personality, persona.Scenario, persona.FirstMessage, persona.ExampleDialogue, responseStyleProfileOrDefault(persona.ResponseStyleProfile),
		persona.PostHistoryInstructions, persona.AlternateGreetings, persona.CreatorNotes, persona.Tags,
		persona.CreatorName, persona.CharacterVersion, emptyRawJSON(persona.ExtensionsJSON), nilIfEmptyRawJSON(persona.CharacterBookJSON), nilIfEmptyRawJSON(persona.RawCardJSON),
		persona.ImportSourceFilename, persona.AvatarURL, persona.PreviewVideoURL, persona.GalleryURLs, persona.IsNSFW,
	))
}

// DeleteOwned soft-deletes a user-owned persona.
func (r *BotPersonaRepository) DeleteOwned(ctx context.Context, userID, id int) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE bot_personas
		SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND owner_user_id = $2 AND is_active
	`, id, userID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// UpdateMedia updates avatar, preview video, and optionally gallery URLs for
// an admin-curated persona. A nil galleryURLs pointer preserves the existing
// gallery; a non-nil empty slice clears it.
func (r *BotPersonaRepository) UpdateMedia(ctx context.Context, id int, avatarURL *string, previewVideoURL *string, galleryURLs *[]string) (*BotPersona, error) {
	query := `
		UPDATE bot_personas
		SET avatar_url = $2,
		    preview_video_url = $3,
		    gallery_urls = COALESCE($4::text[], gallery_urls),
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
		RETURNING ` + botPersonaSelectColumns + `
	`

	var galleryArg interface{}
	if galleryURLs != nil {
		galleryArg = *galleryURLs
	}

	p, err := scanBotPersona(r.pool.QueryRow(ctx, query, id, avatarURL, previewVideoURL, galleryArg))
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return p, nil
}

func emptyRawJSON(raw json.RawMessage) json.RawMessage {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" {
		return json.RawMessage(`{}`)
	}
	return json.RawMessage(trimmed)
}

func nilIfEmptyRawJSON(raw json.RawMessage) json.RawMessage {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" {
		return nil
	}
	return json.RawMessage(trimmed)
}

func responseStyleProfileOrDefault(profile string) string {
	if strings.TrimSpace(profile) == "" {
		return ResponseStyleProfileInherit
	}
	return strings.TrimSpace(profile)
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
func (r *BotConversationRepository) Create(ctx context.Context, userID, personaID int, title *string, settings *ConversationSettings) (*BotConversation, error) {
	c := &BotConversation{UserID: userID, PersonaID: personaID, Title: title}
	if settings == nil {
		settings = &ConversationSettings{}
	}
	c.Settings = settings
	query := `
		INSERT INTO bot_conversations (user_id, persona_id, title, settings_user_name, settings_user_age, settings_user_gender)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at, last_message_at
	`
	err := r.pool.QueryRow(ctx, query, userID, personaID, title,
		settings.UserName, settings.UserAge, settings.UserGender,
	).Scan(&c.ID, &c.CreatedAt, &c.LastMessageAt)
	if err != nil {
		return nil, err
	}
	return c, nil
}

// CreateWithMessages creates a conversation and any initial messages in a
// single transaction so partial guest-import failures cannot leave orphaned
// conversations behind.
func (r *BotConversationRepository) CreateWithMessages(ctx context.Context, userID, personaID int, title *string, settings *ConversationSettings, messages []*BotMessage) (*BotConversation, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	c := &BotConversation{UserID: userID, PersonaID: personaID, Title: title}
	if settings == nil {
		settings = &ConversationSettings{}
	}
	c.Settings = settings

	query := `
		INSERT INTO bot_conversations (user_id, persona_id, title, settings_user_name, settings_user_age, settings_user_gender)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at, last_message_at
	`
	err = tx.QueryRow(ctx, query, userID, personaID, title,
		settings.UserName, settings.UserAge, settings.UserGender,
	).Scan(&c.ID, &c.CreatedAt, &c.LastMessageAt)
	if err != nil {
		return nil, err
	}

	if len(messages) > 0 {
		insertMessageQuery := `
			INSERT INTO bot_messages (conversation_id, role, content, failed)
			VALUES ($1, $2, $3, $4)
		`
		for _, m := range messages {
			if _, err := tx.Exec(ctx, insertMessageQuery, c.ID, m.Role, m.Content, m.Failed); err != nil {
				return nil, err
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE bot_conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1`, c.ID); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return c, nil
}

// scanConversation scans a row with settings columns into a BotConversation.
// Expects columns in order: id, user_id, persona_id, title, settings_user_name,
// settings_user_age, settings_user_gender, created_at, last_message_at, archived_at.
func scanConversation(scanner interface {
	Scan(dest ...interface{}) error
}) (*BotConversation, error) {
	c := &BotConversation{}
	s := &ConversationSettings{}
	err := scanner.Scan(
		&c.ID, &c.UserID, &c.PersonaID, &c.Title,
		&s.UserName, &s.UserAge, &s.UserGender,
		&c.CreatedAt, &c.LastMessageAt, &c.ArchivedAt,
	)
	if err != nil {
		return nil, err
	}
	c.Settings = s
	return c, nil
}

// GetActiveByUserAndPersonaID returns the user's most recently active
// non-archived conversation with the given persona, if one exists.
func (r *BotConversationRepository) GetActiveByUserAndPersonaID(ctx context.Context, userID, personaID int) (*BotConversation, error) {
	query := `
		SELECT id, user_id, persona_id, title, settings_user_name, settings_user_age, settings_user_gender, created_at, last_message_at, archived_at
		FROM bot_conversations
		WHERE user_id = $1 AND persona_id = $2 AND archived_at IS NULL
		ORDER BY last_message_at DESC
		LIMIT 1
	`
	c, err := scanConversation(r.pool.QueryRow(ctx, query, userID, personaID))
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
	query := `
		SELECT id, user_id, persona_id, title, settings_user_name, settings_user_age, settings_user_gender, created_at, last_message_at, archived_at
		FROM bot_conversations
		WHERE id = $1 AND user_id = $2
	`
	c, err := scanConversation(r.pool.QueryRow(ctx, query, id, userID))
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
			c.id, c.user_id, c.persona_id, c.title,
			lm.content,
			c.settings_user_name, c.settings_user_age, c.settings_user_gender,
			c.created_at, c.last_message_at, c.archived_at,
			` + qualifySelectColumns("p", botPersonaSelectColumns) + `
		FROM bot_conversations c
		INNER JOIN bot_personas p ON p.id = c.persona_id AND p.is_active
		LEFT JOIN LATERAL (
			SELECT content
			FROM bot_messages
			WHERE conversation_id = c.id
			ORDER BY created_at DESC, id DESC
			LIMIT 1
		) lm ON TRUE
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
		s := &ConversationSettings{}
		p := &BotPersona{}
		if err := rows.Scan(
			&c.ID, &c.UserID, &c.PersonaID, &c.Title,
			&c.LastMessagePreview,
			&s.UserName, &s.UserAge, &s.UserGender,
			&c.CreatedAt, &c.LastMessageAt, &c.ArchivedAt,
			&p.ID, &p.Slug, &p.Name, &p.Description, &p.Category, &p.OwnerUserID, &p.Visibility, &p.SourceFormat,
			&p.SystemPrompt, &p.Personality, &p.Scenario, &p.FirstMessage, &p.ExampleDialogue, &p.ResponseStyleProfile,
			&p.PostHistoryInstructions, &p.AlternateGreetings, &p.CreatorNotes, &p.Tags, &p.CreatorName,
			&p.CharacterVersion, &p.ExtensionsJSON, &p.CharacterBookJSON, &p.RawCardJSON,
			&p.ImportSourceFilename, &p.AvatarURL, &p.PreviewVideoURL, &p.GalleryURLs,
			&p.IsNSFW, &p.IsActive, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		c.Settings = s
		c.Persona = p
		conversations = append(conversations, c)
	}
	return conversations, rows.Err()
}

// ListByUserIDAndPersonaID retrieves a user's conversations with a specific
// persona, newest first. Used for the chat history drawer.
func (r *BotConversationRepository) ListByUserIDAndPersonaID(ctx context.Context, userID, personaID, limit, offset int) ([]*BotConversation, error) {
	query := `
		SELECT c.id, c.user_id, c.persona_id, c.title,
		       lm.content,
		       c.settings_user_name, c.settings_user_age, c.settings_user_gender,
		       c.created_at, c.last_message_at, c.archived_at
		FROM bot_conversations c
		INNER JOIN bot_personas p ON p.id = c.persona_id AND p.is_active
		LEFT JOIN LATERAL (
		    SELECT content
		    FROM bot_messages
		    WHERE conversation_id = c.id
		    ORDER BY created_at DESC, id DESC
		    LIMIT 1
		) lm ON TRUE
		WHERE c.user_id = $1 AND c.persona_id = $2 AND c.archived_at IS NULL
		ORDER BY c.last_message_at DESC
		LIMIT $3 OFFSET $4
	`
	rows, err := r.pool.Query(ctx, query, userID, personaID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	conversations := []*BotConversation{}
	for rows.Next() {
		c := &BotConversation{}
		s := &ConversationSettings{}
		err := rows.Scan(
			&c.ID, &c.UserID, &c.PersonaID, &c.Title,
			&c.LastMessagePreview,
			&s.UserName, &s.UserAge, &s.UserGender,
			&c.CreatedAt, &c.LastMessageAt, &c.ArchivedAt,
		)
		if err != nil {
			return nil, err
		}
		c.Settings = s
		conversations = append(conversations, c)
	}
	return conversations, rows.Err()
}

// UpdateSettings updates the per-conversation user settings.
func (r *BotConversationRepository) UpdateSettings(ctx context.Context, conversationID int, settings *ConversationSettings) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE bot_conversations
		SET settings_user_name = $1, settings_user_age = $2, settings_user_gender = $3
		WHERE id = $4
	`, settings.UserName, settings.UserAge, settings.UserGender, conversationID)
	return err
}

// ForkConversation creates a new conversation for the same persona, copying
// all messages from the original. Returns the new conversation.
func (r *BotConversationRepository) ForkConversation(ctx context.Context, userID int, original *BotConversation) (*BotConversation, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Create new conversation with same persona, title, and settings
	title := "Copy of " + coalesceString(original.Title, original.Persona.Name)
	settings := original.Settings
	if settings == nil {
		settings = &ConversationSettings{}
	}

	query := `
		INSERT INTO bot_conversations (user_id, persona_id, title, settings_user_name, settings_user_age, settings_user_gender)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at, last_message_at
	`
	newConv := &BotConversation{UserID: userID, PersonaID: original.PersonaID, Title: &title}
	err = tx.QueryRow(ctx, query, userID, original.PersonaID, &title,
		settings.UserName, settings.UserAge, settings.UserGender,
	).Scan(&newConv.ID, &newConv.CreatedAt, &newConv.LastMessageAt)
	if err != nil {
		return nil, err
	}
	newConv.Settings = settings

	// Copy all messages from the original conversation
	_, err = tx.Exec(ctx, `
		INSERT INTO bot_messages (conversation_id, role, content, failed, created_at)
		SELECT $1, role, content, failed, created_at
		FROM bot_messages
		WHERE conversation_id = $2
		ORDER BY id
	`, newConv.ID, original.ID)
	if err != nil {
		return nil, err
	}

	if _, err := tx.Exec(ctx, `UPDATE bot_conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1`, newConv.ID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return newConv, nil
}

// Archive soft-deletes a bot conversation by setting archived_at. It returns
// false when no conversation matched the requested id/user ownership pair.
func (r *BotConversationRepository) Archive(ctx context.Context, conversationID, userID int) (bool, error) {
	tag, err := r.pool.Exec(ctx, `UPDATE bot_conversations SET archived_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`, conversationID, userID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// ArchiveByUserAndPersonaID soft-deletes every active conversation the user
// has with a persona. It returns how many rows were archived.
func (r *BotConversationRepository) ArchiveByUserAndPersonaID(ctx context.Context, userID, personaID int) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE bot_conversations
		SET archived_at = CURRENT_TIMESTAMP
		WHERE user_id = $1
		  AND persona_id = $2
		  AND archived_at IS NULL
	`, userID, personaID)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// UpdateLastMessageAt bumps the conversation's last_message_at to now.
func (r *BotConversationRepository) UpdateLastMessageAt(ctx context.Context, conversationID int) error {
	_, err := r.pool.Exec(ctx, `UPDATE bot_conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1`, conversationID)
	return err
}

func coalesceString(s *string, fallback string) string {
	if s != nil && *s != "" {
		return *s
	}
	return fallback
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

// RepairStaleDanglingUserTurn inserts a failed assistant fallback when the
// latest message in a conversation is an old user turn with no assistant
// response. It returns nil when there is nothing to repair.
func (r *BotMessageRepository) RepairStaleDanglingUserTurn(ctx context.Context, conversationID int, staleAfter time.Duration, content string) (*BotMessage, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Serialize repairs for a conversation before checking its latest message.
	// Without this lock, simultaneous page loads can both observe the same stale
	// user turn and each append an assistant fallback.
	var lockedConversationID int
	err = tx.QueryRow(ctx, `
		SELECT id
		FROM bot_conversations
		WHERE id = $1
		FOR UPDATE
	`, conversationID).Scan(&lockedConversationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	query := `
		WITH last_message AS (
			SELECT id, created_at
			FROM bot_messages
			WHERE conversation_id = $1
			ORDER BY id DESC
			LIMIT 1
		), inserted AS (
			INSERT INTO bot_messages (conversation_id, role, content, failed)
			SELECT $1, $2, $3, TRUE
			FROM last_message lm
			JOIN bot_messages m ON m.id = lm.id
			WHERE m.role = $4
			  AND lm.created_at <= NOW() - ($5::DOUBLE PRECISION * INTERVAL '1 second')
			RETURNING id, conversation_id, role, content, failed, created_at
		)
		SELECT id, conversation_id, role, content, failed, created_at
		FROM inserted
	`
	m := &BotMessage{}
	err = tx.QueryRow(ctx, query,
		conversationID,
		BotMessageRoleAssistant,
		content,
		BotMessageRoleUser,
		staleAfter.Seconds(),
	).Scan(&m.ID, &m.ConversationID, &m.Role, &m.Content, &m.Failed, &m.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			if err := tx.Commit(ctx); err != nil {
				return nil, err
			}
			return nil, nil
		}
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return m, nil
}

// BulkCreateMessages inserts multiple messages in a single batch for a conversation.
func (r *BotMessageRepository) BulkCreateMessages(ctx context.Context, conversationID int, messages []*BotMessage) ([]*BotMessage, error) {
	if len(messages) == 0 {
		return messages, nil
	}
	query := `
		INSERT INTO bot_messages (conversation_id, role, content, failed)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at
	`
	created := make([]*BotMessage, len(messages))
	for i, m := range messages {
		m.ConversationID = conversationID
		created[i] = &BotMessage{
			ConversationID: conversationID,
			Role:           m.Role,
			Content:        m.Content,
			Failed:         false,
		}
		err := r.pool.QueryRow(ctx, query, conversationID, m.Role, m.Content, false).
			Scan(&created[i].ID, &created[i].CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("bulk insert message %d: %w", i, err)
		}
	}
	return created, nil
}

// ListByConversationID retrieves the most recent messages for a conversation
// and returns that bounded window in chronological order.
func (r *BotMessageRepository) ListByConversationID(ctx context.Context, conversationID int, limit int) ([]*BotMessage, error) {
	query := `
		SELECT id, conversation_id, role, content, failed, created_at
		FROM (
			SELECT id, conversation_id, role, content, failed, created_at
			FROM bot_messages
			WHERE conversation_id = $1
			ORDER BY id DESC
			LIMIT $2
		) recent
		ORDER BY id
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

// GetLatestAssistantForRegeneration returns messageID only when it is the
// conversation's latest message and is an assistant reply. This keeps
// regeneration from rewriting earlier history after the user has continued.
func (r *BotMessageRepository) GetLatestAssistantForRegeneration(ctx context.Context, conversationID, messageID int) (*BotMessage, error) {
	query := `
		SELECT m.id, m.conversation_id, m.role, m.content, m.failed, m.created_at
		FROM bot_messages m
		WHERE m.id = $1
		  AND m.conversation_id = $2
		  AND m.role = $3
		  AND NOT EXISTS (
			SELECT 1
			FROM bot_messages newer
			WHERE newer.conversation_id = m.conversation_id
			  AND newer.id > m.id
		  )
	`
	m := &BotMessage{}
	err := r.pool.QueryRow(ctx, query, messageID, conversationID, BotMessageRoleAssistant).
		Scan(&m.ID, &m.ConversationID, &m.Role, &m.Content, &m.Failed, &m.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return m, nil
}

// ListBeforeMessageID returns the most recent messages before messageID in
// chronological order. The target assistant reply itself is intentionally
// excluded so a regeneration is based on the same conversation state.
func (r *BotMessageRepository) ListBeforeMessageID(ctx context.Context, conversationID, messageID, limit int) ([]*BotMessage, error) {
	query := `
		SELECT id, conversation_id, role, content, failed, created_at
		FROM (
			SELECT id, conversation_id, role, content, failed, created_at
			FROM bot_messages
			WHERE conversation_id = $1 AND id < $2
			ORDER BY id DESC
			LIMIT $3
		) recent
		ORDER BY id
	`
	rows, err := r.pool.Query(ctx, query, conversationID, messageID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

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

// ReplaceLatestAssistantContent updates a reply only if it is still latest
// and still contains the content the caller originally read. The content
// check prevents two concurrent regenerations from overwriting each other.
func (r *BotMessageRepository) ReplaceLatestAssistantContent(ctx context.Context, conversationID, messageID int, expectedContent, content string) (*BotMessage, error) {
	query := `
		UPDATE bot_messages AS target
		SET content = $4, failed = FALSE
		WHERE target.id = $1
		  AND target.conversation_id = $2
		  AND target.role = $3
		  AND target.content = $5
		  AND NOT EXISTS (
			SELECT 1
			FROM bot_messages newer
			WHERE newer.conversation_id = target.conversation_id
			  AND newer.id > target.id
		  )
		RETURNING target.id, target.conversation_id, target.role, target.content, target.failed, target.created_at
	`
	m := &BotMessage{}
	err := r.pool.QueryRow(ctx, query, messageID, conversationID, BotMessageRoleAssistant, content, expectedContent).
		Scan(&m.ID, &m.ConversationID, &m.Role, &m.Content, &m.Failed, &m.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return m, nil
}

// EditLatestAssistantContent atomically records the previous text and replaces
// the latest assistant reply. The ownership join keeps authorization at the
// data boundary, and the row lock prevents racing edits from losing history.
func (r *BotMessageRepository) EditLatestAssistantContent(ctx context.Context, userID, conversationID, messageID int, content string) (*BotMessage, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	current := &BotMessage{}
	query := `
		SELECT m.id, m.conversation_id, m.role, m.content, m.failed, m.created_at
		FROM bot_messages m
		JOIN bot_conversations c ON c.id = m.conversation_id
		WHERE c.user_id = $1
		  AND c.id = $2
		  AND m.id = $3
		  AND m.role = $4
		  AND NOT EXISTS (
			SELECT 1 FROM bot_messages newer
			WHERE newer.conversation_id = m.conversation_id AND newer.id > m.id
		  )
		FOR UPDATE OF m
	`
	err = tx.QueryRow(ctx, query, userID, conversationID, messageID, BotMessageRoleAssistant).
		Scan(&current.ID, &current.ConversationID, &current.Role, &current.Content, &current.Failed, &current.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if current.Content == content {
		return current, nil
	}

	if _, err = tx.Exec(ctx, `
		INSERT INTO bot_message_edit_history (message_id, previous_content, edited_by)
		VALUES ($1, $2, $3)
	`, messageID, current.Content, userID); err != nil {
		return nil, err
	}

	updated := &BotMessage{}
	err = tx.QueryRow(ctx, `
		UPDATE bot_messages AS target
		SET content = $2, failed = FALSE
		WHERE target.id = $1
		  AND target.conversation_id = $3
		  AND target.role = $4
		  AND NOT EXISTS (
			SELECT 1 FROM bot_messages newer
			WHERE newer.conversation_id = target.conversation_id AND newer.id > target.id
		  )
		RETURNING id, conversation_id, role, content, failed, created_at
	`, messageID, content, conversationID, BotMessageRoleAssistant).Scan(
		&updated.ID, &updated.ConversationID, &updated.Role,
		&updated.Content, &updated.Failed, &updated.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return updated, nil
}
