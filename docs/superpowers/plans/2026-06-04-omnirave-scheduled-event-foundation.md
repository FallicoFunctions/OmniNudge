# OmniRave Scheduled Event Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first authoritative scheduled-event system for OmniRave so each venue exposes the correct `lead_in`, `active`, and `recovery` event state at the right real-world times, and the runtime visibly reacts through the stage screen and lightweight world atmosphere.

**Architecture:** Keep the schedule authoritative on the backend so all players in a venue see the same event phase at the same time. The first rendering slice should stay pragmatic: encode event timing and payloads once, feed them into both session bootstrap and world snapshots, then let the React runtime express them through stage-screen modes and simple world-scene visual shifts rather than attempting the full fireworks/collapse/psychedelic simulation in one pass.

**Tech Stack:** Go (`omniraveworld`, `omnigame/session_service`, websocket snapshot handlers), TypeScript/React/Vite/Vitest, existing OmniRave runtime session/bootstrap/socket types, `three` / `@react-three/fiber`.

---

## Scope And Decomposition

This slice intentionally stops short of the final spectacle implementation. It covers:

1. authoritative per-venue event schedule state on the backend
2. runtime payload support for event state in both launch bootstrap and websocket snapshots
3. frontend event typing and state propagation
4. stage-screen rendering that changes by venue, phase, and countdown state
5. lightweight world-atmosphere changes in the existing blockout scene

Still explicitly deferred:
- full fireworks particles, sky text, and stage pyro
- Underground debris impacts / respawn hazards
- P.L.U.R.R. floor-paint, wall-wave, and particle swarm spectacle
- global/local chat announcements for event timing
- venue-specific audio FX layers beyond the already authoritative music sync

The result should still be real, testable software:
- the server reports the correct event phase from the global clock
- bootstrap and live snapshots agree on the current event state
- the stage screen visibly changes at `:00`, `:30`, and `:45`
- the world scene reacts to those event states in a synchronized way

---

## File Structure

### Backend files to create

- Create: `backend/internal/omniraveworld/world/event_schedule.go`
  - Own the authoritative per-venue schedule calculation and event-phase payload shaping.
- Create: `backend/internal/omniraveworld/world/event_schedule_test.go`
  - Cover exact `lead_in`, `active`, `recovery`, and `none` transitions against fixed timestamps.

### Backend files to modify

- Modify: `backend/internal/omniraveworld/world/protocol.go`
  - Add event-state payload types to world snapshots.
- Modify: `backend/internal/omniraveworld/world/world.go`
  - Include event-state snapshots in `SnapshotForPlayer`.
- Modify: `backend/internal/omniraveworld/server/ws_handler.go`
  - Thread the current authoritative event state into every emitted world snapshot.
- Modify: `backend/internal/omniraveworld/server/ws_handler_test.go`
  - Assert websocket snapshots now include event state.
- Modify: `backend/internal/omnigame/model/types.go`
  - Add runtime bootstrap response types for event state.
- Modify: `backend/internal/omnigame/service/session_service.go`
  - Include current event state in session bootstrap responses.
- Modify: `backend/internal/omnigame/service/session_service_test.go`
  - Cover event-state shaping in guest/account bootstrap.

### Frontend files to create

- Create: `omnirave-web/src/lib/events.ts`
  - Shared frontend event typings and small presentation helpers.
- Create: `omnirave-web/src/lib/__tests__/events.test.ts`
  - Cover frontend helper formatting for countdowns and venue-specific labels.

### Frontend files to modify

- Modify: `omnirave-web/src/lib/session.ts`
  - Add runtime bootstrap event-state types.
- Modify: `omnirave-web/src/lib/protocol.ts`
  - Add live world-snapshot event-state types.
- Modify: `omnirave-web/src/lib/worldSocket.ts`
  - Preserve event-state snapshots without loss.
- Modify: `omnirave-web/src/lib/__tests__/session.test.ts`
  - Cover event-state bootstrap parsing.
- Modify: `omnirave-web/src/lib/__tests__/worldSocket.test.ts`
  - Cover event-state snapshot preservation.
- Modify: `omnirave-web/src/components/StageScreen.tsx`
  - Render venue-aware event modes instead of a static generic card.
- Modify: `omnirave-web/src/components/runtime/FestivalBlockout.tsx`
  - Apply simple phase-based atmosphere changes from event state.
- Modify: `omnirave-web/src/components/WorldScene.tsx`
  - Thread event state into the runtime blockout scene.
