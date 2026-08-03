package handlers

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

type omniChatSocialPublisherFake struct {
	assetOwner      int
	chatRequestID   uuid.UUID
	chatPublication *models.OmniChatPublication
}

func (f *omniChatSocialPublisherFake) PublishAsset(_ context.Context, owner int, _ uuid.UUID, _ string) (*models.OmniChatPublication, error) {
	f.assetOwner = owner
	return &models.OmniChatPublication{ID: uuid.New(), PublishedAt: time.Now()}, nil
}
func (f *omniChatSocialPublisherFake) PublishChat(_ context.Context, _ int, _ int, _ []int, _, _ string, requestID uuid.UUID) (*models.OmniChatPublication, error) {
	f.chatRequestID = requestID
	return f.chatPublication, nil
}
func (f *omniChatSocialPublisherFake) AddComment(_ context.Context, _ uuid.UUID, _ int, _ *uuid.UUID, _ string) (*models.OmniChatPublicationComment, error) {
	return nil, nil
}

type omniChatSocialStoreFake struct {
	feed           []*models.OmniChatPublication
	publication    *models.OmniChatPublication
	canFollow      bool
	publicPath     string
	publicFileType string
	reports        []*models.OmniChatPublicationReport
	resolvedReport uuid.UUID
	resolution     string
}

func (f *omniChatSocialStoreFake) ListExplore(_ context.Context, _ *int, _ string, _ *models.OmniChatExploreCursor, _ int) ([]*models.OmniChatPublication, error) {
	return f.feed, nil
}
func (f *omniChatSocialStoreFake) ListBookmarkedPublications(context.Context, int, *models.OmniChatExploreCursor, int) ([]*models.OmniChatPublication, error) {
	return f.feed, nil
}
func (f *omniChatSocialStoreFake) GetPublicationAccessible(context.Context, uuid.UUID, *int) (*models.OmniChatPublication, error) {
	return f.publication, nil
}
func (f *omniChatSocialStoreFake) SetPublicationLiked(context.Context, uuid.UUID, int, bool) error {
	return nil
}
func (f *omniChatSocialStoreFake) ListPublicationComments(context.Context, uuid.UUID, *int, *models.OmniChatCommentCursor, int) ([]*models.OmniChatPublicationComment, error) {
	return nil, nil
}
func (f *omniChatSocialStoreFake) RecordPublicationShare(context.Context, uuid.UUID, int) error {
	return nil
}
func (f *omniChatSocialStoreFake) SetPublicationBookmarked(context.Context, uuid.UUID, int, bool) error {
	return nil
}
func (f *omniChatSocialStoreFake) CanFollow(context.Context, int, int) (bool, error) {
	return f.canFollow, nil
}
func (f *omniChatSocialStoreFake) SetFollowing(context.Context, int, int, bool) error { return nil }
func (f *omniChatSocialStoreFake) ContinueChatSnapshot(context.Context, uuid.UUID, int, uuid.UUID) (*models.BotConversation, error) {
	return nil, nil
}
func (f *omniChatSocialStoreFake) ReportPublication(context.Context, uuid.UUID, int, string, string) error {
	return nil
}
func (f *omniChatSocialStoreFake) RemovePublicationOwned(context.Context, uuid.UUID, int) (bool, error) {
	return false, nil
}
func (f *omniChatSocialStoreFake) PublicAssetStoragePath(context.Context, uuid.UUID, *int) (string, string, error) {
	return f.publicPath, f.publicFileType, nil
}
func (f *omniChatSocialStoreFake) DeleteCommentOwned(context.Context, uuid.UUID, int, bool) (bool, error) {
	return false, nil
}
func (f *omniChatSocialStoreFake) ListPublicationReports(context.Context, string, int) ([]*models.OmniChatPublicationReport, error) {
	return f.reports, nil
}
func (f *omniChatSocialStoreFake) ResolvePublicationReport(_ context.Context, id uuid.UUID, _ int, resolution string) (bool, error) {
	f.resolvedReport = id
	f.resolution = resolution
	return true, nil
}

func TestOmniChatSocialHandlerPublishesOwnedAsset(t *testing.T) {
	gin.SetMode(gin.TestMode)
	publisher := &omniChatSocialPublisherFake{}
	handler := NewOmniChatSocialHandler(publisher, &omniChatSocialStoreFake{}, nil)
	router := gin.New()
	router.POST("/publish", func(c *gin.Context) { c.Set("user_id", 44); handler.PublishAsset(c) })

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/publish", bytes.NewBufferString(`{"asset_id":"`+uuid.NewString()+`","caption":"Park day"}`))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusCreated, recorder.Code)
	require.Equal(t, 44, publisher.assetOwner)
}

func TestOmniChatSocialHandlerRequiresAndForwardsChatIdempotencyKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	publisher := &omniChatSocialPublisherFake{
		chatPublication: &models.OmniChatPublication{ID: uuid.New(), PublishedAt: time.Now()},
	}
	handler := NewOmniChatSocialHandler(publisher, &omniChatSocialStoreFake{}, nil)
	router := gin.New()
	router.POST("/publish", func(c *gin.Context) {
		c.Set("user_id", 44)
		handler.PublishChat(c)
	})

	missing := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/publish",
		bytes.NewBufferString(`{"conversation_id":9,"message_ids":[1],"title":"Memory"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(missing, request)
	require.Equal(t, http.StatusBadRequest, missing.Code)

	requestID := uuid.New()
	recorder := httptest.NewRecorder()
	request = httptest.NewRequest(
		http.MethodPost,
		"/publish",
		bytes.NewBufferString(`{"conversation_id":9,"message_ids":[1],"title":"Memory","idempotency_key":"`+requestID.String()+`"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusCreated, recorder.Code)
	require.Equal(t, requestID, publisher.chatRequestID)
}

