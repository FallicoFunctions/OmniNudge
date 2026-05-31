package linkpreview

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/services"
	_ "golang.org/x/image/webp"
)

type assetIngestor struct {
	client       *http.Client
	storage      services.StorageService
	virusScanner services.VirusScanner
}

func newAssetIngestor(client *http.Client, storage services.StorageService, virusScanner services.VirusScanner) *assetIngestor {
	if client == nil || storage == nil {
		return nil
	}
	return &assetIngestor{
		client:       client,
		storage:      storage,
		virusScanner: virusScanner,
	}
}

func (i *assetIngestor) StoreImage(ctx context.Context, imageURL string) (string, error) {
	parsed, err := validateTargetURL(imageURL)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", defaultUserAgent)
	req.Header.Set("Accept", "image/*")

	resp, err := i.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("unexpected image status: %d", resp.StatusCode)
	}

	contentType := strings.ToLower(strings.TrimSpace(resp.Header.Get("Content-Type")))
	if !strings.HasPrefix(contentType, "image/") {
		return "", fmt.Errorf("unsupported image content type: %s", contentType)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxAssetBytes+1))
	if err != nil {
		return "", err
	}
	if len(data) > maxAssetBytes {
		return "", fmt.Errorf("image exceeds size limit")
	}

	if _, _, err := image.DecodeConfig(bytes.NewReader(data)); err != nil {
		return "", fmt.Errorf("decode preview image: %w", err)
	}

	if err := i.scanImage(ctx, data); err != nil {
		return "", err
	}

	ext := extensionForContentType(contentType)
	key := fmt.Sprintf("link-previews/%s/%s%s", time.Now().UTC().Format("2006/01/02"), uuid.NewString(), ext)
	return i.storage.Upload(ctx, key, bytes.NewReader(data), contentType)
}

func (i *assetIngestor) scanImage(ctx context.Context, data []byte) error {
	if i.virusScanner == nil {
		return nil
	}

	tempFile, err := os.CreateTemp("", "link-preview-*")
	if err != nil {
		return err
	}
	tempPath := tempFile.Name()
	defer os.Remove(tempPath)

	if _, err := tempFile.Write(data); err != nil {
		_ = tempFile.Close()
		return err
	}
	if err := tempFile.Close(); err != nil {
		return err
	}

	result, err := i.virusScanner.ScanFile(ctx, tempPath)
	if err != nil {
		return err
	}
	if result.Infected {
		return fmt.Errorf("preview image rejected by virus scanner")
	}
	return nil
}

func extensionForContentType(contentType string) string {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err == nil {
		contentType = mediaType
	}

	switch contentType {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	default:
		if ext := filepath.Ext(contentType); ext != "" {
			return ext
		}
		return ".img"
	}
}