- Modify: `omnirave-web/src/components/__tests__/WorldScene.test.tsx`
  - Assert event state is threaded into the runtime scene.
- Modify: `omnirave-web/src/__tests__/App.test.tsx`
  - Assert stage screen event presentation for at least one active event case.

---

## Task 1: Add Authoritative Venue Event Scheduling

**Files:**
- Create: `backend/internal/omniraveworld/world/event_schedule.go`
- Create: `backend/internal/omniraveworld/world/event_schedule_test.go`
- Modify: `backend/internal/omniraveworld/world/protocol.go`

- [ ] **Step 1: Write the failing backend schedule tests**

```go
// backend/internal/omniraveworld/world/event_schedule_test.go
func TestEventSchedule_MainStageLeadInAndActive(t *testing.T) {
	schedule := NewEventSchedule()

	leadIn := time.Date(2026, 6, 4, 14, 59, 52, 0, time.UTC)
	active := time.Date(2026, 6, 4, 15, 1, 0, 0, time.UTC)

	mainLead := schedule.StateFor(ZoneMainStage, leadIn)
	mainActive := schedule.StateFor(ZoneMainStage, active)

	require.Equal(t, EventPhaseLeadIn, mainLead.Phase)
	require.Equal(t, int64(8), mainLead.CountdownSeconds)
	require.Equal(t, EventPhaseActive, mainActive.Phase)
}

func TestEventSchedule_UndergroundAndPlurrWindows(t *testing.T) {
	schedule := NewEventSchedule()

	underground := schedule.StateFor(ZoneUnderground, time.Date(2026, 6, 4, 15, 31, 0, 0, time.UTC))
	plurrLead := schedule.StateFor(ZonePlurrPartay, time.Date(2026, 6, 4, 15, 44, 50, 0, time.UTC))

	require.Equal(t, EventPhaseActive, underground.Phase)
	require.Equal(t, EventPhaseLeadIn, plurrLead.Phase)
}
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omniraveworld/world -run 'TestEventSchedule_' -count=1`

Expected: FAIL because the schedule type and event payloads do not exist yet.

- [ ] **Step 3: Add the backend event schedule model**

```go
// backend/internal/omniraveworld/world/event_schedule.go
type EventPhase string

const (
	EventPhaseNone     EventPhase = "none"
	EventPhaseLeadIn   EventPhase = "lead_in"
	EventPhaseActive   EventPhase = "active"
	EventPhaseRecovery EventPhase = "recovery"
)

type ZoneEventState struct {
	ZoneID            ZoneID      `json:"zoneId"`
	Phase             EventPhase  `json:"phase"`
	EventName         string      `json:"eventName"`
	CountdownSeconds  int64       `json:"countdownSeconds,omitempty"`
	RecoverySeconds   int64       `json:"recoverySeconds,omitempty"`
	ActiveMinute      int         `json:"activeMinute,omitempty"`
}
```

```go
// backend/internal/omniraveworld/world/event_schedule.go
func (s EventSchedule) StateFor(zone ZoneID, now time.Time) ZoneEventState {
	// Main Stage: :59:50 lead-in, :00-:02:59 active, :03:00-:03:04 recovery
	// Underground: :30-:32:59 active, :33:00-:33:04 recovery
	// P.L.U.R.R.: :44:45 lead-in, :45-:47:59 active, :48:00-:48:09 recovery
}
```

- [ ] **Step 4: Add snapshot payload support**

```go
// backend/internal/omniraveworld/world/protocol.go
type Snapshot struct {
	Players         []*Player         `json:"players"`
	ZoneMedia       []ZoneMediaState  `json:"zoneMedia,omitempty"`
	ZoneEvents      []ZoneEventState  `json:"zoneEvents,omitempty"`
	CurrentPlayerID string            `json:"currentPlayerId,omitempty"`
	ActiveZone      ZoneID            `json:"activeZone"`
}
```

- [ ] **Step 5: Re-run the focused schedule test**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omniraveworld/world -run 'TestEventSchedule_' -count=1`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave
git add backend/internal/omniraveworld/world/event_schedule.go \
  backend/internal/omniraveworld/world/event_schedule_test.go \
  backend/internal/omniraveworld/world/protocol.go
git commit -m "feat: add OmniRave venue event schedule"
```

---

## Task 2: Thread Event State Through Bootstrap And World Snapshots

