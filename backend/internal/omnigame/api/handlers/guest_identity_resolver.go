package handlers

import (
	"net"
	"strings"

	"github.com/gin-gonic/gin"
)

type GuestIdentityResolver struct {
	trustedPeers []*net.IPNet
}

func NewGuestIdentityResolver(trustedProxies []string) *GuestIdentityResolver {
	return &GuestIdentityResolver{
		trustedPeers: parseTrustedProxyNets(trustedProxies),
	}
}

func (r *GuestIdentityResolver) Resolve(c *gin.Context) string {
	peerIP := parseRemoteIP(c.Request.RemoteAddr)
	if peerIP == nil {
		return ""
	}

	if r.isTrustedPeer(peerIP) {
		clientIP := strings.TrimSpace(c.ClientIP())
		if clientIP == "" || clientIP == peerIP.String() {
			return ""
		}
		return clientIP
	}
	return ""
}

func (r *GuestIdentityResolver) isTrustedPeer(peerIP net.IP) bool {
	for _, network := range r.trustedPeers {
		if network.Contains(peerIP) {
			return true
		}
	}
	return false
}

func parseTrustedProxyNets(values []string) []*net.IPNet {
	networks := make([]*net.IPNet, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}

		if _, network, err := net.ParseCIDR(value); err == nil {
			networks = append(networks, network)
			continue
		}

		ip := net.ParseIP(value)
		if ip == nil {
			continue
		}

		maskBits := 32
		if ip.To4() == nil {
			maskBits = 128
		}
		networks = append(networks, &net.IPNet{
			IP:   ip,
			Mask: net.CIDRMask(maskBits, maskBits),
		})
	}

	return networks
}

func parseRemoteIP(remoteAddr string) net.IP {
	host := strings.TrimSpace(remoteAddr)
	if host == "" {
		return nil
	}

	if parsedHost, _, err := net.SplitHostPort(host); err == nil {
		host = parsedHost
	}

	return net.ParseIP(host)
}
