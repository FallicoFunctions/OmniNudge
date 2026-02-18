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

func setupModMailHandlerTest(
	t *testing.T,
) (*ModMailHandler, *database.Database, int, int, string, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	err = database.ResetTestData(ctx, db)
	require.NoError(t, err)

	userRepo := models.NewUserRepository(db.Pool)
	requester := &models.User{
		Username:     fmt.Sprintf("modmail_req_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, requester))

	moderator := &models.User{
		Username:     fmt.Sprintf("modmail_mod_%d", time.Now().UnixNano()),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, moderator))

	hubRepo := models.NewHubRepository(db.Pool)
	createdBy := requester.ID
	hub := &models.Hub{
		Name:      fmt.Sprintf("modmail_hub_%d", time.Now().UnixNano()),
		CreatedBy: &createdBy,
	}
	require.NoError(t, hubRepo.Create(ctx, hub))

	hubModRepo := models.NewHubModeratorRepository(db.Pool)
	require.NoError(t, hubModRepo.AddModerator(ctx, hub.ID, moderator.ID))

	handler := NewModMailHandler(
		db.Pool,
		models.NewConversationRepository(db.Pool),
		models.NewMessageRepository(db.Pool),
		userRepo,
		hubModRepo,
		hubRepo,
	)

	cleanup := func() {
		db.Close()
	}

	return handler, db, requester.ID, moderator.ID, hub.Name, cleanup
}

func TestGetModMailRecipients_ExcludesBlockedModerators(t *testing.T) {
	handler, db, requesterID, moderatorID, hubName, cleanup := setupModMailHandlerTest(t)
	defer cleanup()

	_, err := db.Pool.Exec(context.Background(), `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, moderatorID, requesterID)
	require.NoError(t, err)

	router := gin.New()
	router.GET("/mod-mail/hubs/:hub_name/recipients", func(c *gin.Context) {
		c.Set("user_id", requesterID)
		handler.GetModMailRecipients(c)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/mod-mail/hubs/"+hubName+"/recipients", nil)
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var response struct {
		RecipientIDs []int `json:"recipient_ids"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	assert.NotContains(t, response.RecipientIDs, moderatorID)
}

func TestGetModMailRecipients_ExcludesRequesterFromRecipients(t *testing.T) {
	handler, db, requesterID, moderatorID, hubName, cleanup := setupModMailHandlerTest(t)
	defer cleanup()

	// Make requester an admin to ensure admin query also excludes requester.
	_, err := db.Pool.Exec(context.Background(), `
		UPDATE users SET role = 'admin' WHERE id = $1
	`, requesterID)
	require.NoError(t, err)

	router := gin.New()
	router.GET("/mod-mail/hubs/:hub_name/recipients", func(c *gin.Context) {
		c.Set("user_id", requesterID)
		handler.GetModMailRecipients(c)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/mod-mail/hubs/"+hubName+"/recipients", nil)
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var response struct {
		RecipientIDs []int `json:"recipient_ids"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	assert.NotContains(t, response.RecipientIDs, requesterID)
	assert.Contains(t, response.RecipientIDs, moderatorID)
}

func TestCreateModMail_BlockedModeratorForbidden(t *testing.T) {
	handler, db, requesterID, moderatorID, hubName, cleanup := setupModMailHandlerTest(t)
	defer cleanup()

	_, err := db.Pool.Exec(context.Background(), `
		INSERT INTO blocked_users (blocker_id, blocked_id)
		VALUES ($1, $2)
	`, moderatorID, requesterID)
	require.NoError(t, err)

	router := gin.New()
	router.POST("/mod-mail", func(c *gin.Context) {
		c.Set("user_id", requesterID)
		handler.CreateModMail(c)
	})

	body := map[string]string{
		"hub_name": hubName,
		"subject":  "Need help",
		"message":  "Hello mods",
	}
	payload, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mod-mail", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusForbidden, w.Code, w.Body.String())

	var response map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	assert.Contains(t, response["error"], "blocking settings")
}

func TestCreateModMail_UpgradesRequesterToModeratorWhenApplicable(t *testing.T) {
	handler, db, requesterID, _, hubName, cleanup := setupModMailHandlerTest(t)
	defer cleanup()

	var hubID int
	err := db.Pool.QueryRow(context.Background(), `
		SELECT id FROM hubs WHERE name = $1
	`, hubName).Scan(&hubID)
	require.NoError(t, err)

	// Requester is also a moderator for this hub.
	_, err = db.Pool.Exec(context.Background(), `
		INSERT INTO hub_moderators (hub_id, user_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, hubID, requesterID)
	require.NoError(t, err)

	router := gin.New()
	router.POST("/mod-mail", func(c *gin.Context) {
		c.Set("user_id", requesterID)
		handler.CreateModMail(c)
	})

	body := map[string]string{
		"hub_name": hubName,
		"subject":  "Moderator note",
		"message":  "Starting a mod mail thread",
	}
	payload, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/mod-mail", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	var response struct {
		ConversationID int `json:"conversation_id"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.NotZero(t, response.ConversationID)

	var isModerator bool
	err = db.Pool.QueryRow(context.Background(), `
		SELECT is_moderator
		FROM conversation_participants
		WHERE conversation_id = $1 AND user_id = $2
	`, response.ConversationID, requesterID).Scan(&isModerator)
	require.NoError(t, err)
	assert.True(t, isModerator)
}
