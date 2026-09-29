package world

import (
	"fmt"
	"testing"
	"time"
)

func TestShowTwoPanelsPreparationAndHandoff(t *testing.T) {
	w := NewWorld(DefaultConfig())
	start := time.Date(2026, 9, 17, 20, 0, 0, 0, time.UTC)
	a := w.AddPlayer(PlayerSession{PlayerID: "a", PlayerName: "A"})
	b := w.AddPlayer(PlayerSession{PlayerID: "b", PlayerName: "B"})
	d := w.AddPlayer(PlayerSession{PlayerID: "d", PlayerName: "D"})
	request := 0
	command := func(p *Player, panel, action, turn string, shots []ShowShot, clip string, at time.Time) ShowResult {
		request++
		return w.ApplyShowCommand(p.ID, p, ShowCommand{RequestID: fmt.Sprint(request), Panel: panel, Action: action, TurnID: turn, Shots: shots, Clip: clip}, at)
	}
	for _, v := range []struct {
		p     *Player
		panel string
	}{{a, "fireworks"}, {b, "fireworks"}, {d, "drones"}} {
		if r := command(v.p, v.panel, "join", "", nil, "", start.Add(-11*time.Second)); !r.OK {
			t.Fatal(r)
		}
	}
	w.AdvanceShows(start.Add(-10 * time.Second))
	turnA := w.show.Fireworks.Preparing
	if turnA == nil || turnA.PlayerID != "a" || turnA.EndsAt-turnA.StartsAt != 150000 {
		t.Fatal("missing full prepared turn", turnA)
	}
	if r := command(a, "fireworks", "prepare", turnA.ID, []ShowShot{{"F01", 1}, {"F01", 5}}, "", start.Add(-9*time.Second)); !r.OK {
		t.Fatal(r)
	}
	if len(w.show.Launches) != 0 {
		t.Fatal("preparation launched early")
	}
	w.AdvanceShows(start)
	if a.ShowPanel != "fireworks" || d.ShowPanel != "drones" {
		t.Fatal("panels did not run independently", a.ShowPanel, d.ShowPanel)
	}
	if len(w.show.Launches) != 2 || w.show.Launches[0].StartsAt != start.UnixMilli() {
		t.Fatal("opening not launched at boundary")
	}
	position := a.Position
	w.ApplyInput(a.ID, InputFrame{MoveTo: Vec3{X: 5, Y: 2, Z: -70}})
	w.RespawnPlayer(a.ID)
	if a.Position != position {
		t.Fatal("operator movement escaped lock")
	}
	if r := command(b, "fireworks", "launch", turnA.ID, []ShowShot{{"F03", 0}}, "", start.Add(time.Second)); r.OK {
		t.Fatal("other player controlled the panel")
	}
	w.AdvanceShows(start.Add(140 * time.Second))
	turnB := w.show.Fireworks.Preparing
	if turnB == nil || turnB.PlayerID != "b" || a.ShowPanel != "fireworks" {
		t.Fatal("overlapping preparation displaced active operator")
	}
	if r := command(b, "fireworks", "prepare", turnB.ID, []ShowShot{{"F06", 2}}, "", start.Add(141*time.Second)); !r.OK {
		t.Fatal(r)
	}
	if r := command(a, "fireworks", "launch", turnA.ID, []ShowShot{{"F06", 3}}, "", start.Add(145*time.Second)); r.OK {
		t.Fatal("opening cooldown reservation was violated")
	}
	w.AdvanceShows(start.Add(150 * time.Second))
	if a.ShowPanel != "" || b.ShowPanel != "fireworks" || b.Position != showAnchor("fireworks") {
		t.Fatal("handoff did not move players")
	}
	if len(w.show.Launches) != 1 || w.show.Launches[0].Design != "F06" || w.show.Launches[0].StartsAt != start.Add(150*time.Second).UnixMilli() {
		t.Fatal("second opening missing", w.show.Launches)
	}
	if r := command(a, "fireworks", "launch", turnA.ID, []ShowShot{{"F03", 3}}, "", start.Add(151*time.Second)); r.OK {
		t.Fatal("expired owner command accepted")
	}
	w.AdvanceShows(start.Add(300 * time.Second))
	if b.ShowPanel != "" || w.show.Fireworks.Active != nil {
		t.Fatal("event did not end")
	}
}

