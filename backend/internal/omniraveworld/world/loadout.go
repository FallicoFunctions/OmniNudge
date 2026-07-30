package world

import "fmt"

// Loadout size bounds. A loadout is a small dictionary describing an avatar
// (~10 short keys today, see omnirave-babylon/src/player/avatarDefinition.ts
// serializeAvatarLoadout), and it reaches the server from two untrusted
// entry points: the profile REST handler and the world socket's "loadout"
// event. Both MUST enforce the same bounds, so they live here - beside the
// Loadout type - rather than being duplicated per entry point.
const (
	MaxLoadoutKeys        = 32
	MaxLoadoutKeyLength   = 128
	MaxLoadoutValueLength = 128
)

// ValidateLoadout rejects a loadout that exceeds the shared size bounds.
func ValidateLoadout(payload map[string]string) error {
	if len(payload) > MaxLoadoutKeys {
		return fmt.Errorf("loadout has too many entries: %d (max %d)", len(payload), MaxLoadoutKeys)
	}
	for key, value := range payload {
		if len(key) > MaxLoadoutKeyLength {
			return fmt.Errorf("loadout key %q exceeds max length %d", key, MaxLoadoutKeyLength)
		}
		if len(value) > MaxLoadoutValueLength {
			return fmt.Errorf("loadout value for key %q exceeds max length %d", key, MaxLoadoutValueLength)
		}
	}
	return nil
}

// Clone returns a defensive copy so a stored loadout cannot be mutated
// through the caller's map after it has been applied to a player.
func (l Loadout) Clone() Loadout {
	if l == nil {
		return nil
	}
	cloned := make(Loadout, len(l))
	for key, value := range l {
		cloned[key] = value
	}
	return cloned
}
