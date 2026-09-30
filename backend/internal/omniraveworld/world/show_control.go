package world

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"slices"
	"time"

	"github.com/google/uuid"
)

//go:embed show_catalogue.json
var showCatalogueJSON []byte

type FireworkRule struct {
	ID         string `json:"id"`
	CooldownMS int64  `json:"cooldownMs"`
	DurationMS int64  `json:"durationMs"`
	Cost       int    `json:"cost"`
}
type DroneRule struct {
	ID         string `json:"id"`
	DurationMS int64  `json:"durationMs"`
}
type ShowCatalogue struct {
	Version          int            `json:"version"`
	TurnMS           int64          `json:"turnMs"`
	PreparationMS    int64          `json:"preparationMs"`
	RepeatMS         int64          `json:"repeatMs"`
	MaxCost          int            `json:"maxCost"`        // Zero disables sky-capacity admission and reservation limits.
	MaxOpeningCost   int            `json:"maxOpeningCost"` // Zero disables the opening-group cost limit.
	BankTurnaroundMS int64          `json:"bankTurnaroundMs"`
	Fireworks        []FireworkRule `json:"fireworks"`
	Drones           []DroneRule    `json:"drones"`
}

var ShowRules = func() ShowCatalogue {
	var c ShowCatalogue
	if err := json.Unmarshal(showCatalogueJSON, &c); err != nil {
		panic(err)
	}
	return c
}()

type ShowShot struct {
	Design string `json:"design"`
	Bank   int    `json:"bank"`
}
type ShowCommand struct {
	RequestID string     `json:"requestId"`
	Panel     string     `json:"panel"`
	Action    string     `json:"action"`
	TurnID    string     `json:"turnId,omitempty"`
	Shots     []ShowShot `json:"shots,omitempty"`
	Clip      string     `json:"clip,omitempty"`
}
type ShowResult struct {
	RequestID string `json:"requestId"`
	OK        bool   `json:"ok"`
	Message   string `json:"message"`
}
type ShowQueueEntry struct {
	PlayerID   string `json:"playerId"`
	PlayerName string `json:"playerName"`
	JoinedAt   int64  `json:"joinedAt"`
	// AwaySince is when the player's connection dropped (0 while present). An
	// away player keeps the place for ShowQueueGraceMS; turns skip them.
	AwaySince int64 `json:"awaySince,omitempty"`
}

// ShowQueueGraceMS is how long a disconnected player keeps a queue place.
const ShowQueueGraceMS = int64(2 * 60 * 1000)

type ShowTurn struct {
	ID          string     `json:"id"`
	PlayerID    string     `json:"playerId"`
	PlayerName  string     `json:"playerName"`
	StartsAt    int64      `json:"startsAt"`
	EndsAt      int64      `json:"endsAt"`
	Opening     []ShowShot `json:"opening"`
	Clip        string     `json:"clip,omitempty"`
	returnPoint Vec3
}
type ShowPanel struct {
	Queue     []ShowQueueEntry `json:"queue"`
	Active    *ShowTurn        `json:"active"`
	Preparing *ShowTurn        `json:"preparing"`
	NextAt    int64            `json:"nextAt"`
}
type ShowLaunch struct {
	ID       string `json:"id"`
	Design   string `json:"design"`
	Bank     int    `json:"bank"`
	Seed     uint32 `json:"seed"`
	StartsAt int64  `json:"startsAt"`
	EndsAt   int64  `json:"endsAt"`
	Cost     int    `json:"cost"`
}

