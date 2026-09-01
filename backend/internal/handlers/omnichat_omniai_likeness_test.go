package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

type likenessStoreFake struct {
	candidates []*models.OmniChatOmniAILikenessCandidate
	listErr    error
	pickErr    error
	pickedID   int64
	pickedFor  int
	scopedTo   int
	pending    int
	pendingErr error
}

func (f *likenessStoreFake) PendingLikenessCount(_ context.Context, personaID, ownerUserID int) (int, error) {
	return f.pending, f.pendingErr
}

func (f *likenessStoreFake) ListLikenessCandidates(_ context.Context, personaID, ownerUserID int) ([]*models.OmniChatOmniAILikenessCandidate, error) {
	f.scopedTo = ownerUserID
	if f.listErr != nil {
		return nil, f.listErr
	}
	return f.candidates, nil
}

func (f *likenessStoreFake) LikenessCandidateForOwner(_ context.Context, personaID, ownerUserID int, candidateID int64) (*models.OmniChatOmniAILikenessCandidate, error) {
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
	// The chosen picture's URL comes back with the asset: the supporting
	// renders are conditioned on it.
	return &models.OmniChatMediaAsset{
		ID: uuid.New(), StorageURL: "/uploads/omnichat/generated/9/anchor.png",
	}, nil
}

func newLikenessRouter(store omniChatLikenessStore) *gin.Engine {
	gin.SetMode(gin.TestMode)
	handler := NewOmniChatLikenessHandler(store, nil)
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", 9); c.Next() })
	router.GET("/api/v1/omnichat/omniai/:id/likeness", handler.List)
	router.GET("/api/v1/omnichat/omniai/:id/likeness/:candidate_id/content", handler.Content)
	router.POST("/api/v1/omnichat/omniai/:id/likeness/:candidate_id", handler.Pick)
	return router
}

func callLikeness(router *gin.Engine, method, path string) *httptest.ResponseRecorder {
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(method, path, nil))
	return response
}

func TestTheChoiceIsListedWithoutGivingAwayWhereThePicturesLive(t *testing.T) {
	store := &likenessStoreFake{candidates: []*models.OmniChatOmniAILikenessCandidate{
		{ID: 11, StorageURL: "/uploads/omnichat/generated/9/a.png",
			StoragePath: "omnichat/generated/9/a.png", ScanStatus: models.MediaScanStatusClean},
		{ID: 12, StorageURL: "/uploads/omnichat/generated/9/b.png",
			StoragePath: "omnichat/generated/9/b.png", ScanStatus: models.MediaScanStatusPending},
	}}
	response := callLikeness(newLikenessRouter(store), http.MethodGet, "/api/v1/omnichat/omniai/31/likeness")
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
	require.Equal(t, "/api/v1/omnichat/omniai/31/likeness/11/content", body.Candidates[0].ContentURL)

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
		callLikeness(newLikenessRouter(store), http.MethodGet, "/api/v1/omnichat/omniai/31/likeness").Code)
	require.Equal(t, 9, store.scopedTo, "her owner, not the character in the path")
}

func TestAnEmptyChoiceIsAnEmptyListAndNotNull(t *testing.T) {
	store := &likenessStoreFake{candidates: []*models.OmniChatOmniAILikenessCandidate{}}
	response := callLikeness(newLikenessRouter(store), http.MethodGet, "/api/v1/omnichat/omniai/31/likeness")
	require.Contains(t, response.Body.String(), `"candidates":[]`)
}

func TestPickingAnswersWithWhatSheNowOwns(t *testing.T) {
	store := &likenessStoreFake{}
	response := callLikeness(newLikenessRouter(store), http.MethodPost, "/api/v1/omnichat/omniai/31/likeness/12")
	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, int64(12), store.pickedID)
	require.Equal(t, 9, store.pickedFor)
	require.Contains(t, response.Body.String(), "asset_id")
}

func TestTheSecondPressIsToldTheChoiceIsMade(t *testing.T) {
	// The pick locks the whole set so a double-click cannot deadlock; the loser
	// arrives here, and must read as "already chosen" rather than as a failure.
	store := &likenessStoreFake{pickErr: models.ErrLikenessCandidateNotFound}
	response := callLikeness(newLikenessRouter(store), http.MethodPost, "/api/v1/omnichat/omniai/31/likeness/12")
	require.Equal(t, http.StatusConflict, response.Code)
	require.Contains(t, response.Body.String(), "already been chosen")
}

