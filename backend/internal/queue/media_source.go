package queue

import (
	"context"
	"fmt"
	"io"
	"os"

	"github.com/omninudge/backend/internal/services"
)

func resolveMediaRemoteKey(defaultKey, payloadKey string) string {
	if payloadKey != "" {
		return payloadKey
	}
	return defaultKey
}

func thumbnailJobTypeForMIME(mimeType string) (string, bool) {
	switch {
	case services.IsImageType(mimeType):
		return "image", true
	case services.IsPDFType(mimeType):
		return "pdf", true
	case services.IsVideoType(mimeType):
		return "video", true
	default:
		return "", false
	}
}

func resolveMediaSource(ctx context.Context, localPath, remoteKey string, storageSvc services.StorageService) (string, func(), error) {
	if _, err := os.Stat(localPath); err == nil {
		return localPath, func() {}, nil
	} else if !os.IsNotExist(err) {
		return "", nil, fmt.Errorf("stat source file %q: %w", localPath, err)
	}

	if storageSvc == nil {
		return "", nil, fmt.Errorf("source file does not exist: stat %s: no such file or directory", localPath)
	}
	if remoteKey == "" {
		return "", nil, fmt.Errorf("source file missing locally and no remote storage key available")
	}

	rc, err := storageSvc.Download(ctx, remoteKey)
	if err != nil {
		return "", nil, fmt.Errorf("download source %q from storage: %w", remoteKey, err)
	}
	defer rc.Close()

	tempFile, err := os.CreateTemp("", "omnimedia-*")
	if err != nil {
		return "", nil, fmt.Errorf("create temp media source: %w", err)
	}

	cleanup := func() {
		tempFile.Close()
		_ = os.Remove(tempFile.Name())
	}

	if _, err := io.Copy(tempFile, rc); err != nil {
		cleanup()
		return "", nil, fmt.Errorf("write temp media source: %w", err)
	}
	if err := tempFile.Sync(); err != nil {
		cleanup()
		return "", nil, fmt.Errorf("sync temp media source: %w", err)
	}

	return tempFile.Name(), cleanup, nil
}
