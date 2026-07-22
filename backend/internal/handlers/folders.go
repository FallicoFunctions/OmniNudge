package handlers

import (
	"errors"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/ports"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
)

type FoldersHandler struct {
	pool             *pgxpool.Pool
	conversationRepo ports.ConversationRepository
}

func NewFoldersHandler(pool *pgxpool.Pool, conversationRepo ports.ConversationRepository) *FoldersHandler {
	return &FoldersHandler{
		pool:             pool,
		conversationRepo: conversationRepo,
	}
}

type Folder struct {
	ID                int    `json:"id"`
	UserID            int    `json:"user_id"`
	Name              string `json:"name"`
	Color             string `json:"color"`
	Icon              string `json:"icon"`
	Position          int    `json:"position"`
	ConversationCount int    `json:"conversation_count,omitempty"`
}

type createFolderRequest struct {
	Name  string `json:"name" binding:"required"`
	Color string `json:"color"`
	Icon  string `json:"icon"`
}

type updateFolderRequest struct {
	Name  *string `json:"name"`
	Color *string `json:"color"`
	Icon  *string `json:"icon"`
}

type reorderFoldersRequest struct {
	FolderIDs []int `json:"folder_ids" binding:"required"`
}

func (h *FoldersHandler) getUserID(c *gin.Context) (int, bool) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return 0, false
	}
	return userID, true
}

// CreateFolder creates a new conversation folder.
// @Summary      Create folder
// @Tags         Folders
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      201  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /folders [post]
func (h *FoldersHandler) CreateFolder(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	var req createFolderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" || len(name) > 50 {
		RespondError(c, http.StatusBadRequest, "Folder name must be between 1 and 50 characters")
		return
	}
	color := strings.TrimSpace(req.Color)
	if color == "" {
		color = "#3B82F6"
	}
	icon := strings.TrimSpace(req.Icon)
	if icon == "" {
		icon = "📁"
	}

	var folder Folder
	err := h.pool.QueryRow(c.Request.Context(), `
		WITH next_pos AS (
			SELECT COALESCE(MAX(position), -1) + 1 AS pos
			FROM conversation_folders
			WHERE user_id = $1
		)
		INSERT INTO conversation_folders (user_id, name, color, icon, position)
		SELECT $1, $2, $3, $4, pos
		FROM next_pos
		RETURNING id, user_id, name, color, icon, position
	`, userID, name, color, icon).Scan(
		&folder.ID,
		&folder.UserID,
		&folder.Name,
		&folder.Color,
		&folder.Icon,
		&folder.Position,
	)
	if err != nil {
		h.handleFolderMutationError(c, err)
		return
	}

	c.JSON(http.StatusCreated, folder)
}

// ListFolders returns all folders for the current user.
// @Summary      List folders
// @Tags         Folders
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}   gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /folders [get]
func (h *FoldersHandler) ListFolders(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	rows, err := h.pool.Query(c.Request.Context(), `
		SELECT f.id, f.user_id, f.name, f.color, f.icon, f.position,
		       COUNT(m.id) AS conversation_count
		FROM conversation_folders f
		LEFT JOIN conversation_folder_members m ON m.folder_id = f.id
		WHERE f.user_id = $1
		GROUP BY f.id
		ORDER BY f.position ASC, f.id ASC
	`, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to list folders")
		return
	}
	defer rows.Close()

	folders := make([]Folder, 0)
	for rows.Next() {
		var folder Folder
		if err := rows.Scan(
			&folder.ID,
			&folder.UserID,
			&folder.Name,
			&folder.Color,
			&folder.Icon,
			&folder.Position,
			&folder.ConversationCount,
		); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to list folders")
			return
		}
		folders = append(folders, folder)
	}

	c.JSON(http.StatusOK, gin.H{"folders": folders})
}

