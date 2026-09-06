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

func exploreThumbRouter(handler *OmniChatSocialHandler, viewerID int) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/media/:asset_id/thumbnail", func(c *gin.Context) {
		if viewerID > 0 {
			c.Set("user_id", viewerID)
		}
		handler.GetPublicMediaThumbnail(c)
	})
	return router
}

// The explore feed is three columns of cards. A card that fetches its asset to
// show anything fetches every asset on the page: about a megabyte for a
// generated image, and 6.6 MB for one real clip.
func TestExploreThumbnailRouteServesTheThumbnail(t *testing.T) {
	assetID := uuid.New()
	store := &omniChatSocialStoreFake{thumbnailPath: "omnichat/generated/9/" + assetID.String() + "-thumb.jpg"}
	storage := &omniChatMediaStorageFake{body: []byte("jpeg-bytes")}
	handler := NewOmniChatSocialHandler(&omniChatSocialPublisherFake{}, store, storage)

	res := httptest.NewRecorder()
	exploreThumbRouter(handler, 0).ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/media/"+assetID.String()+"/thumbnail", nil))

	require.Equal(t, http.StatusOK, res.Code)
	require.Equal(t, "image/jpeg", res.Header().Get("Content-Type"))
	require.Equal(t, []string{store.thumbnailPath}, storage.downloadedKeys)
}

// The gate answers for the thumbnail exactly as it answers for the asset. An
// empty key is the repository saying this viewer may not have it -- an
// unpublished asset, a banned author, a block, or NSFW they have not asked
// for.
func TestExploreThumbnailRouteRefusesWhatTheGateRefuses(t *testing.T) {
	assetID := uuid.New()
	store := &omniChatSocialStoreFake{thumbnailPath: ""}
	storage := &omniChatMediaStorageFake{body: []byte("jpeg-bytes")}
	handler := NewOmniChatSocialHandler(&omniChatSocialPublisherFake{}, store, storage)

	res := httptest.NewRecorder()
	exploreThumbRouter(handler, 0).ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/media/"+assetID.String()+"/thumbnail", nil))

	require.Equal(t, http.StatusNotFound, res.Code)
	require.Zero(t, storage.downloadCalls)
}

// A signed-in viewer's authorization depends on their own block graph and NSFW
// preference, so their response must never be replayed to anybody else. The
// content route already says this; the thumbnail is the same picture, smaller.
func TestExploreThumbnailRouteNeverSharesAViewerScopedResponse(t *testing.T) {
	assetID := uuid.New()
	store := &omniChatSocialStoreFake{thumbnailPath: "omnichat/generated/9/" + assetID.String() + "-thumb.jpg"}
	storage := &omniChatMediaStorageFake{body: []byte("jpeg-bytes")}
	handler := NewOmniChatSocialHandler(&omniChatSocialPublisherFake{}, store, storage)

	res := httptest.NewRecorder()
	exploreThumbRouter(handler, 44).ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/media/"+assetID.String()+"/thumbnail", nil))

	require.Equal(t, http.StatusOK, res.Code)
	cacheControl := res.Header().Get("Cache-Control")
	require.Contains(t, cacheControl, "private", "a viewer-scoped response must never enter a shared cache")
	require.NotContains(t, cacheControl, "public")
	require.NotContains(t, cacheControl, "s-maxage")
	require.Contains(t, res.Header().Values("Vary"), "Authorization")
	require.Contains(t, res.Header().Values("Vary"), "Cookie")
}

// Explore is not the owner's gallery. Access depends on the viewer -- their
// NSFW preference, the block graph, whether the publication still stands -- so
// a cached thumbnail outlives a block or an unpublish for as long as it is
// allowed to live. Bounded at the five minutes the anonymous branch beside it
// already settled on, and never in a shared cache.
func TestExploreThumbnailIsCachedOnlyBriefly(t *testing.T) {
	assetID := uuid.New()
	store := &omniChatSocialStoreFake{thumbnailPath: "omnichat/generated/9/" + assetID.String() + ".png-thumb.jpg"}
	handler := NewOmniChatSocialHandler(&omniChatSocialPublisherFake{}, store, &omniChatMediaStorageFake{body: []byte("jpeg")})

	viewer := httptest.NewRecorder()
	exploreThumbRouter(handler, 44).ServeHTTP(viewer, httptest.NewRequest(http.MethodGet, "/media/"+assetID.String()+"/thumbnail", nil))

	require.Equal(t, "private, max-age=300", viewer.Header().Get("Cache-Control"))
	require.Contains(t, viewer.Header().Values("Vary"), "Authorization")

	anonymous := httptest.NewRecorder()
	exploreThumbRouter(handler, 0).ServeHTTP(anonymous, httptest.NewRequest(http.MethodGet, "/media/"+assetID.String()+"/thumbnail", nil))

	require.Equal(t, "public, max-age=300, s-maxage=300", anonymous.Header().Get("Cache-Control"),
		"anonymous authorization has no viewer state, so the two bounds must match")
}

func TestExploreThumbnailRouteRefusesAnOversizedObjectBeforeDownloading(t *testing.T) {
	assetID := uuid.New()
	oversized := int64(4<<20 + 1)
	store := &omniChatSocialStoreFake{thumbnailPath: "omnichat/generated/9/" + assetID.String() + "-thumb.jpg"}
	storage := &omniChatMediaStorageFake{size: &oversized}
	handler := NewOmniChatSocialHandler(&omniChatSocialPublisherFake{}, store, storage)

	res := httptest.NewRecorder()
	exploreThumbRouter(handler, 0).ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/media/"+assetID.String()+"/thumbnail", nil))

	require.Equal(t, http.StatusConflict, res.Code)
	require.Zero(t, storage.downloadCalls)
}

// The decorator is the gate: it is what every published asset passes through,
// and it set the thumbnail to nothing for all of them.
func TestADecoratedPublishedAssetOffersItsThumbnail(t *testing.T) {
	assetID := uuid.New()
	publication := &models.OmniChatPublication{
		Asset: &models.OmniChatPublicMediaAsset{
			ID: assetID, Kind: models.OmniChatMediaKindImage, HasThumbnail: true,
		},
	}

	decoratePublicPublication(publication)

	require.NotNil(t, publication.Asset.ThumbnailURL, "a published asset with a thumbnail offered none")
	require.Equal(t, "/api/v1/omnichat/explore/media/"+assetID.String()+"/thumbnail", *publication.Asset.ThumbnailURL)
	require.Equal(t, "/api/v1/omnichat/explore/media/"+assetID.String()+"/content", publication.Asset.ContentURL)
}

func TestADecoratedPublishedAssetWithoutAThumbnailOffersNone(t *testing.T) {
	for name, asset := range map[string]*models.OmniChatPublicMediaAsset{
		"a clip with none":  {ID: uuid.New(), Kind: models.OmniChatMediaKindVideo},
		"a still with none": {ID: uuid.New(), Kind: models.OmniChatMediaKindImage},
	} {
		t.Run(name, func(t *testing.T) {
			publication := &models.OmniChatPublication{Asset: asset}
			decoratePublicPublication(publication)
			require.Nil(t, publication.Asset.ThumbnailURL)
		})
	}
}