func TestAFailureToReadTheChoiceIsNotAnEmptyChoice(t *testing.T) {
	// Answering 200 with [] on a database error would read as "her pictures are
	// not ready yet", and the picker would wait forever for four that had
	// already arrived.
	store := &likenessStoreFake{listErr: errors.New("database is down")}
	response := callLikeness(newLikenessRouter(store), http.MethodGet, "/api/v1/omnichat/omniai/31/likeness")
	require.Equal(t, http.StatusInternalServerError, response.Code)
}

func TestAPictureThatIsNotHersIsNotFound(t *testing.T) {
	store := &likenessStoreFake{}
	response := callLikeness(newLikenessRouter(store), http.MethodGet,
		"/api/v1/omnichat/omniai/31/likeness/404/content")
	require.Equal(t, http.StatusNotFound, response.Code)
}

func TestAnUnverifiedPictureIsNotStreamed(t *testing.T) {
	// The scan runs on media_files like any upload. Streaming before it lands
	// would serve something nothing has checked.
	store := &likenessStoreFake{candidates: []*models.OmniChatOmniAILikenessCandidate{
		{ID: 11, FileType: "image/png", StoragePath: "omnichat/generated/9/a.png",
			ScanStatus: models.MediaScanStatusPending},
	}}
	response := callLikeness(newLikenessRouter(store), http.MethodGet,
		"/api/v1/omnichat/omniai/31/likeness/11/content")
	require.Equal(t, http.StatusConflict, response.Code)
}

func TestBadIdentifiersAreRefusedRatherThanGuessed(t *testing.T) {
	router := newLikenessRouter(&likenessStoreFake{})
	require.Equal(t, http.StatusBadRequest,
		callLikeness(router, http.MethodPost, "/api/v1/omnichat/omniai/31/likeness/not-a-number").Code)
	require.Equal(t, http.StatusBadRequest,
		callLikeness(router, http.MethodGet, "/api/v1/omnichat/omniai/nope/likeness").Code)
}

func TestAnUnconfiguredPickerSaysSoRatherThanPanicking(t *testing.T) {
	response := callLikeness(newLikenessRouter(nil), http.MethodGet, "/api/v1/omnichat/omniai/31/likeness")
	require.Equal(t, http.StatusServiceUnavailable, response.Code)
}

func TestThePickerIsToldHowManyAreStillComing(t *testing.T) {
	// Three candidates is otherwise two situations the picker cannot tell
	// apart: a fourth still rendering, and a fourth that failed and never will.
	// Without this it either spins forever or settles for three while one is
	// seconds away.
	arrived := []*models.OmniChatOmniAILikenessCandidate{
		{ID: 21, ScanStatus: models.MediaScanStatusClean},
		{ID: 22, ScanStatus: models.MediaScanStatusClean},
		{ID: 23, ScanStatus: models.MediaScanStatusClean},
	}

	waiting := callLikeness(newLikenessRouter(&likenessStoreFake{candidates: arrived, pending: 1}),
		http.MethodGet, "/api/v1/omnichat/omniai/31/likeness")
	require.Contains(t, waiting.Body.String(), `"pending":1`, "keep waiting")

	// A failed render is not pending. Nothing will ever deliver it, and saying
	// so is what lets the picker stop.
	settled := callLikeness(newLikenessRouter(&likenessStoreFake{candidates: arrived, pending: 0}),
		http.MethodGet, "/api/v1/omnichat/omniai/31/likeness")
	require.Contains(t, settled.Body.String(), `"pending":0`, "three is all there will be")
}

func TestNotKnowingHowManyAreComingStillShowsWhatArrived(t *testing.T) {
	// A failure to count is not a failure to choose. The number only decides
	// whether to keep waiting, so losing it must not cost somebody the screen.
	store := &likenessStoreFake{
		candidates: []*models.OmniChatOmniAILikenessCandidate{{ID: 21, ScanStatus: models.MediaScanStatusClean}},
		pendingErr: errors.New("database is down"),
	}
	response := callLikeness(newLikenessRouter(store), http.MethodGet, "/api/v1/omnichat/omniai/31/likeness")
	require.Equal(t, http.StatusOK, response.Code)
	require.Contains(t, response.Body.String(), `"id":21`)
	require.Contains(t, response.Body.String(), `"pending":0`)
}

// likenessStorageFake serves one object. Only Download and GetObjectSize are
// reached by the content route; the rest satisfy the interface.
type likenessStorageFake struct {
	body      []byte
	size      int64
	sizeSet   bool
	sizeErr   error
	downErr   error
	askedPath string
}

func (f *likenessStorageFake) Download(_ context.Context, key string) (io.ReadCloser, error) {
	f.askedPath = key
	if f.downErr != nil {
		return nil, f.downErr
	}
	return io.NopCloser(bytes.NewReader(f.body)), nil
}

