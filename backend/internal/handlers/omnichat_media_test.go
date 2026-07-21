package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

type omniChatGenerationCreatorFake struct {
	request models.OmniChatGenerationRequest
	job     *models.OmniChatGenerationJob
	err     error
}

func (f *omniChatGenerationCreatorFake) CreateGeneration(_ context.Context, _ int, request models.OmniChatGenerationRequest) (*models.OmniChatGenerationJob, error) {
	f.request = request
	return f.job, f.err
}

type omniChatMediaReaderFake struct {
	job           *models.OmniChatGenerationJob
	asset         *models.OmniChatMediaAsset
	galleryCursor *models.OmniChatMediaCursor
}

type omniChatMediaStorageFake struct {
	body          []byte
	size          *int64
	downloadCalls int
}

func (f *omniChatMediaStorageFake) Upload(context.Context, string, io.Reader, string) (string, error) {
	return "", nil
}
func (f *omniChatMediaStorageFake) Download(context.Context, string) (io.ReadCloser, error) {
	f.downloadCalls++
	return io.NopCloser(bytes.NewReader(f.body)), nil
}
func (f *omniChatMediaStorageFake) Delete(context.Context, string) error { return nil }
func (f *omniChatMediaStorageFake) GetSignedURL(context.Context, string, time.Duration) (string, error) {
	return "", nil
}
func (f *omniChatMediaStorageFake) List(context.Context, string) ([]string, error) { return nil, nil }
func (f *omniChatMediaStorageFake) GeneratePresignedPutURL(context.Context, string, string, time.Duration) (string, error) {
	return "", nil
}
func (f *omniChatMediaStorageFake) PublicURL(string) string { return "" }
func (f *omniChatMediaStorageFake) GetObjectSize(context.Context, string) (int64, error) {
	if f.size != nil {
		return *f.size, nil
	}
	return int64(len(f.body)), nil
}

func (f *omniChatMediaReaderFake) GetGenerationJobOwned(_ context.Context, _ uuid.UUID, _ int) (*models.OmniChatGenerationJob, error) {
	return f.job, nil
}

func (f *omniChatMediaReaderFake) ListGenerationJobsOwned(_ context.Context, _, _ int) ([]*models.OmniChatGenerationJob, error) {
	if f.job == nil {
		return []*models.OmniChatGenerationJob{}, nil
	}
	return []*models.OmniChatGenerationJob{f.job}, nil
}

func (f *omniChatMediaReaderFake) CancelGenerationJobOwned(_ context.Context, _ uuid.UUID, _ int) (bool, error) {
	return true, nil
}

func (f *omniChatMediaReaderFake) ListMediaAssetsOwned(_ context.Context, _ int, _ *models.OmniChatMediaKind, before *models.OmniChatMediaCursor, _ int) ([]*models.OmniChatMediaAsset, error) {
	f.galleryCursor = before
	if f.asset == nil {
		return []*models.OmniChatMediaAsset{}, nil
	}
	return []*models.OmniChatMediaAsset{f.asset}, nil
}

func (f *omniChatMediaReaderFake) GetMediaAssetOwned(_ context.Context, _ uuid.UUID, _ int) (*models.OmniChatMediaAsset, error) {
	return f.asset, nil
}

func (f *omniChatMediaReaderFake) SetConversationSceneOwned(_ context.Context, _, _ int, _ models.OmniChatSceneState) (bool, error) {
	return true, nil
}

func (f *omniChatMediaReaderFake) GetConversationSceneOwned(_ context.Context, _, _ int) (*models.OmniChatSceneState, error) {
	return &models.OmniChatSceneState{Location: "park"}, nil
}

func newOmniChatMediaTestRouter(creator OmniChatGenerationCreator, reader OmniChatMediaStore) *gin.Engine {
	gin.SetMode(gin.TestMode)
	handler := NewOmniChatMediaHandler(creator, reader, nil)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user_id", 9)
		c.Next()
	})
	router.POST("/api/v1/omnichat/generations", handler.CreateGeneration)
	router.GET("/api/v1/omnichat/generations/:id", handler.GetGeneration)
	router.GET("/api/v1/omnichat/gallery", handler.ListGallery)
	return router
}

func TestOmniChatMediaHandlerGalleryRequiresCompositeCursor(t *testing.T) {
	reader := &omniChatMediaReaderFake{}
	router := newOmniChatMediaTestRouter(nil, reader)

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/omnichat/gallery?before=2026-07-21T00:00:00Z", nil))
	require.Equal(t, http.StatusBadRequest, response.Code)

	id := uuid.New()
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/omnichat/gallery?before=2026-07-21T00:00:00Z&before_id="+id.String(), nil))
	require.Equal(t, http.StatusOK, response.Code)
	require.NotNil(t, reader.galleryCursor)
	require.Equal(t, id, reader.galleryCursor.ID)
}

