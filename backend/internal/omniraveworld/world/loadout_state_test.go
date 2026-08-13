package world

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWorld_SetPlayerLoadoutReplacesCurrentPlayerLoadout(t *testing.T) {
	worldState := NewWorld(DefaultConfig())
	player := worldState.AddPlayer(PlayerSession{
		PlayerID: "guest-1",
		Loadout:  Loadout{"tp": "tee-black"},
	})

	worldState.SetPlayerLoadout("guest-1", player, Loadout{"av": "1", "tp": "mesh-neon"})

	require.Equal(t, Loadout{"av": "1", "tp": "mesh-neon"}, worldState.Player("guest-1").Loadout)
}

// The stored loadout must be a copy: a caller that reuses (or mutates) the map
// it published must not be able to reach into live world state afterwards.
func TestWorld_SetPlayerLoadoutStoresDefensiveCopy(t *testing.T) {
	worldState := NewWorld(DefaultConfig())
	player := worldState.AddPlayer(PlayerSession{PlayerID: "guest-1"})

	published := Loadout{"tp": "mesh-neon"}
	worldState.SetPlayerLoadout("guest-1", player, published)
	published["tp"] = "mutated-after-publish"

	require.Equal(t, "mesh-neon", worldState.Player("guest-1").Loadout["tp"])
}

// Same reconnect race RemovePlayer guards: a stale connection's late loadout
// event must not repaint the avatar of the player now holding that ID.
func TestWorld_SetPlayerLoadoutIgnoresStaleSession(t *testing.T) {
	worldState := NewWorld(DefaultConfig())
	stale := worldState.AddPlayer(PlayerSession{PlayerID: "guest-1", Loadout: Loadout{"tp": "old"}})
	reconnected := worldState.AddPlayer(PlayerSession{PlayerID: "guest-1", Loadout: Loadout{"tp": "new"}})
	require.NotSame(t, stale, reconnected)

	worldState.SetPlayerLoadout("guest-1", stale, Loadout{"tp": "stale-write"})

	require.Equal(t, "new", worldState.Player("guest-1").Loadout["tp"])
}

func TestWorld_SetPlayerLoadoutIgnoresUnknownPlayer(t *testing.T) {
	worldState := NewWorld(DefaultConfig())
	player := worldState.AddPlayer(PlayerSession{PlayerID: "guest-1"})
	worldState.RemovePlayer("guest-1", player)

	worldState.SetPlayerLoadout("guest-1", player, Loadout{"tp": "ghost"})

	require.Nil(t, worldState.Player("guest-1"))
}

func TestValidateLoadout(t *testing.T) {
	tests := []struct {
		name    string
		payload map[string]string
		wantErr bool
	}{
		{
			name:    "empty is allowed",
			payload: map[string]string{},
			wantErr: false,
		},
		{
			name:    "typical avatar loadout",
			payload: map[string]string{"av": "1", "bb": "m", "ht": "70"},
			wantErr: false,
		},
		{
			name:    "key count at the cap",
			payload: loadoutWithKeys(MaxLoadoutKeys),
			wantErr: false,
		},
		{
			name:    "key count over the cap",
			payload: loadoutWithKeys(MaxLoadoutKeys + 1),
			wantErr: true,
		},
		{
			name:    "key at the length cap",
			payload: map[string]string{strings.Repeat("k", MaxLoadoutKeyLength): "ok"},
			wantErr: false,
		},
		{
			name:    "key over the length cap",
			payload: map[string]string{strings.Repeat("k", MaxLoadoutKeyLength+1): "ok"},
			wantErr: true,
		},
		{
			name:    "value at the length cap",
			payload: map[string]string{"tp": strings.Repeat("v", MaxLoadoutValueLength)},
			wantErr: false,
		},
		{
			name:    "value over the length cap",
			payload: map[string]string{"tp": strings.Repeat("v", MaxLoadoutValueLength+1)},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateLoadout(tt.payload)
			require.Equal(t, tt.wantErr, err != nil, "ValidateLoadout() error = %v", err)
		})
	}
}

func loadoutWithKeys(count int) map[string]string {
	payload := make(map[string]string, count)
	for i := 0; i < count; i++ {
		payload[string(rune('a'+i%26))+strings.Repeat("x", i/26+1)] = "v"
	}
	return payload
}
