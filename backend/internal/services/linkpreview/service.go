package linkpreview

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/omninudge/backend/internal/services"
)

type HTTPDoer interface {
	Do(req *http.Request) (*http.Response, error)
}

type Service struct {
	client   HTTPDoer
	ingestor *assetIngestor
}

type PreviewMetadata struct {
	Title        string
	Description  string
	SiteName     string
	ImageURL     string
	ThumbnailURL string
}

func NewService(client *http.Client, storage services.StorageService, virusScanner services.VirusScanner) *Service {
	if client == nil {
		client = NewHTTPClient()
	}

	return &Service{
		client:   client,
		ingestor: newAssetIngestor(client, storage, virusScanner),
	}
}

func (s *Service) Extract(ctx context.Context, rawURL string) (*PreviewMetadata, error) {
	parsedURL, err := validateTargetURL(rawURL)
	if err != nil {
		return nil, err
	}

	body, err := s.fetchHTML(ctx, parsedURL.String())
	if err != nil {
		return nil, err
	}
	defer body.Close()

	meta, err := s.parseHTML(parsedURL.String(), body)
	if err != nil {
		return nil, err
	}

	if meta.ImageURL != "" && s.ingestor != nil {
		thumbnailURL, err := s.ingestor.StoreImage(ctx, meta.ImageURL)
		if err == nil {
			meta.ThumbnailURL = thumbnailURL
		}
	}

	return meta, nil
}

func (s *Service) fetchHTML(ctx context.Context, rawURL string) (io.ReadCloser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", defaultUserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		resp.Body.Close()
		return nil, fmt.Errorf("unexpected html status: %d", resp.StatusCode)
	}

	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	if contentType != "" &&
		!strings.Contains(contentType, "text/html") &&
		!strings.Contains(contentType, "application/xhtml+xml") {
		resp.Body.Close()
		return nil, fmt.Errorf("unsupported content type: %s", contentType)
	}

	return struct {
		io.Reader
		io.Closer
	}{
		Reader: io.LimitReader(resp.Body, maxHTMLBytes),
		Closer: resp.Body,
	}, nil
}

func (s *Service) parseHTML(baseURL string, body io.Reader) (*PreviewMetadata, error) {
	parsed, err := parseHTML(baseURL, body)
	if err != nil {
		return nil, err
	}

	return &PreviewMetadata{
		Title:       parsed.Title,
		Description: parsed.Description,
		SiteName:    parsed.SiteName,
		ImageURL:    parsed.ImageURL,
	}, nil
}
