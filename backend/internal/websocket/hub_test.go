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
