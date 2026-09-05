package queue

import (
	"bytes"
	"context"
	"io"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/services"
)

type downloadOnlyStorage struct{ body []byte }

func (s *downloadOnlyStorage) Download(context.Context, string) (io.ReadCloser, error) {
	return io.NopCloser(bytes.NewReader(s.body)), nil
}
func (*downloadOnlyStorage) Upload(context.Context, string, io.Reader, string) (string, error) {
	return "", nil
}
func (*downloadOnlyStorage) Delete(context.Context, string) error { return nil }
func (*downloadOnlyStorage) GetSignedURL(context.Context, string, time.Duration) (string, error) {
	return "", nil
}
func (*downloadOnlyStorage) List(context.Context, string) ([]string, error) { return nil, nil }
func (*downloadOnlyStorage) GeneratePresignedPutURL(context.Context, string, string, time.Duration) (string, error) {
	return "", nil
}
func (*downloadOnlyStorage) PublicURL(string) string { return "" }
func (*downloadOnlyStorage) GetObjectSize(context.Context, string) (int64, error) {
	return 0, nil
}

var _ services.StorageService = (*downloadOnlyStorage)(nil)

// A source pulled out of storage has to keep the extension the object had.
//
// The thumbnail service refuses a source whose type it cannot read from the
// name, so a remote video came back as "not a supported video file" and got no
// thumbnail at all. ffmpeg has the same habit on the output side. Nothing in
// the local-file branch showed this, because a local path already has a name.
func TestAResolvedRemoteSourceKeepsItsExtension(t *testing.T) {
	storage := &downloadOnlyStorage{body: []byte("stored-bytes")}

	path, cleanup, err := resolveMediaSource(context.Background(),
		filepath.Join(t.TempDir(), "not-here.mp4"), "omnichat/generated/7/clip.mp4", storage)
	defer cleanup()

	require.NoError(t, err)
	require.Equal(t, ".mp4", filepath.Ext(path), "the downloaded source does not say what it holds")
}

// An object with no extension is still a valid object; it simply has nothing to
// carry over.
func TestAResolvedRemoteSourceSurvivesAKeyWithNoExtension(t *testing.T) {
	storage := &downloadOnlyStorage{body: []byte("stored-bytes")}

	path, cleanup, err := resolveMediaSource(context.Background(),
		filepath.Join(t.TempDir(), "not-here"), "omnichat/generated/7/clip", storage)
	defer cleanup()

	require.NoError(t, err)
	require.NotEmpty(t, path)
}
