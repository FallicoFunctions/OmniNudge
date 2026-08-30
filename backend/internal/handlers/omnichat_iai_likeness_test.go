package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

type likenessStoreFake struct {
	candidates []*models.OmniChatIAILikenessCandidate
	listErr    error
	pickErr    error
	pickedID   int64
	pickedFor  int
	scopedTo   int
}

func (f *likenessStoreFake) ListLikenessCandidates(_ context.Context, personaID, ownerUserID int) ([]*models.OmniChatIAILikenessCandidate, error) {
	f.scopedTo = ownerUserID
	if f.listErr != nil {
		return nil, f.listErr
	}
	return f.candidates, nil
}

func (f *likenessStoreFake) LikenessCandidateForOwner(_ context.Context, personaID, ownerUserID int, candidateID int64) (*models.OmniChatIAILikenessCandidate, error) {
	for _, one := range f.candidates {
		if one.ID == candidateID {
			return one, nil
		}
	}
	return nil, models.ErrLikenessCandidateNotFound
}

func (f *likenessStoreFake) PickLikeness(_ context.Context, personaID, ownerUserID int, candidateID int64) (*models.OmniChatMediaAsset, error) {
	f.pickedID, f.pickedFor = candidateID, ownerUserID
	if f.pickErr != nil {
		return nil, f.pickErr
	}
	return &models.OmniChatMediaAsset{ID: uuid.New()}, nil
}

func newLikenessRouter(store omniChatLikenessStore) *gin.Engine {
	gin.SetMode(gin.TestMode)
	handler := NewOmniChatLikenessHandler(store, nil)
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", 9); c.Next() })
	router.GET("/api/v1/omnichat/iai/:id/likeness", handler.List)
	router.GET("/api/v1/omnichat/iai/:id/likeness/:candidate_id/content", handler.Content)
	router.POST("/api/v1/omnichat/iai/:id/likeness/:candidate_id", handler.Pick)
	return router
}

func callLikeness(router *gin.Engine, method, path string) *httptest.ResponseRecorder {
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(method, path, nil))
	return response
}

func TestTheChoiceIsListedWithoutGivingAwayWhereThePicturesLive(t *testing.T) {
	store := &likenessStoreFake{candidates: []*models.OmniChatIAILikenessCandidate{
		{ID: 11, StorageURL: "/uploads/omnichat/generated/9/a.png",
			StoragePath: "omnichat/generated/9/a.png", ScanStatus: models.MediaScanStatusClean},
		{ID: 12, StorageURL: "/uploads/omnichat/generated/9/b.png",
			StoragePath: "omnichat/generated/9/b.png", ScanStatus: models.MediaScanStatusPending},
	}}
	response := callLikeness(newLikenessRouter(store), http.MethodGet, "/api/v1/omnichat/iai/31/likeness")
	require.Equal(t, http.StatusOK, response.Code)

	var body struct {
		Candidates []struct {
			ID         int64  `json:"id"`
			ContentURL string `json:"content_url"`
			Ready      bool   `json:"ready"`
		} `json:"candidates"`
	}
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
	require.Len(t, body.Candidates, 2)
	require.Equal(t, "/api/v1/omnichat/iai/31/likeness/11/content", body.Candidates[0].ContentURL)

	// A render that has landed but is not scanned yet keeps its place, so the
	// picker shows four rather than appearing to have lost one.
	require.True(t, body.Candidates[0].Ready)
	require.False(t, body.Candidates[1].Ready)

	// Nothing says where the file actually is. A picture nobody has chosen
	// should not be linkable by anyone who learns the address.
	require.NotContains(t, response.Body.String(), "/uploads/")
	require.NotContains(t, response.Body.String(), "omnichat/generated")
}

