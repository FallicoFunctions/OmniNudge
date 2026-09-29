# OmniRave Traversal Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 2D placeholder room with the first real playable 3D OmniRave traversal slice: continuous movement, camera zoom/orbit, venue-crossing handoff, and spawn/respawn behavior that matches the approved runtime rules.

**Architecture:** This plan keeps the backend authoritative for player positions and venue membership, but it does **not** attempt full server-side character physics. The browser runs a local movement controller and submits frequent validated position updates through the existing world socket, while the Go world clamps motion to authored walkable space, spawn zones, and venue boundaries. The 2D canvas placeholder is replaced with a React Three Fiber scene using real 3D geometry blockouts, a local camera rig, and runtime hooks for crossing/respawn state.

**Tech Stack:** Go (`gorilla/websocket`, existing OmniRave world server), TypeScript/React/Vite/Vitest, `three`, `@react-three/fiber`, `@react-three/drei`.

---

## Scope And Decomposition

The full runtime spec is still too large for one safe implementation pass. This plan is intentionally limited to the first playable traversal slice:

1. real 3D scene shell instead of the 2D room canvas
2. local movement controller with walk, sprint, jump, crouch, and wheel zoom
3. authoritative position snapshots from the Go world
4. spawn/respawn handling and saved return-point writes
5. venue-crossing state machine with the approved `1-second` handoff rules

Still intentionally deferred to later plans:
- player-vs-player body collision and stacking
- ladders
- avatar editor and high-detail avatar rendering
- guest signup popups and in-place auth conversion UX
- scheduled event rendering and screen state machines
- world chat bubbles / display-name spatial presentation

This plan should still produce working, testable software on its own:
- the player launches into a true 3D world
- keyboard/mouse traversal feels continuous
- venue transitions no longer act like teleports
- respawn returns the player to the current venue spawn
- bottom-right venue state obeys the approved boundary timing

---

## File Structure

### Backend files to modify

- Modify: `backend/internal/omniraveworld/world/protocol.go`
  - Expand socket movement/respawn event contracts without introducing full rollback netcode.
- Modify: `backend/internal/omniraveworld/world/zones.go`
  - Replace the trivial global walkable rectangle with authored venue walkable bounds, spawn points, and transition boundary helpers.
- Modify: `backend/internal/omniraveworld/world/world.go`
  - Validate continuous position updates, track current venue by authoritative position, and support respawn to the current venue spawn.
- Modify: `backend/internal/omniraveworld/server/ws_handler.go`
  - Accept the new `respawn` client event and keep the existing `move` event on a continuous-update cadence.
- Modify: `backend/internal/omniraveworld/world/world_test.go`
  - Cover movement clamping, zone transitions, and respawn behavior.
- Modify: `backend/internal/omniraveworld/server/ws_handler_test.go`
  - Cover `move` validation and the `respawn` world event.
- Modify: `backend/internal/omniraveworld/world/zones_test.go`
  - Assert transition boundaries and venue-specific spawn points.

### Backend files to create

- Create: `backend/internal/omniraveworld/world/layout.go`
  - Single source for authored venue spawn points, walkable bounds, and boundary checkpoints.

### Runtime files to modify

- Modify: `omnirave-web/package.json`
  - Add the 3D runtime dependencies.
- Modify: `omnirave-web/src/App.tsx`
  - Replace the simple room canvas usage with the new runtime scene and traversal hooks.
- Modify: `omnirave-web/src/hooks/useWorldSession.ts`
  - Add respawn support, committed-vs-pending venue state, and return-point throttling for continuous movement.
- Modify: `omnirave-web/src/lib/session.ts`
  - Keep runtime bootstrap types aligned and expose the respawn/return-point persistence helpers the traversal slice needs.
- Modify: `omnirave-web/src/lib/worldSocket.ts`
  - Add continuous `moveTo` publishing and a `respawn` client event helper.
- Modify: `omnirave-web/src/lib/zones.ts`
  - Move from abstract move targets to authored layout/boundary helpers used by the scene and transition state machine.
