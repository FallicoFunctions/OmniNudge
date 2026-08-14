package queue

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	_ "golang.org/x/image/webp"
)

type generatedMediaDownload struct {
	Path        string
	Size        int64
	ContentType string
	Extension   string
}

const maxGeneratedMediaBoxes = 100_000

type generatedMediaResolver interface {
	LookupIPAddr(ctx context.Context, host string) ([]net.IPAddr, error)
}

type generatedMediaDialer interface {
	DialContext(ctx context.Context, network, address string) (net.Conn, error)
}

func generatedMediaDialContext(resolver generatedMediaResolver, dialer generatedMediaDialer) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil || host == "" || port == "" {
			return nil, errors.New("generated media dial address is invalid")
		}
		addresses, err := resolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, fmt.Errorf("resolve generated media host: %w", err)
		}
		if len(addresses) == 0 {
			return nil, errors.New("generated media host has no addresses")
		}
		for _, address := range addresses {
			ip := address.IP
			if ip == nil || !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() ||
				ip.IsUnspecified() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
				ip.IsInterfaceLocalMulticast() || ip.IsMulticast() {
				return nil, errors.New("generated media host resolved to a forbidden network")
			}
		}
		var lastErr error
		for _, address := range addresses {
			ipHost := address.IP.String()
			if address.Zone != "" {
				ipHost += "%" + address.Zone
			}
			connection, dialErr := dialer.DialContext(ctx, network, net.JoinHostPort(ipHost, port))
			if dialErr == nil {
				return connection, nil
			}
			lastErr = dialErr
		}
		return nil, fmt.Errorf("connect to generated media host: %w", lastErr)
	}
}

func validateGeneratedMediaURL(rawURL string, additionalHosts ...string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" {
		return errors.New("generated media URL is invalid")
	}
	if parsed.User != nil || parsed.Fragment != "" {
		return errors.New("generated media URL contains forbidden components")
	}
	if port := parsed.Port(); port != "" && port != "443" {
		return errors.New("generated media URL uses an untrusted port")
	}
	host := strings.ToLower(strings.TrimSuffix(parsed.Hostname(), "."))
	if ip := net.ParseIP(host); ip != nil && (!ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() || ip.IsMulticast()) {
		return errors.New("generated media host is not trusted")
	}
	if !generatedMediaHostTrusted(host, additionalHosts...) {
		return errors.New("generated media host is not trusted")
	}
	return nil
}

func generatedMediaHostTrusted(host string, additionalHosts ...string) bool {
	allowed := []string{"storage.googleapis.com"}
	allowed = append(allowed, additionalHosts...)
	for _, candidate := range allowed {
		candidate = strings.ToLower(strings.TrimSpace(strings.TrimSuffix(candidate, ".")))
		candidate = strings.TrimPrefix(candidate, ".")
		if candidate == "" || strings.ContainsAny(candidate, "/:@?&#") {
			continue
		}
		// Output hosts are deployment-owned origins, not DNS suffixes. Accepting
		// arbitrary subdomains would let a future provider configuration
		// accidentally trust an unrelated tenant-controlled host beneath the
		// configured domain. Wildcard behavior must be expressed explicitly by
		// configuring each concrete output hostname.
		if host == candidate {
			return true
		}
	}
	return false
}

func downloadGeneratedMedia(ctx context.Context, rawURL string, kind modelsMediaKind, maxBytes int64, additionalHosts ...string) (*generatedMediaDownload, func(), error) {
	if err := validateGeneratedMediaURL(rawURL, additionalHosts...); err != nil {
		return nil, nil, err
	}
	// The bounded copy below reads maxBytes+1 so it can distinguish an exact
	// limit from an oversized response. Reject the only value that would make
	// that addition overflow and turn the limit negative.
	if maxBytes <= 0 || maxBytes >= int64(1<<63-1) {
		return nil, nil, errors.New("generated media size limit is invalid")
	}
	baseTransport, ok := http.DefaultTransport.(*http.Transport)
	if !ok {
		baseTransport = &http.Transport{}
	}
	transport := baseTransport.Clone()
	// Resolve once inside DialContext, validate every answer, and dial the
	// validated IP directly. This closes DNS-rebinding and environment-proxy
	// paths that a hostname-only allowlist would leave open.
	transport.Proxy = nil
	transport.DialContext = generatedMediaDialContext(net.DefaultResolver, &net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second})
	client := &http.Client{
		Transport: transport,
		Timeout:   5 * time.Minute,
		CheckRedirect: func(request *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("too many generated media redirects")
			}
			return validateGeneratedMediaURL(request.URL.String(), additionalHosts...)
		},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, nil, fmt.Errorf("create generated media download: %w", err)
	}
	request.Header.Set("Accept", "image/png,image/jpeg,image/webp,video/mp4")
	response, err := client.Do(request)
	if err != nil {
		return nil, nil, fmt.Errorf("download generated media: %w", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4<<10))
		return nil, nil, fmt.Errorf("generated media host returned HTTP %d", response.StatusCode)
	}
	if response.ContentLength > maxBytes {
		return nil, nil, errors.New("generated media exceeds size limit")
	}

	tempFile, err := os.CreateTemp("", "omnichat-generated-*")
	if err != nil {
		return nil, nil, fmt.Errorf("create generated media temp file: %w", err)
	}
	cleanup := func() {
		_ = tempFile.Close()
		_ = os.Remove(tempFile.Name())
	}
	written, err := io.Copy(tempFile, io.LimitReader(response.Body, maxBytes+1))
	if err != nil {
		cleanup()
		return nil, nil, fmt.Errorf("write generated media temp file: %w", err)
	}
	if written > maxBytes {
		cleanup()
		return nil, nil, errors.New("generated media exceeds size limit")
	}
	if err := tempFile.Sync(); err != nil {
		cleanup()
		return nil, nil, fmt.Errorf("sync generated media temp file: %w", err)
	}

	header := make([]byte, 512)
	n, err := tempFile.ReadAt(header, 0)
	if err != nil && !errors.Is(err, io.EOF) {
		cleanup()
		return nil, nil, fmt.Errorf("inspect generated media: %w", err)
	}
	contentType, extension, err := detectGeneratedMediaType(header[:n], string(kind))
	if err != nil {
		cleanup()
		return nil, nil, err
	}
	if err := validateGeneratedMediaContents(tempFile, string(kind), contentType, written); err != nil {
		cleanup()
		return nil, nil, err
	}
	if err := tempFile.Close(); err != nil {
		cleanup()
		return nil, nil, fmt.Errorf("close generated media temp file: %w", err)
	}
	return &generatedMediaDownload{
		Path: tempFile.Name(), Size: written, ContentType: contentType, Extension: extension,
	}, cleanup, nil
}