**Files:**
- Modify: `backend/internal/omniraveworld/world/world.go`
- Modify: `backend/internal/omniraveworld/server/ws_handler.go`
- Modify: `backend/internal/omniraveworld/server/ws_handler_test.go`
- Modify: `backend/internal/omnigame/model/types.go`
- Modify: `backend/internal/omnigame/service/session_service.go`
- Modify: `backend/internal/omnigame/service/session_service_test.go`
- Modify: `omnirave-web/src/lib/session.ts`
- Modify: `omnirave-web/src/lib/protocol.ts`
- Modify: `omnirave-web/src/lib/worldSocket.ts`
- Modify: `omnirave-web/src/lib/__tests__/session.test.ts`
- Modify: `omnirave-web/src/lib/__tests__/worldSocket.test.ts`

- [ ] **Step 1: Write the failing payload tests**

```go
// backend/internal/omnigame/service/session_service_test.go
func TestBuildGuestRuntimeResponseIncludesZoneEvents(t *testing.T) {
	service := NewSessionService("http://runtime", "ws://world")
	response, err := service.BuildRuntimeGuestLogout(context.Background(), "main_stage")
	require.NoError(t, err)
	require.NotEmpty(t, response.ZoneEvents)
}
```

```ts
// omnirave-web/src/lib/__tests__/worldSocket.test.ts
it('preserves authoritative zone event state from snapshots', () => {
  const next = applyWorldSnapshot(baseSession, {
    type: 'world_snapshot',
    currentPlayerId: 'guest-42',
    activeZone: 'main_stage',
    players: [],
    zoneMedia: [],
    zoneEvents: [{ zoneId: 'main_stage', phase: 'lead_in', eventName: 'fireworks', countdownSeconds: 9 }],
  });

  expect(next.zoneEvents?.[0].phase).toBe('lead_in');
});
```

- [ ] **Step 2: Run the focused backend/frontend tests to verify failure**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omnigame/service ./internal/omniraveworld/server -run 'ZoneEvents|Snapshot' -count=1`

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/session.test.ts src/lib/__tests__/worldSocket.test.ts`

Expected: FAIL because runtime payloads do not expose `zoneEvents`.

- [ ] **Step 3: Add backend response and snapshot plumbing**

```go
// backend/internal/omnigame/model/types.go
type SessionExchangeResponse struct {
	// existing fields...
	ZoneEvents []ZoneEventState `json:"zoneEvents,omitempty"`
}
```

```go
// backend/internal/omnigame/service/session_service.go
func (s *SessionService) currentZoneEvents() []model.ZoneEventState {
	return modelZoneEventsFromWorld(NewEventSchedule().Snapshot(s.now()))
}
```

```go
// backend/internal/omniraveworld/world/world.go
func (w *World) SnapshotForPlayer(playerID string, zoneMedia []ZoneMediaState, zoneEvents []ZoneEventState) Snapshot {
	// include zoneEvents alongside players and zoneMedia
}
```

- [ ] **Step 4: Add frontend event types**

```ts
// omnirave-web/src/lib/session.ts
export type RuntimeEventPhase = 'none' | 'lead_in' | 'active' | 'recovery';

export interface RuntimeZoneEvent {
  zoneId: RuntimeZoneID;
  phase: RuntimeEventPhase;
  eventName: string;
  countdownSeconds?: number;
  recoverySeconds?: number;
  activeMinute?: number;
}
```

```ts
// omnirave-web/src/lib/protocol.ts
export interface WorldSnapshotMessage {
  type: 'world_snapshot';
  currentPlayerId: string;
  activeZone: RuntimeZoneID;
  players: RuntimePlayer[];
  zoneMedia: RuntimeZoneMedia[];
  zoneEvents: RuntimeZoneEvent[];
}
```

- [ ] **Step 5: Re-run the focused payload tests**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omnigame/service ./internal/omniraveworld/server -run 'ZoneEvents|Snapshot' -count=1`

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/session.test.ts src/lib/__tests__/worldSocket.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave
git add backend/internal/omniraveworld/world/world.go \
  backend/internal/omniraveworld/server/ws_handler.go \
  backend/internal/omniraveworld/server/ws_handler_test.go \
  backend/internal/omnigame/model/types.go \
  backend/internal/omnigame/service/session_service.go \
  backend/internal/omnigame/service/session_service_test.go \
  omnirave-web/src/lib/session.ts \
  omnirave-web/src/lib/protocol.ts \
  omnirave-web/src/lib/worldSocket.ts \
  omnirave-web/src/lib/__tests__/session.test.ts \
  omnirave-web/src/lib/__tests__/worldSocket.test.ts
git commit -m "feat: expose OmniRave zone event state"
```