// Source transitions are flattened into a bounded mixture at interruption.
// This preserves every drone's current position without a history of nested clips.
type DroneSource struct {
	Clip   string  `json:"clip"`
	Weight float64 `json:"weight"`
}
type ShowDrone struct {
	Clip         string        `json:"clip"`
	StartsAt     int64         `json:"startsAt"`
	EndsAt       int64         `json:"endsAt"`
	TransitionMS int64         `json:"transitionMs"`
	From         []DroneSource `json:"from"`
	Next         string        `json:"next"`
}
type ShowState struct {
	Version       int              `json:"version"`
	ServerAt      int64            `json:"serverAt"`
	EventStartsAt int64            `json:"eventStartsAt"`
	EventEndsAt   int64            `json:"eventEndsAt"`
	TurnMS        int64            `json:"turnMs"`
	PreparationMS int64            `json:"preparationMs"`
	Fireworks     ShowPanel        `json:"fireworks"`
	Drones        ShowPanel        `json:"drones"`
	Launches      []ShowLaunch     `json:"launches"`
	Cooldowns     map[string]int64 `json:"cooldowns"`
	Banks         map[int]int64    `json:"banks"`
	Drone         ShowDrone        `json:"drone"`
}
type showControl struct {
	ShowState
	anchor, repeat    int64
	boot              string
	sequence          uint32
	nextAuto          int64
	lastDroneBoundary int64
	results           map[string]map[string]ShowResult
	resultOrder       map[string][]string
}

func newShowControl() *showControl {
	return &showControl{ShowState: ShowState{Version: 1, TurnMS: ShowRules.TurnMS, PreparationMS: ShowRules.PreparationMS,
		Fireworks: ShowPanel{Queue: []ShowQueueEntry{}}, Drones: ShowPanel{Queue: []ShowQueueEntry{}}, Launches: []ShowLaunch{}, Cooldowns: map[string]int64{}, Banks: map[int]int64{},
		Drone: ShowDrone{Clip: "cube", From: []DroneSource{}, TransitionMS: 2500}}, repeat: ShowRules.RepeatMS, boot: uuid.NewString(), results: map[string]map[string]ShowResult{}, resultOrder: map[string][]string{}}
}

// ConfigureShowReview is an explicit process-level fixture, never a client command.
// Call before accepting players. Production uses the default hourly clock.
func (w *World) ConfigureShowReview(anchor time.Time, turn, prep time.Duration) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if len(w.players) > 0 || turn < 10*time.Second || prep < time.Second || prep >= turn {
		return
	}
	w.show = newShowControl()
	w.show.anchor = anchor.UnixMilli()
	w.show.TurnMS = turn.Milliseconds()
	w.show.PreparationMS = prep.Milliseconds()
	w.show.repeat = 2*w.show.TurnMS + 30000
}

func (s *showControl) panel(name string) *ShowPanel {
	if name == "fireworks" {
		return &s.Fireworks
	}
	if name == "drones" {
		return &s.Drones
	}
	return nil
}
func fireworkRule(id string) (FireworkRule, bool) {
	for _, r := range ShowRules.Fireworks {
		if r.ID == id {
			return r, true
		}
	}
	return FireworkRule{}, false
}
func droneRule(id string) (DroneRule, bool) {
	for _, r := range ShowRules.Drones {
		if r.ID == id {
			return r, true
		}
	}
	return DroneRule{}, false
}
func (s *showControl) id(prefix string) string {
	s.sequence++
	return fmt.Sprintf("%s:%s:%d", s.boot, prefix, s.sequence)
}
func showAnchor(panel string) Vec3 {
	x := -.92
	if panel == "drones" {
		x = .92
	}
	return Vec3{X: x, Y: 2.15, Z: -67.3}
}

func (w *World) endShowTurn(p *ShowPanel) {
	if p.Active == nil {
		return
	}
	if player := w.players[p.Active.PlayerID]; player != nil {
		point := p.Active.returnPoint
		if !w.cfg.Walkable.IsValid(point) {
			point = w.cfg.SpawnPoint
		}
		for _, other := range w.players {
			if other.ID != player.ID && (other.Position.X-point.X)*(other.Position.X-point.X)+(other.Position.Z-point.Z)*(other.Position.Z-point.Z) < 1.2 {
				point = w.cfg.ZoneMap.SpawnFor(w.cfg.ZoneMap.ZoneFor(point), w.occupiedPositions(w.cfg.ZoneMap.ZoneFor(point), player.ID))
				break
			}
		}
		player.Position = point
		player.Zone = w.cfg.ZoneMap.ZoneFor(point)
		player.Crouched = false
		player.ShowPanel = ""
		player.ShowRevision++
	}
	p.Active = nil
}

