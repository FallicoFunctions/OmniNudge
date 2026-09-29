package server

import (
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func TestSnapshotDeliveryCoalescesBlockedWritesWithoutDelayingAnotherClient(t *testing.T) {
	var slow, healthy snapshotDelivery
	defer slow.close()
	defer healthy.close()
	started, release := make(chan struct{}), make(chan struct{})
	var unblock sync.Once
	defer unblock.Do(func() { close(release) })
	values := make(chan int, 4)
	slow.enqueue(func() { close(started); <-release; values <- 1 })
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("snapshot writer did not start")
	}
	for i := 2; i <= 100; i++ {
		slow.enqueue(func() { values <- i })
	}
	healthySent := make(chan struct{})
	healthy.enqueue(func() { close(healthySent) })
	select {
	case <-healthySent:
	case <-time.After(2 * time.Second):
		t.Fatal("slow connection stalled the healthy connection")
	}
	unblock.Do(func() { close(release) })
	require.Eventually(t, func() bool {
		slow.mu.Lock()
		defer slow.mu.Unlock()
		return !slow.running
	}, 2*time.Second, time.Millisecond)
	require.Len(t, values, 2, "only the in-flight snapshot and latest pending request should send")
	require.Equal(t, 1, <-values)
	require.Equal(t, 100, <-values)
}

func TestSnapshotDeliveryCloseDropsPendingAndFutureRequests(t *testing.T) {
	var delivery snapshotDelivery
	started, release := make(chan struct{}), make(chan struct{})
	var unblock sync.Once
	defer unblock.Do(func() { close(release) })
	var unexpected atomic.Int32
	delivery.enqueue(func() { close(started); <-release })
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("snapshot writer did not start")
	}
	delivery.enqueue(func() { unexpected.Add(1) })
	delivery.close()
	delivery.enqueue(func() { unexpected.Add(1) })
	unblock.Do(func() { close(release) })
	require.Eventually(t, func() bool {
		delivery.mu.Lock()
		defer delivery.mu.Unlock()
		return !delivery.running
	}, 2*time.Second, time.Millisecond)
	require.Zero(t, unexpected.Load())
}

func TestWSHandlerBlockedSnapshotWriterDoesNotDelayHealthyConnection(t *testing.T) {
	auth := services.NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")
	handler := NewWSHandler(world.NewWorld(world.DefaultConfig()), world.NewMediaState(), auth, []string{"https://play.omninudge.com"})
	server := httptest.NewServer(handler)
	defer server.Close()
	dial := func(id string) *websocket.Conn {
		conn, _, err := websocket.DefaultDialer.Dial(buildWorldWSURL(server.URL, newGuestWorldSessionToken(t, auth, id, id, nil), ""), worldDialHeader("https://play.omninudge.com"))
		require.NoError(t, err)
		t.Cleanup(func() { _ = conn.Close() })
		return conn
	}
	slow := dial("slow")
	var snapshot map[string]any
	_ = slow.SetReadDeadline(time.Now().Add(2 * time.Second))
	require.NoError(t, slow.ReadJSON(&snapshot))
	healthy := dial("healthy")
	_ = healthy.SetReadDeadline(time.Now().Add(2 * time.Second))
	require.NoError(t, healthy.ReadJSON(&snapshot))
	require.NoError(t, slow.ReadJSON(&snapshot))
	handler.mu.Lock()
	blocked := handler.conns["slow"]
	handler.mu.Unlock()
	require.NotNil(t, blocked)
	blocked.writeMu.Lock()
	defer blocked.writeMu.Unlock()
	returned := make(chan struct{})
	go func() { handler.broadcastSnapshots(); close(returned) }()
	select {
	case <-returned:
	case <-time.After(2 * time.Second):
		t.Fatal("a blocked socket held the room broadcaster")
	}
	_ = healthy.SetReadDeadline(time.Now().Add(2 * time.Second))
	require.NoError(t, healthy.ReadJSON(&snapshot))
	require.Equal(t, "world_snapshot", snapshot["type"])
	require.Len(t, snapshot["players"], 2)
}
