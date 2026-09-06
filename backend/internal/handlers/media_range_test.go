package handlers

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/services"
)

func TestParsingAByteRange(t *testing.T) {
	const size = 1000
	for name, tc := range map[string]struct {
		header string
		want   *byteRange
		err    bool
	}{
		// A player asks for this first: everything from here to the end.
		"an open end":             {header: "bytes=0-", want: &byteRange{Offset: 0, Length: 1000}},
		"a seek with an open end": {header: "bytes=500-", want: &byteRange{Offset: 500, Length: 500}},
		"both ends":               {header: "bytes=0-99", want: &byteRange{Offset: 0, Length: 100}},
		"a middle slice":          {header: "bytes=200-299", want: &byteRange{Offset: 200, Length: 100}},
		"the last byte":           {header: "bytes=999-999", want: &byteRange{Offset: 999, Length: 1}},
		// "bytes=-500" is the LAST 500 bytes, not the first 500. Reading it the
		// other way serves the wrong part of every file to a player that seeks
		// backwards from the end to read a container's trailing index.
		"a suffix":              {header: "bytes=-500", want: &byteRange{Offset: 500, Length: 500}},
		"a suffix past the end": {header: "bytes=-5000", want: &byteRange{Offset: 0, Length: 1000}},
		// Clamped rather than refused: asking past the end is asking for the
		// rest, and that is how every other server answers it.
		"an end past the end": {header: "bytes=900-5000", want: &byteRange{Offset: 900, Length: 100}},

		"no header":       {header: "", want: nil},
		"whitespace only": {header: "   ", want: nil},
		"another unit":    {header: "items=0-10", want: nil},
		"multiple ranges": {header: "bytes=0-10,20-30", want: nil},
		"no dash":         {header: "bytes=100", want: nil},

		"a start past the end": {header: "bytes=1000-", err: true},
		"backwards":            {header: "bytes=500-100", err: true},
		"a negative start":     {header: "bytes=-1-5", err: true},
		"not a number":         {header: "bytes=abc-def", err: true},
		"an empty suffix":      {header: "bytes=-", err: true},
		"a zero suffix":        {header: "bytes=-0", err: true},
	} {
		t.Run(name, func(t *testing.T) {
			got, err := parseByteRange(tc.header, size)
			if tc.err {
				require.ErrorIs(t, err, errUnsatisfiableRange)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tc.want, got)
		})
	}
}

// An empty object has no byte to return, whatever was asked for.
func TestParsingAByteRangeOfNothing(t *testing.T) {
	got, err := parseByteRange("bytes=0-", 0)
	require.NoError(t, err)
	require.Nil(t, got)
}

// rangeStorageFake serves slices of a fixed body and records what it was asked
// for, so a test can tell a real range from a whole download relabelled.
type rangeStorageFake struct {
	body   []byte
	ranges [][2]int64
	wholes int
}

func (f *rangeStorageFake) Download(context.Context, string) (io.ReadCloser, error) {
	f.wholes++
	return io.NopCloser(bytes.NewReader(f.body)), nil
}
func (f *rangeStorageFake) DownloadRange(_ context.Context, _ string, offset, length int64) (io.ReadCloser, error) {
	f.ranges = append(f.ranges, [2]int64{offset, length})
	return io.NopCloser(bytes.NewReader(f.body[offset : offset+length])), nil
}
func (*rangeStorageFake) Upload(context.Context, string, io.Reader, string) (string, error) {
	return "", nil
}
func (*rangeStorageFake) Delete(context.Context, string) error { return nil }
func (*rangeStorageFake) GetSignedURL(context.Context, string, time.Duration) (string, error) {
	return "", nil
}
func (*rangeStorageFake) List(context.Context, string) ([]string, error) { return nil, nil }
func (*rangeStorageFake) GeneratePresignedPutURL(context.Context, string, string, time.Duration) (string, error) {
	return "", nil
}
func (*rangeStorageFake) PublicURL(string) string { return "" }
func (f *rangeStorageFake) GetObjectSize(context.Context, string) (int64, error) {
	return int64(len(f.body)), nil
}

func servingRouter(t *testing.T, storage services.StorageService, size int64) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/object", func(c *gin.Context) {
		c.Header("Content-Type", "video/mp4")
		serveStoredObject(c, storage, "omnichat/generated/9/clip.mp4", size)
	})
	return router
}

func requestRange(router *gin.Engine, header string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodGet, "/object", nil)
	if header != "" {
		request.Header.Set("Range", header)
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

// Without Accept-Ranges a player will not try to seek at all, however well the
// rest of this works.
func TestAWholeObjectStillAdvertisesRanges(t *testing.T) {
	body := bytes.Repeat([]byte("a"), 1000)
	storage := &rangeStorageFake{body: body}

	response := requestRange(servingRouter(t, storage, 1000), "")

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, "bytes", response.Header().Get("Accept-Ranges"))
	require.Equal(t, "1000", response.Header().Get("Content-Length"))
	require.Len(t, response.Body.Bytes(), 1000)
	require.Empty(t, storage.ranges, "a request with no Range must not become a ranged read")
}

