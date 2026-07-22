package services

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"testing/iotest"
	"time"

	"github.com/stretchr/testify/require"
)

func TestLocalStorageRejectsPathsOutsideConfiguredRoot(t *testing.T) {
	parent := t.TempDir()
	storage, err := NewLocalStorageService(filepath.Join(parent, "storage"), "/uploads")
	require.NoError(t, err)

	_, err = storage.Upload(context.Background(), "../escape.txt", bytes.NewBufferString("outside"), "text/plain")
	require.Error(t, err)
	_, statErr := os.Stat(filepath.Join(parent, "escape.txt"))
	require.ErrorIs(t, statErr, os.ErrNotExist)

	_, err = storage.Download(context.Background(), "../escape.txt")
	require.Error(t, err)
	require.Error(t, storage.Delete(context.Background(), "../escape.txt"))
	_, err = storage.GetObjectSize(context.Background(), "../escape.txt")
	require.Error(t, err)
	_, err = storage.List(context.Background(), "../")
	require.Error(t, err)
	_, err = storage.GetSignedURL(context.Background(), "../escape.txt", time.Minute)
	require.Error(t, err)
	require.Empty(t, storage.PublicURL("../escape.txt"))
}

func TestLocalStorageStillSupportsNestedObjectKeys(t *testing.T) {
	storage, err := NewLocalStorageService(filepath.Join(t.TempDir(), "storage"), "/uploads")
	require.NoError(t, err)
	_, err = storage.Upload(context.Background(), "omnichat/speech/1/audio.mp3", bytes.NewBufferString("audio"), "audio/mpeg")
	require.NoError(t, err)
	reader, err := storage.Download(context.Background(), "omnichat/speech/1/audio.mp3")
	require.NoError(t, err)
	require.NoError(t, reader.Close())
}

func TestLocalStorageRejectsSymlinksInsideConfiguredRoot(t *testing.T) {
	parent := t.TempDir()
	base := filepath.Join(parent, "storage")
	storage, err := NewLocalStorageService(base, "/uploads")
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(parent, "outside.txt"), []byte("secret"), 0600))
	require.NoError(t, os.Symlink(filepath.Join(parent, "outside.txt"), filepath.Join(base, "linked.txt")))

	_, err = storage.Download(context.Background(), "linked.txt")
	require.Error(t, err)
	_, err = storage.Upload(context.Background(), "linked.txt", bytes.NewBufferString("overwrite"), "text/plain")
	require.Error(t, err)
}

func TestLocalStorageUploadFailureDoesNotCorruptExistingObject(t *testing.T) {
	storage, err := NewLocalStorageService(filepath.Join(t.TempDir(), "storage"), "/uploads")
	require.NoError(t, err)
	_, err = storage.Upload(context.Background(), "asset.bin", bytes.NewBufferString("original"), "application/octet-stream")
	require.NoError(t, err)

	_, err = storage.Upload(context.Background(), "asset.bin", iotest.ErrReader(errors.New("read failed")), "application/octet-stream")
	require.Error(t, err)
	reader, err := storage.Download(context.Background(), "asset.bin")
	require.NoError(t, err)
	contents, err := io.ReadAll(reader)
	require.NoError(t, err)
	require.NoError(t, reader.Close())
	require.Equal(t, "original", string(contents))
}

func TestS3StorageRoutesPendingUploadsOnlyToPrivateStagingBucket(t *testing.T) {
	storage := &S3StorageService{bucket: "public-assets", stagingBucket: "private-staging", region: "us-east-1"}
	bucket, err := storage.bucketForKey("pending-uploads/1/id/file.png")
	require.NoError(t, err)
	require.Equal(t, "private-staging", bucket)
	require.Empty(t, storage.PublicURL("pending-uploads/1/id/file.png"))

	bucket, err = storage.bucketForKey("uploads/1/id/file.png")
	require.NoError(t, err)
	require.Equal(t, "public-assets", bucket)
	require.NotEmpty(t, storage.PublicURL("uploads/1/id/file.png"))
}

func TestS3StorageDisablesPendingUploadsWithoutStagingBucket(t *testing.T) {
	storage := &S3StorageService{bucket: "public-assets"}
	_, err := storage.bucketForKey("pending-uploads/1/id/file.png")
	require.ErrorContains(t, err, "S3_STAGING_BUCKET")
	require.False(t, storage.SupportsQuarantinedDirectUploads())
	storage.stagingBucket = storage.bucket
	_, err = storage.bucketForKey("pending-uploads/1/id/file.png")
	require.Error(t, err)
}
