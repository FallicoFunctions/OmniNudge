package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupFoldersHandlerTest(t *testing.T) (*FoldersHandler, *models.UserRepository, *models.ConversationRepository, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	conversationRepo := models.NewConversationRepository(db.Pool)
	handler := NewFoldersHandler(db.Pool, conversationRepo)

	return handler, userRepo, conversationRepo, func() {
		db.Close()
	}
}

func createFolderTestUser(t *testing.T, userRepo *models.UserRepository, prefix string) *models.User {
	user := &models.User{
		Username:     fmt.Sprintf("%s_%d", prefix, time.Now().UnixNano()%1_000_000_000),
		PasswordHash: "hash",
	}
	require.NoError(t, userRepo.Create(context.Background(), user))
	return user
}

func TestFoldersHandler_CreateAndList(t *testing.T) {
	handler, userRepo, _, cleanup := setupFoldersHandlerTest(t)
	defer cleanup()

	user := createFolderTestUser(t, userRepo, "folders_create_list")

	router := gin.New()
	router.POST("/folders", func(c *gin.Context) {
		c.Set("user_id", user.ID)
		handler.CreateFolder(c)
	})
	router.GET("/folders", func(c *gin.Context) {
		c.Set("user_id", user.ID)
		handler.ListFolders(c)
	})

	createBody := map[string]any{
		"name":  "Important",
		"color": "#FF0000",
		"icon":  "⭐",
	}
	payload, _ := json.Marshal(createBody)
	createReq := httptest.NewRequest(http.MethodPost, "/folders", bytes.NewReader(payload))
	createReq.Header.Set("Content-Type", "application/json")
	createRes := httptest.NewRecorder()
	router.ServeHTTP(createRes, createReq)
	require.Equal(t, http.StatusCreated, createRes.Code, createRes.Body.String())

	listReq := httptest.NewRequest(http.MethodGet, "/folders", nil)
	listRes := httptest.NewRecorder()
	router.ServeHTTP(listRes, listReq)
	require.Equal(t, http.StatusOK, listRes.Code, listRes.Body.String())
	assert.Contains(t, listRes.Body.String(), "\"name\":\"Important\"")
}

func TestFoldersHandler_AddAndRemoveConversationMembership(t *testing.T) {
	handler, userRepo, conversationRepo, cleanup := setupFoldersHandlerTest(t)
	defer cleanup()

	userA := createFolderTestUser(t, userRepo, "folders_member_a")
	userB := createFolderTestUser(t, userRepo, "folders_member_b")
	conv, err := conversationRepo.Create(context.Background(), userA.ID, userB.ID)
	require.NoError(t, err)

	// Create a folder for user A.
	var folderID int
	err = handler.pool.QueryRow(context.Background(), `
		INSERT INTO conversation_folders (user_id, name, position)
		VALUES ($1, $2, 0)
		RETURNING id
	`, userA.ID, "Inbox").Scan(&folderID)
	require.NoError(t, err)

	router := gin.New()
	router.POST("/folders/:id/conversations/:conv_id", func(c *gin.Context) {
		c.Set("user_id", userA.ID)
		handler.AddConversationToFolder(c)
	})
	router.DELETE("/folders/:id/conversations/:conv_id", func(c *gin.Context) {
		c.Set("user_id", userA.ID)
		handler.RemoveConversationFromFolder(c)
	})

	addReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/folders/%d/conversations/%d", folderID, conv.ID), nil)
	addRes := httptest.NewRecorder()
	router.ServeHTTP(addRes, addReq)
	require.Equal(t, http.StatusCreated, addRes.Code, addRes.Body.String())

	removeReq := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/folders/%d/conversations/%d", folderID, conv.ID), nil)
	removeRes := httptest.NewRecorder()
	router.ServeHTTP(removeRes, removeReq)
	require.Equal(t, http.StatusOK, removeRes.Code, removeRes.Body.String())
}

func TestFoldersHandler_GetConversationFolders_RequiresConversationAccess(t *testing.T) {
	handler, userRepo, conversationRepo, cleanup := setupFoldersHandlerTest(t)
	defer cleanup()

	owner := createFolderTestUser(t, userRepo, "folders_owner")
	other := createFolderTestUser(t, userRepo, "folders_other")
	intruder := createFolderTestUser(t, userRepo, "folders_intruder")
	conv, err := conversationRepo.Create(context.Background(), owner.ID, other.ID)
	require.NoError(t, err)

	var folderID int
	err = handler.pool.QueryRow(context.Background(), `
		INSERT INTO conversation_folders (user_id, name, position)
		VALUES ($1, $2, 0)
		RETURNING id
	`, owner.ID, "Private").Scan(&folderID)
	require.NoError(t, err)
	_, err = handler.pool.Exec(context.Background(), `
		INSERT INTO conversation_folder_members (folder_id, conversation_id)
		VALUES ($1, $2)
	`, folderID, conv.ID)
	require.NoError(t, err)

	router := gin.New()
	router.GET("/conversations/:id/folders", func(c *gin.Context) {
		c.Set("user_id", intruder.ID)
		handler.GetConversationFolders(c)
	})

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/conversations/%d/folders", conv.ID), nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	require.Equal(t, http.StatusForbidden, res.Code, res.Body.String())
}

func TestFoldersHandler_ReorderFolders(t *testing.T) {
	handler, userRepo, _, cleanup := setupFoldersHandlerTest(t)
	defer cleanup()

	user := createFolderTestUser(t, userRepo, "folders_reorder")

	var folder1, folder2 int
	err := handler.pool.QueryRow(context.Background(), `
		INSERT INTO conversation_folders (user_id, name, position) VALUES ($1, 'A', 0) RETURNING id
	`, user.ID).Scan(&folder1)
	require.NoError(t, err)
	err = handler.pool.QueryRow(context.Background(), `
		INSERT INTO conversation_folders (user_id, name, position) VALUES ($1, 'B', 1) RETURNING id
	`, user.ID).Scan(&folder2)
	require.NoError(t, err)

	router := gin.New()
	router.POST("/folders/reorder", func(c *gin.Context) {
		c.Set("user_id", user.ID)
		handler.ReorderFolders(c)
	})

	body := map[string]any{"folder_ids": []int{folder2, folder1}}
	payload, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/folders/reorder", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	require.Equal(t, http.StatusOK, res.Code, res.Body.String())

	var pos1, pos2 int
	require.NoError(t, handler.pool.QueryRow(context.Background(), `SELECT position FROM conversation_folders WHERE id = $1`, folder1).Scan(&pos1))
	require.NoError(t, handler.pool.QueryRow(context.Background(), `SELECT position FROM conversation_folders WHERE id = $1`, folder2).Scan(&pos2))
	assert.Equal(t, 1, pos1)
	assert.Equal(t, 0, pos2)
}