---

## Task 3: Render Event-Aware Stage Screens

**Files:**
- Create: `omnirave-web/src/lib/events.ts`
- Create: `omnirave-web/src/lib/__tests__/events.test.ts`
- Modify: `omnirave-web/src/components/StageScreen.tsx`
- Modify: `omnirave-web/src/__tests__/App.test.tsx`

- [ ] **Step 1: Write the failing stage-screen tests**

```ts
// omnirave-web/src/lib/__tests__/events.test.ts
it('formats the main-stage lead-in countdown copy', () => {
  expect(formatZoneEventHeadline({
    zoneId: 'main_stage',
    phase: 'lead_in',
    eventName: 'fireworks',
    countdownSeconds: 10,
  })).toContain('Fireworks begin in');
});
```

```tsx
// omnirave-web/src/__tests__/App.test.tsx
it('shows the fireworks countdown on the stage screen during main-stage lead-in', async () => {
  mockWorldSession.session.zoneEvents = [
    { zoneId: 'main_stage', phase: 'lead_in', eventName: 'fireworks', countdownSeconds: 10 },
  ];

  render(<App />);

  expect(await screen.findByText('Fireworks begin in')).toBeInTheDocument();
  expect(screen.getByText('10')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused frontend tests to verify failure**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/events.test.ts src/__tests__/App.test.tsx`

Expected: FAIL because the runtime has no event presentation helpers or event-aware stage screen.

- [ ] **Step 3: Add frontend event presentation helpers**

```ts
// omnirave-web/src/lib/events.ts
export function activeZoneEvent(session: RuntimeSession): RuntimeZoneEvent | null {
  return session.zoneEvents?.find((entry) => entry.zoneId === session.activeZone) ?? null;
}

export function formatZoneEventHeadline(event: RuntimeZoneEvent): string {
  // main_stage fireworks copy
  // underground collapse copy
  // plurr_partay PLURR lead-in copy
}
```

- [ ] **Step 4: Make `StageScreen` event-aware**

```tsx
// omnirave-web/src/components/StageScreen.tsx
const event = activeZoneEvent(session);

if (event?.phase === 'lead_in' && event.zoneId === 'main_stage') {
  return (
    <section className="stage-screen stage-screen-event stage-screen-fireworks-lead">
      <div className="stage-card">
        <p className="stage-kicker">Main Stage</p>
        <h2 className="stage-title">Fireworks begin in</h2>
        <p className="stage-countdown">{event.countdownSeconds}</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Re-run the focused stage-screen tests**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/events.test.ts src/__tests__/App.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave
git add omnirave-web/src/lib/events.ts \
  omnirave-web/src/lib/__tests__/events.test.ts \
  omnirave-web/src/components/StageScreen.tsx \
  omnirave-web/src/__tests__/App.test.tsx
git commit -m "feat: render OmniRave stage event screens"
```

---

## Task 4: Add Lightweight World Atmosphere Reactions

**Files:**
- Modify: `omnirave-web/src/components/runtime/FestivalBlockout.tsx`
- Modify: `omnirave-web/src/components/WorldScene.tsx`
- Modify: `omnirave-web/src/components/__tests__/WorldScene.test.tsx`

- [ ] **Step 1: Write the failing world-atmosphere test**

```tsx
// omnirave-web/src/components/__tests__/WorldScene.test.tsx
it('threads active zone event state into the runtime blockout scene', () => {
  render(<WorldScene session={sessionWithUndergroundEvent} unlocked={true} />);
  expect(festivalBlockoutSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      zoneEvent: { zoneId: 'underground', phase: 'active', eventName: 'collapse' },
    }),
  );
});
```

- [ ] **Step 2: Run the focused test to verify failure**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/components/__tests__/WorldScene.test.tsx`

Expected: FAIL because `FestivalBlockout` does not accept event state.

- [ ] **Step 3: Add event-driven blockout presentation**

```tsx
// omnirave-web/src/components/runtime/FestivalBlockout.tsx
export function FestivalBlockout(props: {
  activeZone: RuntimeZoneID;
  unlocked: boolean;
  zoneEvent?: RuntimeZoneEvent | null;
}) {
  const disasterMode = props.zoneEvent?.zoneId === 'underground' && props.zoneEvent.phase === 'active';
  const fireworksMode = props.zoneEvent?.zoneId === 'main_stage' && props.zoneEvent.phase !== 'none';
  const plurrMode = props.zoneEvent?.zoneId === 'plurr_partay' && props.zoneEvent.phase !== 'none';

  // boost emissive / swap palette / tighten fog depending on active event mode
}
```

- [ ] **Step 4: Thread the active zone event into `WorldScene`**

```tsx
// omnirave-web/src/components/WorldScene.tsx
const zoneEvent = session.zoneEvents?.find((entry) => entry.zoneId === session.activeZone) ?? null;