func (f *likenessStorageFake) GetObjectSize(_ context.Context, _ string) (int64, error) {
	if f.sizeErr != nil {
		return 0, f.sizeErr
	}
	if f.sizeSet {
		return f.size, nil
	}
	return int64(len(f.body)), nil
}

func (f *likenessStorageFake) Upload(context.Context, string, io.Reader, string) (string, error) {
	return "", nil
}
func (f *likenessStorageFake) Delete(context.Context, string) error { return nil }
func (f *likenessStorageFake) GetSignedURL(context.Context, string, time.Duration) (string, error) {
	return "", nil
}
func (f *likenessStorageFake) List(context.Context, string) ([]string, error) { return nil, nil }
func (f *likenessStorageFake) GeneratePresignedPutURL(context.Context, string, string, time.Duration) (string, error) {
	return "", nil
}
func (f *likenessStorageFake) PublicURL(string) string { return "" }

func newLikenessRouterWithStorage(store omniChatLikenessStore, storage services.StorageService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	handler := NewOmniChatLikenessHandler(store, storage)
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", 9); c.Next() })
	router.GET("/api/v1/omnichat/omniai/:id/likeness/:candidate_id/content", handler.Content)
	return router
}

func cleanCandidate(fileType string) *likenessStoreFake {
	return &likenessStoreFake{candidates: []*models.OmniChatOmniAILikenessCandidate{
		{ID: 11, FileType: fileType, StoragePath: "omnichat/generated/9/a.png",
			ScanStatus: models.MediaScanStatusClean},
	}}
}

func TestAChosenPictureIsActuallyStreamed(t *testing.T) {
	// Every guard around this was tested and the copy itself was not, because
	// the fixture had no storage: the content type check, the size bounds and
	// the body were all unreachable.
	pixels := []byte("\x89PNG\r\n\x1a\nnot really a png but enough bytes")
	storage := &likenessStorageFake{body: pixels}
	response := callLikeness(
		newLikenessRouterWithStorage(cleanCandidate("image/png"), storage),
		http.MethodGet, "/api/v1/omnichat/omniai/31/likeness/11/content")

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, pixels, response.Body.Bytes())
	require.Equal(t, "image/png", response.Header().Get("Content-Type"))
	require.Equal(t, strconv.Itoa(len(pixels)), response.Header().Get("Content-Length"))
	require.Equal(t, "omnichat/generated/9/a.png", storage.askedPath,
		"the stored path comes from the record, never from the request")

	// A picture nobody has chosen should not be cached anywhere, and a browser
	// must not be allowed to guess its type.
	require.Equal(t, "private, no-store", response.Header().Get("Cache-Control"))
	require.Equal(t, "nosniff", response.Header().Get("X-Content-Type-Options"))
	require.Contains(t, response.Header().Get("Content-Disposition"), "candidate-11.png")
}

func TestAPictureThatIsNotAnImageIsNotStreamed(t *testing.T) {
	// A likeness is a still. A clip arriving here is a render that went down
	// the wrong path, and streaming it would be the first anybody knew.
	for _, fileType := range []string{"video/mp4", "application/pdf", ""} {
		response := callLikeness(
			newLikenessRouterWithStorage(cleanCandidate(fileType), &likenessStorageFake{body: []byte("x")}),
			http.MethodGet, "/api/v1/omnichat/omniai/31/likeness/11/content")
		require.Equal(t, http.StatusConflict, response.Code, "file type %q", fileType)
	}
}

func TestAnImplausiblySizedPictureIsRefused(t *testing.T) {
	// Zero means the object is not really there; past the cap means something
	// other than a render is behind that path.
	for _, size := range []int64{0, -1, (25 << 20) + 1} {
		response := callLikeness(
			newLikenessRouterWithStorage(cleanCandidate("image/png"),
				&likenessStorageFake{body: []byte("x"), size: size, sizeSet: true}),
			http.MethodGet, "/api/v1/omnichat/omniai/31/likeness/11/content")
		require.Equal(t, http.StatusConflict, response.Code, "size %d", size)
	}
}

func TestAMissingObjectIsNotFoundRatherThanEmpty(t *testing.T) {
	// Answering 200 with nothing would render as a broken picture the picker
	// could not explain.
	response := callLikeness(
		newLikenessRouterWithStorage(cleanCandidate("image/png"),
			&likenessStorageFake{sizeErr: errors.New("no such object")}),
		http.MethodGet, "/api/v1/omnichat/omniai/31/likeness/11/content")
	require.Equal(t, http.StatusNotFound, response.Code)
}

