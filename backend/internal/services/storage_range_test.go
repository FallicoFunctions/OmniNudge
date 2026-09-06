package services

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

// A seek-and-bound is exactly where an off-by-one lives, and a range that is
// one byte long or one byte short plays as corruption rather than as an error.
func TestLocalStorageServesExactlyTheRangeAskedFor(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "omnichat", "generated", "9"), 0o750))
	const body = "0123456789"
	require.NoError(t, os.WriteFile(filepath.Join(dir, "omnichat", "generated", "9", "clip.mp4"), []byte(body), 0o600))

	storage, err := NewLocalStorageService(dir, "http://example.test/uploads")
	require.NoError(t, err)
	const key = "omnichat/generated/9/clip.mp4"

	for name, tc := range map[string]struct {
		offset, length int64
		want           string
	}{
		"the middle":     {offset: 3, length: 3, want: "345"},
		"the first byte": {offset: 0, length: 1, want: "0"},
		"the last byte":  {offset: 9, length: 1, want: "9"},
		"the whole file": {offset: 0, length: 10, want: body},
		"to the end":     {offset: 7, length: 3, want: "789"},
	} {
		t.Run(name, func(t *testing.T) {
			reader, err := storage.DownloadRange(context.Background(), key, tc.offset, tc.length)
			require.NoError(t, err)
			defer func() { _ = reader.Close() }()

			got, err := io.ReadAll(reader)
			require.NoError(t, err)
			require.Equal(t, tc.want, string(got))
		})
	}
}

// The reader must stop at the end of its range even when the caller keeps
// asking, and it must still close the file underneath. A plain LimitedReader
// would leak the descriptor on every seek a player makes.
func TestLocalStorageRangeStopsAndCloses(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "omnichat", "generated", "9"), 0o750))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "omnichat", "generated", "9", "clip.mp4"), []byte("0123456789"), 0o600))

	storage, err := NewLocalStorageService(dir, "http://example.test/uploads")
	require.NoError(t, err)

	reader, err := storage.DownloadRange(context.Background(), "omnichat/generated/9/clip.mp4", 2, 3)
	require.NoError(t, err)

	buffer := make([]byte, 100)
	n, err := reader.Read(buffer)
	require.NoError(t, err)
	require.Equal(t, "234", string(buffer[:n]), "the reader ran past the range it was given")

	_, err = reader.Read(buffer)
	require.ErrorIs(t, err, io.EOF)
	require.NoError(t, reader.Close())
}

// The path rules that govern a whole download govern a partial one too.
func TestLocalStorageRangeRefusesAnEscapingKey(t *testing.T) {
	storage, err := NewLocalStorageService(t.TempDir(), "http://example.test/uploads")
	require.NoError(t, err)

	_, err = storage.DownloadRange(context.Background(), "../../etc/passwd", 0, 1)

	require.Error(t, err)
}