func validateGeneratedMediaContents(file *os.File, expectedKind, contentType string, size int64) error {
	if file == nil || size <= 0 {
		return errors.New("generated media content is empty")
	}
	if expectedKind == "image" {
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			return fmt.Errorf("seek generated image: %w", err)
		}
		config, format, err := image.DecodeConfig(file)
		if err != nil {
			return errors.New("generated image could not be decoded")
		}
		expectedFormat := strings.TrimPrefix(contentType, "image/")
		if expectedFormat == "jpeg" && format == "jpg" {
			format = "jpeg"
		}
		if format != expectedFormat || config.Width <= 0 || config.Height <= 0 ||
			config.Width > 16_384 || config.Height > 16_384 || int64(config.Width)*int64(config.Height) > 100_000_000 {
			return errors.New("generated image metadata is invalid")
		}
		return nil
	}
	if expectedKind != "video" || contentType != "video/mp4" {
		return errors.New("generated media content type is invalid")
	}

	var offset int64
	boxCount := 0
	var sawFTYP, sawMovieMetadata, sawMediaData bool
	for offset < size {
		boxCount++
		if boxCount > maxGeneratedMediaBoxes {
			return errors.New("generated video container has too many boxes")
		}
		if size-offset < 8 {
			return errors.New("generated video container is truncated")
		}
		header := make([]byte, 16)
		if _, err := file.ReadAt(header[:8], offset); err != nil {
			return errors.New("generated video container is unreadable")
		}
		boxSize := int64(binary.BigEndian.Uint32(header[:4]))
		headerSize := int64(8)
		switch boxSize {
		case 1:
			if size-offset < 16 {
				return errors.New("generated video container is truncated")
			}
			if _, err := file.ReadAt(header[8:16], offset+8); err != nil {
				return errors.New("generated video container is unreadable")
			}
			extendedSize := binary.BigEndian.Uint64(header[8:16])
			// ISO BMFF extended sizes are unsigned. Reject values outside the
			// signed file-offset domain before converting so a hostile container
			// can never wrap to a negative box size.
			if extendedSize > uint64(1<<63-1) {
				return errors.New("generated video container has an invalid box size")
			}
			boxSize = int64(extendedSize)
			headerSize = 16
		case 0:
			boxSize = size - offset
		}
		if boxSize < headerSize || boxSize > size-offset {
			return errors.New("generated video container has an invalid box size")
		}
		boxType := string(header[4:8])
		if offset == 0 {
			if boxType != "ftyp" || boxSize < 16 {
				return errors.New("generated video container is missing a valid file type box")
			}
			sawFTYP = true
		}
		switch boxType {
		case "moov", "moof":
			sawMovieMetadata = true
		case "mdat":
			sawMediaData = true
		}
		offset += boxSize
	}
	if !sawFTYP || !sawMovieMetadata || !sawMediaData {
		return errors.New("generated video container is incomplete")
	}
	return nil
}

// modelsMediaKind is a small local alias that keeps the downloader independent
// of database models while accepting the same string values.
type modelsMediaKind string

func detectGeneratedMediaType(header []byte, expectedKind string) (string, string, error) {
	if expectedKind == "image" {
		switch {
		case len(header) >= 8 && bytes.Equal(header[:8], []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}):
			return "image/png", ".png", nil
		case len(header) >= 3 && header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff:
			return "image/jpeg", ".jpg", nil
		case len(header) >= 12 && bytes.Equal(header[:4], []byte("RIFF")) && bytes.Equal(header[8:12], []byte("WEBP")):
			return "image/webp", ".webp", nil
		default:
			return "", "", errors.New("generated image content is invalid")
		}
	}
	if expectedKind == "video" {
		if len(header) >= 12 && bytes.Equal(header[4:8], []byte("ftyp")) {
			return "video/mp4", ".mp4", nil
		}
		return "", "", errors.New("generated video content is invalid")
	}
	return "", "", errors.New("generated media kind is invalid")
}
