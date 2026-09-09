package handlers

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/omninudge/backend/internal/services"
)

// Serving part of a file, so a video can play before it has finished arriving.
//
// Every media route here answered with the whole object and no Accept-Ranges,
// so a player had to wait for the last byte before showing the first frame, and
// dragging the scrubber was impossible. One real clip is 6.6 MB.
//
// Only the two headers below make that work, and both are easy to get subtly
// wrong: a byte range is inclusive at BOTH ends, so the last byte of a range is
// offset+length-1, and Content-Range states the whole object's size after the
// slash rather than the slice's.

// setCacheable sets Cache-Control and clears the two headers the API's cache
// middleware stamps on every response under /api/.
//
// That middleware sends "Pragma: no-cache" and "Expires: 0" alongside its own
// no-store default. A route that then sets its own max-age gets all three, and
// a browser stores the response but never treats it as fresh -- so every visit
// revalidates and the max-age is decoration. Measured in the running app: the
// same thumbnail took 141ms with the default cache mode and 2ms with
// force-cache, which is a response that is cached and never used.
//
// The uploads handler already deletes both for exactly this reason. This is
// that fix, where the media routes can reach it.
func setCacheable(c *gin.Context, value string) {
	c.Header("Cache-Control", value)
	c.Writer.Header().Del("Pragma")
	c.Writer.Header().Del("Expires")
}

// errUnsatisfiableRange means the client asked for bytes this object does not
// have. It is answered with 416 and the object's real size, which is how a
// player learns what it should have asked for.
var errUnsatisfiableRange = errors.New("range is outside the object")

// byteRange is a resolved, clamped slice of an object.
type byteRange struct {
	Offset int64
	Length int64
}

// parseByteRange reads a Range header against an object of the given size.
//
// A nil result with a nil error means "no range asked for, send the whole
// thing". Only a single range is honoured: multipart ranges are legal HTTP and
// no video player asks for them, so the whole object is a correct and simpler
// answer than a multipart body nobody would read.
func parseByteRange(header string, size int64) (*byteRange, error) {
	header = strings.TrimSpace(header)
	if header == "" || size <= 0 {
		return nil, nil
	}
	value, found := strings.CutPrefix(header, "bytes=")
	if !found || strings.Contains(value, ",") {
		return nil, nil
	}
	first, last, found := strings.Cut(strings.TrimSpace(value), "-")
	if !found {
		return nil, nil
	}
	first, last = strings.TrimSpace(first), strings.TrimSpace(last)

	// "bytes=-500" is the LAST 500 bytes, not the first 500. Reading it the
	// other way serves the wrong part of every file to a player that seeks
	// backwards from the end, which is how some of them read a container's
	// trailing index.
	if first == "" {
		suffix, err := strconv.ParseInt(last, 10, 64)
		if err != nil || suffix <= 0 {
			return nil, errUnsatisfiableRange
		}
		if suffix > size {
			suffix = size
		}
		return &byteRange{Offset: size - suffix, Length: suffix}, nil
	}

	offset, err := strconv.ParseInt(first, 10, 64)
	if err != nil || offset < 0 {
		return nil, errUnsatisfiableRange
	}
	if offset >= size {
		return nil, errUnsatisfiableRange
	}

	// An open end means "to the end of the object", which is what a player asks
	// for when it starts playing.
	end := size - 1
	if last != "" {
		end, err = strconv.ParseInt(last, 10, 64)
		if err != nil || end < offset {
			return nil, errUnsatisfiableRange
		}
		// Clamped, not refused: a player asking past the end is asking for the
		// rest of the file, and every other server answers it that way.
		if end > size-1 {
			end = size - 1
		}
	}
	return &byteRange{Offset: offset, Length: end - offset + 1}, nil
}

// serveStoredObject answers a media request from storage, honouring one byte
// range when the client asks for one and the backend can serve it.
//
// The caller has already decided that this viewer may have this object, and has
// already set Content-Type, Content-Disposition, Cache-Control and any Vary.
func serveStoredObject(c *gin.Context, storage services.StorageService, key string, size int64) {
	c.Header("Accept-Ranges", "bytes")
	// A partial answer must not be stored as if it were the whole file.
	//
	// The explore route lets a shared cache keep an anonymous response for five
	// minutes. Without this, a cache that stored one 206 under the URL could
	// hand its slice to the next plain GET, and every viewer would get a
	// truncated clip. Keying on Range keeps the two apart.
	c.Writer.Header().Add("Vary", "Range")

	requested, err := parseByteRange(c.GetHeader("Range"), size)
	if err != nil {
		// The object's real size, so the player knows what to ask for next.
		c.Header("Content-Range", fmt.Sprintf("bytes */%d", size))
		RespondError(c, http.StatusRequestedRangeNotSatisfiable, "Requested range is not available")
		return
	}

	ranged, canRange := storage.(services.RangeStorage)
	if requested == nil || !canRange {
		reader, err := storage.Download(c.Request.Context(), key)
		if err != nil {
			RespondError(c, http.StatusNotFound, "Media not found")
			return
		}
		defer func() { _ = reader.Close() }()
		c.Header("Content-Length", strconv.FormatInt(size, 10))
		// Headers are already flushed, so a copy failure cannot be reported to
		// the client; discard it explicitly as the other streaming handlers do.
		_, _ = io.Copy(c.Writer, &io.LimitedReader{R: reader, N: size})
		return
	}

	reader, err := ranged.DownloadRange(c.Request.Context(), key, requested.Offset, requested.Length)
	if err != nil {
		RespondError(c, http.StatusNotFound, "Media not found")
		return
	}
	defer func() { _ = reader.Close() }()

	// Inclusive at both ends, and the size after the slash is the whole
	// object's, not the slice's.
	c.Header("Content-Range", fmt.Sprintf("bytes %d-%d/%d",
		requested.Offset, requested.Offset+requested.Length-1, size))
	c.Header("Content-Length", strconv.FormatInt(requested.Length, 10))
	c.Status(http.StatusPartialContent)
	_, _ = io.Copy(c.Writer, &io.LimitedReader{R: reader, N: requested.Length})
}
