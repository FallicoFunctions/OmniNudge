package linkpreview

import (
	"context"
	"errors"
	"net"
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

type staticResolver struct {
	addresses []net.IPAddr
	err       error
}

func (r staticResolver) LookupIPAddr(context.Context, string) ([]net.IPAddr, error) {
	return r.addresses, r.err
}

func TestSafeDialContextRejectsHostnameResolvingToPrivateAddress(t *testing.T) {
	dialed := false
	dial := safeDialContext(staticResolver{addresses: []net.IPAddr{{IP: net.ParseIP("127.0.0.1")}}}, func(context.Context, string, string) (net.Conn, error) {
		dialed = true
		return nil, errors.New("should not dial")
	})

	_, err := dial(context.Background(), "tcp", "rebind.example:443")

	require.Error(t, err)
	require.False(t, dialed)
}

func TestSafeDialContextPinsValidatedPublicAddress(t *testing.T) {
	var dialAddress string
	dial := safeDialContext(staticResolver{addresses: []net.IPAddr{{IP: net.ParseIP("93.184.216.34")}}}, func(_ context.Context, _ string, address string) (net.Conn, error) {
		dialAddress = address
		return nil, errors.New("stop after observing dial address")
	})

	_, err := dial(context.Background(), "tcp", "example.com:443")

	require.Error(t, err)
	require.Equal(t, "93.184.216.34:443", dialAddress)
}

func TestValidateTargetURLRejectsIPv4MappedLoopback(t *testing.T) {
	_, err := validateTargetURL("http://[::ffff:127.0.0.1]/private")

	require.Error(t, err)
}
