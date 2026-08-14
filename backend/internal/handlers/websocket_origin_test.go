package handlers

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWebSocketOriginAllowsCurrentDevelopmentFrontendPorts(t *testing.T) {
	t.Parallel()

	for _, origin := range []string{
		"http://localhost:5176",
		"http://localhost:5177",
		"http://127.0.0.1:5177",
	} {
		origin := origin
		t.Run(origin, func(t *testing.T) {
			t.Parallel()

			req := &http.Request{Header: http.Header{"Origin": []string{origin}}}
			require.True(t, upgrader.CheckOrigin(req))
		})
	}
}

func TestWebSocketOriginAllowsOnlyHTTPSProductionOrigins(t *testing.T) {
	for _, origin := range []string{
		"https://omninudge.com",
		"https://www.omninudge.com",
		"https://api.omninudge.com:443",
	} {
		req := &http.Request{Header: http.Header{"Origin": []string{origin}}}
		require.True(t, upgrader.CheckOrigin(req), origin)
	}
	for _, origin := range []string{
		"http://omninudge.com",
		"ftp://omninudge.com",
		"https://omninudge.com:444",
	} {
		req := &http.Request{Header: http.Header{"Origin": []string{origin}}}
		require.False(t, upgrader.CheckOrigin(req), origin)
	}
}

func TestWebSocketOriginRejectsMissingOriginOutsideLocalDevelopment(t *testing.T) {
	require.True(t, upgrader.CheckOrigin(&http.Request{Host: "localhost:8080", Header: http.Header{}}))
	require.False(t, upgrader.CheckOrigin(&http.Request{Host: "api.omninudge.com", Header: http.Header{}}))
	require.False(t, upgrader.CheckOrigin(&http.Request{Host: "attacker.example", Header: http.Header{}}))
}

func TestWebSocketOriginRejectsUnapprovedOrigins(t *testing.T) {
	t.Parallel()

	for _, origin := range []string{
		"https://attacker.example",
		"http://localhost:7777",
		"http://127.0.0.1:7777",
		"https://localhost:5177",
		"http://omninudge.com",
	} {
		origin := origin
		t.Run(origin, func(t *testing.T) {
			t.Parallel()

			req := &http.Request{Header: http.Header{"Origin": []string{origin}}}
			require.False(t, upgrader.CheckOrigin(req))
		})
	}
}
