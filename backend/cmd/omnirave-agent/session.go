package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"math/rand"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omniraveworld/world"
)

const (
	// handshakeTimeout bounds the upgrade itself. Everything after it is a live
	// connection with its own deadlines.
	handshakeTimeout = 10 * time.Second
	// readDeadline bounds how long the world may say nothing at all. The world
	// broadcasts a snapshot every second from its own scheduler, so silence for
	// this long means the peer is gone in a way TCP has not noticed yet, and
	// the session should end so a new one can be admitted.
	readDeadline = 30 * time.Second
	// closeGrace is how long a deliberate disconnect waits for the world to
	// acknowledge the close before the socket is torn down anyway.
	closeGrace = 2 * time.Second
)

// worldMessage is the envelope the world broadcasts. Only snapshots are acted
// on; chat and anything else this build does not know about is read and
// discarded, which is what keeps the connection drained.
type worldMessage struct {
	Type            string          `json:"type"`
	Players         []*world.Player `json:"players"`
	CurrentPlayerID string          `json:"currentPlayerId"`
}

// liveSession connects with an admission's world token and stays there until
// the world ends the session, the connection fails, or ctx is cancelled.
//
// It always returns the itinerary, including on error: a session that ended
// badly still happened, and what the character did before it ended is still
// true.
func (a *agent) liveSession(ctx context.Context, admission *model.PersonaAdmission) (*itinerary, error) {
	socketURL, err := a.cfg.SocketURL(admission.WorldSessionToken)
	if err != nil {
		return nil, err
	}

	dialer := &websocket.Dialer{HandshakeTimeout: handshakeTimeout}
	// The world upgrades only connections whose Origin it was configured to
	// allow, so this header is not optional politeness -- without it the
	// handshake is refused outright.
	conn, response, err := dialer.DialContext(ctx, socketURL, http.Header{"Origin": []string{a.cfg.Origin}})
	if err != nil {
		if response != nil {
			_ = response.Body.Close()
			return nil, errors.New("world socket refused the connection: " + response.Status)
		}
		return nil, err
	}
	defer func() { _ = conn.Close() }()

	itin := newItinerary(admission.PlayerName, a.now())
	walker := newWanderer(rand.New(rand.NewSource(a.now().UnixNano())), a.walkable)

	// The read loop exists for two reasons and both matter: it is where the
	// character's real position comes from, and it is what drains the socket.
	// A client that never reads eventually blocks the world's broadcast write
	// to it, and the world responds to a blocked write by dropping that
	// connection.
	ended := make(chan error, 1)
	go func() { ended <- a.readSnapshots(conn, admission.PlayerID, itin) }()

	ticker := time.NewTicker(time.Second / moveIntervalHz)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			// Leave properly rather than dropping the TCP connection and
			// letting the world discover it later: the close frame makes the
			// world remove the player now.
			a.closeSocket(conn)
			select {
			case <-ended:
			case <-time.After(closeGrace):
			}
			return itin, ctx.Err()

		case err := <-ended:
			return itin, err

		case <-ticker.C:
			position, seen := itin.current()
			if !seen {
				// No snapshot yet, so there is no confirmed position to move
				// from. Asking to move from a guess is how a client ends up
				// fighting the server's clamp.
				continue
			}
			next, ok := walker.nextStep(position)
			if !ok {
				continue
			}
			_ = conn.SetWriteDeadline(a.now().Add(closeGrace))
			if err := conn.WriteJSON(world.ClientEvent{Type: "move", MoveTo: &next}); err != nil {
				a.closeSocket(conn)
				select {
				case <-ended:
				case <-time.After(closeGrace):
				}
				return itin, err
			}
		}
	}
}

// readSnapshots feeds the itinerary from what the world says, and returns when
// the connection ends. A normal end -- the world closing the session because
// the token expired -- is not an error and is reported as nil.
func (a *agent) readSnapshots(conn *websocket.Conn, playerID string, itin *itinerary) error {
	for {
		_ = conn.SetReadDeadline(a.now().Add(readDeadline))
		_, payload, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				return nil
			}
			return err
		}

		var message worldMessage
		if err := json.Unmarshal(payload, &message); err != nil {
			continue
		}
		if message.Type != "world_snapshot" {
			continue
		}
		for _, player := range message.Players {
			if player == nil || player.ID != playerID {
				continue
			}
			itin.observe(a.now(), player.Position, player.Zone)
			break
		}
	}
}

func (a *agent) closeSocket(conn *websocket.Conn) {
	_ = conn.SetWriteDeadline(a.now().Add(closeGrace))
	_ = conn.WriteMessage(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, "leaving"),
	)
}

// reportVisit files the visit as a memory, if it was long enough to be one.
func (a *agent) reportVisit(ctx context.Context, itin *itinerary) {
	if itin == nil {
		return
	}
	title, summary, ok := itin.report(a.now())
	if !ok {
		log.Printf("omnirave-agent: visit too short to be worth remembering, nothing reported")
		return
	}
	if err := a.api.reportWorldEvent(ctx, title, summary); err != nil {
		// A failed report is not a reason to stop living in the world; the
		// character simply does not remember this visit.
		log.Printf("omnirave-agent: could not report the visit: %v", err)
		return
	}
	log.Printf("omnirave-agent: reported %q -- %s", title, summary)
}