// markShowPlayerAway keeps id's queue places but marks them away from now:
// a turn being prepared for them passes on, and an active turn ends.
func (w *World) markShowPlayerAway(id string, now int64) {
	s := w.show
	for _, p := range []*ShowPanel{&s.Fireworks, &s.Drones} {
		for i := range p.Queue {
			if p.Queue[i].PlayerID == id && p.Queue[i].AwaySince == 0 {
				p.Queue[i].AwaySince = now
			}
		}
		if p.Preparing != nil && p.Preparing.PlayerID == id {
			// Back in line at the front, so the turn goes to the next present
			// player and this one keeps their place for the one after.
			turn := p.Preparing
			p.Preparing = nil
			if !slices.ContainsFunc(p.Queue, func(q ShowQueueEntry) bool { return q.PlayerID == id }) {
				p.Queue = slices.Insert(p.Queue, 0, ShowQueueEntry{PlayerID: id, PlayerName: turn.PlayerName, JoinedAt: turn.StartsAt - s.PreparationMS, AwaySince: now})
			}
		}
		if p.Active != nil && p.Active.PlayerID == id {
			w.endShowTurn(p)
			if p == &s.Drones {
				s.Drone.Next = ""
			}
		}
	}
	delete(s.results, id)
	delete(s.resultOrder, id)
}

// markShowPlayerPresent returns id's queue places to them on reconnect.
func (w *World) markShowPlayerPresent(id string) {
	s := w.show
	for _, p := range []*ShowPanel{&s.Fireworks, &s.Drones} {
		for i := range p.Queue {
			if p.Queue[i].PlayerID == id {
				p.Queue[i].AwaySince = 0
			}
		}
	}
}

// expireAwayQueueEntries drops places whose player has been away too long.
func (w *World) expireAwayQueueEntries(now int64) {
	s := w.show
	for _, p := range []*ShowPanel{&s.Fireworks, &s.Drones} {
		p.Queue = slices.DeleteFunc(p.Queue, func(q ShowQueueEntry) bool {
			return q.AwaySince != 0 && now-q.AwaySince >= ShowQueueGraceMS
		})
	}
}

func (w *World) prepareShow(p *ShowPanel, at, now int64) {
	p.NextAt = at
	// Preparation opens up to ten seconds early; arrivals may use the remaining
	// time in an unclaimed window without delaying or shortening the actual turn.
	if p.Preparing != nil || now < at-w.show.PreparationMS || now >= at {
		return
	}
	// The first player in line who is present takes the turn; anyone away
	// keeps their place for a later one.
	for i, q := range p.Queue {
		if q.AwaySince != 0 || w.players[q.PlayerID] == nil {
			continue
		}
		p.Queue = slices.Delete(p.Queue, i, i+1)
		p.Preparing = &ShowTurn{ID: w.show.id("turn"), PlayerID: q.PlayerID, PlayerName: q.PlayerName, StartsAt: at, EndsAt: at + w.show.TurnMS, Opening: []ShowShot{}}
		return
	}
}
func (w *World) activateShow(panel string, p *ShowPanel, now int64) {
	if p.Preparing == nil || now < p.Preparing.StartsAt {
		return
	}
	t := p.Preparing
	p.Preparing = nil
	player := w.players[t.PlayerID]
	if now >= t.EndsAt || player == nil {
		return
	}
	w.endShowTurn(p)
	p.Active = t
	t.returnPoint = player.Position
	player.Position = showAnchor(panel)
	player.Crouched = false
	player.Zone = ZoneMainStage
	player.ShowPanel = panel
	player.ShowRevision++
	if panel == "fireworks" {
		w.show.launch(t.Opening, t.StartsAt)
	} else {
		w.show.Drone.Next = ""
		if t.Clip != "" {
			w.show.startDrone(t.Clip, t.StartsAt)
		}
	}
}