// UpdateFolder updates a conversation folder.
// @Summary      Update folder
// @Tags         Folders
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "Folder ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /folders/{id} [put]
func (h *FoldersHandler) UpdateFolder(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	folderID, err := strconv.Atoi(c.Param("id"))
	if err != nil || folderID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid folder id")
		return
	}

	var req updateFolderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	var current Folder
	err = h.pool.QueryRow(c.Request.Context(), `
		SELECT id, user_id, name, color, icon, position
		FROM conversation_folders
		WHERE id = $1 AND user_id = $2
	`, folderID, userID).Scan(
		&current.ID,
		&current.UserID,
		&current.Name,
		&current.Color,
		&current.Icon,
		&current.Position,
	)
	if err == pgx.ErrNoRows {
		RespondError(c, http.StatusNotFound, "Folder not found")
		return
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load folder")
		return
	}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" || len(name) > 50 {
			RespondError(c, http.StatusBadRequest, "Folder name must be between 1 and 50 characters")
			return
		}
		current.Name = name
	}
	if req.Color != nil {
		color := strings.TrimSpace(*req.Color)
		if color == "" {
			RespondError(c, http.StatusBadRequest, "Folder color cannot be empty")
			return
		}
		current.Color = color
	}
	if req.Icon != nil {
		icon := strings.TrimSpace(*req.Icon)
		if icon == "" {
			RespondError(c, http.StatusBadRequest, "Folder icon cannot be empty")
			return
		}
		current.Icon = icon
	}

	err = h.pool.QueryRow(c.Request.Context(), `
		UPDATE conversation_folders
		SET name = $1, color = $2, icon = $3, updated_at = NOW()
		WHERE id = $4 AND user_id = $5
		RETURNING id, user_id, name, color, icon, position
	`, current.Name, current.Color, current.Icon, folderID, userID).Scan(
		&current.ID,
		&current.UserID,
		&current.Name,
		&current.Color,
		&current.Icon,
		&current.Position,
	)
	if err != nil {
		h.handleFolderMutationError(c, err)
		return
	}

	c.JSON(http.StatusOK, current)
}

// DeleteFolder deletes a conversation folder.
// @Summary      Delete folder
// @Tags         Folders
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Folder ID"
// @Success      204
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /folders/{id} [delete]
func (h *FoldersHandler) DeleteFolder(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}
	folderID, err := strconv.Atoi(c.Param("id"))
	if err != nil || folderID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid folder id")
		return
	}

	tag, err := h.pool.Exec(c.Request.Context(), `
		DELETE FROM conversation_folders
		WHERE id = $1 AND user_id = $2
	`, folderID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete folder")
		return
	}
	if tag.RowsAffected() == 0 {
		RespondError(c, http.StatusNotFound, "Folder not found")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Folder deleted"})
}

// ReorderFolders updates the display order of folders.
// @Summary      Reorder folders
// @Tags         Folders
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /folders/reorder [put]
func (h *FoldersHandler) ReorderFolders(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}

	var req reorderFoldersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	if len(req.FolderIDs) == 0 {
		RespondError(c, http.StatusBadRequest, "folder_ids cannot be empty")
		return
	}

	tx, err := h.pool.Begin(c.Request.Context())
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to start reorder transaction")
		return
	}
	defer tx.Rollback(c.Request.Context())

	var ownedCount int
	err = tx.QueryRow(c.Request.Context(), `
		SELECT COUNT(1)
		FROM conversation_folders
		WHERE user_id = $1
		  AND id = ANY($2)
	`, userID, req.FolderIDs).Scan(&ownedCount)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to validate folder ownership")
		return
	}
	if ownedCount != len(req.FolderIDs) {
		RespondError(c, http.StatusBadRequest, "One or more folders are invalid")
		return
	}

	for idx, folderID := range req.FolderIDs {
		if _, err := tx.Exec(c.Request.Context(), `
			UPDATE conversation_folders
			SET position = $1, updated_at = NOW()
			WHERE id = $2 AND user_id = $3
		`, idx, folderID, userID); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to reorder folders")
			return
		}
	}

	if err := tx.Commit(c.Request.Context()); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to reorder folders")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Folders reordered"})
}

