package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MediaGalleryHandler handles media gallery requests for conversations
type MediaGalleryHandler struct {
	pool *pgxpool.Pool
}

// NewMediaGalleryHandler creates a new media gallery handler
func NewMediaGalleryHandler(pool *pgxpool.Pool) *MediaGalleryHandler {
	return &MediaGalleryHandler{pool: pool}
}

// MediaItem represents a media item in the gallery
type MediaItem struct {
	ID            int       `json:"id"`
	MessageID     int       `json:"message_id"`
	SenderID      int       `json:"sender_id"`
	MessageType   string    `json:"message_type"`
	MediaURL      string    `json:"media_url"`
	MediaType     string    `json:"media_type"`
	MediaSize     int       `json:"media_size"`
	SentAt        time.Time `json:"created_at"` // JSON key kept as created_at for API compatibility
	IsMine        bool      `json:"is_mine"`    // True if current user sent it
}

// GetConversationMedia handles GET /api/v1/conversations/:id/media
func (h *MediaGalleryHandler) GetConversationMedia(c *gin.Context) {
	userID := c.GetInt("user_id")
	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation ID"})
		return
	}

	// Parse query parameters
	filter := c.DefaultQuery("filter", "all") // all, mine, theirs
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	// Validate filter
	if filter != "all" && filter != "mine" && filter != "theirs" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid filter. Must be 'all', 'mine', or 'theirs'"})
		return
	}

	// Validate limit
	if limit < 1 || limit > 500 {
		limit = 100
	}

	// Verify user is part of conversation
	var user1ID, user2ID int
	err = h.pool.QueryRow(c.Request.Context(),
		`SELECT user1_id, user2_id FROM conversations WHERE id = $1`,
		conversationID,
	).Scan(&user1ID, &user2ID)

	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch conversation"})
		return
	}

	if user1ID != userID && user2ID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not part of this conversation"})
		return
	}

	// Determine other user ID
	otherUserID := user1ID
	if otherUserID == userID {
		otherUserID = user2ID
	}

	// Build query based on filter
	var query string
	var args []interface{}

	baseQuery := `
		SELECT id, id as message_id, sender_id, message_type, media_url, media_type,
		       media_size, sent_at
		FROM messages
		WHERE conversation_id = $1
		  AND message_type IN ('image', 'video', 'audio', 'gif')
		  AND media_url IS NOT NULL
	`

	switch filter {
	case "mine":
		query = baseQuery + ` AND sender_id = $2 ORDER BY sent_at ASC LIMIT $3 OFFSET $4`
		args = []interface{}{conversationID, userID, limit, offset}
	case "theirs":
		query = baseQuery + ` AND sender_id = $2 ORDER BY sent_at ASC LIMIT $3 OFFSET $4`
		args = []interface{}{conversationID, otherUserID, limit, offset}
	default: // "all"
		query = baseQuery + ` ORDER BY sent_at ASC LIMIT $2 OFFSET $3`
		args = []interface{}{conversationID, limit, offset}
	}

	// Execute query
	rows, err := h.pool.Query(c.Request.Context(), query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch media", "details": err.Error()})
		return
	}
	defer rows.Close()

	// Collect media items
	items := make([]MediaItem, 0)
	for rows.Next() {
		var item MediaItem
		err := rows.Scan(
			&item.ID,
			&item.MessageID,
			&item.SenderID,
			&item.MessageType,
			&item.MediaURL,
			&item.MediaType,
			&item.MediaSize,
			&item.SentAt,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse media"})
			return
		}

		item.IsMine = item.SenderID == userID
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to iterate media"})
		return
	}

	// Get total count for pagination
	var totalCount int
	countQuery := `
		SELECT COUNT(*)
		FROM messages
		WHERE conversation_id = $1
		  AND message_type IN ('image', 'video', 'audio', 'gif')
		  AND media_url IS NOT NULL
	`

	switch filter {
	case "mine":
		countQuery += ` AND sender_id = $2`
		err = h.pool.QueryRow(c.Request.Context(), countQuery, conversationID, userID).Scan(&totalCount)
	case "theirs":
		countQuery += ` AND sender_id = $2`
		err = h.pool.QueryRow(c.Request.Context(), countQuery, conversationID, otherUserID).Scan(&totalCount)
	default:
		err = h.pool.QueryRow(c.Request.Context(), countQuery, conversationID).Scan(&totalCount)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count media"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"conversation_id": conversationID,
		"filter":          filter,
		"total":           totalCount,
		"limit":           limit,
		"offset":          offset,
		"items":           items,
	})
}

// FindMediaIndex handles GET /api/v1/conversations/:id/media/:messageId/index
// Returns the index of a specific message in the filtered media gallery
func (h *MediaGalleryHandler) FindMediaIndex(c *gin.Context) {
	userID := c.GetInt("user_id")
	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation ID"})
		return
	}

	messageID, err := strconv.Atoi(c.Param("messageId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message ID"})
		return
	}

	filter := c.DefaultQuery("filter", "all")

	// Validate filter
	if filter != "all" && filter != "mine" && filter != "theirs" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid filter"})
		return
	}

	// Verify user is part of conversation
	var user1ID, user2ID int
	err = h.pool.QueryRow(c.Request.Context(),
		`SELECT user1_id, user2_id FROM conversations WHERE id = $1`,
		conversationID,
	).Scan(&user1ID, &user2ID)

	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch conversation"})
		return
	}

	if user1ID != userID && user2ID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not part of this conversation"})
		return
	}

	// Determine other user ID
	otherUserID := user1ID
	if otherUserID == userID {
		otherUserID = user2ID
	}

	// Find the index of the message in the filtered list
	var indexQuery string
	var args []interface{}

	baseQuery := `
		WITH media_list AS (
			SELECT id, ROW_NUMBER() OVER (ORDER BY sent_at ASC) - 1 as index
			FROM messages
			WHERE conversation_id = $1
			  AND message_type IN ('image', 'video', 'audio', 'gif')
			  AND media_url IS NOT NULL
	`

	switch filter {
	case "mine":
		indexQuery = baseQuery + ` AND sender_id = $2
		)
		SELECT index FROM media_list WHERE id = $3`
		args = []interface{}{conversationID, userID, messageID}
	case "theirs":
		indexQuery = baseQuery + ` AND sender_id = $2
		)
		SELECT index FROM media_list WHERE id = $3`
		args = []interface{}{conversationID, otherUserID, messageID}
	default: // "all"
		indexQuery = baseQuery + `
		)
		SELECT index FROM media_list WHERE id = $2`
		args = []interface{}{conversationID, messageID}
	}

	var index int
	err = h.pool.QueryRow(c.Request.Context(), indexQuery, args...).Scan(&index)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Message not found in media gallery"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to find media index"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message_id": messageID,
		"index":      index,
		"filter":     filter,
	})
}