// The bytes that come back must be the bytes that were asked for. A range that
// returns the right count from the wrong offset plays as corruption.
func TestARangeReturnsExactlyThoseBytes(t *testing.T) {
	body := []byte("0123456789")
	storage := &rangeStorageFake{body: body}

	response := requestRange(servingRouter(t, storage, 10), "bytes=3-5")

	require.Equal(t, http.StatusPartialContent, response.Code)
	require.Equal(t, "345", response.Body.String())
	// Inclusive at both ends, and the number after the slash is the whole
	// object's size, not the slice's.
	require.Equal(t, "bytes 3-5/10", response.Header().Get("Content-Range"))
	require.Equal(t, "3", response.Header().Get("Content-Length"))
	require.Equal(t, [][2]int64{{3, 3}}, storage.ranges)
	require.Zero(t, storage.wholes, "a ranged request read the whole object")
}

// What a player actually sends when it starts: everything from zero.
func TestTheOpeningRangeOfAPlayer(t *testing.T) {
	body := bytes.Repeat([]byte("v"), 6_600_000)
	storage := &rangeStorageFake{body: body}

	response := requestRange(servingRouter(t, storage, int64(len(body))), "bytes=0-")

	require.Equal(t, http.StatusPartialContent, response.Code)
	require.Equal(t, "bytes 0-6599999/6600000", response.Header().Get("Content-Range"))
}

// And what it sends when somebody drags the scrubber to the end.
func TestASuffixRangeReadsTheEnd(t *testing.T) {
	body := []byte("0123456789")
	storage := &rangeStorageFake{body: body}

	response := requestRange(servingRouter(t, storage, 10), "bytes=-3")

	require.Equal(t, http.StatusPartialContent, response.Code)
	require.Equal(t, "789", response.Body.String())
	require.Equal(t, "bytes 7-9/10", response.Header().Get("Content-Range"))
}

// 416 with the object's real size is how a player learns what it should have
// asked for. Answering 200 with the whole file instead makes it retry forever.
func TestAnImpossibleRangeSaysHowBigTheObjectIs(t *testing.T) {
	storage := &rangeStorageFake{body: []byte("0123456789")}

	response := requestRange(servingRouter(t, storage, 10), "bytes=50-60")

	require.Equal(t, http.StatusRequestedRangeNotSatisfiable, response.Code)
	require.Equal(t, "bytes */10", response.Header().Get("Content-Range"))
	require.Zero(t, storage.wholes)
	require.Empty(t, storage.ranges)
}

// A backend that cannot serve a range serves the whole object rather than
// failing. Losing the seek is a slower video; failing is no video.
func TestABackendThatCannotRangeStillServes(t *testing.T) {
	storage := &plainStorageFake{body: []byte("0123456789")}

	response := requestRange(servingRouter(t, storage, 10), "bytes=3-5")

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, "0123456789", response.Body.String())
	require.Equal(t, 1, storage.wholes)
}

// plainStorageFake implements StorageService and nothing more.
type plainStorageFake struct {
	body   []byte
	wholes int
}

func (f *plainStorageFake) Download(context.Context, string) (io.ReadCloser, error) {
	f.wholes++
	return io.NopCloser(bytes.NewReader(f.body)), nil
}
func (*plainStorageFake) Upload(context.Context, string, io.Reader, string) (string, error) {
	return "", nil
}
func (*plainStorageFake) Delete(context.Context, string) error { return nil }
func (*plainStorageFake) GetSignedURL(context.Context, string, time.Duration) (string, error) {
	return "", nil
}
func (*plainStorageFake) List(context.Context, string) ([]string, error) { return nil, nil }
func (*plainStorageFake) GeneratePresignedPutURL(context.Context, string, string, time.Duration) (string, error) {
	return "", nil
}
func (*plainStorageFake) PublicURL(string) string { return "" }
func (*plainStorageFake) GetObjectSize(context.Context, string) (int64, error) {
	return 0, nil
}

// A partial answer must not be stored as if it were the whole file.
//
// The explore route lets a shared cache keep an anonymous response for five
// minutes. A cache that stored one 206 under the URL could hand its slice to
// the next plain GET, and every viewer would get a truncated clip.
func TestARangeIsKeptApartFromTheWholeFileInACache(t *testing.T) {
	storage := &rangeStorageFake{body: []byte("0123456789")}
	router := servingRouter(t, storage, 10)

	partial := requestRange(router, "bytes=0-2")
	require.Equal(t, http.StatusPartialContent, partial.Code)
	require.Contains(t, partial.Header().Values("Vary"), "Range")

	whole := requestRange(router, "")
	require.Equal(t, http.StatusOK, whole.Code)
	require.Contains(t, whole.Header().Values("Vary"), "Range",
		"a cache stores the whole answer under the same key, so it has to be told too")
}