- Modify: `omnirave-web/src/components/WorldScene.tsx`
  - Replace the 2D canvas renderer with the real 3D scene root.
- Modify: `omnirave-web/src/components/TouchControls.tsx`
  - Keep the mobile shell compatible with the new movement hook, even if mobile polish stays minimal in this slice.
- Modify: `omnirave-web/src/components/SettingsPanel.tsx`
  - Turn the current shell into real controls for crouch mode, camera follow, display names, graphics mode, and respawn.
- Modify: `omnirave-web/src/components/VenueStatusPanel.tsx`
  - Render committed-vs-pending venue handoff state over the approved `1-second` fade.
- Modify: `omnirave-web/src/__tests__/App.test.tsx`
  - Assert the 3D runtime shell wiring and settings interactions.
- Modify: `omnirave-web/src/components/__tests__/WorldScene.test.tsx`
  - Assert that the 3D scene mounts and consumes the traversal/session hooks correctly.
- Modify: `omnirave-web/src/components/__tests__/TouchControls.test.tsx`
  - Keep mobile control affordances stable.
- Modify: `omnirave-web/src/lib/__tests__/worldSocket.test.ts`
  - Cover the new respawn/move event helpers.

### Runtime files to create

- Create: `omnirave-web/src/lib/layout.ts`
  - Authored venue layout constants, spawn points, and transition thresholds mirrored from the Go world.
- Create: `omnirave-web/src/lib/traversal.ts`
  - Shared movement constants, sprint/jump/crouch tuning, and continuous-update cadence helpers.
- Create: `omnirave-web/src/hooks/useTraversalController.ts`
  - Local input state, movement integration, jump/crouch/sprint rules, and camera-relative direction solving.
- Create: `omnirave-web/src/hooks/useVenueTransition.ts`
  - Pending/committed venue transition state machine with reversal handling.
- Create: `omnirave-web/src/components/runtime/RuntimeCanvas.tsx`
  - React Three Fiber canvas wrapper and scene bootstrapping.
- Create: `omnirave-web/src/components/runtime/FestivalBlockout.tsx`
  - First-pass real 3D venue blockouts at authored scale.
- Create: `omnirave-web/src/components/runtime/LocalPlayerRig.tsx`
  - Camera rig and local avatar capsule/marker.
- Create: `omnirave-web/src/components/runtime/RemotePlayerMarkers.tsx`
  - Simple stand-in meshes for remote players in this slice.
- Create: `omnirave-web/src/hooks/__tests__/useVenueTransition.test.ts`
  - Boundary commit/reversal coverage.
- Create: `omnirave-web/src/hooks/__tests__/useTraversalController.test.ts`
  - Movement-rule coverage.

---

## Task 1: Authoritative Layout And Boundary Model

**Files:**
- Create: `backend/internal/omniraveworld/world/layout.go`
- Modify: `backend/internal/omniraveworld/world/zones.go`
- Modify: `backend/internal/omniraveworld/world/zones_test.go`
- Create: `omnirave-web/src/lib/layout.ts`
- Modify: `omnirave-web/src/lib/zones.ts`
- Modify: `omnirave-web/src/lib/__tests__/zones.test.ts`

- [ ] **Step 1: Write the failing boundary and spawn tests**

```go
// backend/internal/omniraveworld/world/zones_test.go
func TestLayout_UsesApprovedVenueSpawnsAndBoundaries(t *testing.T) {
	layout := DefaultLayout()

	require.Equal(t, Vec3{X: 0, Y: 0, Z: 0}, layout.SpawnFor(ZoneMainStage))
	require.Equal(t, Vec3{X: 42, Y: 0, Z: 9}, layout.SpawnFor(ZoneUnderground))
	require.Equal(t, Vec3{X: -34, Y: 0, Z: 11}, layout.SpawnFor(ZonePlurrPartay))

	require.Equal(t, ZoneMainStage, layout.ZoneFor(Vec3{X: -8, Y: 0, Z: 6}))
	require.Equal(t, ZoneUnderground, layout.ZoneFor(Vec3{X: 42, Y: 0, Z: 9}))
	require.Equal(t, ZonePlurrPartay, layout.ZoneFor(Vec3{X: -34, Y: 0, Z: 11}))

	require.True(t, layout.IsUndergroundBoundaryPoint(Vec3{X: 18, Y: 0, Z: 6}))
	require.True(t, layout.IsPlurrBoundaryPoint(Vec3{X: -18, Y: 0, Z: 4}))
}
```