// AdvanceShows is called by the scheduler even when nobody moves.
func (w *World) AdvanceShows(now time.Time) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.advanceShows(now.UnixMilli())
}
func (w *World) advanceShows(now int64) bool {
	s := w.show
	sequence := s.sequence
	oldF, oldD := s.Fireworks.Active, s.Drones.Active
	oldP, oldQ := s.Fireworks.Preparing, s.Drones.Preparing
	s.ServerAt = now
	w.expireAwayQueueEntries(now)
	s.Launches = slices.DeleteFunc(s.Launches, func(l ShowLaunch) bool { return l.EndsAt <= now })
	for _, p := range []*ShowPanel{&s.Fireworks, &s.Drones} {
		if p.Active != nil && now >= p.Active.EndsAt {
			w.endShowTurn(p)
			if p == &s.Drones {
				s.Drone.Next = ""
			}
		}
	}
	w.activateShow("fireworks", &s.Fireworks, now)
	w.activateShow("drones", &s.Drones, now)
	offset := (now - s.anchor) % s.repeat
	if offset < 0 {
		offset += s.repeat
	}
	eventStart := now - offset
	s.EventStartsAt = eventStart
	s.EventEndsAt = eventStart + 2*s.TurnMS
	nextFire := eventStart + s.TurnMS
	if now >= nextFire {
		nextFire = eventStart + s.repeat
	}
	if offset >= 2*s.TurnMS {
		s.EventStartsAt = eventStart + s.repeat
		s.EventEndsAt = s.EventStartsAt + 2*s.TurnMS
	}
	w.prepareShow(&s.Fireworks, nextFire, now)
	if s.Drones.Preparing == nil {
		next := s.lastDroneBoundary
		if s.Drones.Active != nil {
			next = s.Drones.Active.EndsAt
		} else if next <= now {
			next = now + s.PreparationMS
		}
		s.lastDroneBoundary = next
		// A player who drops while preparing goes back to the front with the
		// slot's preparation start as JoinedAt, so the slot does not move and
		// the next present player takes it on time.
		if s.Drones.Active == nil && len(s.Drones.Queue) > 0 && s.Drones.Queue[0].JoinedAt > next-s.PreparationMS {
			s.lastDroneBoundary = s.Drones.Queue[0].JoinedAt + s.PreparationMS
			next = s.lastDroneBoundary
		}
		w.prepareShow(&s.Drones, next, now)
	}
	if offset < 2*s.TurnMS && s.Fireworks.Active == nil && now >= s.nextAuto {
		// A modest deterministic fallback. The operator source always replaces it.
		index := int((now - eventStart) / 3500)
		ids := []string{"F01", "F02", "F07", "F17", "F22", "F06"}
		shots := []ShowShot{{Design: ids[index%len(ids)], Bank: index % 7}}
		if s.validateShots(shots, now, false) == "" {
			s.launch(shots, now)
		}
		s.nextAuto = now + 3500
	}
	if s.Drone.EndsAt == 0 {
		s.startDrone("cube", now)
	}
	if now >= s.Drone.EndsAt {
		if s.Drone.Next != "" {
			next := s.Drone.Next
			s.Drone.Next = ""
			s.startDrone(next, s.Drone.EndsAt)
		} else if s.Drones.Active == nil {
			index := 0
			for i, r := range ShowRules.Drones {
				if r.ID == s.Drone.Clip {
					index = (i + 1) % len(ShowRules.Drones)
					break
				}
			}
			s.startDrone(ShowRules.Drones[index].ID, now)
		}
	}
	return s.sequence != sequence || oldF != s.Fireworks.Active || oldD != s.Drones.Active || oldP != s.Fireworks.Preparing || oldQ != s.Drones.Preparing
}