func TestShowDisconnectAndStaleSession(t *testing.T) {
	w := NewWorld(DefaultConfig())
	now := time.Date(2026, 9, 17, 19, 58, 0, 0, time.UTC)
	p := w.AddPlayer(PlayerSession{PlayerID: "p"})
	join := func(p *Player, id string) {
		r := w.ApplyShowCommand(p.ID, p, ShowCommand{RequestID: id, Panel: "fireworks", Action: "join"}, now)
		if !r.OK {
			t.Fatal(r)
		}
	}
	join(p, "first")
	fresh := w.AddPlayer(PlayerSession{PlayerID: "p"})
	if len(w.show.Fireworks.Queue) != 0 {
		t.Fatal("reconnect preserved old place")
	}
	join(fresh, "new")
	w.RemovePlayer("p", p)
	if len(w.show.Fireworks.Queue) != 1 {
		t.Fatal("stale cleanup removed fresh entry")
	}
	w.RemovePlayer("p", fresh)
	if len(w.show.Fireworks.Queue) != 0 {
		t.Fatal("disconnect did not remove place")
	}
}

func TestShowAtomicLaunchAndDuplicateRequest(t *testing.T) {
	w := NewWorld(DefaultConfig())
	start := time.Date(2026, 9, 17, 20, 0, 0, 0, time.UTC)
	p := w.AddPlayer(PlayerSession{PlayerID: "p"})
	w.ApplyShowCommand(p.ID, p, ShowCommand{RequestID: "join", Panel: "fireworks", Action: "join"}, start.Add(-11*time.Second))
	w.AdvanceShows(start.Add(-10 * time.Second))
	w.AdvanceShows(start)
	c := ShowCommand{RequestID: "launch", Panel: "fireworks", Action: "launch", TurnID: w.show.Fireworks.Active.ID, Shots: []ShowShot{{"F01", 0}, {"missing", 2}}}
	if r := w.ApplyShowCommand(p.ID, p, c, start); r.OK || len(w.show.Launches) != 0 || len(w.show.Cooldowns) != 0 {
		t.Fatal("invalid group partially spent resources")
	}
	c.RequestID = "valid"
	c.Shots = []ShowShot{{"F01", 0}, {"F03", 2}}
	r := w.ApplyShowCommand(p.ID, p, c, start)
	if !r.OK {
		t.Fatal(r)
	}
	again := w.ApplyShowCommand(p.ID, p, c, start.Add(time.Second))
	if again != r || len(w.show.Launches) != 2 {
		t.Fatal("duplicate launched twice")
	}
}

func TestShowFallbackAndLateEntry(t *testing.T) {
	w := NewWorld(DefaultConfig())
	start := time.Date(2026, 9, 17, 20, 0, 0, 0, time.UTC)
	w.AdvanceShows(start)
	if len(w.show.Launches) == 0 || w.show.Drone.Clip == "" {
		t.Fatal("empty queues stopped shows")
	}
	p := w.AddPlayer(PlayerSession{PlayerID: "late"})
	w.ApplyShowCommand(p.ID, p, ShowCommand{RequestID: "join", Panel: "fireworks", Action: "join"}, start.Add(145*time.Second))
	w.AdvanceShows(start.Add(150 * time.Second))
	if p.ShowPanel != "fireworks" || len(w.show.Fireworks.Queue) != 0 {
		t.Fatal("late entry did not receive the unclaimed turn")
	}
	w.AdvanceShows(start.Add(300 * time.Second))
	count := len(w.show.Launches)
	w.AdvanceShows(start.Add(304 * time.Second))
	if len(w.show.Launches) > count {
		t.Fatal("fireworks launched outside event")
	}
	if w.show.Drone.EndsAt <= start.Add(300*time.Second).UnixMilli() {
		t.Fatal("continuous drones stopped after event")
	}
}

