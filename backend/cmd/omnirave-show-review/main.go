// Local in-memory show review. The same world scheduler and commands run in production.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"flag"
	"fmt"
	"html/template"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	omnigamemodel "github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omniraveworld/server"
	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
)

var page = template.Must(template.New("review").Parse(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Soundbooth playtest</title><style>body{background:#0a131e;color:#e8edef;font:17px/1.6 system-ui;max-width:850px;margin:4rem auto;padding:0 2rem}h1{font-weight:550}a{color:#c0e8f1}section{border-top:1px solid #344959;padding:18px 0}small{color:#95a7b7}</style><h1>Soundbooth playtest</h1><p>{{.Timing}}</p><p>Open a separate player view for each operator. Join Fireworks with Player 1, Drones with Player 2, and Fireworks with Player 3 to test the handoff. Joining is manual; closing a player view removes that player from the queue.</p>{{range .Links}}<section><strong>{{.Name}}</strong><br><a href="{{.Review}}" target="_blank" rel="noopener">Open booth review</a> · <a href="{{.Venue}}" target="_blank" rel="noopener">Open full venue (WebGPU)</a> · <a href="{{.WebGL}}" target="_blank" rel="noopener">Open full venue (WebGL)</a></section>{{end}}<p><small>Each link represents one player. Opening the same player twice reconnects that player. Links expire in five minutes; reload this page for fresh links. After all player views close, opening a new view restarts the local show clock. Production remains hourly. This fixture has no database or music playlist.</small></p></html>`))

type link struct{ Name, Review, Venue, WebGL string }

func main() {
	port := flag.Int("port", 4176, "loopback review server port")
	runtimeURL := flag.String("runtime", "http://127.0.0.1:4175", "loopback Babylon origin")
	fast := flag.Bool("fast", false, "20-second turns and 3-second preparation, only for handoff tests")
	flag.Parse()
	origin, err := url.Parse(*runtimeURL)
	if err != nil || origin.Scheme != "http" || (origin.Hostname() != "localhost" && origin.Hostname() != "127.0.0.1") || origin.User != nil {
		log.Fatal("runtime must be a loopback HTTP origin")
	}
	origin.Path = ""
	origin.RawQuery = ""
	origin.Fragment = ""
	listener, err := net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		log.Fatal(err)
	}
	secret := make([]byte, 32)
	if _, err = rand.Read(secret); err != nil {
		log.Fatal(err)
	}
	auth := services.NewAuthService(hex.EncodeToString(secret), "OmniRaveWorld/1.0", "")
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	state := world.NewWorld(world.DefaultConfig())
	turn, prep, lead := 150*time.Second, 10*time.Second, 45*time.Second
	timing := "Standard timing: 5-minute fireworks, 2½-minute turns, 10-second preparation. The first local event begins 45 seconds after the first player connects. Local events repeat after a 30-second intermission."
	if *fast {
		turn = 20 * time.Second
		prep = 3 * time.Second
		lead = 15 * time.Second
		timing = "FAST TEST: 20-second turns, 3-second preparation, 40-second fireworks. The first event begins 15 seconds after the first player connects. This timing is only for testing."
	}
	handler := server.NewWithScheduler(ctx, state, world.NewMediaStateWithPlaylists(nil, time.Now()), auth, []string{origin.String()})
	wsURL := "ws://" + listener.Addr().String() + "/ws"
	mux := http.NewServeMux()
	mux.HandleFunc("/review", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		links := []link{}
		for i := 1; i <= 3; i++ {
			token, err := auth.GenerateOmniRaveWorldJWT(services.OmniRaveWorldTokenInput{PlayerID: fmt.Sprintf("show-review-%d", i), PlayerName: fmt.Sprintf("Player %d", i), Mode: "guest",
				Loadout: map[string]string{"av": "1", "bb": "m", "cv": "1", "cp": "male", "cw": "110111"}, ReturnPoint: &omnigamemodel.SavedPoint{X: float64(i-2) * 2, Y: 1.65, Z: -73}})
			if err != nil {
				http.Error(w, "Could not create review links", 500)
				return
			}
			query := url.Values{"world": {wsURL}, "wtoken": {token}, "perf": {"webgpu"}}
			review := origin.String() + "/show-control-review.html?" + query.Encode()
			venue := origin.String() + "/?" + query.Encode()
			query.Set("perf", "webgl")
			links = append(links, link{fmt.Sprintf("Player %d", i), review, venue, origin.String() + "/?" + query.Encode()})
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		_ = page.Execute(w, struct {
			Timing string
			Links  []link
		}{timing, links})
	})
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		state.ConfigureShowReview(time.Now().Add(lead), turn, prep)
		handler.ServeHTTP(w, r)
	})
	mux.Handle("/", handler)
	httpServer := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutdown)
	}()
	log.Printf("Soundbooth review: http://%s/review", listener.Addr())
	if err = httpServer.Serve(listener); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
