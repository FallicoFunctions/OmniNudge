package queue

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/png"
	"net"
	"os"
	"path/filepath"
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

func TestValidateGeneratedMediaContentsRejectsExtendedMP4BoxSizeOutsideInt64(t *testing.T) {
	content := []byte{
		0, 0, 0, 1, 'f', 't', 'y', 'p',
		0x80, 0, 0, 0, 0, 0, 0, 0,
	}
	file, err := os.CreateTemp("", "omnichat-overflow-video-*")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.Remove(file.Name()) })
	_, err = file.Write(content)
	require.NoError(t, err)

	require.EqualError(t, validateGeneratedMediaContents(file, "video", "video/mp4", int64(len(content))), "generated video container has an invalid box size")
}

type generatedMediaDialerFake struct{ calls int }

func (f *generatedMediaDialerFake) DialContext(context.Context, string, string) (net.Conn, error) {
	f.calls++
	return nil, errors.New("test dial stopped")
}

func TestValidateGeneratedMediaURLAllowsConfiguredRunPodOutputHosts(t *testing.T) {
	for _, test := range []struct {
		rawURL string
		hosts  []string
	}{
		{rawURL: "https://storage.googleapis.com/media/output.png"},
		{rawURL: "https://media.example.test/output.png", hosts: []string{"media.example.test"}},
	} {
		rawURL, hosts := test.rawURL, test.hosts
		t.Run(rawURL, func(t *testing.T) {
			require.NoError(t, validateGeneratedMediaURL(rawURL, hosts...))
		})
	}
}

func TestValidateGeneratedMediaURLRejectsSSRFAndUntrustedHosts(t *testing.T) {
	for _, rawURL := range []string{
		"http://media.example.test/files/output.png",
		"https://127.0.0.1/output.png",
		"https://169.254.169.254/latest/meta-data",
		"https://media.example.test.evil.example/output.png",
		"https://user:pass@storage.googleapis.com/output.png",
		"https://storage.googleapis.com:8443/output.png",
		"https://media.example.test:8443/output.png",
		"https://[ff02::1]/output.png",
		"data:text/html,<script>alert(1)</script>",
	} {
		t.Run(rawURL, func(t *testing.T) {
			require.Error(t, validateGeneratedMediaURL(rawURL))
		})
	}
}

func TestValidateGeneratedMediaURLRequiresExactConfiguredOutputHost(t *testing.T) {
	require.Error(t, validateGeneratedMediaURL("https://tenant.media.example.test/output.png", "media.example.test"))
}

func TestValidateGeneratedMediaURLRejectsPrivateIPEvenWhenConfigured(t *testing.T) {
	require.Error(t, validateGeneratedMediaURL("https://127.0.0.1/output.png", "127.0.0.1"))
}

func TestDownloadGeneratedMediaRejectsOverflowingSizeLimit(t *testing.T) {
	_, _, err := downloadGeneratedMedia(
		context.Background(), "https://storage.googleapis.com/output.png", "image", int64(1<<63-1), nil,
	)
	require.EqualError(t, err, "generated media size limit is invalid")
}

func TestValidateGeneratedMediaContentsRejectsExcessiveMP4BoxCount(t *testing.T) {
	// A syntactically plausible stream of tiny boxes can otherwise turn a
	// bounded but attacker-controlled download into millions of filesystem
	// reads during validation.
	content := make([]byte, 0, (maxGeneratedMediaBoxes+1)*8+16)
	content = append(content, 0, 0, 0, 16, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 0, 0)
	for i := 0; i < maxGeneratedMediaBoxes; i++ {
		content = append(content, 0, 0, 0, 8, 'f', 'r', 'e', 'e')
	}
	file, err := os.CreateTemp("", "omnichat-many-video-boxes-*")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.Remove(file.Name()) })
	_, err = file.Write(content)
	require.NoError(t, err)

	require.EqualError(t, validateGeneratedMediaContents(file, "video", "video/mp4", int64(len(content))), "generated video container has too many boxes")
}

func TestGeneratedMediaDialRejectsPrivateDNSAnswersBeforeConnecting(t *testing.T) {
	dialer := &generatedMediaDialerFake{}
	dial := generatedMediaDialContext(
		generatedMediaResolverFake{addresses: []net.IPAddr{{IP: net.ParseIP("169.254.169.254")}}},
		dialer,
	)
	_, err := dial(context.Background(), "tcp", "media.example.test:443")
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

// A downloaded file has to say what it holds.
//
// The name cannot carry the extension up front, because the type is decided by
// sniffing the bytes after they are written -- so every real download landed on
// a path with no extension. ffmpeg chooses its output container from a file
// name, and the thumbnail service refuses a source whose type it cannot read
// from one. The playback rendition failed on every real render for exactly
// this, while passing every test, because the fixtures were all called
// something.mp4 and the real file was not called anything.
func TestDownloadedMediaIsNamedForWhatItHolds(t *testing.T) {
	dir := t.TempDir()
	file, err := os.CreateTemp(dir, "omnichat-generated-*")
	require.NoError(t, err)
	require.NoError(t, file.Close())
	require.Empty(t, filepath.Ext(file.Name()), "this test is only meaningful without an extension")

	named := nameDownloadedMedia(file.Name(), ".mp4")

	require.Equal(t, ".mp4", filepath.Ext(named))
	_, err = os.Stat(named)
	require.NoError(t, err, "the file did not move with its name")
	_, err = os.Stat(file.Name())
	require.True(t, os.IsNotExist(err), "the old path survived, so cleanup would miss the new one")
}

func TestNamingADownloadIsSafeWhenItCannotHelp(t *testing.T) {
	dir := t.TempDir()
	already := filepath.Join(dir, "render.mp4")
	require.NoError(t, os.WriteFile(already, []byte("x"), 0o600))

	require.Equal(t, already, nameDownloadedMedia(already, ".mp4"), "a correct name must not be doubled")
	require.Equal(t, already, nameDownloadedMedia(already, ""), "no extension means nothing to add")

	missing := filepath.Join(dir, "gone")
	require.Equal(t, missing, nameDownloadedMedia(missing, ".mp4"),
		"a rename that cannot happen must not lose the path")
}
