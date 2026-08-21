package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

type adminBlockStoreFake struct {
	blocks        []*models.OmniChatPersonaBlockAdminSummary
	total         int
	personaFilter *int
	limit         int
	offset        int
	overturnedID  int64
	overturnNote  string
	overturnErr   error
}

func (f *adminBlockStoreFake) ListForAdmin(_ context.Context, personaID *int, limit, offset int) ([]*models.OmniChatPersonaBlockAdminSummary, int, error) {
	f.personaFilter = personaID
	f.limit = limit
	f.offset = offset
	return f.blocks, f.total, nil
}

func (f *adminBlockStoreFake) Overturn(_ context.Context, blockID int64, adminUserID int, note string) (*models.OmniChatPersonaBlock, error) {
	if f.overturnErr != nil {
		return nil, f.overturnErr
	}
	f.overturnedID = blockID
	f.overturnNote = note
	return &models.OmniChatPersonaBlock{ID: blockID, OverturnedBy: &adminUserID}, nil
}

func newBlockAdminRouter(store *adminBlockStoreFake) *gin.Engine {
	gin.SetMode(gin.TestMode)
	handler := NewAdminOmniChatBlockHandler(store)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("role", c.GetHeader("X-Test-Role"))
		c.Set("user_id", 42)
		c.Next()
	})
	admin := router.Group("/admin")
	admin.Use(middleware.RequireRole("admin"))
	admin.GET("/omnichat/blocks", handler.List)
	admin.POST("/omnichat/blocks/:id/overturn", handler.Overturn)
	return router
}

func TestAdminOmniChatBlockReviewRequiresAdmin(t *testing.T) {
	store := &adminBlockStoreFake{}
	router := newBlockAdminRouter(store)

	for _, call := range []struct {
		method string
		path   string
		body   string
	}{
		{http.MethodGet, "/admin/omnichat/blocks", ""},
		{http.MethodPost, "/admin/omnichat/blocks/7/overturn", `{"note":"unfair"}`},
	} {
		req := httptest.NewRequest(call.method, call.path, strings.NewReader(call.body))
		req.Header.Set("X-Test-Role", "user")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		require.Equal(t, http.StatusForbidden, w.Code, call.path)
	}

	require.Zero(t, store.overturnedID, "a non-admin must not reach the store at all")
}

// The queue shows blocks in every state. A reviewer looking only at live blocks
// would never see a ten-minute one, and those are the likeliest to be unfair.
func TestAdminOmniChatBlockListReturnsEveryState(t *testing.T) {
	overturnedAt := time.Now()
	store := &adminBlockStoreFake{
		total: 3,
		blocks: []*models.OmniChatPersonaBlockAdminSummary{
			{OmniChatPersonaBlock: models.OmniChatPersonaBlock{ID: 1, Tier: 4, Reason: "kept going"},
				PersonaName: "Jesse", Username: "someone", InForce: true},
			{OmniChatPersonaBlock: models.OmniChatPersonaBlock{ID: 2, Tier: 1, Reason: "lapsed already"},
				PersonaName: "Jesse", Username: "someone", InForce: false},
			{OmniChatPersonaBlock: models.OmniChatPersonaBlock{ID: 3, Tier: 2, Reason: "misread a joke", OverturnedAt: &overturnedAt},
				PersonaName: "Jesse", Username: "someone", InForce: false},
		},
	}
	router := newBlockAdminRouter(store)

	req := httptest.NewRequest(http.MethodGet, "/admin/omnichat/blocks?limit=25&persona_id=9", nil)
	req.Header.Set("X-Test-Role", "admin")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	require.NotNil(t, store.personaFilter)
	require.Equal(t, 9, *store.personaFilter)
	require.Equal(t, 25, store.limit)

	body := w.Body.String()
	require.Contains(t, body, "kept going")
	require.Contains(t, body, "lapsed already")
	require.Contains(t, body, "misread a joke")
	// The reviewer has to see who, not just which ids.
	require.Contains(t, body, "Jesse")
	require.Contains(t, body, "someone")
}

func TestAdminOmniChatBlockListRejectsBadPaging(t *testing.T) {
	router := newBlockAdminRouter(&adminBlockStoreFake{})

	for _, query := range []string{"?limit=0", "?limit=500", "?limit=abc", "?offset=-1", "?persona_id=0"} {
		req := httptest.NewRequest(http.MethodGet, "/admin/omnichat/blocks"+query, nil)
		req.Header.Set("X-Test-Role", "admin")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		require.Equal(t, http.StatusBadRequest, w.Code, query)
	}
}

func TestAdminOmniChatBlockOverturn(t *testing.T) {
	store := &adminBlockStoreFake{}
	router := newBlockAdminRouter(store)

	req := httptest.NewRequest(http.MethodPost, "/admin/omnichat/blocks/7/overturn",
		strings.NewReader(`{"note":"reviewed: this was not an offence"}`))
	req.Header.Set("X-Test-Role", "admin")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, int64(7), store.overturnedID)
	require.Equal(t, "reviewed: this was not an offence", store.overturnNote)
}

// Absent and already-overturned answer alike. Telling them apart would confirm
// whether a given block id exists.
func TestAdminOmniChatBlockOverturnMissingIsNotFound(t *testing.T) {
	store := &adminBlockStoreFake{overturnErr: models.ErrOmniChatBlockNotFound}
	router := newBlockAdminRouter(store)

	req := httptest.NewRequest(http.MethodPost, "/admin/omnichat/blocks/7/overturn", strings.NewReader(`{}`))
	req.Header.Set("X-Test-Role", "admin")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusNotFound, w.Code)
}

func TestAdminOmniChatBlockOverturnRejectsAnOverlongNote(t *testing.T) {
	store := &adminBlockStoreFake{}
	router := newBlockAdminRouter(store)

	req := httptest.NewRequest(http.MethodPost, "/admin/omnichat/blocks/7/overturn",
		strings.NewReader(`{"note":"`+strings.Repeat("x", maxOmniChatBlockOverturnNoteRunes+1)+`"}`))
	req.Header.Set("X-Test-Role", "admin")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusBadRequest, w.Code)
	require.Zero(t, store.overturnedID)
}
