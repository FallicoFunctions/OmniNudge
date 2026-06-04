package world

import (
	"math"
	"sync"
)

const maxMoveStep = 2.25

type World struct {
	cfg     Config
	players map[string]*Player
	mu      sync.RWMutex
}

func NewWorld(cfg Config) *World {
	return &World{
		cfg:     cfg,
		players: make(map[string]*Player),
	}
}

func (w *World) Config() Config {
	return w.cfg
}

func (w *World) AddPlayer(session PlayerSession) *Player {
	w.mu.Lock()
	defer w.mu.Unlock()

	spawn := w.cfg.SpawnPoint
	if session.ReturnPoint != nil && w.cfg.Walkable.IsValid(*session.ReturnPoint) {
		spawn = *session.ReturnPoint
	}

	player := &Player{
		ID:         session.PlayerID,
		PlayerName: session.PlayerName,
		Mode:       session.Mode,
		Position:   spawn,
		Zone:       w.cfg.ZoneMap.ZoneFor(spawn),
		Loadout:    session.Loadout,
	}
	w.players[player.ID] = player
	return player
}

func (w *World) ApplyInput(playerID string, frame InputFrame) {
	w.mu.Lock()
	defer w.mu.Unlock()

	player, ok := w.players[playerID]
	if !ok {
		return
	}

	next := clampMoveTarget(player.Position, frame.MoveTo, maxMoveStep)
	if w.cfg.Walkable.IsValid(next) {
		player.Position = next
	}
	player.Zone = w.cfg.ZoneMap.ZoneFor(player.Position)
}

func (w *World) RespawnPlayer(playerID string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	player, ok := w.players[playerID]
	if !ok {
		return
	}

	player.Position = DefaultLayout().SpawnFor(player.Zone)
	player.Zone = w.cfg.ZoneMap.ZoneFor(player.Position)
}

func (w *World) RemovePlayer(playerID string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	delete(w.players, playerID)
}

func (w *World) Player(playerID string) *Player {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.players[playerID]
}

func (w *World) Snapshot() Snapshot {
	w.mu.RLock()
	defer w.mu.RUnlock()

	return Snapshot{Players: copyPlayers(w.players)}
}

func (w *World) SnapshotForPlayer(playerID string, zoneMedia []ZoneMediaState, zoneEvents []ZoneEventState) Snapshot {
	w.mu.RLock()
	defer w.mu.RUnlock()

	activeZone := ZoneMainStage
	if player, ok := w.players[playerID]; ok {
		activeZone = player.Zone
	}

	return Snapshot{
		Players:         copyPlayers(w.players),
		ZoneMedia:       zoneMedia,
		ZoneEvents:      zoneEvents,
		CurrentPlayerID: playerID,
		ActiveZone:      activeZone,
	}
}

func copyPlayers(players map[string]*Player) []*Player {
	snapshotPlayers := make([]*Player, 0, len(players))
	for _, player := range players {
		copyPlayer := *player
		snapshotPlayers = append(snapshotPlayers, &copyPlayer)
	}
	return snapshotPlayers
}

func clampMoveTarget(current, target Vec3, maxStep float64) Vec3 {
	deltaX := target.X - current.X
	deltaY := target.Y - current.Y
	deltaZ := target.Z - current.Z
	distance := math.Sqrt((deltaX * deltaX) + (deltaY * deltaY) + (deltaZ * deltaZ))
	if distance == 0 || distance <= maxStep {
		return target
	}

	scale := maxStep / distance
	return Vec3{
		X: current.X + (deltaX * scale),
		Y: current.Y + (deltaY * scale),
		Z: current.Z + (deltaZ * scale),
	}
}