// AddConversationToFolder adds a conversation to a folder.
// @Summary      Add conversation to folder
// @Tags         Folders
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "Folder ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /folders/{id}/conversations [post]
func (h *FoldersHandler) AddConversationToFolder(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}
	folderID, convID, valid := parseFolderAndConversationIDs(c)
	if !valid {
		return
	}

	if !h.ensureFolderOwnership(c, folderID, userID) {
		return
	}
	if !h.ensureConversationAccess(c, convID, userID) {
		return
	}

	_, err := h.pool.Exec(c.Request.Context(), `
		INSERT INTO conversation_folder_members (folder_id, conversation_id)
		VALUES ($1, $2)
	`, folderID, convID)
	if err != nil {
		h.handleFolderMutationError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Conversation added to folder"})
}

// RemoveConversationFromFolder removes a conversation from a folder.
// @Summary      Remove conversation from folder
// @Tags         Folders
// @Security     BearerAuth
// @Produce      json
// @Param        id               path  int  true  "Folder ID"
// @Param        conversation_id  path  int  true  "Conversation ID"
// @Success      204
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /folders/{id}/conversations/{conversation_id} [delete]
func (h *FoldersHandler) RemoveConversationFromFolder(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}
	folderID, convID, valid := parseFolderAndConversationIDs(c)
	if !valid {
		return
	}

	if !h.ensureFolderOwnership(c, folderID, userID) {
		return
	}

	tag, err := h.pool.Exec(c.Request.Context(), `
		DELETE FROM conversation_folder_members
		WHERE folder_id = $1 AND conversation_id = $2
	`, folderID, convID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to remove conversation from folder")
		return
	}
	if tag.RowsAffected() == 0 {
		RespondError(c, http.StatusNotFound, "Conversation is not in this folder")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Conversation removed from folder"})
}

// GetFolderConversations returns conversations in a folder.
// @Summary      Get folder conversations
// @Tags         Folders
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Folder ID"
// @Success      200  {array}   gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /folders/{id}/conversations [get]
func (h *FoldersHandler) GetFolderConversations(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}
	folderID, err := strconv.Atoi(c.Param("id"))
	if err != nil || folderID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid folder id")
		return
	}

	if !h.ensureFolderOwnership(c, folderID, userID) {
		return
	}

	rows, err := h.pool.Query(c.Request.Context(), `
		SELECT c.id, c.user1_id, c.user2_id, c.created_at, c.last_message_at, COALESCE(c.conversation_type, 'dm')
		FROM conversation_folder_members m
		JOIN conversations c ON c.id = m.conversation_id
		WHERE m.folder_id = $1
		  AND (
			-- DMs remain visible only while the folder owner is a participant and
			-- has not deleted the conversation from their own inbox.
			(
				COALESCE(c.conversation_type, 'dm') = 'dm'
				AND (
					(c.user1_id = $2 AND COALESCE(c.deleted_for_user1, FALSE) = FALSE)
					OR (c.user2_id = $2 AND COALESCE(c.deleted_for_user2, FALSE) = FALSE)
				)
			)
			-- Group and mod-mail membership is stored in the participants table;
			-- stale folder entries must never resurrect access after removal.
			OR (
				COALESCE(c.conversation_type, 'dm') IN ('group', 'mod_mail')
				AND EXISTS (
					SELECT 1 FROM conversation_participants cp
					WHERE cp.conversation_id = c.id AND cp.user_id = $2
				)
			)
		  )
		ORDER BY c.last_message_at DESC
	`, folderID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load folder conversations")
		return
	}
	defer rows.Close()

	conversations := make([]*models.Conversation, 0)
	for rows.Next() {
		conv := &models.Conversation{}
		if err := rows.Scan(&conv.ID, &conv.User1ID, &conv.User2ID, &conv.CreatedAt, &conv.LastMessageAt, &conv.ConversationType); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to load folder conversations")
			return
		}
		conversations = append(conversations, conv)
	}

	c.JSON(http.StatusOK, gin.H{"conversations": conversations})
}