func TestDroneRepeatAndInterruptPreserveSource(t *testing.T) {
	s := newShowControl()
	s.startDrone("wave", 1000)
	s.Drone.Next = "wave"
	s.startDrone("sphere", 1500)
	weight := 0.0
	for _, from := range s.Drone.From {
		weight += from.Weight
	}
	if weight < .999999 || weight > 1.000001 || len(s.Drone.From) < 2 {
		t.Fatal("interrupted transition lost source positions", s.Drone.From)
	}
}

func TestShowOpeningDoesNotReserveSkyCapacity(t *testing.T) {
	s := newShowControl()
	start := int64(150000)
	s.Fireworks.Preparing = &ShowTurn{StartsAt: start, Opening: []ShowShot{{"F05", 1}, {"F06", 5}}}
	s.Launches = []ShowLaunch{{Cost: 9, EndsAt: start + 1000}}
	// The combined cost used to exceed the cap of 18. An unrelated launch
	// must remain playable while the next player's opening is prepared.
	if message := s.validateShots([]ShowShot{{"F01", 3}}, start-1000, false); message != "" {
		t.Fatal("sky capacity blocked a launch during preparation", message)
	}
	if message := s.validateShots([]ShowShot{{"F01", 3}}, start-20000, false); message != "" {
		t.Fatal("blocked a shell that finishes before the opening", message)
	}
}

func TestShowLaunchesIgnoreSkyCapacity(t *testing.T) {
	w := NewWorld(DefaultConfig())
	start := time.Date(2026, 9, 17, 20, 0, 0, 0, time.UTC)
	p := w.AddPlayer(PlayerSession{PlayerID: "p"})
	command := func(id, action, turn string, shots []ShowShot, at time.Time) ShowResult {
		return w.ApplyShowCommand(p.ID, p, ShowCommand{RequestID: id, Panel: "fireworks", Action: action, TurnID: turn, Shots: shots}, at)
	}
	if r := command("join", "join", "", nil, start.Add(-10*time.Second)); !r.OK {
		t.Fatal(r)
	}
	turn := w.show.Fireworks.Preparing.ID
	// Cost 16: previously rejected by the opening cap of 8.
	opening := []ShowShot{{"F05", 0}, {"F06", 1}, {"F10", 2}, {"F14", 3}}
	if r := command("opening", "prepare", turn, opening, start.Add(-9*time.Second)); !r.OK {
		t.Fatal("sky capacity blocked the opening", r)
	}
	w.AdvanceShows(start)
	if len(w.show.Launches) != 4 {
		t.Fatal("opening did not launch all four shells")
	}
	// These overlap the opening, taking the total cost to 29 (old cap: 18).
	group := []ShowShot{{"F21", 4}, {"F07", 5}, {"F08", 6}, {"F12", 0}}
	if r := command("overlap", "launch", turn, group, start.Add(time.Second)); !r.OK {
		t.Fatal("sky capacity blocked a live group", r)
	}
	if len(w.show.Launches) != 8 {
		t.Fatal("accepted group did not preserve all overlapping shells")
	}
	if r := command("busy-bank", "launch", turn, []ShowShot{{"F03", 4}}, start.Add(1100*time.Millisecond)); r.OK || r.Message != "That launch bank is busy." {
		t.Fatal("bank turnaround stopped being enforced", r)
	}
	if r := command("cooldown", "launch", turn, []ShowShot{{"F05", 1}}, start.Add(2*time.Second)); r.OK || r.Message != "That firework is cooling down." {
		t.Fatal("individual cooldown stopped being enforced", r)
	}
}

