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

func thumbnailAsset(id uuid.UUID, kind models.OmniChatMediaKind, thumbnail string) *models.OmniChatMediaAsset {
	fileType := "video/mp4"
	extension := ".mp4"
	if kind == models.OmniChatMediaKindImage {
		fileType, extension = "image/png", ".png"
	}
	asset := &models.OmniChatMediaAsset{
		ID: id, OwnerUserID: 9, Kind: kind, FileType: fileType,
		StoragePath: "omnichat/generated/9/" + id.String() + extension,
		ScanStatus:  models.MediaScanStatusClean,
	}
	if thumbnail != "" {
		asset.ThumbnailURL = &thumbnail
	}
	return asset
}

func thumbnailRouter(handler *OmniChatMediaHandler) *gin.Engine {
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", 9); c.Next() })
	router.GET("/media/:id/thumbnail", handler.GetAssetThumbnail)
	return router
}

// Both kinds. A generated image is about a megabyte of PNG and a clip was 6.6
// MB; a tile shows either at a few hundred pixels.
func TestThumbnailRouteServesTheThumbnailAndNotTheAsset(t *testing.T) {
	for name, kind := range map[string]models.OmniChatMediaKind{
		"a clip":  models.OmniChatMediaKindVideo,
		"a still": models.OmniChatMediaKindImage,
	} {
		t.Run(name, func(t *testing.T) {
			id := uuid.New()
			asset := thumbnailAsset(id, kind, "/uploads/omnichat/generated/9/"+id.String()+"-thumb.jpg")
			storage := &omniChatMediaStorageFake{body: []byte("jpeg-bytes")}
			handler := NewOmniChatMediaHandler(&omniChatGenerationCreatorFake{}, &omniChatMediaReaderFake{asset: asset}, storage)

			response := httptest.NewRecorder()
			thumbnailRouter(handler).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/media/"+id.String()+"/thumbnail", nil))

			require.Equal(t, http.StatusOK, response.Code)
			require.Equal(t, "image/jpeg", response.Header().Get("Content-Type"))
			require.Equal(t, []string{"omnichat/generated/9/" + id.String() + "-thumb.jpg"}, storage.downloadedKeys,
				"the thumbnail route read the asset instead of the thumbnail")
		})
	}
}

// A tile with no thumbnail must be told so. Answering with anything else pushes
// the grid back to the asset, which is the whole defect this closes.
func TestThumbnailRouteReportsAnAssetWithNoThumbnail(t *testing.T) {
	id := uuid.New()
	storage := &omniChatMediaStorageFake{body: []byte("jpeg-bytes")}
	handler := NewOmniChatMediaHandler(&omniChatGenerationCreatorFake{},
		&omniChatMediaReaderFake{asset: thumbnailAsset(id, models.OmniChatMediaKindVideo, "")}, storage)

	response := httptest.NewRecorder()
	thumbnailRouter(handler).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/media/"+id.String()+"/thumbnail", nil))

	require.Equal(t, http.StatusNotFound, response.Code)
	require.Zero(t, storage.downloadCalls)
}

func TestThumbnailRouteRefusesAnUnverifiedAsset(t *testing.T) {
	id := uuid.New()
	asset := thumbnailAsset(id, models.OmniChatMediaKindVideo, "/uploads/omnichat/generated/9/"+id.String()+"-thumb.jpg")
	asset.ScanStatus = models.MediaScanStatusPending
	storage := &omniChatMediaStorageFake{body: []byte("jpeg")}
	handler := NewOmniChatMediaHandler(&omniChatGenerationCreatorFake{}, &omniChatMediaReaderFake{asset: asset}, storage)

	response := httptest.NewRecorder()
	thumbnailRouter(handler).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/media/"+id.String()+"/thumbnail", nil))

	require.Equal(t, http.StatusConflict, response.Code)
	require.Zero(t, storage.downloadCalls)
}

// A thumbnail the size of the asset is not a thumbnail, and the size is checked
// before anything is fetched.
func TestThumbnailRouteRefusesAnOversizedObjectBeforeDownloading(t *testing.T) {
	id := uuid.New()
	asset := thumbnailAsset(id, models.OmniChatMediaKindVideo, "/uploads/omnichat/generated/9/"+id.String()+"-thumb.jpg")
	oversized := int64(4<<20 + 1)
	storage := &omniChatMediaStorageFake{size: &oversized}
	handler := NewOmniChatMediaHandler(&omniChatGenerationCreatorFake{}, &omniChatMediaReaderFake{asset: asset}, storage)

	response := httptest.NewRecorder()
	thumbnailRouter(handler).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/media/"+id.String()+"/thumbnail", nil))

	require.Equal(t, http.StatusConflict, response.Code)
	require.Zero(t, storage.downloadCalls)
}