func TestOmniChatSocialHandlerExposesAndResolvesModerationReports(t *testing.T) {
	gin.SetMode(gin.TestMode)
	reportID := uuid.New()
	store := &omniChatSocialStoreFake{reports: []*models.OmniChatPublicationReport{{
		ID: reportID, PublicationID: uuid.New(), Reason: "harassment", Status: "open",
	}}}
	handler := NewOmniChatSocialHandler(&omniChatSocialPublisherFake{}, store, nil)
	router := gin.New()
	router.GET("/reports", handler.ListReports)
	router.PATCH("/reports/:report_id", func(c *gin.Context) {
		c.Set("user_id", 44)
		handler.ResolveReport(c)
	})

	listed := httptest.NewRecorder()
	router.ServeHTTP(listed, httptest.NewRequest(http.MethodGet, "/reports?status=open", nil))
	require.Equal(t, http.StatusOK, listed.Code)
	require.Contains(t, listed.Body.String(), reportID.String())

	resolved := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPatch,
		"/reports/"+reportID.String(),
		bytes.NewBufferString(`{"resolution":"removed"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(resolved, request)
	require.Equal(t, http.StatusNoContent, resolved.Code)
	require.Equal(t, reportID, store.resolvedReport)
	require.Equal(t, "removed", store.resolution)
}

func TestOmniChatSocialHandlerRejectsInvalidPublicationKindFilter(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewOmniChatSocialHandler(&omniChatSocialPublisherFake{}, &omniChatSocialStoreFake{}, nil)
	router := gin.New()
	router.GET("/explore", handler.ListExplore)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/explore?kind=executable", nil))
	require.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestOmniChatSocialHandlerRejectsUnapprovedPublicMediaTypeBeforeDownload(t *testing.T) {
	gin.SetMode(gin.TestMode)
	assetID := uuid.New()
	store := &omniChatSocialStoreFake{publicPath: "public/unsafe.svg", publicFileType: "image/svg+xml"}
	storage := &omniChatMediaStorageFake{body: []byte("<svg></svg>")}
	handler := NewOmniChatSocialHandler(&omniChatSocialPublisherFake{}, store, storage)
	router := gin.New()
	router.GET("/media/:asset_id", handler.GetPublicMediaContent)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/media/"+assetID.String(), nil))

	require.Equal(t, http.StatusConflict, recorder.Code)
	require.Zero(t, storage.downloadCalls)
}

func TestOmniChatSocialHandlerPreventsSharedCachingOfViewerScopedMedia(t *testing.T) {
	gin.SetMode(gin.TestMode)
	assetID := uuid.New()
	store := &omniChatSocialStoreFake{publicPath: "public/scene.png", publicFileType: "image/png"}
	storage := &omniChatMediaStorageFake{body: []byte("private-viewer-scoped-bytes")}
	handler := NewOmniChatSocialHandler(&omniChatSocialPublisherFake{}, store, storage)
	router := gin.New()
	router.GET("/media/:asset_id", func(c *gin.Context) {
		c.Set("user_id", 44)
		handler.GetPublicMediaContent(c)
	})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/media/"+assetID.String(), nil))

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "private, no-store", recorder.Header().Get("Cache-Control"))
	require.Contains(t, recorder.Header().Values("Vary"), "Authorization")
	require.Contains(t, recorder.Header().Values("Vary"), "Cookie")
}

func TestOmniChatSocialHandlerAllowsShortAnonymousPublicMediaCaching(t *testing.T) {
	gin.SetMode(gin.TestMode)
	assetID := uuid.New()
	store := &omniChatSocialStoreFake{publicPath: "public/scene.png", publicFileType: "image/png"}
	storage := &omniChatMediaStorageFake{body: []byte("public-bytes")}
	handler := NewOmniChatSocialHandler(&omniChatSocialPublisherFake{}, store, storage)
	router := gin.New()
	router.GET("/media/:asset_id", handler.GetPublicMediaContent)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/media/"+assetID.String(), nil))

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "public, max-age=300, s-maxage=300", recorder.Header().Get("Cache-Control"))
}

func TestOmniChatSocialHandlerReturnsNotFoundForEngagementOnMissingPublication(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewOmniChatSocialHandler(&omniChatSocialPublisherFake{}, &omniChatSocialStoreFake{}, nil)
	router := gin.New()
	router.PUT("/explore/:id/like", func(c *gin.Context) {
		c.Set("user_id", 44)
		handler.SetLike(c)
	})
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/explore/"+uuid.NewString()+"/like", bytes.NewBufferString(`{"liked":true}`))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNotFound, recorder.Code)
}

func TestOmniChatSocialHandlerRejectsFollowingSelf(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewOmniChatSocialHandler(&omniChatSocialPublisherFake{}, &omniChatSocialStoreFake{}, nil)
	router := gin.New()
	router.PUT("/users/:user_id/follow", func(c *gin.Context) {
		c.Set("user_id", 44)
		handler.SetFollow(c)
	})
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/users/44/follow", bytes.NewBufferString(`{"following":true}`))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
}