<FestivalBlockout
  activeZone={session.activeZone}
  unlocked={unlocked}
  zoneEvent={zoneEvent}
/>
```

- [ ] **Step 5: Re-run the focused world-scene test**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/components/__tests__/WorldScene.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave
git add omnirave-web/src/components/runtime/FestivalBlockout.tsx \
  omnirave-web/src/components/WorldScene.tsx \
  omnirave-web/src/components/__tests__/WorldScene.test.tsx
git commit -m "feat: react to OmniRave event phases in world scene"
```

---

## Task 5: Full Verification And Review Pass

**Files:**
- Modify only if verification finds a real defect in the files above.

- [ ] **Step 1: Run the focused backend suite**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omniraveworld/world ./internal/omniraveworld/server ./internal/omnigame/service -count=1`

Expected: PASS

- [ ] **Step 2: Run the focused frontend suite**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/session.test.ts src/lib/__tests__/worldSocket.test.ts src/lib/__tests__/events.test.ts src/components/__tests__/WorldScene.test.tsx src/__tests__/App.test.tsx`

Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm run build`

Expected: PASS, with only the existing non-blocking Vite chunk warning.

- [ ] **Step 4: Review the slice against the approved runtime rules**

Check explicitly:

- only one authoritative event phase per venue at a time
- `Main Stage` uses a `10-second` lead-in before the top of the hour
- `Underground` has no lead-in and begins immediately at `:30`
- `P.L.U.R.R. Partay` has a brief non-numeric lead-in before `:45`
- post-event recovery exists for `Main Stage`, `Underground`, and `P.L.U.R.R.`
- bootstrap and live snapshots expose the same event state shape
- stage-screen copy changes by venue and event phase
- world-atmosphere changes are synchronized to the active venue event state

- [ ] **Step 5: Commit verification-only fixes if needed**

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave
git add backend/internal/omniraveworld/world/event_schedule.go \
  backend/internal/omniraveworld/world/event_schedule_test.go \
  backend/internal/omniraveworld/world/protocol.go \
  backend/internal/omniraveworld/world/world.go \
  backend/internal/omniraveworld/server/ws_handler.go \
  backend/internal/omniraveworld/server/ws_handler_test.go \
  backend/internal/omnigame/model/types.go \
  backend/internal/omnigame/service/session_service.go \
  backend/internal/omnigame/service/session_service_test.go \
  omnirave-web/src/lib/session.ts \
  omnirave-web/src/lib/protocol.ts \
  omnirave-web/src/lib/worldSocket.ts \
  omnirave-web/src/lib/events.ts \
  omnirave-web/src/lib/__tests__/events.test.ts \
  omnirave-web/src/lib/__tests__/session.test.ts \
  omnirave-web/src/lib/__tests__/worldSocket.test.ts \
  omnirave-web/src/components/StageScreen.tsx \
  omnirave-web/src/components/runtime/FestivalBlockout.tsx \
  omnirave-web/src/components/WorldScene.tsx \
  omnirave-web/src/components/__tests__/WorldScene.test.tsx \
  omnirave-web/src/__tests__/App.test.tsx
git commit -m "test: verify OmniRave scheduled event foundation"
```

---

## Self-Review

### Spec Coverage Check

This plan covers the next highest-value approved event behavior without pretending to finish the entire spectacle stack:

- server-authoritative venue event timing: Task 1
- bootstrap + live snapshot event-state parity: Task 2
- venue-specific stage-screen event presentation: Task 3
- synchronized world-atmosphere response: Task 4

Explicitly deferred:
- full fireworks/debris/psychedelic geometry simulation
- event chat announcements
- advanced audio hallucination/disaster layers

### Placeholder Scan

No `TODO`, `TBD`, “implement later,” or “write tests for the above” placeholders remain. Each task includes exact files, commands, and concrete code targets.

### Type Consistency Check

The plan consistently uses:

- `ZoneEventState` on the backend
- `RuntimeZoneEvent` on the frontend
- `phase: 'none' | 'lead_in' | 'active' | 'recovery'`
- `zoneEvents` for both bootstrap and snapshot payloads

Later tasks do not rename these APIs.
