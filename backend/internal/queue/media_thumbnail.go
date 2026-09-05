package queue

import (
	"context"
	"fmt"
	"os"
	"time"

	zlog "github.com/rs/zerolog/log"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// A gallery tile must not fetch the thing it is a tile for.
//
// Every asset was fetched whole to draw a tile a few hundred pixels wide: the
// generated images are about a megabyte of PNG at 896x1120, and a clip was 6.6
// MB. Twenty-four tiles is one page. Nothing was cached, so it happened again
// on every visit.
//
// A thumbnail is one small JPEG stored beside the asset under the same job id.
// It is made by the same ThumbnailService the upload path has always used --
// there is no second resize in this repository, and the one that exists is
// already bounded, already guarded against decoder panics, and already squeezed
// under a size cap.

// thumbnailTimeout bounds the ffmpeg call for a clip's frame.
const thumbnailTimeout = 30 * time.Second

// storeThumbnail makes a thumbnail for a finished render and uploads it beside
// the asset, returning the URL to record and the storage key to clean up. Both
// are empty when there is no thumbnail.
//
// A missing thumbnail is never a reason to fail a render. The user paid for the
// picture, the picture is in hand, and a tile without a preview is a smaller
// loss than a refund and a retry.
func (h *OmniChatGenerationHandler) storeThumbnail(
	ctx context.Context, job *models.OmniChatGenerationJob, kind models.OmniChatMediaKind, sourcePath string,
) (string, string) {
	if h.thumbnails == nil {
		return "", ""
	}
	warn := func(err error, message string) (string, string) {
		zlog.Warn().Err(err).Str("job_id", job.ID.String()).Str("kind", string(kind)).Msg(message)
		return "", ""
	}

	var thumbnailPath string
	var err error
	switch kind {
	case models.OmniChatMediaKindVideo:
		thumbnailPath, err = h.thumbnails.GenerateVideoThumbnailSecure(sourcePath, thumbnailTimeout)
	default:
		var set *services.ImageThumbnailSet
		set, err = h.thumbnails.GenerateImageThumbnails(sourcePath)
		if err == nil {
			thumbnailPath = set.PrimaryPath
			// The small variant is for compact surfaces this path has none of.
			// It is written beside the primary, so it has to be removed here or
			// it stays in the worker's temp directory for the life of the
			// process.
			defer func() { _ = os.Remove(set.SmallPath) }()
		}
	}
	if err != nil {
		return warn(err, "omnichat: the render has no thumbnail")
	}
	defer func() { _ = os.Remove(thumbnailPath) }()

	file, err := os.Open(thumbnailPath)
	if err != nil {
		return warn(err, "omnichat: the thumbnail could not be read")
	}
	defer func() { _ = file.Close() }()

	key := fmt.Sprintf("omnichat/generated/%d/%s%s.jpg", job.OwnerUserID, job.ID.String(), models.OmniChatThumbnailSuffix)
	if _, err := h.storage.Upload(ctx, key, file, "image/jpeg"); err != nil {
		return warn(err, "omnichat: the thumbnail could not be stored")
	}
	return "/uploads/" + key, key
}
