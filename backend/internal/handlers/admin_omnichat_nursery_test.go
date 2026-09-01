package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

type stubNurseryStore struct {
	waiting    []models.OmniAIAwaitingReview
	listLimit  int
	listErr    error
	keptID     int
	keptResult bool
	keepErr    error
}

func (s *stubNurseryStore) ListAwaitingReview(_ context.Context, limit int) ([]models.OmniAIAwaitingReview, error) {
	s.listLimit = limit
	return s.waiting, s.listErr
}

func (s *stubNurseryStore) Commandeer(_ context.Context, personaID int) (bool, error) {
	s.keptID = personaID
	return s.keptResult, s.keepErr
}

func nurseryRouter(store adminNurseryStore) *gin.Engine {
	gin.SetMode(gin.TestMode)
	handler := NewAdminOmniChatNurseryHandler(store)
	router := gin.New()
	router.GET("/nursery/awaiting-review", handler.ListAwaitingReview)
	router.POST("/nursery/:id/commandeer", handler.Commandeer)
	return router
}

func TestTheReviewQueueAnswersWithWhoIsWaiting(t *testing.T) {
	store := &stubNurseryStore{waiting: []models.OmniAIAwaitingReview{
		{PersonaID: 7, Name: "Nadia", Slug: "nadia-7", LeftAt: time.Now()},
	}}
	recorder := httptest.NewRecorder()
	nurseryRouter(store).ServeHTTP(recorder,
		httptest.NewRequest(http.MethodGet, "/nursery/awaiting-review?limit=25", nil))

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, 25, store.listLimit, "the caller's limit reaches the store")

	var body struct {
		AwaitingReview []models.OmniAIAwaitingReview `json:"awaiting_review"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	require.Len(t, body.AwaitingReview, 1)
	require.Equal(t, "Nadia", body.AwaitingReview[0].Name)
}

func TestAnEmptyQueueIsAnEmptyListAndNotNull(t *testing.T) {
	// A client rendering a list should get [] rather than null on a quiet day.
	store := &stubNurseryStore{waiting: []models.OmniAIAwaitingReview{}}
	recorder := httptest.NewRecorder()
	nurseryRouter(store).ServeHTTP(recorder,
		httptest.NewRequest(http.MethodGet, "/nursery/awaiting-review", nil))

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Contains(t, recorder.Body.String(), `"awaiting_review":[]`)
}

func TestKeepingSomebodyWhoIsNotWaitingIsNotFound(t *testing.T) {
	store := &stubNurseryStore{keptResult: false}
	recorder := httptest.NewRecorder()
	nurseryRouter(store).ServeHTTP(recorder,
		httptest.NewRequest(http.MethodPost, "/nursery/7/commandeer", nil))

	// Either she never left a house or somebody already decided. Both are the
	// same answer to the caller.
	require.Equal(t, http.StatusNotFound, recorder.Code)
	require.Equal(t, 7, store.keptID)
}

func TestKeepingSomebodyReportsItPlainly(t *testing.T) {
	store := &stubNurseryStore{keptResult: true}
	recorder := httptest.NewRecorder()
	nurseryRouter(store).ServeHTTP(recorder,
		httptest.NewRequest(http.MethodPost, "/nursery/42/commandeer", nil))

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, 42, store.keptID)
}

func TestABadPersonaIDIsRefusedRatherThanGuessed(t *testing.T) {
	store := &stubNurseryStore{keptResult: true}
	recorder := httptest.NewRecorder()
	nurseryRouter(store).ServeHTTP(recorder,
		httptest.NewRequest(http.MethodPost, "/nursery/not-a-number/commandeer", nil))

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Zero(t, store.keptID, "nothing reaches the store")
}

func TestAFailureToReadTheQueueIsNotAnEmptyQueue(t *testing.T) {
	// Answering 200 with [] on a database error would read as "nobody is
	// waiting", which is the one wrong answer here: characters would sit
	// unreviewed and nothing would say so.
	store := &stubNurseryStore{listErr: errors.New("database is down")}
	recorder := httptest.NewRecorder()
	nurseryRouter(store).ServeHTTP(recorder,
		httptest.NewRequest(http.MethodGet, "/nursery/awaiting-review", nil))

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
}

func TestAnUnconfiguredQueueSaysSoRatherThanPanicking(t *testing.T) {
	recorder := httptest.NewRecorder()
	nurseryRouter(nil).ServeHTTP(recorder,
		httptest.NewRequest(http.MethodGet, "/nursery/awaiting-review", nil))

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
}