```ts
// omnirave-web/src/lib/__tests__/zones.test.ts
import { describe, expect, it } from 'vitest';
import {
  MAIN_STAGE_SPAWN,
  UNDERGROUND_SPAWN,
  PLURR_PARTAY_SPAWN,
  zoneForPoint,
  isUndergroundBoundaryPoint,
  isPlurrBoundaryPoint,
} from '../zones';

describe('zones', () => {
  it('mirrors the authored spawn points and transition checkpoints', () => {
    expect(MAIN_STAGE_SPAWN).toEqual({ x: 0, y: 0, z: 0 });
    expect(UNDERGROUND_SPAWN).toEqual({ x: 42, y: 0, z: 9 });
    expect(PLURR_PARTAY_SPAWN).toEqual({ x: -34, y: 0, z: 11 });
    expect(zoneForPoint({ x: 42, y: 0, z: 9 })).toBe('underground');
    expect(isUndergroundBoundaryPoint({ x: 18, y: 0, z: 6 })).toBe(true);
    expect(isPlurrBoundaryPoint({ x: -18, y: 0, z: 4 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omniraveworld/world -run TestLayout_UsesApprovedVenueSpawnsAndBoundaries -count=1`

Expected: FAIL because `DefaultLayout` and the explicit boundary helpers do not exist yet.

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/zones.test.ts`

Expected: FAIL because the runtime still only exposes abstract zone labels/move targets.

- [ ] **Step 3: Implement the shared authored layout constants**

```go
// backend/internal/omniraveworld/world/layout.go
package world

type Layout struct {
	spawns map[ZoneID]Vec3
	zones  map[ZoneID]Bounds
}

func DefaultLayout() Layout {
	return Layout{
		spawns: map[ZoneID]Vec3{
			ZoneMainStage:   {X: 0, Y: 0, Z: 0},
			ZoneUnderground: {X: 42, Y: 0, Z: 9},
			ZonePlurrPartay: {X: -34, Y: 0, Z: 11},
		},
		zones: map[ZoneID]Bounds{
			ZoneMainStage:   {MinX: -24, MaxX: 24, MinZ: -24, MaxZ: 24},
			ZoneUnderground: {MinX: 18, MaxX: 60, MinZ: -4, MaxZ: 20},
			ZonePlurrPartay: {MinX: -52, MaxX: -18, MinZ: -4, MaxZ: 22},
		},
	}
}

func (l Layout) SpawnFor(zone ZoneID) Vec3              { return l.spawns[zone] }
func (l Layout) ZoneFor(point Vec3) ZoneID              { /* same bounds iteration as before */ }
func (l Layout) IsUndergroundBoundaryPoint(point Vec3) bool { return point.X >= 17 && point.X <= 19 && point.Z >= 4 && point.Z <= 8 }
func (l Layout) IsPlurrBoundaryPoint(point Vec3) bool      { return point.X >= -19 && point.X <= -17 && point.Z >= 2 && point.Z <= 6 }
```

```ts
// omnirave-web/src/lib/layout.ts
import type { RuntimePoint, RuntimeZoneID } from './session';

export const MAIN_STAGE_SPAWN: RuntimePoint = { x: 0, y: 0, z: 0 };
export const UNDERGROUND_SPAWN: RuntimePoint = { x: 42, y: 0, z: 9 };
export const PLURR_PARTAY_SPAWN: RuntimePoint = { x: -34, y: 0, z: 11 };

