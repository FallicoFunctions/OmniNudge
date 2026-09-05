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

func posterAsset(id uuid.UUID, thumbnail string) *models.OmniChatMediaAsset {
	asset := &models.OmniChatMediaAsset{
		ID: id, OwnerUserID: 9, Kind: models.OmniChatMediaKindVideo,
		FileType: "video/mp4", StoragePath: "omnichat/generated/9/" + id.String() + ".mp4",
		ScanStatus: models.MediaScanStatusClean,
	}
	if thumbnail != "" {
		asset.ThumbnailURL = &thumbnail
	}
	return asset
}

func posterRouter(handler *OmniChatMediaHandler) *gin.Engine {
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", 9); c.Next() })
	router.GET("/media/:id/poster", handler.GetAssetPoster)
	return router
}

func TestPosterRouteServesThePosterAndNotTheClip(t *testing.T) {
	id := uuid.New()
	asset := posterAsset(id, "/uploads/omnichat/generated/9/"+id.String()+"-poster.jpg")
	storage := &omniChatMediaStorageFake{body: []byte("jpeg-bytes")}
	handler := NewOmniChatMediaHandler(&omniChatGenerationCreatorFake{}, &omniChatMediaReaderFake{asset: asset}, storage)

	response := httptest.NewRecorder()
	posterRouter(handler).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/media/"+id.String()+"/poster", nil))

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, "image/jpeg", response.Header().Get("Content-Type"))
	require.Equal(t, []string{"omnichat/generated/9/" + id.String() + "-poster.jpg"}, storage.downloadedKeys,
		"the poster route read the clip instead of the poster")
}

// A tile with no poster must be told so. Answering with anything else pushes
// the grid back to the clip, which is the whole defect this closes.
func TestPosterRouteReportsAClipWithNoPoster(t *testing.T) {
	id := uuid.New()
	storage := &omniChatMediaStorageFake{body: []byte("jpeg-bytes")}
	handler := NewOmniChatMediaHandler(&omniChatGenerationCreatorFake{}, &omniChatMediaReaderFake{asset: posterAsset(id, "")}, storage)

	response := httptest.NewRecorder()
	posterRouter(handler).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/media/"+id.String()+"/poster", nil))

	require.Equal(t, http.StatusNotFound, response.Code)
	require.Zero(t, storage.downloadCalls)
}

func TestPosterRouteRefusesAnImage(t *testing.T) {
	id := uuid.New()
	asset := &models.OmniChatMediaAsset{
		ID: id, OwnerUserID: 9, Kind: models.OmniChatMediaKindImage,
		FileType: "image/png", StoragePath: "omnichat/generated/9/still.png",
		ScanStatus: models.MediaScanStatusClean,
	}
	storage := &omniChatMediaStorageFake{body: []byte("jpeg")}
	handler := NewOmniChatMediaHandler(&omniChatGenerationCreatorFake{}, &omniChatMediaReaderFake{asset: asset}, storage)

	response := httptest.NewRecorder()
	posterRouter(handler).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/media/"+id.String()+"/poster", nil))

	require.Equal(t, http.StatusNotFound, response.Code)
	require.Zero(t, storage.downloadCalls)
}

func TestPosterRouteRefusesAnUnverifiedClip(t *testing.T) {
	id := uuid.New()
	asset := posterAsset(id, "/uploads/omnichat/generated/9/"+id.String()+"-poster.jpg")
	asset.ScanStatus = models.MediaScanStatusPending
	storage := &omniChatMediaStorageFake{body: []byte("jpeg")}
	handler := NewOmniChatMediaHandler(&omniChatGenerationCreatorFake{}, &omniChatMediaReaderFake{asset: asset}, storage)

	response := httptest.NewRecorder()
	posterRouter(handler).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/media/"+id.String()+"/poster", nil))

	require.Equal(t, http.StatusConflict, response.Code)
	require.Zero(t, storage.downloadCalls)
}

// A poster the size of a clip is not a poster, and the size is checked before
// anything is fetched.
func TestPosterRouteRefusesAnOversizedPosterBeforeDownloading(t *testing.T) {
	id := uuid.New()
	asset := posterAsset(id, "/uploads/omnichat/generated/9/"+id.String()+"-poster.jpg")
	oversized := int64(4<<20 + 1)
	storage := &omniChatMediaStorageFake{size: &oversized}
	handler := NewOmniChatMediaHandler(&omniChatGenerationCreatorFake{}, &omniChatMediaReaderFake{asset: asset}, storage)

	response := httptest.NewRecorder()
	posterRouter(handler).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/media/"+id.String()+"/poster", nil))

	require.Equal(t, http.StatusConflict, response.Code)
	require.Zero(t, storage.downloadCalls)
}

// The value comes out of a database row and is used to address storage, so it
// is checked rather than trusted.
func TestPosterKeyRefusesAnythingButAGeneratedPoster(t *testing.T) {
	id := uuid.New()
	for name, thumbnail := range map[string]string{
		"climbing out":     "/uploads/omnichat/generated/9/../../../etc/passwd.jpg",
		"a doubled slash":  "/uploads/omnichat/generated//9/x.jpg",
		"another prefix":   "/uploads/avatars/9/x.jpg",
		"not a poster":     "/uploads/omnichat/generated/9/clip.mp4",
		"an absolute host": "https://evil.test/x.jpg",
		"empty":            "   ",
	} {
		t.Run(name, func(t *testing.T) {
			require.Empty(t, omniChatPosterKey(posterAsset(id, thumbnail)))
		})
	}
	require.Empty(t, omniChatPosterKey(posterAsset(id, "")))
	require.Empty(t, omniChatPosterKey(nil))
}

// The decorator is the gate. Every asset the API returns passes through it, and
// before this it set the poster to nil for everything -- so a grid had no
// poster to show and had to reach for the clip.
func TestDecoratedClipOffersItsPosterThroughTheAPI(t *testing.T) {
	id := uuid.New()
	asset := posterAsset(id, "/uploads/omnichat/generated/9/"+id.String()+"-poster.jpg")

	decorateOmniChatAsset(asset)

	require.NotNil(t, asset.ThumbnailURL, "a clip with a poster offered none")
	require.Equal(t, "/api/v1/omnichat/media/"+id.String()+"/poster", *asset.ThumbnailURL)
}

// A private asset's storage location must never reach a client, whatever the
// row holds.
func TestDecoratedAssetNeverLeaksAStorageURL(t *testing.T) {
	id := uuid.New()
	for _, thumbnail := range []string{
		"https://omninudge-media.r2.cloudflarestorage.com/omnichat/generated/9/x-poster.jpg",
		"/uploads/avatars/9/x.jpg",
	} {
		asset := posterAsset(id, thumbnail)
		decorateOmniChatAsset(asset)
		require.Nil(t, asset.ThumbnailURL, "%s reached the client", thumbnail)
	}

	image := &models.OmniChatMediaAsset{ID: id, Kind: models.OmniChatMediaKindImage}
	stored := "/uploads/omnichat/generated/9/still-poster.jpg"
	image.ThumbnailURL = &stored
	decorateOmniChatAsset(image)
	require.Nil(t, image.ThumbnailURL, "an image has no poster of its own")
}
