package world

import (
	"fmt"
	"testing"
	"time"
)

func TestFireworksJoinDuringPreparationGetsUpcomingFullTurn(t *testing.T) {
	start := time.Date(2026, 9, 17, 20, 0, 0, 0, time.UTC)
	for _, half := range []int{0, 1} {
		for _, remaining := range []time.Duration{10 * time.Second, 9500 * time.Millisecond, 9 * time.Second, time.Second, time.Millisecond} {
			t.Run(fmt.Sprintf("half%d/%s", half+1, remaining), func(t *testing.T) {
				w := NewWorld(DefaultConfig())
				p := w.AddPlayer(PlayerSession{PlayerID: "p", PlayerName: "Player"})
				boundary := start.Add(time.Duration(half) * 150 * time.Second)
				joined := boundary.Add(-remaining)
				r := w.ApplyShowCommand(p.ID, p, ShowCommand{RequestID: "join", Panel: "fireworks", Action: "join"}, joined)
				if !r.OK {
					t.Fatal(r)
				}
				turn := w.show.Fireworks.Preparing
				if turn == nil || turn.PlayerID != p.ID || turn.StartsAt != boundary.UnixMilli() {
					t.Fatal("join did not immediately open the upcoming preparation", turn)
				}
				if turn.EndsAt-turn.StartsAt != 150000 {
					t.Fatal("shortened operator turn", turn)
				}
				r = w.ApplyShowCommand(p.ID, p, ShowCommand{RequestID: "opening", Panel: "fireworks", Action: "prepare", TurnID: turn.ID, Shots: []ShowShot{{"F03", 3}}}, joined)
				if !r.OK {
					t.Fatal(r)
				}
				other := w.AddPlayer(PlayerSession{PlayerID: "other"})
				r = w.ApplyShowCommand(other.ID, other, ShowCommand{RequestID: "join", Panel: "fireworks", Action: "join"}, joined)
				if !r.OK || w.show.Fireworks.Preparing.PlayerID != p.ID || len(w.show.Fireworks.Queue) != 1 {
					t.Fatal("later join displaced reserved player", r)
				}
				w.AdvanceShows(boundary)
				if p.ShowPanel != "fireworks" || p.Position != showAnchor("fireworks") || w.show.Fireworks.Active.ID != turn.ID {
					t.Fatal("missed scheduled handoff")
				}
				opening := false
				for _, l := range w.show.Launches {
					if l.Design == "F03" && l.StartsAt == boundary.UnixMilli() {
						opening = true
					}
				}
				if !opening {
					t.Fatal("opening was not launched at the scheduled start")
				}
			})
		}
	}
}