func TestOmniChatMediaHandlerCreateGenerationReturnsAcceptedJob(t *testing.T) {
	jobID := uuid.New()
	creator := &omniChatGenerationCreatorFake{job: &models.OmniChatGenerationJob{
		ID: jobID, OwnerUserID: 9, Status: models.OmniChatGenerationStatusQueued,
	}}
	router := newOmniChatMediaTestRouter(creator, &omniChatMediaReaderFake{})
	body := []byte(`{"kind":"image","mode":"contextual","persona_id":42,"conversation_id":7,"prompt":"show me"}`)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/omnichat/generations", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusAccepted, response.Code, response.Body.String())
	require.Equal(t, models.OmniChatGenerationModeContextual, creator.request.Mode)
	var payload struct {
		Job models.OmniChatGenerationJob `json:"job"`
	}
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &payload))
	require.Equal(t, jobID, payload.Job.ID)
}

func TestOmniChatMediaHandlerGetGenerationHidesForeignJob(t *testing.T) {
	router := newOmniChatMediaTestRouter(&omniChatGenerationCreatorFake{}, &omniChatMediaReaderFake{job: nil})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/omnichat/generations/"+uuid.NewString(), nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusNotFound, response.Code)
}

func TestOmniChatMediaHandlerServesVerifiedAssetUsingStoredMediaType(t *testing.T) {
	assetID := uuid.New()
	asset := &models.OmniChatMediaAsset{
		ID: assetID, OwnerUserID: 9, Kind: models.OmniChatMediaKindImage,
		FileType: "image/jpeg", StoragePath: "private/photo.jpg", ScanStatus: models.MediaScanStatusClean,
	}
	handler := NewOmniChatMediaHandler(&omniChatGenerationCreatorFake{}, &omniChatMediaReaderFake{asset: asset}, &omniChatMediaStorageFake{body: []byte("jpeg")})
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", 9); c.Next() })
	router.GET("/media/:id/content", handler.GetAssetContent)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/media/"+assetID.String()+"/content", nil))

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, "image/jpeg", response.Header().Get("Content-Type"))
	require.Contains(t, response.Header().Get("Content-Disposition"), ".jpg\"")
}

func TestOmniChatMediaHandlerRejectsOversizedStoredObjectBeforeDownload(t *testing.T) {
	assetID := uuid.New()
	asset := &models.OmniChatMediaAsset{
		ID: assetID, OwnerUserID: 9, Kind: models.OmniChatMediaKindImage,
		FileType: "image/png", StoragePath: "private/photo.png", ScanStatus: models.MediaScanStatusClean,
	}
	oversized := int64(25<<20 + 1)
	storage := &omniChatMediaStorageFake{size: &oversized}
	handler := NewOmniChatMediaHandler(&omniChatGenerationCreatorFake{}, &omniChatMediaReaderFake{asset: asset}, storage)
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", 9); c.Next() })
	router.GET("/media/:id/content", handler.GetAssetContent)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/media/"+assetID.String()+"/content", nil))

	require.Equal(t, http.StatusConflict, response.Code)
	require.Zero(t, storage.downloadCalls)
}

func TestDecodeStrictJSONRejectsBodyBeyondLimit(t *testing.T) {
	body := append([]byte(`{"kind":"image"}`), bytes.Repeat([]byte(" "), 1<<20)...)
	request := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request

	var payload map[string]any
	err := decodeStrictJSON(context, &payload)

	require.Error(t, err)
}

func TestDecorateOmniChatMessageAttachmentsUsesAuthorizedContentRoutes(t *testing.T) {
	ownedID := uuid.New()
	sharedID := uuid.New()
	thumbnail := "https://storage.example.test/private-thumbnail.jpg"
	messages := []*models.BotMessage{{Attachments: []*models.OmniChatMessageMediaAsset{
		{ID: ownedID, OwnerUserID: 9, ThumbnailURL: &thumbnail},
		{ID: sharedID, OwnerUserID: 17, ThumbnailURL: &thumbnail},
	}}}

	decorateOmniChatMessageAttachments(messages, 9)

	require.Equal(t, "/api/v1/omnichat/media/"+ownedID.String()+"/content", messages[0].Attachments[0].ContentURL)
	require.Equal(t, "/api/v1/omnichat/explore/media/"+sharedID.String()+"/content", messages[0].Attachments[1].ContentURL)
	require.Nil(t, messages[0].Attachments[0].ThumbnailURL)
	require.Nil(t, messages[0].Attachments[1].ThumbnailURL)
	encoded, err := json.Marshal(messages[0].Attachments[1])
	require.NoError(t, err)
	for _, privateField := range []string{"owner_user_id", "conversation_id", "source_message_id", "generation_job_id", "prompt", "scene"} {
		require.NotContains(t, string(encoded), `"`+privateField+`"`, "continued chats must not expose the original author's private generation provenance")
	}
}
