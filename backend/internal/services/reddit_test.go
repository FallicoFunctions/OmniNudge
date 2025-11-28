package services

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// mapCache is a simple in-memory cache for testing
type mapCache struct {
	store map[string]string
}

func (m *mapCache) Get(ctx context.Context, key string) (string, bool, error) {
	v, ok := m.store[key]
	return v, ok, nil
}

func (m *mapCache) Set(ctx context.Context, key string, value string, ttl time.Duration) error {
	m.store[key] = value
	return nil
}

// hostRewriteTransport rewrites outgoing requests to a test server host
type hostRewriteTransport struct {
	target *httptest.Server
}

func (t *hostRewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req.URL.Scheme = "http"
	req.URL.Host = t.target.Listener.Addr().String()
	return http.DefaultTransport.RoundTrip(req)
}

func TestRedditClientCachesFrontPage(t *testing.T) {
	// Mock Reddit response
	handlerCalls := int32(0)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&handlerCalls, 1)
		w.Header().Set("Content-Type", "application/json")
		resp := RedditListing{
			Kind: "Listing",
		}
		// Minimal children to keep payload small
		resp.Data.Children = []struct {
			Kind string     `json:"kind"`
			Data RedditPost `json:"data"`
		}{
			{Kind: "t3", Data: RedditPost{ID: "abc", Title: "hello", Subreddit: "test"}},
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer ts.Close()

	cache := &mapCache{store: make(map[string]string)}
	client := NewRedditClient("test-agent", cache, time.Minute)
	client.httpClient.Transport = &hostRewriteTransport{target: ts}

	ctx := context.Background()

	// First call should hit the server
	listing, err := client.GetFrontPage(ctx, "hot", "", 10, "")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(listing.Data.Children) != 1 {
		t.Fatalf("expected 1 child, got %d", len(listing.Data.Children))
	}
	if atomic.LoadInt32(&handlerCalls) != 1 {
		t.Fatalf("expected server to be called once, got %d", handlerCalls)
	}

	// Second call should be served from cache (no additional server hit)
	listing2, err := client.GetFrontPage(ctx, "hot", "", 10, "")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if listing2.Data.Children[0].Data.ID != "abc" {
		t.Fatalf("unexpected cached data")
	}
	if atomic.LoadInt32(&handlerCalls) != 1 {
		t.Fatalf("expected server still called once, got %d", handlerCalls)
	}
}
