// Local, in-memory multiplayer fixture for the existing complete-avatar review.
// Run alongside the Babylon dev server; this command never connects to a database.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"log"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	omnigameapi "github.com/omninudge/backend/internal/omnigame/api"
	omnigamemodel "github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omnigame/repository"
	"github.com/omninudge/backend/internal/omnigame/service"
	"github.com/omninudge/backend/internal/omniraveworld/server"
	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
)

type reviewLink struct{ Label, URL string }

var reviewPage = template.Must(template.New("review").Parse(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Local avatar multiplayer review</title>
<style>body{font:18px system-ui;max-width:44rem;margin:4rem auto;padding:0 1.5rem;line-height:1.5}li{margin:1rem 0}</style>
<h1>Local avatar multiplayer review</h1>
<p>Open one view per character to test wardrobe changes between clients. Each view joins the same in-memory room.</p>
<ul>{{range .}}<li><a href="{{.URL}}" target="_blank" rel="noopener noreferrer">{{.Label}}</a></li>{{end}}</ul>
<p>Links expire after five minutes. Reload this page for fresh links. The scene has an empty playlist.</p>
<p>Account links use two local test profiles. Point VITE_OMNIGAME_API_URL at this server's /api/v1 address to test saving and a fresh account launch. Profiles reset when this command stops.</p>
</html>`))

func main() {
	runtimeURL := flag.String("runtime", "http://127.0.0.1:4175", "loopback Babylon dev-server origin")
	port := flag.Int("port", 0, "loopback review-server port; 0 selects an available port")
	peers := flag.Int("peers", 8, "number of synthetic peers, from 0 to 32")
	moving := flag.Bool("moving-peers", false, "mix idle, walking and running peer lanes")
	show := flag.Bool("performance-show", false, "run the automatic fireworks show for an hour in this local performance fixture")
	lifetime := flag.Duration("peers-lifetime", 0, "disconnect synthetic peers after this duration; 0 keeps them connected")
	observe := flag.Bool("observe", false, "print first-peer snapshot counts and browser-player positions once per second")
	flag.Parse()
	origin, err := localRuntimeOrigin(*runtimeURL)
	if err != nil {
		log.Fatal(err)
	}
	if *port < 0 || *port > 65535 || *peers < 0 || *peers > 32 || *lifetime < 0 {
		log.Fatal("port must be 0–65535, peers 0–32, and peers-lifetime nonnegative")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	listener, err := net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		log.Fatal(err)
	}
	defer func() { _ = listener.Close() }()
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		log.Fatal(err)
	}
	auth := services.NewAuthService(hex.EncodeToString(secret), "OmniRaveWorld/1.0", "")
	state := world.NewWorld(world.DefaultConfig())
	if *show {
		state.ConfigureShowReview(time.Now(), 30*time.Minute, 10*time.Second)
	}
	worldHandler := server.NewWithScheduler(ctx, state, world.NewMediaStateWithPlaylists(nil, time.Now()), auth, []string{origin})
	wsURL := "ws://" + listener.Addr().String() + "/ws"
	accounts, err := newReviewAccounts(auth, origin, wsURL)
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle("/api/v1/", omnigameapi.NewRouter(accounts, auth, nil, nil, nil, nil, nil, services.NewMemoryCache()))
	mux.HandleFunc("/review", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		links, err := browserLinks(auth, origin, wsURL)
		if err == nil {
			var saved []reviewLink
			saved, err = accountLinks(accounts)
			links = append(links, saved...)
		}
		if err != nil {
			http.Error(w, "Could not create local review links", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		if err := reviewPage.Execute(w, links); err != nil {
			log.Printf("review page: %v", err)
		}
	})
	mux.Handle("/", worldHandler)
	httpServer := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	serveErrors := make(chan error, 1)
	go func() { serveErrors <- httpServer.Serve(listener) }()
	var snapshots atomic.Int64
	connections, err := connectPeers(ctx, auth, origin, wsURL, *peers, *moving, &snapshots)
	if err != nil {
		log.Fatal(err)
	}
	defer func() {
		for _, conn := range connections {
			_ = conn.Close()
		}
	}()
	if *lifetime > 0 {
		go func() {
			timer := time.NewTimer(*lifetime)
			defer timer.Stop()
			select {
			case <-ctx.Done():
			case <-timer.C:
				for _, conn := range connections {
					_ = conn.Close()
				}
			}
		}()
	}
	if *observe {
		go observeRoom(ctx, state, &snapshots)
	}
	log.Printf("Open http://%s/review — %d local peers; runtime %s", listener.Addr(), *peers, origin)
	select {
	case <-ctx.Done():
	case err := <-serveErrors:
		if err != nil && err != http.ErrServerClosed {
			log.Printf("review server: %v", err)
		}
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdown)
}

func newReviewAccounts(auth *services.AuthService, origin, wsURL string) (*service.SessionService, error) {
	sessions := service.NewSessionServiceWithMediaState(origin, wsURL,
		repository.NewInMemoryProfileRepository(), repository.NewInMemorySanctionRepository(),
		world.NewMediaStateWithPlaylists(nil, time.Now()), auth)
	for index, character := range []string{"male", "female"} {
		userID := 1001 + index
		if err := sessions.ProfileService().SaveLoadout(context.Background(), userID,
			map[string]string{"av": "1", "cv": "1", "cp": character, "cw": "110111"}); err != nil {
			return nil, err
		}
		if err := sessions.ProfileService().SaveReturnPoint(context.Background(), userID,
			&omnigamemodel.SavedPoint{X: -.8 + 1.6*float64(index), Y: 2.285, Z: -45}); err != nil {
			return nil, err
		}
	}
	return sessions, nil
}

func accountLinks(sessions *service.SessionService) ([]reviewLink, error) {
	links := []reviewLink{}
	for index, character := range []string{"male", "female"} {
		userID := 1001 + index
		for _, renderer := range []string{"webgpu", "webgl"} {
			launch, err := sessions.CreateLaunchSession(context.Background(), omnigamemodel.LaunchRequest{Mode: omnigamemodel.LaunchModeAccount},
				omnigamemodel.PlayerIdentity{UserID: &userID, Username: "Review account " + character})
			if err != nil {
				return nil, err
			}
			raw, err := sessions.BuildLaunchURL(launch)
			if err != nil {
				return nil, err
			}
			link, err := url.Parse(raw)
			if err != nil {
				return nil, err
			}
			query := link.Query()
			query.Set("debug", "1")
			query.Set("perf", renderer)
			link.RawQuery = query.Encode()
			links = append(links, reviewLink{character + " account · " + renderer, link.String()})
		}
	}
	return links, nil
}

func localRuntimeOrigin(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("invalid runtime origin: %w", err)
	}
	ip := net.ParseIP(u.Hostname())
	local := u.Hostname() == "localhost" || (ip != nil && ip.IsLoopback())
	if u.Scheme != "http" || !local || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
		return "", fmt.Errorf("runtime must be an HTTP loopback origin, such as http://127.0.0.1:4175")
	}
	return strings.TrimSuffix(u.String(), "/"), nil
}

func browserLinks(auth *services.AuthService, origin, wsURL string) ([]reviewLink, error) {
	links := []reviewLink{}
	for _, character := range []string{"male", "female"} {
		spawnX := -.8
		if character == "female" {
			spawnX = .8
		}
		token, err := auth.GenerateOmniRaveWorldJWT(services.OmniRaveWorldTokenInput{
			PlayerID: "review-" + character, PlayerName: "Review " + character, Mode: "guest",
			ReturnPoint: &omnigamemodel.SavedPoint{X: spawnX, Y: 2.285, Z: -45},
		})
		if err != nil {
			return nil, err
		}
		for _, renderer := range []string{"webgpu", "webgl"} {
			query := url.Values{"avatarComplete": {character}, "world": {wsURL}, "wtoken": {token}, "debug": {"1"}, "perf": {renderer}}
			links = append(links, reviewLink{character + " · " + renderer, origin + "/?" + query.Encode()})
		}
		base := "m"
		if character == "female" {
			base = "f"
		}
		savedToken, err := auth.GenerateOmniRaveWorldJWT(services.OmniRaveWorldTokenInput{
			PlayerID: "review-" + character, PlayerName: "Review " + character, Mode: "guest",
			ReturnPoint: &omnigamemodel.SavedPoint{X: spawnX, Y: 2.285, Z: -45},
			Loadout:     map[string]string{"av": "1", "bb": base, "cv": "1", "cp": character, "cw": "110111"},
		})
		if err != nil {
			return nil, err
		}
		for _, renderer := range []string{"webgpu", "webgl"} {
			query := url.Values{"world": {wsURL}, "wtoken": {savedToken}, "debug": {"1"}, "perf": {renderer}}
			links = append(links, reviewLink{character + " saved outfit · " + renderer, origin + "/?" + query.Encode()})
		}
	}
	return links, nil
}

func connectPeers(ctx context.Context, auth *services.AuthService, origin, wsURL string, count int, moving bool, snapshots *atomic.Int64) ([]*websocket.Conn, error) {
	connections := make([]*websocket.Conn, 0, count)
	for index := 0; index < count; index++ {
		character, base := "male", "m"
		if index%2 == 1 {
			character, base = "female", "f"
		}
		position := peerPosition(index, 0, false)
		token, err := auth.GenerateOmniRaveWorldJWT(services.OmniRaveWorldTokenInput{
			PlayerID: fmt.Sprintf("peer-%d", index), PlayerName: fmt.Sprintf("Review peer %d", index+1), Mode: "guest",
			ReturnPoint: &omnigamemodel.SavedPoint{X: position.X, Y: position.Y, Z: position.Z},
			Loadout:     map[string]string{"av": "1", "bb": base, "cv": "1", "cp": character, "cw": "111111"},
		})
		if err != nil {
			return closePeersOnError(connections, err)
		}
		dialer := websocket.Dialer{HandshakeTimeout: 5 * time.Second}
		conn, _, err := dialer.DialContext(ctx, wsURL+"?token="+url.QueryEscape(token), http.Header{"Origin": {origin}})
		if err != nil {
			return closePeersOnError(connections, err)
		}
		connections = append(connections, conn)
		go func(index int, conn *websocket.Conn) {
			for {
				var event struct {
					Type string `json:"type"`
				}
				if err := conn.ReadJSON(&event); err != nil {
					return
				}
				if index == 0 && event.Type == "world_snapshot" {
					snapshots.Add(1)
				}
			}
		}(index, conn)
		if moving && index%3 != 0 {
			go func(index int, conn *websocket.Conn) {
				ticker := time.NewTicker(100 * time.Millisecond)
				defer ticker.Stop()
				start := time.Now()
				for {
					select {
					case <-ctx.Done():
						return
					case now := <-ticker.C:
						position := peerPosition(index, now.Sub(start).Seconds(), true)
						_ = conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
						if err := conn.WriteJSON(world.ClientEvent{Type: "move", MoveTo: &position}); err != nil {
							return
						}
					}
				}
			}(index, conn)
		}
	}
	return connections, nil
}

func closePeersOnError(connections []*websocket.Conn, err error) ([]*websocket.Conn, error) {
	for _, conn := range connections {
		_ = conn.Close()
	}
	return nil, err
}

func peerPosition(index int, seconds float64, moving bool) world.Vec3 {
	// Additional rows extend toward the stage, keeping the first eight peers
	// unchanged and the larger crowd in front of the normal follow camera.
	position := world.Vec3{X: (float64(index%8) - 3.5) * 1.5, Y: 2.285, Z: -49 + float64(index/8)*2.5}
	if moving && index%3 != 0 {
		rate := .75
		if index%3 == 2 {
			rate = 2.5
		}
		position.Z += 2 * math.Sin(seconds*rate)
	}
	return position
}

func observeRoom(ctx context.Context, state *world.World, snapshots *atomic.Int64) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	encoder := json.NewEncoder(os.Stdout)
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			positions := map[string]world.Vec3{}
			snapshot := state.SnapshotForPlayer("review-male", nil, nil)
			for _, player := range snapshot.Players {
				if strings.HasPrefix(player.ID, "review-") {
					positions[player.ID] = player.Position
				}
			}
			_ = encoder.Encode(map[string]any{"time": now.UTC(), "firstPeerSnapshots": snapshots.Swap(0), "players": len(snapshot.Players), "browserPositions": positions})
		}
	}
}