func (s *showControl) startDrone(clip string, now int64) {
	rule, ok := droneRule(clip)
	if !ok {
		return
	}
	u := float64(now-s.Drone.StartsAt) / float64(max(1, s.Drone.TransitionMS))
	u = min(1, max(0, u))
	u = u * u * (3 - 2*u)
	weights := map[string]float64{s.Drone.Clip: u}
	for _, from := range s.Drone.From {
		weights[from.Clip] += from.Weight * (1 - u)
	}
	if len(s.Drone.From) == 0 {
		weights[s.Drone.Clip] = 1
	}
	from := []DroneSource{}
	for _, r := range ShowRules.Drones {
		if weight := weights[r.ID]; weight > 0 {
			from = append(from, DroneSource{r.ID, weight})
		}
	}
	s.Drone = ShowDrone{Clip: clip, StartsAt: now, EndsAt: now + rule.DurationMS, TransitionMS: 2500, From: from}
	s.sequence++
}

func (s *showControl) validateShots(shots []ShowShot, at int64, opening bool) string {
	if len(shots) > 4 {
		return "Choose up to four launches together."
	}
	cost := 0
	counts := map[string]int{}
	seen := map[ShowShot]bool{}
	for _, shot := range shots {
		rule, ok := fireworkRule(shot.Design)
		if !ok || shot.Bank < 0 || shot.Bank > 6 {
			return "Unknown firework or launch bank."
		}
		if seen[shot] {
			return "That firework and bank are already selected."
		}
		seen[shot] = true
		counts[shot.Design]++
		cost += rule.Cost
		if s.Cooldowns[shot.Design] > at {
			return "That firework is cooling down."
		}
		if s.Banks[shot.Bank] > at {
			return "That launch bank is busy."
		}
	}
	if opening && ShowRules.MaxOpeningCost > 0 && cost > ShowRules.MaxOpeningCost {
		return "Choose a smaller opening group."
	}
	for _, l := range s.Launches {
		if l.EndsAt > at {
			cost += l.Cost
		}
	}
	if !opening && s.Fireworks.Preparing != nil {
		t := s.Fireworks.Preparing
		future := 0
		for _, reserved := range t.Opening {
			rule, _ := fireworkRule(reserved.Design)
			future += rule.Cost
			for _, shot := range shots {
				r, _ := fireworkRule(shot.Design)
				if shot.Design == reserved.Design && at+r.CooldownMS*int64(counts[shot.Design]) > t.StartsAt {
					return "Reserved for the next player's opening."
				}
				if shot.Bank == reserved.Bank && at+ShowRules.BankTurnaroundMS > t.StartsAt {
					return "That bank is reserved for the next player."
				}
			}
		}
		for _, l := range s.Launches {
			if l.EndsAt > t.StartsAt {
				future += l.Cost
			}
		}
		for _, shot := range shots {
			r, _ := fireworkRule(shot.Design)
			if at+r.DurationMS > t.StartsAt {
				future += r.Cost
			}
		}
		if ShowRules.MaxCost > 0 && len(t.Opening) > 0 && future > ShowRules.MaxCost {
			return "Keeping space for the next player's opening."
		}
	}
	if ShowRules.MaxCost > 0 && cost > ShowRules.MaxCost {
		return "Sky capacity full. Let the current effects finish."
	}
	return ""
}
func (s *showControl) launch(shots []ShowShot, at int64) {
	counts := map[string]int{}
	for _, shot := range shots {
		rule, ok := fireworkRule(shot.Design)
		if !ok {
			continue
		}
		id := s.id("shell")
		counts[shot.Design]++
		s.Launches = append(s.Launches, ShowLaunch{ID: id, Design: shot.Design, Bank: shot.Bank, Seed: s.sequence * 2654435761, StartsAt: at, EndsAt: at + rule.DurationMS, Cost: rule.Cost})
		s.Banks[shot.Bank] = at + ShowRules.BankTurnaroundMS
	}
	for id, n := range counts {
		rule, _ := fireworkRule(id)
		s.Cooldowns[id] = at + rule.CooldownMS*int64(n)
	}
}