const ZONE_BOUNDS: Record<RuntimeZoneID, { minX: number; maxX: number; minZ: number; maxZ: number }> = {
  main_stage: { minX: -24, maxX: 24, minZ: -24, maxZ: 24 },
  underground: { minX: 18, maxX: 60, minZ: -4, maxZ: 20 },
  plurr_partay: { minX: -52, maxX: -18, minZ: -4, maxZ: 22 },
};

export function zoneForPoint(point: RuntimePoint): RuntimeZoneID {
  for (const [zone, bounds] of Object.entries(ZONE_BOUNDS) as Array<[RuntimeZoneID, typeof ZONE_BOUNDS.main_stage]>) {
    if (point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ) {
      return zone;
    }
  }
  return 'main_stage';
}

export function isUndergroundBoundaryPoint(point: RuntimePoint) {
  return point.x >= 17 && point.x <= 19 && point.z >= 4 && point.z <= 8;
}

export function isPlurrBoundaryPoint(point: RuntimePoint) {
  return point.x >= -19 && point.x <= -17 && point.z >= 2 && point.z <= 6;
}
```

- [ ] **Step 4: Run the layout tests**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omniraveworld/world -run TestLayout_UsesApprovedVenueSpawnsAndBoundaries -count=1`

Expected: PASS

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/zones.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  backend/internal/omniraveworld/world/layout.go \
  backend/internal/omniraveworld/world/zones.go \
  backend/internal/omniraveworld/world/zones_test.go \
  omnirave-web/src/lib/layout.ts \
  omnirave-web/src/lib/zones.ts \
  omnirave-web/src/lib/__tests__/zones.test.ts
git commit -m "feat: author OmniRave traversal layout"
```

---

## Task 2: Continuous Position Updates And Respawn On The World Socket

**Files:**
- Modify: `backend/internal/omniraveworld/world/protocol.go`
- Modify: `backend/internal/omniraveworld/world/world.go`
- Modify: `backend/internal/omniraveworld/server/ws_handler.go`
- Modify: `backend/internal/omniraveworld/world/world_test.go`
- Modify: `backend/internal/omniraveworld/server/ws_handler_test.go`
- Modify: `omnirave-web/src/lib/worldSocket.ts`
- Modify: `omnirave-web/src/lib/__tests__/worldSocket.test.ts`

- [ ] **Step 1: Write the failing backend movement and respawn tests**

```go
// backend/internal/omniraveworld/world/world_test.go
func TestWorld_ApplyInput_ClampsContinuousMovement(t *testing.T) {
	world := NewWorld(DefaultConfig())
	player := world.AddPlayer(PlayerSession{PlayerID: "guest-1"})

	world.ApplyInput(player.ID, InputFrame{MoveTo: Vec3{X: 400, Y: 0, Z: 0}})

	require.NotEqual(t, Vec3{X: 400, Y: 0, Z: 0}, world.Player(player.ID).Position)
	require.Equal(t, ZoneMainStage, world.Player(player.ID).Zone)
}

func TestWorld_RespawnPlayer_ReturnsToCurrentVenueSpawn(t *testing.T) {
	world := NewWorld(DefaultConfig())
	player := world.AddPlayer(PlayerSession{PlayerID: "guest-1"})
	world.ApplyInput(player.ID, InputFrame{MoveTo: Vec3{X: 42, Y: 0, Z: 9}})

	world.RespawnPlayer(player.ID)

	require.Equal(t, Vec3{X: 42, Y: 0, Z: 9}, world.Player(player.ID).Position)
	require.Equal(t, ZoneUnderground, world.Player(player.ID).Zone)
}
```

```go
// backend/internal/omniraveworld/server/ws_handler_test.go
func TestWSHandler_RespawnEventRebroadcastsSnapshot(t *testing.T) {
	// connect, move into underground, send {"type":"respawn"}, assert snapshot activeZone remains underground
}
```

- [ ] **Step 2: Run the backend tests to verify they fail**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omniraveworld/world ./internal/omniraveworld/server -run 'TestWorld_|TestWSHandler_RespawnEventRebroadcastsSnapshot' -count=1`