// The value comes out of a database row and addresses storage, so it is checked
// rather than trusted.
func TestThumbnailKeyRefusesAnythingButAGeneratedThumbnail(t *testing.T) {
	id := uuid.New()
	for name, thumbnail := range map[string]string{
		"climbing out":     "/uploads/omnichat/generated/9/../../../etc/passwd-thumb.jpg",
		"a doubled slash":  "/uploads/omnichat/generated//9/" + id.String() + "-thumb.jpg",
		"another prefix":   "/uploads/avatars/9/" + id.String() + "-thumb.jpg",
		"the asset itself": "/uploads/omnichat/generated/9/" + id.String() + ".mp4",
		"an absolute host": "https://evil.test/x-thumb.jpg",
		"empty":            "   ",
	} {
		t.Run(name, func(t *testing.T) {
			require.Empty(t, omniChatThumbnailKey(thumbnailAsset(id, models.OmniChatMediaKindVideo, thumbnail)))
		})
	}
	require.Empty(t, omniChatThumbnailKey(thumbnailAsset(id, models.OmniChatMediaKindVideo, "")))
	require.Empty(t, omniChatThumbnailKey(nil))
}

// The decorator is the gate. Every asset the API returns passes through it, and
// before this it set the thumbnail to nil for everything -- so a grid had none
// to show and had to reach for the asset.
func TestADecoratedAssetOffersItsThumbnailThroughTheAPI(t *testing.T) {
	for name, kind := range map[string]models.OmniChatMediaKind{
		"a clip":  models.OmniChatMediaKindVideo,
		"a still": models.OmniChatMediaKindImage,
	} {
		t.Run(name, func(t *testing.T) {
			id := uuid.New()
			asset := thumbnailAsset(id, kind, "/uploads/omnichat/generated/9/"+id.String()+"-thumb.jpg")

			decorateOmniChatAsset(asset)

			require.NotNil(t, asset.ThumbnailURL, "an asset with a thumbnail offered none")
			require.Equal(t, "/api/v1/omnichat/media/"+id.String()+"/thumbnail", *asset.ThumbnailURL)
		})
	}
}

// A private asset's storage location must never reach a client, whatever the
// row holds.
func TestADecoratedAssetNeverLeaksAStorageURL(t *testing.T) {
	id := uuid.New()
	for _, thumbnail := range []string{
		"https://omninudge-media.r2.cloudflarestorage.com/omnichat/generated/9/" + id.String() + "-thumb.jpg",
		"/uploads/avatars/9/" + id.String() + "-thumb.jpg",
		"/uploads/omnichat/generated/9/" + id.String() + ".png",
	} {
		asset := thumbnailAsset(id, models.OmniChatMediaKindImage, thumbnail)
		decorateOmniChatAsset(asset)
		require.Nil(t, asset.ThumbnailURL, "%s reached the client", thumbnail)
	}
}

// A thumbnail is the one thing here worth caching. The bytes never change --
// the key is the asset plus a suffix -- and only the owner can ever get a 200,
// so there is no revocation to outrun. Without this a gallery re-fetched every
// tile on every visit, which is most of what the thumbnail exists to stop.
func TestThumbnailRouteLetsTheOwnersBrowserKeepIt(t *testing.T) {
	id := uuid.New()
	asset := thumbnailAsset(id, models.OmniChatMediaKindImage, "/uploads/omnichat/generated/9/"+id.String()+".png-thumb.jpg")
	handler := NewOmniChatMediaHandler(&omniChatGenerationCreatorFake{},
		&omniChatMediaReaderFake{asset: asset}, &omniChatMediaStorageFake{body: []byte("jpeg")})

	response := httptest.NewRecorder()
	thumbnailRouter(handler).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/media/"+id.String()+"/thumbnail", nil))

	require.Equal(t, http.StatusOK, response.Code)
	cacheControl := response.Header().Get("Cache-Control")
	require.Contains(t, cacheControl, "max-age=", "the owner's browser must be allowed to keep this")
	// Private and varied: no shared cache may hold it, and no browser may
	// replay one account's tile to another.
	require.Contains(t, cacheControl, "private")
	require.NotContains(t, cacheControl, "no-store")
	require.Contains(t, response.Header().Values("Vary"), "Authorization")
	require.Contains(t, response.Header().Values("Vary"), "Cookie")
}

// The asset itself is a different question and keeps its answer: megabytes,
// and no reason yet to let them persist.
func TestTheAssetItselfIsStillNotCached(t *testing.T) {
	id := uuid.New()
	asset := &models.OmniChatMediaAsset{
		ID: id, OwnerUserID: 9, Kind: models.OmniChatMediaKindImage,
		FileType: "image/png", StoragePath: "omnichat/generated/9/still.png",
		ScanStatus: models.MediaScanStatusClean,
	}
	handler := NewOmniChatMediaHandler(&omniChatGenerationCreatorFake{},
		&omniChatMediaReaderFake{asset: asset}, &omniChatMediaStorageFake{body: []byte("png")})
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", 9); c.Next() })
	router.GET("/media/:id/content", handler.GetAssetContent)

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/media/"+id.String()+"/content", nil))

	require.Equal(t, "private, no-store", response.Header().Get("Cache-Control"))
}