func (w *World) ApplyShowCommand(playerID string, session *Player, c ShowCommand, now time.Time) ShowResult {
	w.mu.Lock()
	defer w.mu.Unlock()
	result := ShowResult{RequestID: c.RequestID}
	if w.players[playerID] != session || session == nil {
		result.Message = "Session ended."
		return result
	}
	if len(c.RequestID) < 1 || len(c.RequestID) > 64 || len(c.TurnID) > 100 {
		result.Message = "Invalid command."
		return result
	}
	s := w.show
	if old, ok := s.results[playerID][c.RequestID]; ok {
		return old
	}
	w.advanceShows(now.UnixMilli())
	at := now.UnixMilli()
	p := s.panel(c.Panel)
	apply := func() string {
		if p == nil {
			return "Unknown panel."
		}
		switch c.Action {
		case "join":
			for _, other := range []*ShowPanel{&s.Fireworks, &s.Drones} {
				if other.Active != nil && other.Active.PlayerID == playerID || other.Preparing != nil && other.Preparing.PlayerID == playerID || slices.ContainsFunc(other.Queue, func(q ShowQueueEntry) bool { return q.PlayerID == playerID }) {
					return "You already have a place or a turn."
				}
			}
			if len(p.Queue) >= 100 {
				return "This queue is full."
			}
			p.Queue = append(p.Queue, ShowQueueEntry{PlayerID: playerID, PlayerName: session.PlayerName, JoinedAt: at})
			// Publish preparation in this command, including a join just before start.
			w.advanceShows(at)
			return ""
		case "leave":
			if p.Active != nil && p.Active.PlayerID == playerID {
				if c.TurnID != p.Active.ID {
					return "That turn has ended."
				}
				w.endShowTurn(p)
				if c.Panel == "drones" {
					s.Drone.Next = ""
				}
			}
			if p.Preparing != nil && p.Preparing.PlayerID == playerID {
				p.Preparing = nil
			}
			p.Queue = slices.DeleteFunc(p.Queue, func(q ShowQueueEntry) bool { return q.PlayerID == playerID })
			return ""
		case "prepare":
			if p.Preparing == nil || p.Preparing.PlayerID != playerID || p.Preparing.ID != c.TurnID {
				return "Preparation is not open for you."
			}
			if c.Panel == "fireworks" {
				if message := s.validateShots(c.Shots, p.Preparing.StartsAt, true); message != "" {
					return message
				}
				p.Preparing.Opening = slices.Clone(c.Shots)
			} else {
				if _, ok := droneRule(c.Clip); !ok {
					return "Unknown movement."
				}
				p.Preparing.Clip = c.Clip
			}
			return ""
		case "launch", "movement":
			if p.Active == nil || p.Active.PlayerID != playerID || p.Active.ID != c.TurnID || at >= p.Active.EndsAt {
				return "It is not your turn."
			}
			if c.Action == "launch" && c.Panel == "fireworks" {
				if len(c.Shots) == 0 {
					return "Choose a firework."
				}
				if message := s.validateShots(c.Shots, at, false); message != "" {
					return message
				}
				s.launch(c.Shots, at)
				return ""
			}
			if c.Action == "movement" && c.Panel == "drones" {
				if _, ok := droneRule(c.Clip); !ok {
					return "Unknown movement."
				}
				if at >= s.Drone.EndsAt {
					s.startDrone(c.Clip, at)
				} else {
					s.Drone.Next = c.Clip
				}
				return ""
			}
			return "Invalid panel action."
		default:
			return "Unknown action."
		}
	}
	result.Message = apply()
	result.OK = result.Message == ""
	if result.OK {
		result.Message = "Accepted"
	}
	if s.results[playerID] == nil {
		s.results[playerID] = map[string]ShowResult{}
	}
	s.results[playerID][c.RequestID] = result
	s.resultOrder[playerID] = append(s.resultOrder[playerID], c.RequestID)
	if len(s.resultOrder[playerID]) > 4096 {
		old := s.resultOrder[playerID][0]
		s.resultOrder[playerID] = s.resultOrder[playerID][1:]
		delete(s.results[playerID], old)
	}
	return result
}

// Deep-copy under the world's lock; socket writers never observe mutable maps.
func (s *showControl) snapshot() *ShowState {
	raw, _ := json.Marshal(s.ShowState)
	var copy ShowState
	_ = json.Unmarshal(raw, &copy)
	return &copy
}