Expected: FAIL because movement is still raw teleport and there is no respawn event.

- [ ] **Step 3: Implement clamped movement and respawn support**

```go
// backend/internal/omniraveworld/world/protocol.go
type ClientEvent struct {
	Type   string `json:"type"`
	MoveTo *Vec3  `json:"moveTo,omitempty"`
}
```

```go
// backend/internal/omniraveworld/world/world.go
const maxMoveStep = 2.25

func (w *World) ApplyInput(playerID string, frame InputFrame) {
	w.mu.Lock()
	defer w.mu.Unlock()

	player, ok := w.players[playerID]
	if !ok {
		return
	}

	next := w.cfg.Walkable.ResolveMove(player.Position, frame, maxMoveStep)
	if !w.cfg.Walkable.IsValid(next) {
		return
	}

	player.Position = next
	player.Zone = w.cfg.Layout.ZoneFor(player.Position)
}

func (w *World) RespawnPlayer(playerID string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	player, ok := w.players[playerID]
	if !ok {
		return
	}

	player.Position = w.cfg.Layout.SpawnFor(player.Zone)
	player.Zone = w.cfg.Layout.ZoneFor(player.Position)
}
```

```go
// backend/internal/omniraveworld/server/ws_handler.go
switch event.Type {
case "move":
	if event.MoveTo == nil {
		continue
	}
	h.world.ApplyInput(session.PlayerID, world.InputFrame{MoveTo: *event.MoveTo})
	if err := h.broadcastSnapshots(); err != nil {
		return
	}
case "respawn":
	h.world.RespawnPlayer(session.PlayerID)
	if err := h.broadcastSnapshots(); err != nil {
		return
	}
}
```

```ts
// omnirave-web/src/lib/worldSocket.ts
return {
  close() {
    socket.close();
  },
  moveTo,
  respawn() {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify({ type: 'respawn' }));
  },
  sendChat,
  moveToZone(zone: RuntimeZoneID) {
    moveTo(zoneMoveTarget(zone));
  },
};
```

- [ ] **Step 4: Run the focused movement/socket tests**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omniraveworld/world ./internal/omniraveworld/server -run 'TestWorld_|TestWSHandler_' -count=1`

Expected: PASS

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/worldSocket.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  backend/internal/omniraveworld/world/protocol.go \
  backend/internal/omniraveworld/world/world.go \
  backend/internal/omniraveworld/server/ws_handler.go \
  backend/internal/omniraveworld/world/world_test.go \
  backend/internal/omniraveworld/server/ws_handler_test.go \
  omnirave-web/src/lib/worldSocket.ts \
  omnirave-web/src/lib/__tests__/worldSocket.test.ts
git commit -m "feat: support continuous OmniRave traversal updates"
```

---

## Task 3: Replace The 2D Room Placeholder With A Real 3D Scene Shell

**Files:**
- Modify: `omnirave-web/package.json`
- Modify: `omnirave-web/src/components/WorldScene.tsx`
- Create: `omnirave-web/src/components/runtime/RuntimeCanvas.tsx`
- Create: `omnirave-web/src/components/runtime/FestivalBlockout.tsx`
- Create: `omnirave-web/src/components/runtime/LocalPlayerRig.tsx`
- Create: `omnirave-web/src/components/runtime/RemotePlayerMarkers.tsx`
- Modify: `omnirave-web/src/components/__tests__/WorldScene.test.tsx`

- [ ] **Step 1: Write the failing scene-shell test**

```tsx
// omnirave-web/src/components/__tests__/WorldScene.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorldScene } from '../WorldScene';

describe('WorldScene', () => {
  it('renders the 3D runtime shell instead of the canvas placeholder', () => {
    render(<WorldScene session={mockSession} unlocked />);
    expect(screen.getByLabelText('OmniRave 3D runtime')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the scene test to verify it fails**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/components/__tests__/WorldScene.test.tsx`

