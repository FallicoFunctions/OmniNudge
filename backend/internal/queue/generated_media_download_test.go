package queue

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/png"
	"net"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

type generatedMediaResolverFake struct{ addresses []net.IPAddr }

func (f generatedMediaResolverFake) LookupIPAddr(context.Context, string) ([]net.IPAddr, error) {
	return f.addresses, nil
}

func TestValidateGeneratedMediaContentsRejectsTruncatedImageWithValidSignature(t *testing.T) {
	file, err := os.CreateTemp("", "omnichat-invalid-image-*")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.Remove(file.Name()) })
	_, err = file.Write([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	require.NoError(t, err)

	require.Error(t, validateGeneratedMediaContents(file, "image", "image/png", 8))
}

func TestValidateGeneratedMediaContentsAcceptsDecodableImage(t *testing.T) {
	var encoded bytes.Buffer
	require.NoError(t, png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 2, 3))))
	file, err := os.CreateTemp("", "omnichat-valid-image-*")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.Remove(file.Name()) })
	_, err = file.Write(encoded.Bytes())
	require.NoError(t, err)

	require.NoError(t, validateGeneratedMediaContents(file, "image", "image/png", int64(encoded.Len())))
}

func TestValidateGeneratedMediaContentsChecksMP4BoxStructure(t *testing.T) {
	valid := []byte{
		0, 0, 0, 16, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 0, 0,
		0, 0, 0, 8, 'm', 'o', 'o', 'v',
		0, 0, 0, 8, 'm', 'd', 'a', 't',
	}
	file, err := os.CreateTemp("", "omnichat-valid-video-*")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.Remove(file.Name()) })
	_, err = file.Write(valid)
	require.NoError(t, err)
	require.NoError(t, validateGeneratedMediaContents(file, "video", "video/mp4", int64(len(valid))))

	broken, err := os.CreateTemp("", "omnichat-invalid-video-*")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.Remove(broken.Name()) })
	_, err = broken.Write([]byte{0, 0, 0, 16, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'})
	require.NoError(t, err)
	require.Error(t, validateGeneratedMediaContents(broken, "video", "video/mp4", 12))
}

type generatedMediaDialerFake struct{ calls int }

func (f *generatedMediaDialerFake) DialContext(context.Context, string, string) (net.Conn, error) {
	f.calls++
	return nil, errors.New("test dial stopped")
}

func TestValidateGeneratedMediaURLAllowsKnownFalHosts(t *testing.T) {
	for _, rawURL := range []string{
		"https://fal.media/files/a/output.mp4",
		"https://v3.fal.media/files/a/output.png",
		"https://storage.googleapis.com/falserverless/output.png",
	} {
		t.Run(rawURL, func(t *testing.T) {
			require.NoError(t, validateGeneratedMediaURL(rawURL))
		})
	}
}

func TestValidateGeneratedMediaURLRejectsSSRFAndUntrustedHosts(t *testing.T) {
	for _, rawURL := range []string{
		"http://v3.fal.media/files/output.png",
		"https://127.0.0.1/output.png",
		"https://169.254.169.254/latest/meta-data",
		"https://fal.media.evil.example/output.png",
		"https://user:pass@fal.media/output.png",
		"data:text/html,<script>alert(1)</script>",
	} {
		t.Run(rawURL, func(t *testing.T) {
			require.Error(t, validateGeneratedMediaURL(rawURL))
		})
	}
}

func TestGeneratedMediaDialRejectsPrivateDNSAnswersBeforeConnecting(t *testing.T) {
	dialer := &generatedMediaDialerFake{}
	dial := generatedMediaDialContext(
		generatedMediaResolverFake{addresses: []net.IPAddr{{IP: net.ParseIP("169.254.169.254")}}},
		dialer,
	)
	_, err := dial(context.Background(), "tcp", "v3.fal.media:443")
	require.Error(t, err)
	require.Zero(t, dialer.calls, "private DNS answers must never reach the network dialer")
}

func TestDetectGeneratedMediaTypeChecksMagicBytes(t *testing.T) {
	contentType, extension, err := detectGeneratedMediaType([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, "image")
	require.NoError(t, err)
	require.Equal(t, "image/png", contentType)
	require.Equal(t, ".png", extension)

	_, _, err = detectGeneratedMediaType([]byte("<html>not media</html>"), "image")
	require.Error(t, err)
}