func TestTheChoiceIsScopedToWhoeverIsAsking(t *testing.T) {
	store := &likenessStoreFake{}
	require.Equal(t, http.StatusOK,
		callLikeness(newLikenessRouter(store), http.MethodGet, "/api/v1/omnichat/iai/31/likeness").Code)
	require.Equal(t, 9, store.scopedTo, "her owner, not the character in the path")
}

func TestAnEmptyChoiceIsAnEmptyListAndNotNull(t *testing.T) {
	store := &likenessStoreFake{candidates: []*models.OmniChatIAILikenessCandidate{}}
	response := callLikeness(newLikenessRouter(store), http.MethodGet, "/api/v1/omnichat/iai/31/likeness")
	require.Contains(t, response.Body.String(), `"candidates":[]`)
}

func TestPickingAnswersWithWhatSheNowOwns(t *testing.T) {
	store := &likenessStoreFake{}
	response := callLikeness(newLikenessRouter(store), http.MethodPost, "/api/v1/omnichat/iai/31/likeness/12")
	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, int64(12), store.pickedID)
	require.Equal(t, 9, store.pickedFor)
	require.Contains(t, response.Body.String(), "asset_id")
}

func TestTheSecondPressIsToldTheChoiceIsMade(t *testing.T) {
	// The pick locks the whole set so a double-click cannot deadlock; the loser
	// arrives here, and must read as "already chosen" rather than as a failure.
	store := &likenessStoreFake{pickErr: models.ErrLikenessCandidateNotFound}
	response := callLikeness(newLikenessRouter(store), http.MethodPost, "/api/v1/omnichat/iai/31/likeness/12")
	require.Equal(t, http.StatusConflict, response.Code)
	require.Contains(t, response.Body.String(), "already been chosen")
}

func TestAFailureToReadTheChoiceIsNotAnEmptyChoice(t *testing.T) {
	// Answering 200 with [] on a database error would read as "her pictures are
	// not ready yet", and the picker would wait forever for four that had
	// already arrived.
	store := &likenessStoreFake{listErr: errors.New("database is down")}
	response := callLikeness(newLikenessRouter(store), http.MethodGet, "/api/v1/omnichat/iai/31/likeness")
	require.Equal(t, http.StatusInternalServerError, response.Code)
}

func TestAPictureThatIsNotHersIsNotFound(t *testing.T) {
	store := &likenessStoreFake{}
	response := callLikeness(newLikenessRouter(store), http.MethodGet,
		"/api/v1/omnichat/iai/31/likeness/404/content")
	require.Equal(t, http.StatusNotFound, response.Code)
}

func TestAnUnverifiedPictureIsNotStreamed(t *testing.T) {
	// The scan runs on media_files like any upload. Streaming before it lands
	// would serve something nothing has checked.
	store := &likenessStoreFake{candidates: []*models.OmniChatIAILikenessCandidate{
		{ID: 11, FileType: "image/png", StoragePath: "omnichat/generated/9/a.png",
			ScanStatus: models.MediaScanStatusPending},
	}}
	response := callLikeness(newLikenessRouter(store), http.MethodGet,
		"/api/v1/omnichat/iai/31/likeness/11/content")
	require.Equal(t, http.StatusConflict, response.Code)
}

func TestBadIdentifiersAreRefusedRatherThanGuessed(t *testing.T) {
	router := newLikenessRouter(&likenessStoreFake{})
	require.Equal(t, http.StatusBadRequest,
		callLikeness(router, http.MethodPost, "/api/v1/omnichat/iai/31/likeness/not-a-number").Code)
	require.Equal(t, http.StatusBadRequest,
		callLikeness(router, http.MethodGet, "/api/v1/omnichat/iai/nope/likeness").Code)
}

func TestAnUnconfiguredPickerSaysSoRatherThanPanicking(t *testing.T) {
	response := callLikeness(newLikenessRouter(nil), http.MethodGet, "/api/v1/omnichat/iai/31/likeness")
	require.Equal(t, http.StatusServiceUnavailable, response.Code)
}