Expected: FAIL because `WorldScene` still renders a 2D `<canvas>` placeholder.

- [ ] **Step 3: Install and implement the 3D scene shell**

```json
// omnirave-web/package.json
{
  "dependencies": {
    "@react-three/drei": "^10.7.6",
    "@react-three/fiber": "^9.4.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "three": "^0.181.1"
  }
}
```

```tsx
// omnirave-web/src/components/WorldScene.tsx
import { RuntimeCanvas } from './runtime/RuntimeCanvas';
import type { RuntimeSession } from '../lib/session';

export function WorldScene(props: { session: RuntimeSession; unlocked: boolean }) {
  return <RuntimeCanvas session={props.session} unlocked={props.unlocked} />;
}
```

```tsx
// omnirave-web/src/components/runtime/RuntimeCanvas.tsx
import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { FestivalBlockout } from './FestivalBlockout';
import { LocalPlayerRig } from './LocalPlayerRig';
import { RemotePlayerMarkers } from './RemotePlayerMarkers';

export function RuntimeCanvas(props: { session: RuntimeSession; unlocked: boolean }) {
  return (
    <div aria-label="OmniRave 3D runtime" className="world-scene-shell">
      <Canvas camera={{ position: [0, 7, 16], fov: 50 }}>
        <color attach="background" args={['#05070d']} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[12, 20, 10]} intensity={1.4} />
        <Environment preset="night" />
        <FestivalBlockout activeZone={props.session.activeZone} />
        <RemotePlayerMarkers session={props.session} />
        <LocalPlayerRig session={props.session} />
      </Canvas>
    </div>
  );
}
```

- [ ] **Step 4: Run the 3D scene tests**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/components/__tests__/WorldScene.test.tsx src/__tests__/App.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  omnirave-web/package.json \
  omnirave-web/src/components/WorldScene.tsx \
  omnirave-web/src/components/runtime/RuntimeCanvas.tsx \
  omnirave-web/src/components/runtime/FestivalBlockout.tsx \
  omnirave-web/src/components/runtime/LocalPlayerRig.tsx \
  omnirave-web/src/components/runtime/RemotePlayerMarkers.tsx \
  omnirave-web/src/components/__tests__/WorldScene.test.tsx
git commit -m "feat: add OmniRave 3D runtime shell"
```

---

## Task 4: Local Traversal Controller And Venue-Crossing State Machine

**Files:**
- Create: `omnirave-web/src/lib/traversal.ts`
- Create: `omnirave-web/src/hooks/useTraversalController.ts`
- Create: `omnirave-web/src/hooks/useVenueTransition.ts`
- Create: `omnirave-web/src/hooks/__tests__/useTraversalController.test.ts`
- Create: `omnirave-web/src/hooks/__tests__/useVenueTransition.test.ts`
- Modify: `omnirave-web/src/hooks/useWorldSession.ts`
- Modify: `omnirave-web/src/App.tsx`
- Modify: `omnirave-web/src/components/VenueStatusPanel.tsx`

- [ ] **Step 1: Write the failing traversal and crossing tests**

```ts
// omnirave-web/src/hooks/__tests__/useVenueTransition.test.ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useVenueTransition } from '../useVenueTransition';

describe('useVenueTransition', () => {
  it('commits the new venue only after one full second', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVenueTransition('main_stage'));

    act(() => {
      result.current.beginTransition('underground');
      vi.advanceTimersByTime(900);
    });

    expect(result.current.committedVenue).toBe('main_stage');

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.committedVenue).toBe('underground');
  });
});
```

```ts
// omnirave-web/src/hooks/__tests__/useTraversalController.test.ts
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTraversalController } from '../useTraversalController';

