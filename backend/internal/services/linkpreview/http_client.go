package linkpreview

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	defaultUserAgent = "OmniNudgeLinkPreview/1.0"
	maxHTMLBytes     = 2 << 20
	maxAssetBytes    = 8 << 20
	maxRedirects     = 5
)

func NewHTTPClient() *http.Client {
	// Do not inherit HTTP(S)_PROXY from the process. Link previews fetch URLs
	// derived from user content, and a proxy would receive the original target
	// URL before this transport can pin its DNS resolution.
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DialContext = safeDialContext(net.DefaultResolver, (&net.Dialer{}).DialContext)

	return &http.Client{
		Transport: transport,
		Timeout:   5 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= maxRedirects {
				return errors.New("too many redirects")
			}
			_, err := validateTargetURL(req.URL.String())
			return err
		},
	}
}

// hostResolver is intentionally small so the dial guard can be tested without
// network access. Lookup results are validated and then dialed by IP, rather
// than handing the hostname back to net.Dialer. That pins the validated answer
// for this connection and prevents DNS-rebinding SSRF.
type hostResolver interface {
	LookupIPAddr(context.Context, string) ([]net.IPAddr, error)
}

type dialContextFunc func(context.Context, string, string) (net.Conn, error)

func safeDialContext(resolver hostResolver, dial dialContextFunc) dialContextFunc {
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, fmt.Errorf("invalid target address: %w", err)
		}

		// Literal IP addresses have already been checked by validateTargetURL,
		// but keep the check here as defense in depth.
		if ip := net.ParseIP(host); ip != nil {
			if isBlockedIP(ip) {
				return nil, errors.New("private network urls are not allowed")
			}
			return dial(ctx, network, net.JoinHostPort(ip.String(), port))
		}

		addresses, err := resolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, fmt.Errorf("resolve target host: %w", err)
		}
		if len(addresses) == 0 {
			return nil, errors.New("target host has no IP addresses")
		}

		for _, address := range addresses {
			if isBlockedIP(address.IP) {
				return nil, errors.New("private network urls are not allowed")
			}
		}

		// Dial the validated address directly. Selecting the first answer avoids
		// a second resolver call between validation and connection establishment.
		return dial(ctx, network, net.JoinHostPort(addresses[0].IP.String(), port))
	}
}

func validateTargetURL(rawURL string) (*url.URL, error) {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return nil, errors.New("url is required")
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return nil, fmt.Errorf("parse url: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, errors.New("only http and https urls are allowed")
	}
	if parsed.Hostname() == "" {
		return nil, errors.New("url host is required")
	}

	host := strings.ToLower(parsed.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return nil, errors.New("localhost urls are not allowed")
	}

	if ip := net.ParseIP(host); ip != nil {
		if isBlockedIP(ip) {
			return nil, errors.New("private network urls are not allowed")
		}
	}

	return parsed, nil
}

func isBlockedIP(ip net.IP) bool {
	if ipv4 := ip.To4(); ipv4 != nil {
		// net.IP.IsPrivate deliberately excludes carrier-grade NAT (100.64/10)
		// and several non-global ranges. None of them are safe preview targets.
		return ipv4.IsLoopback() || ipv4.IsPrivate() || ipv4.IsLinkLocalMulticast() ||
			ipv4.IsLinkLocalUnicast() || ipv4.IsUnspecified() || ipv4[0] == 0 ||
			(ipv4[0] == 100 && ipv4[1]&0xc0 == 0x40) ||
			(ipv4[0] == 192 && ipv4[1] == 0 && ipv4[2] == 0)
	}

	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalMulticast() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() || ip.IsMulticast()
}