// GetConversationFolders returns folders containing a conversation.
// @Summary      Get conversation folders
// @Tags         Folders
// @Security     BearerAuth
// @Produce      json
// @Param        conversation_id  path  int  true  "Conversation ID"
// @Success      200  {array}   gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations/{conversation_id}/folders [get]
func (h *FoldersHandler) GetConversationFolders(c *gin.Context) {
	userID, ok := h.getUserID(c)
	if !ok {
		return
	}
	convID, err := strconv.Atoi(c.Param("id"))
	if err != nil || convID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid conversation id")
		return
	}

	if !h.ensureConversationAccess(c, convID, userID) {
		return
	}

	rows, err := h.pool.Query(c.Request.Context(), `
		SELECT f.id, f.user_id, f.name, f.color, f.icon, f.position
		FROM conversation_folder_members m
		JOIN conversation_folders f ON f.id = m.folder_id
		WHERE m.conversation_id = $1
		  AND f.user_id = $2
		ORDER BY f.position ASC, f.id ASC
	`, convID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load folders for conversation")
		return
	}
	defer rows.Close()

	folders := make([]Folder, 0)
	for rows.Next() {
		var folder Folder
		if err := rows.Scan(&folder.ID, &folder.UserID, &folder.Name, &folder.Color, &folder.Icon, &folder.Position); err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to load folders for conversation")
			return
		}
		folders = append(folders, folder)
	}

	c.JSON(http.StatusOK, gin.H{"folders": folders})
}

func parseFolderAndConversationIDs(c *gin.Context) (int, int, bool) {
	folderID, err := strconv.Atoi(c.Param("id"))
	if err != nil || folderID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid folder id")
		return 0, 0, false
	}
	convID, err := strconv.Atoi(c.Param("conv_id"))
	if err != nil || convID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid conversation id")
		return 0, 0, false
	}
	return folderID, convID, true
}

func (h *FoldersHandler) ensureFolderOwnership(c *gin.Context, folderID int, userID int) bool {
	var count int
	err := h.pool.QueryRow(c.Request.Context(), `
		SELECT COUNT(1)
		FROM conversation_folders
		WHERE id = $1 AND user_id = $2
	`, folderID, userID).Scan(&count)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to validate folder")
		return false
	}
	if count == 0 {
		RespondError(c, http.StatusNotFound, "Folder not found")
		return false
	}
	return true
}

func (h *FoldersHandler) ensureConversationAccess(c *gin.Context, conversationID int, userID int) bool {
	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), conversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get conversation")
		return false
	}
	if conversation == nil {
		RespondError(c, http.StatusNotFound, "Conversation not found")
		return false
	}
	if conversation.ConversationType == "mod_mail" {
		var participantCount int
		err := h.pool.QueryRow(c.Request.Context(), `
			SELECT COUNT(1) FROM conversation_participants
			WHERE conversation_id = $1 AND user_id = $2
		`, conversationID, userID).Scan(&participantCount)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to verify conversation access")
			return false
		}
		if participantCount == 0 {
			RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
			return false
		}
		return true
	}
	if !conversation.IsParticipant(userID) {
		RespondError(c, http.StatusForbidden, "You are not a participant in this conversation")
		return false
	}
	return true
}

func (h *FoldersHandler) handleFolderMutationError(c *gin.Context, err error) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			RespondError(c, http.StatusConflict, "Folder or membership already exists")
			return
		case "23503":
			RespondError(c, http.StatusBadRequest, "Invalid folder or conversation reference")
			return
		case "P0001":
			RespondError(c, http.StatusBadRequest, pgErr.Message)
			return
		}
	}
	RespondError(c, http.StatusInternalServerError, "Folder operation failed")
}