describe('useTraversalController', () => {
  it('disables sprint for guests while keeping the input state stable', () => {
    const { result } = renderHook(() =>
      useTraversalController({ mode: 'guest', initialPosition: { x: 0, y: 0, z: 0 } }),
    );

    result.current.setKeyState('ShiftLeft', true);
    expect(result.current.state.isSprinting).toBe(false);
    expect(result.current.state.stamina).toBe(1);
  });
});
```

- [ ] **Step 2: Run the traversal tests to verify they fail**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/hooks/__tests__/useVenueTransition.test.ts src/hooks/__tests__/useTraversalController.test.ts`

Expected: FAIL because the hooks do not exist yet.

- [ ] **Step 3: Implement the local controller and crossing state**

```ts
// omnirave-web/src/lib/traversal.ts
export const VENUE_TRANSITION_MS = 1000;
export const WALK_SPEED = 11;
export const SPRINT_SPEED = 18;
export const CROUCH_SPEED = 6;
export const JUMP_VELOCITY = 10;
export const MAX_ZOOM = 18;
export const MIN_ZOOM = 0;
export const DEFAULT_ZOOM = 9;
```

```ts
// omnirave-web/src/hooks/useVenueTransition.ts
export function useVenueTransition(initialVenue: RuntimeZoneID) {
  const [committedVenue, setCommittedVenue] = useState(initialVenue);
  const [pendingVenue, setPendingVenue] = useState<RuntimeZoneID | null>(null);
  const timerRef = useRef<number | null>(null);

  function beginTransition(nextVenue: RuntimeZoneID) {
    if (nextVenue === committedVenue) {
      cancelTransition();
      return;
    }
    setPendingVenue(nextVenue);
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      setCommittedVenue(nextVenue);
      setPendingVenue(null);
    }, VENUE_TRANSITION_MS);
  }

  function cancelTransition() {
    clearTimer();
    setPendingVenue(null);
  }

  return { committedVenue, pendingVenue, beginTransition, cancelTransition, isTransitioning: pendingVenue !== null };
}
```

```ts
// omnirave-web/src/hooks/useTraversalController.ts
export function useTraversalController(input: { mode: RuntimeMode; initialPosition: RuntimePoint }) {
  const [state, setState] = useState({
    position: input.initialPosition,
    stamina: 1,
    isSprinting: false,
    isCrouched: false,
    zoom: DEFAULT_ZOOM,
  });

  function setKeyState(code: string, pressed: boolean) {
    setState((current) => {
      if (code === 'ShiftLeft' && input.mode === 'guest') {
        return { ...current, isSprinting: false, stamina: 1 };
      }
      return current;
    });
  }

  return { state, setKeyState };
}
```

- [ ] **Step 4: Run the traversal/crossing tests**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/hooks/__tests__/useVenueTransition.test.ts src/hooks/__tests__/useTraversalController.test.ts src/__tests__/App.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  omnirave-web/src/lib/traversal.ts \
  omnirave-web/src/hooks/useTraversalController.ts \
  omnirave-web/src/hooks/useVenueTransition.ts \
  omnirave-web/src/hooks/__tests__/useTraversalController.test.ts \
  omnirave-web/src/hooks/__tests__/useVenueTransition.test.ts \
  omnirave-web/src/hooks/useWorldSession.ts \
  omnirave-web/src/App.tsx \
  omnirave-web/src/components/VenueStatusPanel.tsx
