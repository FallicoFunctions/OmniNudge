package linkpreview

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestExtractPreview_PrefersOpenGraphImage(t *testing.T) {
	html := `<html><head><meta property="og:image" content="https://cdn.example.com/og.jpg"><meta property="og:title" content="OG Title"></head><body><img src="https://cdn.example.com/body.jpg"></body></html>`
	service := NewService(nil, nil, nil)

	meta, err := service.parseHTML("https://example.com/post", strings.NewReader(html))

	require.NoError(t, err)
	require.Equal(t, "https://cdn.example.com/og.jpg", meta.ImageURL)
	require.Equal(t, "OG Title", meta.Title)
}

func TestExtractPreview_ReturnsEmptyWhenNoUsableImageExists(t *testing.T) {
	html := `<html><body><img src="/pixel.gif" width="1" height="1"></body></html>`
	service := NewService(nil, nil, nil)

	meta, err := service.parseHTML("https://example.com/post", strings.NewReader(html))

	require.NoError(t, err)
	require.Empty(t, meta.ImageURL)
}

func TestExtractPreview_RejectsLocalhostURLs(t *testing.T) {
	service := NewService(nil, nil, nil)

	_, err := service.Extract(context.Background(), "http://127.0.0.1/private")

	require.Error(t, err)
}
