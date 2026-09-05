package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

func explorePosterRouter(handler *OmniChatSocialHandler, viewerID int) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/media/:asset_id/poster", func(c *gin.Context) {
		if viewerID > 0 {
			c.Set("user_id", viewerID)
		}
		handler.GetPublicMediaPoster(c)
	})
	return router
}

// The explore feed is three columns of cards. A card that fetches its clip to
// show anything fetches every clip on the page, and one real render was 6.6 MB.
func TestExplorePosterRouteServesThePoster(t *testing.T) {
	assetID := uuid.New()
	store := &omniChatSocialStoreFake{posterPath: "omnichat/generated/9/" + assetID.String() + "-poster.jpg"}
	storage := &omniChatMediaStorageFake{body: []byte("jpeg-bytes")}
	handler := NewOmniChatSocialHandler(&omniChatSocialPublisherFake{}, store, storage)

	res := httptest.NewRecorder()
	explorePosterRouter(handler, 0).ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/media/"+assetID.String()+"/poster", nil))

	require.Equal(t, http.StatusOK, res.Code)
	require.Equal(t, "image/jpeg", res.Header().Get("Content-Type"))
	require.Equal(t, []string{store.posterPath}, storage.downloadedKeys)
}

// The gate answers for the poster exactly as it answers for the clip. An empty
// key is the repository saying this viewer may not have it -- an unpublished
// asset, a banned author, a block, or NSFW they have not asked for.
func TestExplorePosterRouteRefusesWhatTheGateRefuses(t *testing.T) {
	assetID := uuid.New()
	store := &omniChatSocialStoreFake{posterPath: ""}
	storage := &omniChatMediaStorageFake{body: []byte("jpeg-bytes")}
	handler := NewOmniChatSocialHandler(&omniChatSocialPublisherFake{}, store, storage)

	res := httptest.NewRecorder()
	explorePosterRouter(handler, 0).ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/media/"+assetID.String()+"/poster", nil))

	require.Equal(t, http.StatusNotFound, res.Code)
	require.Zero(t, storage.downloadCalls)
}

// A signed-in viewer's authorization depends on their own block graph and NSFW
// preference, so their response must never be replayed to anybody else. The
// clip route already says this; the poster is the same picture.
func TestExplorePosterRouteNeverSharesAViewerScopedResponse(t *testing.T) {
	assetID := uuid.New()
	store := &omniChatSocialStoreFake{posterPath: "omnichat/generated/9/" + assetID.String() + "-poster.jpg"}
	storage := &omniChatMediaStorageFake{body: []byte("jpeg-bytes")}
	handler := NewOmniChatSocialHandler(&omniChatSocialPublisherFake{}, store, storage)

	res := httptest.NewRecorder()
	explorePosterRouter(handler, 44).ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/media/"+assetID.String()+"/poster", nil))

	require.Equal(t, http.StatusOK, res.Code)
	require.Equal(t, "private, no-store", res.Header().Get("Cache-Control"))
	require.Contains(t, res.Header().Values("Vary"), "Authorization")
	require.Contains(t, res.Header().Values("Vary"), "Cookie")
}

func TestExplorePosterRouteRefusesAnOversizedObjectBeforeDownloading(t *testing.T) {
	assetID := uuid.New()
	oversized := int64(4<<20 + 1)
	store := &omniChatSocialStoreFake{posterPath: "omnichat/generated/9/" + assetID.String() + "-poster.jpg"}
	storage := &omniChatMediaStorageFake{size: &oversized}
	handler := NewOmniChatSocialHandler(&omniChatSocialPublisherFake{}, store, storage)

	res := httptest.NewRecorder()
	explorePosterRouter(handler, 0).ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/media/"+assetID.String()+"/poster", nil))

	require.Equal(t, http.StatusConflict, res.Code)
	require.Zero(t, storage.downloadCalls)
}

// The decorator is the gate: it is what every published asset passes through,
// and it set the poster to nothing for all of them.
func TestADecoratedPublishedClipOffersItsPoster(t *testing.T) {
	assetID := uuid.New()
	publication := &models.OmniChatPublication{
		Asset: &models.OmniChatPublicMediaAsset{
			ID: assetID, Kind: models.OmniChatMediaKindVideo, HasPoster: true,
		},
	}

	decoratePublicPublication(publication)

	require.NotNil(t, publication.Asset.ThumbnailURL, "a published clip with a poster offered none")
	require.Equal(t, "/api/v1/omnichat/explore/media/"+assetID.String()+"/poster", *publication.Asset.ThumbnailURL)
	require.Equal(t, "/api/v1/omnichat/explore/media/"+assetID.String()+"/content", publication.Asset.ContentURL)
}

func TestADecoratedPublishedAssetWithoutAPosterOffersNone(t *testing.T) {
	for name, asset := range map[string]*models.OmniChatPublicMediaAsset{
		"a clip with no poster": {ID: uuid.New(), Kind: models.OmniChatMediaKindVideo},
		"an image":              {ID: uuid.New(), Kind: models.OmniChatMediaKindImage, HasPoster: true},
	} {
		t.Run(name, func(t *testing.T) {
			publication := &models.OmniChatPublication{Asset: asset}
			decoratePublicPublication(publication)
			require.Nil(t, publication.Asset.ThumbnailURL)
		})
	}
}