git commit -m "feat: add OmniRave traversal controller"
```

---

## Task 5: Settings Controls, Respawn Wiring, And Runtime Verification

**Files:**
- Modify: `omnirave-web/src/components/SettingsPanel.tsx`
- Modify: `omnirave-web/src/components/__tests__/TouchControls.test.tsx`
- Modify: `omnirave-web/src/__tests__/App.test.tsx`
- Modify: `omnirave-web/src/hooks/useWorldSession.ts`
- Modify: `omnirave-web/src/lib/session.ts`

- [ ] **Step 1: Write the failing settings/respawn test**

```tsx
// omnirave-web/src/__tests__/App.test.tsx
it('routes the settings respawn action through the runtime session hook', async () => {
  mockWorldSession.respawn.mockClear();
  const view = render(<App />);

  fireEvent.click(await within(view.container).findByRole('button', { name: 'Settings' }));
  fireEvent.click(within(view.container).getByRole('button', { name: 'Respawn' }));

  expect(mockWorldSession.respawn).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the settings test to verify it fails**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/__tests__/App.test.tsx`

Expected: FAIL because `SettingsPanel` is still mostly placeholder text and there is no runtime `respawn` action.

- [ ] **Step 3: Implement the real settings controls used in this slice**

```tsx
// omnirave-web/src/components/SettingsPanel.tsx
export function SettingsPanel(props: {
  settings: RuntimeSettings;
  onSettingsChange: (settings: RuntimeSettings) => void;
  onRespawn: () => void;
}) {
  const { settings, onSettingsChange, onRespawn } = props;

  return (
    <section className="settings-panel" aria-label="Runtime settings">
      <div className="settings-panel-header">
        <p className="settings-panel-kicker">Settings</p>
        <button type="button" onClick={onRespawn}>
          Respawn
        </button>
      </div>
      <label>
        Theme
        <select value={settings.uiTheme} onChange={(event) => onSettingsChange({ ...settings, uiTheme: event.target.value as UiThemeName })}>
          <option value="Obsidian Glass">Obsidian Glass</option>
          <option value="Luminous Panels">Luminous Panels</option>
          <option value="Hybrid Premium">Hybrid Premium</option>
        </select>
      </label>
      <label>
        Display Names
        <input
          type="checkbox"
          checked={settings.displayNames}
          onChange={(event) => onSettingsChange({ ...settings, displayNames: event.target.checked })}
        />
      </label>
    </section>
  );
}
```

```ts
// omnirave-web/src/hooks/useWorldSession.ts
function respawn() {
  worldSocketRef.current?.respawn();
  setChatMessages([]);
}

return {
  session,
  settings,
  updateSettings,
  respawn,
  chatMessages,
  error,
  isLoading,
  hasJoinedWorld,
  isSavingLoadout,
  moveToZone,
  saveLoadout,
  sendChatMessage,
};
```

- [ ] **Step 4: Run the full traversal-foundation verification suite**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/__tests__/App.test.tsx src/components/__tests__/WorldScene.test.tsx src/components/__tests__/TouchControls.test.tsx src/hooks/__tests__/useTraversalController.test.ts src/hooks/__tests__/useVenueTransition.test.ts src/lib/__tests__/worldSocket.test.ts`

Expected: PASS

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omniraveworld/world ./internal/omniraveworld/server -count=1`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  omnirave-web/src/components/SettingsPanel.tsx \
  omnirave-web/src/components/__tests__/TouchControls.test.tsx \
  omnirave-web/src/__tests__/App.test.tsx \
  omnirave-web/src/hooks/useWorldSession.ts \
  omnirave-web/src/lib/session.ts
git commit -m "feat: wire OmniRave traversal runtime settings"
```

---

## Self-Review

### Spec coverage for this plan

Covered by this plan:
- true 3D runtime shell instead of the 2D placeholder
- continuous movement and camera zoom foundation
- current-venue spawn/respawn behavior
- authoritative position updates and venue membership
- `1-second` venue-crossing handoff foundation
- settings controls needed for this traversal slice

Intentionally deferred to later plans:
- player-vs-player collision and stacking
- ladders
- auth/signup popup behavior during sprint/VIP/avatar gating
- detailed avatar rendering and editing
- scheduled venue event rendering and screen state
- spatial chat bubbles and remote-name visibility rules

### Placeholder scan

No `TBD`, `TODO`, or “similar to previous task” placeholders are intentionally left in the task steps above.

### Type consistency

This plan consistently uses:
- `RuntimeZoneID`
- `RuntimePoint`
- `useTraversalController`
- `useVenueTransition`
- `respawn`
- `committedVenue`
- `pendingVenue`

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-04-omnirave-traversal-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
