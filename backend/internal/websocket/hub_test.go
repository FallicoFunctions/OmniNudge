package websocket

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestHubRegister_KeepsEveryConnectionForTheSameUser(t *testing.T) {
	hub := NewHub()
	go hub.Run()
	t.Cleanup(hub.Shutdown)

	first := &Client{Hub: hub, UserID: 42, Send: make(chan *Message, 8)}
	second := &Client{Hub: hub, UserID: 42, Send: make(chan *Message, 8)}

	hub.Register(first)
	waitForMessageType(t, first.Send, "initial_state")

	hub.Register(second)
	waitForMessageType(t, second.Send, "initial_state")

	drainMessages(first.Send)
	drainMessages(second.Send)
	hub.Broadcast(&Message{RecipientID: 42, Type: "same_user_event"})

	waitForMessageType(t, first.Send, "same_user_event")
	waitForMessageType(t, second.Send, "same_user_event")

	require.True(t, hub.IsUserOnline(42))
}

func TestHubUnregister_OneConnectionLeavesTheUserOnline(t *testing.T) {
	hub := NewHub()
	go hub.Run()
	t.Cleanup(hub.Shutdown)

	first := &Client{Hub: hub, UserID: 42, Send: make(chan *Message, 8)}
	second := &Client{Hub: hub, UserID: 42, Send: make(chan *Message, 8)}
	observer := &Client{Hub: hub, UserID: 99, Send: make(chan *Message, 8)}
	hub.Register(first)
	waitForMessageType(t, first.Send, "initial_state")
	hub.Register(second)
	waitForMessageType(t, second.Send, "initial_state")
	hub.Register(observer)
	waitForMessageType(t, observer.Send, "initial_state")
	drainMessages(first.Send)
	drainMessages(second.Send)
	drainMessages(observer.Send)

	hub.Unregister(first)
	waitForClosedChannel(t, first.Send)
	require.True(t, hub.IsUserOnline(42))
	assertNoMessageType(t, observer.Send, "user_offline")

	hub.Broadcast(&Message{RecipientID: 42, Type: "remaining_connection_event"})
	waitForMessageType(t, second.Send, "remaining_connection_event")

	hub.Unregister(second)
	waitForClosedChannel(t, second.Send)
	waitForMessageType(t, observer.Send, "user_offline")
	require.False(t, hub.IsUserOnline(42))
}

func TestHubBroadcastFeatureFlagUpdate_FansOutToAllConnectedClients(t *testing.T) {
	hub := NewHub()
	go hub.Run()
	t.Cleanup(hub.Shutdown)

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

func waitForClosedChannel(t *testing.T, ch <-chan *Message) {
	t.Helper()

	select {
	case _, ok := <-ch:
		require.False(t, ok)
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for channel to close")
	}
}

func assertNoMessageType(t *testing.T, ch <-chan *Message, unexpectedType string) {
	t.Helper()

	select {
	case msg := <-ch:
		require.NotEqual(t, unexpectedType, msg.Type)
	case <-time.After(25 * time.Millisecond):
	}
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