func TestDroneQueuedRepeatStartsAtExactBoundaryAndDisconnectFallsBack(t *testing.T) {
	w := NewWorld(DefaultConfig())
	start := time.Date(2026, 9, 17, 20, 0, 0, 0, time.UTC)
	p := w.AddPlayer(PlayerSession{PlayerID: "drone"})
	command := func(id, action, turn, clip string, at time.Time) ShowResult {
		return w.ApplyShowCommand(p.ID, p, ShowCommand{RequestID: id, Panel: "drones", Action: action, TurnID: turn, Clip: clip}, at)
	}
	if r := command("join", "join", "", "", start.Add(-10*time.Second)); !r.OK {
		t.Fatal(r)
	}
	w.AdvanceShows(start.Add(-9 * time.Second))
	turn := w.show.Drones.Preparing
	if turn == nil {
		t.Fatal("no prep")
	}
	if r := command("prep", "prepare", turn.ID, "wave", start.Add(-8*time.Second)); !r.OK {
		t.Fatal(r)
	}
	w.AdvanceShows(start)
	if r := command("repeat", "movement", turn.ID, "wave", start.Add(time.Second)); !r.OK {
		t.Fatal(r)
	}
	boundary := w.show.Drone.EndsAt
	w.AdvanceShows(time.UnixMilli(boundary + 80))
	if w.show.Drone.Clip != "wave" || w.show.Drone.StartsAt != boundary || w.show.Drone.Next != "" {
		t.Fatal("repeat drifted or failed", w.show.Drone)
	}
	w.RemovePlayer(p.ID, p)
	if w.show.Drones.Active != nil {
		t.Fatal("disconnected player kept panel")
	}
	w.AdvanceShows(time.UnixMilli(w.show.Drone.EndsAt + 100))
	if w.show.Drone.Clip == "wave" {
		t.Fatal("automatic sequence did not resume")
	}
}

func TestVacatedPreparationPromotesNextPlayerForSameFullTurn(t *testing.T) {
	for _, panel := range []string{"fireworks", "drones"} {
		for _, departure := range []string{"leave", "disconnect"} {
			t.Run(panel+"/"+departure, func(t *testing.T) {
				w := NewWorld(DefaultConfig())
				start := time.Date(2026, 9, 17, 20, 0, 0, 0, time.UTC)
				a := w.AddPlayer(PlayerSession{PlayerID: "a"})
				b := w.AddPlayer(PlayerSession{PlayerID: "b"})
				for _, p := range []*Player{a, b} {
					if r := w.ApplyShowCommand(p.ID, p, ShowCommand{RequestID: "join", Panel: panel, Action: "join"}, start.Add(-11*time.Second)); !r.OK {
						t.Fatal(r)
					}
				}
				w.AdvanceShows(start.Add(-10 * time.Second))
				p := w.show.panel(panel)
				if p.Preparing == nil || p.Preparing.PlayerID != a.ID {
					t.Fatal("first player did not receive preparation")
				}
				boundary := p.Preparing.StartsAt
				if departure == "disconnect" {
					w.RemovePlayer(a.ID, a)
				} else if r := w.ApplyShowCommand(a.ID, a, ShowCommand{RequestID: "leave", Panel: panel, Action: "leave", TurnID: p.Preparing.ID}, time.UnixMilli(boundary-4000)); !r.OK {
					t.Fatal(r)
				}
				w.AdvanceShows(time.UnixMilli(boundary - 3000))
				if p.Preparing == nil || p.Preparing.PlayerID != b.ID || p.Preparing.StartsAt != boundary || len(p.Queue) != 0 {
					t.Fatal("replacement did not receive the remaining preparation", p)
				}
				if p.Preparing.EndsAt-p.Preparing.StartsAt != 150000 {
					t.Fatal("replacement turn was shortened")
				}
				if len(p.Preparing.Opening) != 0 {
					t.Fatal("replacement inherited the departing player's opening")
				}
				w.AdvanceShows(time.UnixMilli(boundary))
				if p.Active == nil || p.Active.PlayerID != b.ID || b.ShowPanel != panel {
					t.Fatal("replacement did not take over at the scheduled start", p)
				}
			})
		}
	}
}
