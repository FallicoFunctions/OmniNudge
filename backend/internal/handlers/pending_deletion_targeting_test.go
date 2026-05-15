package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
)

func markUserPendingDeletion(t *testing.T, db *database.Database, userID int) {
	t.Helper()
	_, err := db.Pool.Exec(context.Background(), `
		UPDATE users
		SET deleted_at = NOW(), permanent_deletion_at = NOW() + INTERVAL '30 days'
		WHERE id = $1
	`, userID)
	if err != nil {
		t.Fatalf("mark user pending deletion: %v", err)
	}
}

func TestCreateConversation_PendingDeletionTargetHidden(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	markUserPendingDeletion(t, db, user2ID)

	router := gin.New()
	router.POST("/conversations", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.CreateConversation(c)
	})

	body := map[string]any{"other_user_id": user2ID}
	bodyJSON, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/conversations", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestAddHubModerator_PendingDeletionTargetHidden(t *testing.T) {
	f := setupHubSettingsHandlerTest(t)
	defer f.cleanup()

	markUserPendingDeletion(t, f.db, f.nonModID)

	router := gin.New()
	router.POST("/hubs/:name/moderators", mockAuthMiddleware(f.ownerID), f.handler.AddHubModerator)

	body := map[string]any{
		"username": f.nonModUsername,
		"role":     "moderator",
	}
	bodyJSON, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("/hubs/%s/moderators", f.hubName), bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestBlockingHandlers_PendingDeletionTargetHidden(t *testing.T) {
	handler, db, blockerID, _, _, blockedUsername, cleanup := setupBlockingHandlerTest(t)
	defer cleanup()

	userRepo := models.NewUserRepository(db.Pool)
	blockedUser, err := userRepo.GetByUsername(context.Background(), blockedUsername)
	if err != nil {
		t.Fatalf("load blocked user: %v", err)
	}
	if blockedUser == nil {
		t.Fatal("blocked user missing")
	}
	markUserPendingDeletion(t, db, blockedUser.ID)

	router := gin.New()
	router.POST("/block", func(c *gin.Context) {
		c.Set("user_id", blockerID)
		handler.BlockUser(c)
	})
	router.DELETE("/block/:username", func(c *gin.Context) {
		c.Set("user_id", blockerID)
		handler.UnblockUser(c)
	})

	body := map[string]string{"username": blockedUsername}
	bodyJSON, _ := json.Marshal(body)
	reqBlock := httptest.NewRequest(http.MethodPost, "/block", bytes.NewBuffer(bodyJSON))
	reqBlock.Header.Set("Content-Type", "application/json")
	wBlock := httptest.NewRecorder()
	router.ServeHTTP(wBlock, reqBlock)
	if wBlock.Code != http.StatusNotFound {
		t.Fatalf("expected block 404, got %d body=%s", wBlock.Code, wBlock.Body.String())
	}

	reqUnblock := httptest.NewRequest(http.MethodDelete, "/block/"+blockedUsername, nil)
	wUnblock := httptest.NewRecorder()
	router.ServeHTTP(wUnblock, reqUnblock)
	if wUnblock.Code != http.StatusNotFound {
		t.Fatalf("expected unblock 404, got %d body=%s", wUnblock.Code, wUnblock.Body.String())
	}
}

