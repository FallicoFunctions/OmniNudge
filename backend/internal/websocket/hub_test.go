package websocket

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestHubRegister_LastConnectionWinsPerUser(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	first := &Client{Hub: hub, UserID: 42, Send: make(chan *Message, 1)}
	second := &Client{Hub: hub, UserID: 42, Send: make(chan *Message, 1)}

	hub.Register(first)
	// Drain initial state to avoid buffer interference in assertions.
	select {
	case <-first.Send:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for first client initial state")
	}

	hub.Register(second)

	// Replaced client channel should be closed.
	select {
	case _, ok := <-first.Send:
		require.False(t, ok, "first client send channel should be closed when replaced")
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for first client channel close")
	}

	// New client should receive initial state as active connection.
	select {
	case msg := <-second.Send:
		require.Equal(t, "initial_state", msg.Type)
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for second client initial state")
	}

	require.True(t, hub.IsUserOnline(42))
}

func TestHubBroadcastFeatureFlagUpdate_FansOutToAllConnectedClients(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	clientA := &Client{Hub: hub, UserID: 101, Send: make(chan *Message, 8)}
	clientB := &Client{Hub: hub, UserID: 202, Send: make(chan *Message, 8)}

	hub.Register(clientA)
	waitForMessageType(t, clientA.Send, "initial_state")

	hub.Register(clientB)
	waitForMessageType(t, clientB.Send, "initial_state")

	// Drain any non-target messages (for example, user_online).
	drainMessages(clientA.Send)
	drainMessages(clientB.Send)

	hub.BroadcastFeatureFlagUpdate("new_ui", true, nil)

	msgA := waitForMessageType(t, clientA.Send, "feature_flag_updated")
	msgB := waitForMessageType(t, clientB.Send, "feature_flag_updated")

	payloadA, ok := msgA.Payload.(FeatureFlagUpdatedEvent)
	require.True(t, ok, "client A should receive typed feature flag payload")
	require.Equal(t, "new_ui", payloadA.Key)
	require.True(t, payloadA.Enabled)

	payloadB, ok := msgB.Payload.(FeatureFlagUpdatedEvent)
	require.True(t, ok, "client B should receive typed feature flag payload")
	require.Equal(t, "new_ui", payloadB.Key)
	require.True(t, payloadB.Enabled)
}

func drainMessages(ch <-chan *Message) {
	for {
		select {
		case <-ch:
		default:
			return
		}
	}
}

func waitForMessageType(t *testing.T, ch <-chan *Message, targetType string) *Message {
	t.Helper()

	timeout := time.After(1 * time.Second)
	for {
		select {
		case msg := <-ch:
			require.NotNil(t, msg)
			if msg.Type == targetType {
				return msg
			}
		case <-timeout:
			t.Fatalf("timed out waiting for %s message", targetType)
		}
	}
}
