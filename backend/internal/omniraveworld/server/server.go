package server

import (
	"net/http"

	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
)

func New(worldState *world.World, mediaState *world.MediaState, authService *services.AuthService, allowedOrigins []string) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/ws", NewWSHandler(worldState, mediaState, authService, allowedOrigins))
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	return mux
}