type referenceStarterFake struct {
	mu      sync.Mutex
	calls   int
	persona *models.BotPersona
	anchor  string
	err     error
	called  chan struct{}
	release chan struct{}
}

func newReferenceStarterFake(err error) *referenceStarterFake {
	return &referenceStarterFake{err: err, called: make(chan struct{})}
}

func (f *referenceStarterFake) StartReferences(_ context.Context, persona *models.BotPersona, anchorURL string) ([]uuid.UUID, error) {
	f.mu.Lock()
	f.calls++
	f.persona, f.anchor = persona, anchorURL
	f.mu.Unlock()
	close(f.called)
	if f.release != nil {
		<-f.release
	}
	return nil, f.err
}

func (f *referenceStarterFake) waitForStart(t *testing.T) {
	t.Helper()
	select {
	case <-f.called:
	case <-time.After(2 * time.Second):
		t.Fatal("her supporting pictures were never asked for")
	}
}

type likenessPersonaReaderFake struct {
	persona *models.BotPersona
	err     error
}

func (f *likenessPersonaReaderFake) GetAccessibleByID(_ context.Context, _ int, _ *int) (*models.BotPersona, error) {
	return f.persona, f.err
}

func newPickRouter(store omniChatLikenessStore, personas omniChatLikenessPersonaReader, starter omniChatReferenceStarter) *gin.Engine {
	gin.SetMode(gin.TestMode)
	handler := NewOmniChatLikenessHandler(store, nil).SetReferenceStarter(personas, starter)
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", 9); c.Next() })
	router.POST("/api/v1/omnichat/omniai/:id/likeness/:candidate_id", handler.Pick)
	return router
}

func TestChoosingAsksForTheSupportingPictures(t *testing.T) {
	owner := 9
	persona := &models.BotPersona{ID: 31, Name: "Nadia", OwnerUserID: &owner}
	store := &likenessStoreFake{}
	starter := newReferenceStarterFake(nil)

	response := callLikeness(newPickRouter(store, &likenessPersonaReaderFake{persona: persona}, starter),
		http.MethodPost, "/api/v1/omnichat/omniai/31/likeness/12")
	require.Equal(t, http.StatusOK, response.Code)

	starter.waitForStart(t)
	require.Equal(t, 31, starter.persona.ID)
	require.NotEmpty(t, starter.anchor, "conditioned on the picture that was chosen")
}

func TestChoosingDoesNotWaitForTheRenderQueue(t *testing.T) {
	// A pick has committed by the time this runs: she is already wearing the
	// face. Holding the response on five enqueues would make a stalled queue
	// look like a failed choice.
	owner := 9
	starter := newReferenceStarterFake(nil)
	starter.release = make(chan struct{})
	router := newPickRouter(&likenessStoreFake{},
		&likenessPersonaReaderFake{persona: &models.BotPersona{ID: 31, OwnerUserID: &owner}}, starter)

	responded := make(chan int, 1)
	go func() {
		responded <- callLikeness(router, http.MethodPost, "/api/v1/omnichat/omniai/31/likeness/12").Code
	}()

	select {
	case code := <-responded:
		require.Equal(t, http.StatusOK, code)
	case <-time.After(2 * time.Second):
		close(starter.release)
		t.Fatal("choosing waited for the render queue")
	}
	close(starter.release)
	starter.waitForStart(t)
}

func TestAPickSurvivesTheRenderQueueBeingDown(t *testing.T) {
	// The supporting set costs consistency in scenes, never the choice itself.
	owner := 9
	starter := newReferenceStarterFake(errors.New("redis is unreachable"))
	response := callLikeness(newPickRouter(&likenessStoreFake{},
		&likenessPersonaReaderFake{persona: &models.BotPersona{ID: 31, OwnerUserID: &owner}}, starter),
		http.MethodPost, "/api/v1/omnichat/omniai/31/likeness/12")

	require.Equal(t, http.StatusOK, response.Code)
	starter.waitForStart(t)
}

func TestAPickSurvivesHavingNothingToStartRendersWith(t *testing.T) {
	// Unwired, or the character could not be loaded. Either way the choice
	// stands.
	owner := 9
	require.Equal(t, http.StatusOK, callLikeness(
		newPickRouter(&likenessStoreFake{}, nil, nil),
		http.MethodPost, "/api/v1/omnichat/omniai/31/likeness/12").Code)

	starter := newReferenceStarterFake(nil)
	require.Equal(t, http.StatusOK, callLikeness(
		newPickRouter(&likenessStoreFake{},
			&likenessPersonaReaderFake{err: errors.New("gone")}, starter),
		http.MethodPost, "/api/v1/omnichat/omniai/31/likeness/12").Code)
	_ = owner
}
