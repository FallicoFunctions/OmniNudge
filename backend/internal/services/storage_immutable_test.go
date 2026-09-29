package services

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/aws/smithy-go"
	"github.com/stretchr/testify/require"
)

type immutableHTTPError struct {
	status int
}

func (e immutableHTTPError) Error() string       { return "immutable HTTP error" }
func (e immutableHTTPError) HTTPStatusCode() int { return e.status }

func TestLocalStoragePutIfAbsentIsImmutable(t *testing.T) {
	storage, err := NewLocalStorageService(t.TempDir(), "/uploads")
	require.NoError(t, err)
	ctx := context.Background()
	key := "omniavatar/jobs/job-id/testing/avatar.glb"

	created, err := storage.PutIfAbsent(ctx, key, bytes.NewReader([]byte("first")), "model/gltf-binary")
	require.NoError(t, err)
	require.True(t, created)
	created, err = storage.PutIfAbsent(ctx, key, bytes.NewReader([]byte("second")), "model/gltf-binary")
	require.NoError(t, err)
	require.False(t, created)

	stored, err := storage.Download(ctx, key)
	require.NoError(t, err)
	defer func() { _ = stored.Close() }()
	contents, err := io.ReadAll(stored)
	require.NoError(t, err)
	require.Equal(t, []byte("first"), contents)
}

func TestLocalStoragePutIfAbsentRejectsTraversal(t *testing.T) {
	storage, err := NewLocalStorageService(t.TempDir(), "/uploads")
	require.NoError(t, err)
	_, err = storage.PutIfAbsent(context.Background(), "../outside", bytes.NewReader([]byte("bad")), "application/octet-stream")
	require.Error(t, err)
	_, err = storage.PutIfAbsent(context.Background(), "folder\\outside", bytes.NewReader([]byte("bad")), "application/octet-stream")
	require.Error(t, err)
	_, err = storage.PutIfAbsent(context.Background(), "object", nil, "application/octet-stream")
	require.ErrorContains(t, err, "body is required")
}

func TestImmutableObjectKeyValidationIsProviderNeutral(t *testing.T) {
	for _, key := range []string{"", ".", "../outside", "/absolute", "folder\\object", "folder//object", "folder/../object", "object\x00tail", "object\nforged", "object?download=1", " object"} {
		require.Error(t, validateImmutableObjectKey(key), key)
	}
	require.Error(t, validateImmutableObjectKey(strings.Repeat("a", 1025)))
	require.NoError(t, validateImmutableObjectKey("omniavatar/jobs/job-id/stage/object.glb"))
}

func TestLocalStoragePutIfAbsentRejectsSymlinkEscape(t *testing.T) {
	base := t.TempDir()
	outside := t.TempDir()
	require.NoError(t, os.Symlink(outside, filepath.Join(base, "escape")))
	storage, err := NewLocalStorageService(base, "/uploads")
	require.NoError(t, err)
	_, err = storage.PutIfAbsent(context.Background(), "escape/newdir/object", bytes.NewReader([]byte("bad")), "application/octet-stream")
	require.ErrorContains(t, err, "symlink")
	_, statErr := os.Stat(filepath.Join(outside, "newdir"))
	require.ErrorIs(t, statErr, os.ErrNotExist)
}

func TestLocalStoragePutIfAbsentRejectsSymlinkAtObjectName(t *testing.T) {
	base := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside")
	require.NoError(t, os.WriteFile(outside, []byte("outside"), 0600))
	require.NoError(t, os.Symlink(outside, filepath.Join(base, "object")))
	storage, err := NewLocalStorageService(base, "/uploads")
	require.NoError(t, err)

	created, err := storage.PutIfAbsent(context.Background(), "object", bytes.NewReader([]byte("bad")), "application/octet-stream")
	require.ErrorContains(t, err, "not a regular file")
	require.False(t, created)
	contents, err := os.ReadFile(outside)
	require.NoError(t, err)
	require.Equal(t, []byte("outside"), contents)
}

func TestConditionalWriteConflictDetection(t *testing.T) {
	require.True(t, isConditionalWriteConflict(&smithy.GenericAPIError{Code: "PreconditionFailed"}))
	require.True(t, isConditionalWriteConflict(&smithy.GenericAPIError{Code: "ConditionalRequestConflict"}))
	require.True(t, isConditionalWriteConflict(immutableHTTPError{status: 409}))
	require.True(t, isConditionalWriteConflict(fmt.Errorf("wrapped: %w", immutableHTTPError{status: 412})))
	require.False(t, isConditionalWriteConflict(immutableHTTPError{status: 500}))
	require.False(t, isConditionalWriteConflict(errors.New("unrelated")))
}

func TestLocalStoragePutIfAbsentHasSingleConcurrentWinner(t *testing.T) {
	storage, err := NewLocalStorageService(t.TempDir(), "/uploads")
	require.NoError(t, err)
	const workers = 16
	var winners atomic.Int32
	var wait sync.WaitGroup
	errorsByWorker := make(chan error, workers)
	for index := 0; index < workers; index++ {
		wait.Add(1)
		go func(value byte) {
			defer wait.Done()
			created, putErr := storage.PutIfAbsent(context.Background(), "immutable/object", bytes.NewReader([]byte{value}), "application/octet-stream")
			if putErr != nil {
				errorsByWorker <- putErr
				return
			}
			if created {
				winners.Add(1)
			}
		}(byte(index))
	}
	wait.Wait()
	close(errorsByWorker)
	for err := range errorsByWorker {
		require.NoError(t, err)
	}
	require.Equal(t, int32(1), winners.Load())
}
