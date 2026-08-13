package server

import (
	"context"
	"net/http"

	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
)

func New(worldState *world.World, mediaState *world.MediaState, authService *services.AuthService, allowedOrigins []string) http.Handler {
	return newMux(NewWSHandler(worldState, mediaState, authService, allowedOrigins))
}

// NewWithScheduler is New plus the background scheduler goroutine (sec 14.1:
// the event clock is global and 24/7, independent of player activity) that
// keeps idle players' zone-event countdowns live and fires the Main Stage
// 5-minute/1-minute chat announcements.
//
// Kept separate from New: every existing test constructs its server via New,
// and a live 1-second ticker racing a test's own tightly-sequenced
// WriteJSON/ReadJSON exchanges would inject unexpected extra world_snapshot
// messages into the stream. ctx's cancellation stops the goroutine; pass
// context.Background() if the process has no shutdown path to plug into yet.
func NewWithScheduler(ctx context.Context, worldState *world.World, mediaState *world.MediaState, authService *services.AuthService, allowedOrigins []string) http.Handler {
	wsHandler := NewWSHandler(worldState, mediaState, authService, allowedOrigins)
	wsHandler.StartScheduler(ctx)
	return newMux(wsHandler)
}

func newMux(wsHandler *WSHandler) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/ws", wsHandler)
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	return mux
}