func TestGetPost_PendingDeletionAuthorHiddenFromOtherUsers(t *testing.T) {
	db, err := database.NewTest()
	if err != nil {
		t.Fatalf("new test db: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	if err := db.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if err := database.ResetTestData(ctx, db); err != nil {
		t.Fatalf("reset: %v", err)
	}

	userRepo := models.NewUserRepository(db.Pool)
	author := &models.User{Username: uniqueCommentsUsername("pd_author"), PasswordHash: "hash"}
	if err := userRepo.Create(ctx, author); err != nil {
		t.Fatalf("create author: %v", err)
	}
	viewer := &models.User{Username: uniqueCommentsUsername("pd_viewer"), PasswordHash: "hash"}
	if err := userRepo.Create(ctx, viewer); err != nil {
		t.Fatalf("create viewer: %v", err)
	}

	post := createTestPost(t, db, author.ID)
	markUserPendingDeletion(t, db, author.ID)

	postRepo := models.NewPlatformPostRepository(db.Pool)
	hubRepo := models.NewHubRepository(db.Pool)
	handler := NewPostsHandler(db.Pool, postRepo, hubRepo, userRepo, nil, nil, nil)

	router := gin.New()
	router.GET("/posts/:id", func(c *gin.Context) {
		c.Set("user_id", viewer.ID)
		handler.GetPost(c)
	})

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/posts/%d", post.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestGetConversations_PendingDeletionOtherUserHidden(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	user3 := &models.User{Username: uniqueConversationsUsername("pdm3"), PasswordHash: "hash"}
	if err := userRepo.Create(ctx, user3); err != nil {
		t.Fatalf("create user3: %v", err)
	}

	convRepo := models.NewConversationRepository(db.Pool)
	if _, err := convRepo.Create(ctx, user1ID, user2ID); err != nil {
		t.Fatalf("create hidden conversation: %v", err)
	}
	visibleConv, err := convRepo.Create(ctx, user1ID, user3.ID)
	if err != nil {
		t.Fatalf("create visible conversation: %v", err)
	}

	markUserPendingDeletion(t, db, user2ID)

	router := gin.New()
	router.GET("/conversations", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetConversations(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/conversations", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var response map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	conversations, ok := response["conversations"].([]any)
	if !ok {
		t.Fatalf("missing conversations array: %s", w.Body.String())
	}
	if len(conversations) != 1 {
		t.Fatalf("expected 1 visible conversation, got %d body=%s", len(conversations), w.Body.String())
	}
	convMap, ok := conversations[0].(map[string]any)
	if !ok {
		t.Fatalf("invalid conversation payload: %#v", conversations[0])
	}
	if convMap["id"] != float64(visibleConv.ID) {
		t.Fatalf("expected visible conversation id %d, got %v", visibleConv.ID, convMap["id"])
	}
}

func TestGetConversation_PendingDeletionOtherUserHidden(t *testing.T) {
	handler, db, user1ID, user2ID, cleanup := setupConversationsHandlerTest(t)
	defer cleanup()

	ctx := context.Background()
	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, user1ID, user2ID)
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	markUserPendingDeletion(t, db, user2ID)

	router := gin.New()
	router.GET("/conversations/:id", func(c *gin.Context) {
		c.Set("user_id", user1ID)
		handler.GetConversation(c)
	})

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/conversations/%d", conv.ID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestAddUserAccessByUsername_PendingDeletionTargetHidden(t *testing.T) {
	f := setupHubAccessRequestTest(t)
	defer f.cleanup()

	ctx := context.Background()
	userRepo := models.NewUserRepository(f.handler.userRepo.(*models.UserRepository).GetPool())
	targetUser, err := userRepo.GetByID(ctx, f.userID)
	if err != nil {
		t.Fatalf("load target user: %v", err)
	}
	if targetUser == nil {
		t.Fatal("target user missing")
	}
	markUserPendingDeletion(t, &database.Database{Pool: userRepo.GetPool()}, targetUser.ID)

	router := gin.New()
	router.POST("/mod/hubs/:hub_name/access-requests/add-user", func(c *gin.Context) {
		c.Set("user_id", f.ownerID)
		f.handler.AddUserAccessByUsername(c)
	})

	body := map[string]string{"username": targetUser.Username}
	bodyJSON, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPost, "/mod/hubs/"+f.hubName+"/access-requests/add-user", bytes.NewBuffer(bodyJSON))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d body=%s", w.Code, w.Body.String())
	}
}
