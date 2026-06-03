package world

import "sync"

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
		ID:       session.PlayerID,
		Position: spawn,
		Zone:     w.cfg.ZoneMap.ZoneFor(spawn),
		Loadout:  session.Loadout,
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

	next := w.cfg.Walkable.ResolveMove(player.Position, frame)
	if w.cfg.Walkable.IsValid(next) {
		player.Position = next
	}
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

func (w *World) SnapshotForPlayer(playerID string, zoneMedia []ZoneMediaState) Snapshot {
	w.mu.RLock()
	defer w.mu.RUnlock()

	activeZone := ZoneMainStage
	if player, ok := w.players[playerID]; ok {
		activeZone = player.Zone
	}

	return Snapshot{
		Players:         copyPlayers(w.players),
		ZoneMedia:       zoneMedia,
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
