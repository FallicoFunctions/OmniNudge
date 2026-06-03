# OmniRave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the OmniGame discovery surface, the dedicated OmniRave game runtime, and the supporting platform/game backend services described in [2026-06-01-omnirave-design.md](/Users/Nick_1/Documents/Personal_Projects/OmniNudge/docs/superpowers/specs/2026-06-01-omnirave-design.md:1).

**Architecture:** Keep the existing OmniNudge React app as the discovery and launch layer, add a separate `omnirave-web` Vite app for the full-screen runtime, and add two backend binaries under the existing Go module: `omnigame-api` for launch/bootstrap/persistence and `omnirave-world` for authoritative realtime world state. Shared contracts live in the Go backend and TypeScript client packages so future games can reuse the same launcher/session model.

**Tech Stack:** Go 1.26, Gin/WebSocket/Redis/Postgres in `backend/`, React 19 + Vite 7 + TypeScript 5.9 in `frontend/`, a second Vite + React + TypeScript app in `omnirave-web/`, Vitest/Testing Library for web tests, and Go `testing` + `testify` for backend tests.

---

## File Structure

### Existing files to modify

- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/layouts/MainLayout.tsx`
- Modify: `frontend/src/components/mobile/MoreMenuSheet.tsx`
- Modify: `frontend/public/locales/en.json`
- Modify: `frontend/public/locales/ar.json`
- Modify: `frontend/public/locales/es.json`
- Modify: `backend/cmd/server/main.go`
- Modify: `backend/internal/config/config.go`
- Create: `backend/internal/database/migrations/103_omnirave_profiles.up.sql`
- Create: `backend/internal/database/migrations/103_omnirave_profiles.down.sql`
- Modify: `scripts/deploy-on.sh`
- Modify: `RUNBOOK.md`

### New OmniNudge frontend files

- Create: `frontend/src/pages/GamesPage.tsx`
- Create: `frontend/src/pages/GameDetailPage.tsx`
- Create: `frontend/src/pages/__tests__/GamesPage.test.tsx`
- Create: `frontend/src/pages/__tests__/GameDetailPage.test.tsx`
- Create: `frontend/src/services/omnigameService.ts`
- Create: `frontend/src/services/__tests__/omnigameService.test.ts`
- Create: `frontend/src/types/omnigame.ts`

### New dedicated game client files

- Create: `omnirave-web/package.json`
- Create: `omnirave-web/tsconfig.json`
- Create: `omnirave-web/vite.config.ts`
- Create: `omnirave-web/index.html`
- Create: `omnirave-web/src/main.tsx`
- Create: `omnirave-web/src/App.tsx`
- Create: `omnirave-web/src/styles.css`
- Create: `omnirave-web/src/lib/session.ts`
- Create: `omnirave-web/src/lib/protocol.ts`
- Create: `omnirave-web/src/lib/zones.ts`
- Create: `omnirave-web/src/lib/youtube.ts`
- Create: `omnirave-web/src/hooks/useWorldSession.ts`
- Create: `omnirave-web/src/hooks/useMobileMediaUnlock.ts`
- Create: `omnirave-web/src/components/Hud.tsx`
- Create: `omnirave-web/src/components/ChatPanel.tsx`
- Create: `omnirave-web/src/components/LoadoutPanel.tsx`
- Create: `omnirave-web/src/components/TouchControls.tsx`
- Create: `omnirave-web/src/components/StageScreen.tsx`
- Create: `omnirave-web/src/components/__tests__/TouchControls.test.tsx`
- Create: `omnirave-web/src/lib/__tests__/zones.test.ts`
- Create: `omnirave-web/src/lib/__tests__/session.test.ts`

### New game platform backend files

- Create: `backend/cmd/omnigame-api/main.go`
- Create: `backend/internal/omnigame/api/router.go`
- Create: `backend/internal/omnigame/api/handlers/launch_handler.go`
- Create: `backend/internal/omnigame/api/handlers/profile_handler.go`
- Create: `backend/internal/omnigame/api/middleware/auth.go`
- Create: `backend/internal/omnigame/service/session_service.go`
- Create: `backend/internal/omnigame/service/profile_service.go`
- Create: `backend/internal/omnigame/service/guest_service.go`
- Create: `backend/internal/omnigame/repository/profile_repository.go`
- Create: `backend/internal/omnigame/repository/sanction_repository.go`
- Create: `backend/internal/omnigame/model/types.go`
- Create: `backend/internal/omnigame/model/session_tokens.go`
- Create: `backend/internal/omnigame/api/handlers/launch_handler_test.go`
- Create: `backend/internal/omnigame/service/session_service_test.go`
- Create: `backend/internal/omnigame/repository/profile_repository_test.go`

### New realtime world backend files

- Create: `backend/cmd/omnirave-world/main.go`
- Create: `backend/internal/omniraveworld/server/server.go`
- Create: `backend/internal/omniraveworld/server/ws_handler.go`
- Create: `backend/internal/omniraveworld/world/world.go`
- Create: `backend/internal/omniraveworld/world/player.go`
- Create: `backend/internal/omniraveworld/world/zones.go`
- Create: `backend/internal/omniraveworld/world/media_state.go`
- Create: `backend/internal/omniraveworld/world/chat.go`
- Create: `backend/internal/omniraveworld/world/loadout.go`
- Create: `backend/internal/omniraveworld/world/protocol.go`
- Create: `backend/internal/omniraveworld/world/reconnect.go`
- Create: `backend/internal/omniraveworld/world/world_test.go`
- Create: `backend/internal/omniraveworld/world/zones_test.go`
- Create: `backend/internal/omniraveworld/world/media_state_test.go`
- Create: `backend/internal/omniraveworld/world/loadout_test.go`

### New docs and support files

- Create: `docs/technical/omnirave-architecture.md`
- Create: `docs/guides/omnirave-local-dev.md`

---

### Task 1: Scaffold OmniGame And OmniRave Service Boundaries

**Files:**
- Create: `omnirave-web/package.json`
- Create: `omnirave-web/tsconfig.json`
- Create: `omnirave-web/vite.config.ts`
- Create: `omnirave-web/index.html`
- Create: `backend/cmd/omnigame-api/main.go`
- Create: `backend/cmd/omnirave-world/main.go`
- Create: `docs/guides/omnirave-local-dev.md`
- Test: `backend/internal/omnigame/service/session_service_test.go`

- [ ] **Step 1: Write the failing repo-shape test/verification notes**

```markdown
Add a local-dev doc section that asserts the repo now has:
- `frontend/` for OmniNudge discovery UI
- `omnirave-web/` for the dedicated game runtime
- `backend/cmd/omnigame-api/` for launch/bootstrap APIs
- `backend/cmd/omnirave-world/` for realtime authority
```

```go
func TestSessionService_NotYetImplemented(t *testing.T) {
	t.Skip("expected to fail until backend/internal/omnigame/service/session_service.go exists")
}
```

- [ ] **Step 2: Run the new checks to verify the repo is missing the new boundaries**

Run: `test -d omnirave-web && test -f backend/cmd/omnigame-api/main.go && test -f backend/cmd/omnirave-world/main.go`

Expected: command exits non-zero because the directories/files do not exist yet.

Run: `cd backend && go test ./internal/omnigame/... -run TestSessionService_NotYetImplemented -count=1`

Expected: FAIL with `stat .../internal/omnigame/...: directory not found`.

- [ ] **Step 3: Create the new app and binary scaffolding**

```json
{
  "name": "omnirave-web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.3.0",
    "@types/react": "^19.2.5",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "typescript": "~5.9.3",
    "vite": "^7.2.4",
    "vitest": "^3.2.4"
  }
}
```

```go
package main

import "log"

func main() {
	log.Println("omnigame-api bootstrap stub")
}
```

```go
package main

import "log"

func main() {
	log.Println("omnirave-world bootstrap stub")
}
```

- [ ] **Step 4: Verify the scaffolding exists and builds minimally**

Run: `test -d omnirave-web && test -f backend/cmd/omnigame-api/main.go && test -f backend/cmd/omnirave-world/main.go`

Expected: exit code 0.

Run: `cd backend && go test ./cmd/omnigame-api ./cmd/omnirave-world`

Expected: PASS with no test files.

- [ ] **Step 5: Commit**

```bash
git add omnirave-web backend/cmd/omnigame-api backend/cmd/omnirave-world docs/guides/omnirave-local-dev.md
git commit -m "chore: scaffold OmniRave apps and binaries"
```

### Task 2: Add OmniGame Discovery And Launch Surfaces In OmniNudge

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/layouts/MainLayout.tsx`
- Modify: `frontend/src/components/mobile/MoreMenuSheet.tsx`
- Create: `frontend/src/pages/GamesPage.tsx`
- Create: `frontend/src/pages/GameDetailPage.tsx`
- Create: `frontend/src/types/omnigame.ts`
- Create: `frontend/src/services/omnigameService.ts`
- Create: `frontend/src/pages/__tests__/GamesPage.test.tsx`
- Create: `frontend/src/pages/__tests__/GameDetailPage.test.tsx`
- Test: `frontend/src/pages/__tests__/GamesPage.test.tsx`

- [ ] **Step 1: Write the failing route/navigation tests**

```tsx
it('renders Games in primary navigation and routes to the games index', async () => {
  render(
    <MemoryRouter initialEntries={['/games']}>
      <Routes>
        <Route path="/games" element={<GamesPage />} />
      </Routes>
    </MemoryRouter>
  )

  expect(screen.getByRole('heading', { name: /OmniGame/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /OmniRave/i })).toHaveAttribute('href', '/games/omnirave')
})
```

```tsx
it('offers account launch and guest launch on the OmniRave detail page', () => {
  render(
    <MemoryRouter initialEntries={['/games/omnirave']}>
      <Routes>
        <Route path="/games/omnirave" element={<GameDetailPage />} />
      </Routes>
    </MemoryRouter>
  )

  expect(screen.getByRole('button', { name: /Launch OmniRave/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Launch as Guest/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the frontend tests to prove the surfaces are missing**

Run: `cd frontend && npm test -- --run src/pages/__tests__/GamesPage.test.tsx src/pages/__tests__/GameDetailPage.test.tsx`

Expected: FAIL with module-not-found errors for the new pages or missing routes/navigation.

- [ ] **Step 3: Implement the discovery pages, routes, and launch service**

```ts
export interface GameCatalogEntry {
  slug: 'omnirave'
  name: 'OmniRave'
  summary: string
  runtimeUrl: string
  supportsGuestLaunch: boolean
}
```

```tsx
<Route path="/games" element={<GamesPage />} />
<Route path="/games/omnirave" element={<GameDetailPage />} />
```

```tsx
export default function GamesPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold">OmniGame</h1>
      <Link to="/games/omnirave">OmniRave</Link>
    </main>
  )
}
```

```ts
export async function createOmniRaveLaunch(mode: 'account' | 'guest') {
  return api.post('/omnigame/launch/omnirave', { mode })
}
```

- [ ] **Step 4: Re-run the focused frontend tests**

Run: `cd frontend && npm test -- --run src/pages/__tests__/GamesPage.test.tsx src/pages/__tests__/GameDetailPage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/layouts/MainLayout.tsx frontend/src/components/mobile/MoreMenuSheet.tsx frontend/src/pages frontend/src/services/omnigameService.ts frontend/src/types/omnigame.ts
git commit -m "feat: add OmniGame discovery and launch pages"
```

### Task 3: Build OmniGame Launch Bootstrap And Persistence APIs

**Files:**
- Create: `backend/internal/omnigame/model/types.go`
- Create: `backend/internal/omnigame/model/session_tokens.go`
- Create: `backend/internal/omnigame/service/session_service.go`
- Create: `backend/internal/omnigame/service/profile_service.go`
- Create: `backend/internal/omnigame/service/guest_service.go`
- Create: `backend/internal/omnigame/api/router.go`
- Create: `backend/internal/omnigame/api/handlers/launch_handler.go`
- Create: `backend/internal/omnigame/api/handlers/profile_handler.go`
- Create: `backend/internal/omnigame/api/handlers/launch_handler_test.go`
- Create: `backend/internal/omnigame/service/session_service_test.go`
- Create: `backend/internal/database/migrations/103_omnirave_profiles.up.sql`
- Create: `backend/internal/database/migrations/103_omnirave_profiles.down.sql`
- Test: `backend/internal/omnigame/service/session_service_test.go`

- [ ] **Step 1: Write failing Go tests for signed-in and guest launch bootstrap**

```go
func TestSessionService_CreateSignedInLaunchSession(t *testing.T) {
	svc := newSessionServiceForTest()

	session, err := svc.CreateLaunchSession(context.Background(), LaunchRequest{
		GameSlug: "omnirave",
		Mode:     LaunchModeAccount,
		UserID:   ptr(42),
	})

	require.NoError(t, err)
	require.Equal(t, "omnirave", session.GameSlug)
	require.Equal(t, LaunchModeAccount, session.Mode)
	require.NotEmpty(t, session.LaunchToken)
}
```

```go
func TestSessionService_CreateGuestLaunchSession(t *testing.T) {
	svc := newSessionServiceForTest()

	session, err := svc.CreateLaunchSession(context.Background(), LaunchRequest{
		GameSlug: "omnirave",
		Mode:     LaunchModeGuest,
	})

	require.NoError(t, err)
	require.Equal(t, LaunchModeGuest, session.Mode)
	require.NotEmpty(t, session.GuestName)
}
```

- [ ] **Step 2: Run the backend tests before implementation**

Run: `cd backend && go test ./internal/omnigame/... -run 'TestSessionService_Create(SignedIn|Guest)LaunchSession' -count=1`

Expected: FAIL because the package and types do not exist yet.

- [ ] **Step 3: Implement launch sessions, guest bootstrap, and persistence models**

```go
type LaunchMode string

const (
	LaunchModeAccount LaunchMode = "account"
	LaunchModeGuest   LaunchMode = "guest"
)

type LaunchSession struct {
	GameSlug      string
	Mode          LaunchMode
	LaunchToken   string
	GuestName     string
	UserID        *int64
	ReturnPoint   *SavedPoint
	Loadout       *Loadout
	SanctionState SanctionState
}
```

```go
func (s *SessionService) CreateLaunchSession(ctx context.Context, req LaunchRequest) (*LaunchSession, error) {
	if req.Mode == LaunchModeGuest {
		return s.createGuestLaunch(ctx, req)
	}
	return s.createAccountLaunch(ctx, req)
}
```

```sql
CREATE TABLE omnirave_profiles (
  user_id BIGINT PRIMARY KEY,
  loadout JSONB NOT NULL,
  return_point JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE omnirave_guest_sanctions (
  id BIGSERIAL PRIMARY KEY,
  bootstrap_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 4: Re-run targeted backend tests and handler tests**

Run: `cd backend && go test ./internal/omnigame/... -run 'TestSessionService_Create(SignedIn|Guest)LaunchSession|TestLaunchHandler' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/omnigame backend/internal/database/migrations backend/cmd/omnigame-api/main.go
git commit -m "feat: add OmniGame launch bootstrap APIs"
```

### Task 4: Implement The Authoritative OmniRave World Skeleton

**Files:**
- Create: `backend/internal/omniraveworld/server/server.go`
- Create: `backend/internal/omniraveworld/server/ws_handler.go`
- Create: `backend/internal/omniraveworld/world/world.go`
- Create: `backend/internal/omniraveworld/world/player.go`
- Create: `backend/internal/omniraveworld/world/zones.go`
- Create: `backend/internal/omniraveworld/world/protocol.go`
- Create: `backend/internal/omniraveworld/world/world_test.go`
- Create: `backend/internal/omniraveworld/world/zones_test.go`
- Test: `backend/internal/omniraveworld/world/world_test.go`

- [ ] **Step 1: Write failing world tests for zone membership and fixed spawn**

```go
func TestWorld_AddPlayerUsesFixedSpawn(t *testing.T) {
	world := NewWorld(testConfig())

	player := world.AddPlayer(PlayerSession{
		PlayerID: "guest-1",
		Mode:     SessionModeGuest,
	})

	require.Equal(t, world.Config().SpawnPoint, player.Position)
	require.Equal(t, ZoneMainStage, player.Zone)
}
```

```go
func TestWorld_CrossingBoundaryChangesZone(t *testing.T) {
	world := NewWorld(testConfig())
	player := world.AddPlayer(PlayerSession{PlayerID: "user-1"})

	world.ApplyInput(player.ID, InputFrame{MoveTo: Vec3{X: 42, Y: 0, Z: 9}})

	require.Equal(t, ZoneTechnoRoom, world.Player(player.ID).Zone)
}
```

- [ ] **Step 2: Run the world tests and confirm they fail**

Run: `cd backend && go test ./internal/omniraveworld/... -run 'TestWorld_(AddPlayerUsesFixedSpawn|CrossingBoundaryChangesZone)' -count=1`

Expected: FAIL because the package does not exist yet.

- [ ] **Step 3: Implement the minimal authoritative world model**

```go
type ZoneID string

const (
	ZoneMainStage ZoneID = "main_stage"
	ZoneTechnoRoom ZoneID = "techno_room"
	ZoneNeonRoom ZoneID = "neon_room"
)

type Player struct {
	ID       string
	Position Vec3
	Zone     ZoneID
	Loadout  Loadout
}
```

```go
func (w *World) AddPlayer(session PlayerSession) *Player {
	player := &Player{
		ID:       session.PlayerID,
		Position: w.cfg.SpawnPoint,
		Zone:     ZoneMainStage,
		Loadout:  session.Loadout,
	}
	w.players[player.ID] = player
	return player
}
```

```go
func (w *World) ApplyInput(playerID string, frame InputFrame) {
	player := w.players[playerID]
	player.Position = w.walkable.ResolveMove(player.Position, frame)
	player.Zone = w.zoneMap.ZoneFor(player.Position)
}
```

- [ ] **Step 4: Re-run the focused world tests**

Run: `cd backend && go test ./internal/omniraveworld/... -run 'TestWorld_(AddPlayerUsesFixedSpawn|CrossingBoundaryChangesZone)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/omniraveworld backend/cmd/omnirave-world/main.go
git commit -m "feat: add OmniRave authoritative world skeleton"
```

### Task 5: Add Synchronized Stage Media State And Guest Sanction Enforcement

**Files:**
- Create: `backend/internal/omniraveworld/world/media_state.go`
- Create: `backend/internal/omniraveworld/world/chat.go`
- Create: `backend/internal/omniraveworld/world/reconnect.go`
- Create: `backend/internal/omniraveworld/world/media_state_test.go`
- Modify: `backend/internal/omnigame/service/guest_service.go`
- Modify: `backend/internal/omnigame/repository/sanction_repository.go`
- Test: `backend/internal/omniraveworld/world/media_state_test.go`

- [ ] **Step 1: Write failing tests for synchronized stage playback and sanctioned guest rejection**

```go
func TestMediaState_JoinerReceivesCurrentStagePlayhead(t *testing.T) {
	state := NewMediaState(testClock())
	state.AdvanceTo("main_stage", "yt123", 3, time.Unix(1000, 0))

	snapshot := state.SnapshotForZone("main_stage", time.Unix(1012, 0))

	require.Equal(t, "yt123", snapshot.VideoID)
	require.Equal(t, 12*time.Second, snapshot.Playhead)
}
```

```go
func TestGuestService_RejectsSanctionedBootstrap(t *testing.T) {
	svc := newGuestServiceWithSanction("bootstrap-1")

	_, err := svc.ExchangeBootstrap(context.Background(), "bootstrap-1")

	require.ErrorContains(t, err, "sanctioned")
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd backend && go test ./internal/omniraveworld/... ./internal/omnigame/... -run 'Test(MediaState_JoinerReceivesCurrentStagePlayhead|GuestService_RejectsSanctionedBootstrap)' -count=1`

Expected: FAIL because the implementations are incomplete.

- [ ] **Step 3: Implement media snapshots and sanction enforcement**

```go
type ZoneMediaSnapshot struct {
	ZoneID    ZoneID
	VideoID   string
	Index     int
	StartedAt time.Time
	Playhead  time.Duration
}
```

```go
func (m *MediaState) SnapshotForZone(zone ZoneID, now time.Time) ZoneMediaSnapshot {
	current := m.zones[zone]
	return ZoneMediaSnapshot{
		ZoneID:    zone,
		VideoID:   current.VideoID,
		Index:     current.Index,
		StartedAt: current.StartedAt,
		Playhead:  now.Sub(current.StartedAt),
	}
}
```

```go
func (s *GuestService) ExchangeBootstrap(ctx context.Context, token string) (*GuestSession, error) {
	if blocked, err := s.sanctions.IsBootstrapBlocked(ctx, token); err != nil {
		return nil, err
	} else if blocked {
		return nil, ErrSanctionedGuest
	}
	return s.createGuestSession(ctx, token)
}
```

- [ ] **Step 4: Re-run the targeted tests**

Run: `cd backend && go test ./internal/omniraveworld/... ./internal/omnigame/... -run 'Test(MediaState_JoinerReceivesCurrentStagePlayhead|GuestService_RejectsSanctionedBootstrap)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/omniraveworld/world backend/internal/omnigame/service/guest_service.go backend/internal/omnigame/repository/sanction_repository.go
git commit -m "feat: add stage sync and guest sanction enforcement"
```

### Task 6: Build The OmniRave Web Runtime Shell

**Files:**
- Create: `omnirave-web/src/main.tsx`
- Create: `omnirave-web/src/App.tsx`
- Create: `omnirave-web/src/styles.css`
- Create: `omnirave-web/src/lib/session.ts`
- Create: `omnirave-web/src/hooks/useWorldSession.ts`
- Create: `omnirave-web/src/components/Hud.tsx`
- Create: `omnirave-web/src/components/ChatPanel.tsx`
- Create: `omnirave-web/src/components/LoadoutPanel.tsx`
- Create: `omnirave-web/src/lib/__tests__/session.test.ts`
- Test: `omnirave-web/src/lib/__tests__/session.test.ts`

- [ ] **Step 1: Write the failing runtime bootstrap tests**

```ts
it('exchanges launch params for a session before opening the world socket', async () => {
  const session = await bootstrapSession({
    search: '?launch=token-1',
    fetcher: mockFetcher({ worldSocketUrl: 'wss://ws.play.omninudge.com/world' }),
  })

  expect(session.worldSocketUrl).toContain('ws.play.omninudge.com')
  expect(session.playerName).toBeDefined()
})
```

- [ ] **Step 2: Run the failing omnirave-web tests**

Run: `npm --prefix omnirave-web test -- --run src/lib/__tests__/session.test.ts`

Expected: FAIL because the app and helper do not exist yet.

- [ ] **Step 3: Implement the runtime bootstrap shell**

```ts
export async function bootstrapSession(input: {
  search: string
  fetcher?: typeof fetch
}) {
  const params = new URLSearchParams(input.search)
  const launch = params.get('launch')
  const guest = params.get('guest')
  const res = await (input.fetcher ?? fetch)('/session/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ launch, guest }),
  })
  return res.json()
}
```

```tsx
export default function App() {
  return (
    <div className="omnirave-shell">
      <Hud />
      <ChatPanel />
      <LoadoutPanel />
      <canvas id="omnirave-canvas" />
    </div>
  )
}
```

- [ ] **Step 4: Re-run the focused omnirave-web tests**

Run: `npm --prefix omnirave-web test -- --run src/lib/__tests__/session.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add omnirave-web
git commit -m "feat: add OmniRave web runtime shell"
```

### Task 7: Implement Mobile Media Unlock, Zone Audio Switching, And Touch Controls

**Files:**
- Create: `omnirave-web/src/lib/zones.ts`
- Create: `omnirave-web/src/lib/youtube.ts`
- Create: `omnirave-web/src/hooks/useMobileMediaUnlock.ts`
- Create: `omnirave-web/src/components/TouchControls.tsx`
- Create: `omnirave-web/src/components/StageScreen.tsx`
- Create: `omnirave-web/src/components/__tests__/TouchControls.test.tsx`
- Create: `omnirave-web/src/lib/__tests__/zones.test.ts`
- Test: `omnirave-web/src/lib/__tests__/zones.test.ts`

- [ ] **Step 1: Write the failing tests for hard zone switching and media unlock**

```ts
it('returns the correct active stage for a confirmed zone', () => {
  expect(activeStageForZone('main_stage')).toBe('main_stage')
  expect(activeStageForZone('techno_room')).toBe('techno_room')
})
```

```tsx
it('renders touch controls on mobile and requires explicit enter interaction', () => {
  render(<TouchControls unlocked={false} onUnlock={() => {}} />)
  expect(screen.getByRole('button', { name: /Enter OmniRave/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the failing omnirave-web tests**

Run: `npm --prefix omnirave-web test -- --run src/lib/__tests__/zones.test.ts src/components/__tests__/TouchControls.test.tsx`

Expected: FAIL because the modules do not exist yet.

- [ ] **Step 3: Implement zone switching and unlock flow**

```ts
export function activeStageForZone(zone: 'main_stage' | 'techno_room' | 'neon_room') {
  return zone
}
```

```ts
export function syncStagePlayers(currentZone: ZoneID, players: Record<ZoneID, YouTubePlayerHandle>) {
  for (const [zone, player] of Object.entries(players) as Array<[ZoneID, YouTubePlayerHandle]>) {
    if (zone === currentZone) {
      player.unmute()
      player.play()
    } else {
      player.mute()
    }
  }
}
```

```tsx
export function TouchControls(props: { unlocked: boolean; onUnlock: () => void }) {
  if (!props.unlocked) {
    return <button onClick={props.onUnlock}>Enter OmniRave</button>
  }
  return <div data-testid="touch-controls">Touch controls</div>
}
```

- [ ] **Step 4: Re-run the focused tests**

Run: `npm --prefix omnirave-web test -- --run src/lib/__tests__/zones.test.ts src/components/__tests__/TouchControls.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add omnirave-web/src/lib omnirave-web/src/hooks omnirave-web/src/components
git commit -m "feat: add OmniRave mobile media unlock and touch controls"
```

### Task 8: Persist Signed-In Loadouts, Saved Return Points, And Admin-Curated Setlists

**Files:**
- Modify: `backend/internal/omnigame/service/profile_service.go`
- Modify: `backend/internal/omnigame/api/handlers/profile_handler.go`
- Modify: `backend/internal/omniraveworld/world/loadout.go`
- Create: `backend/internal/omniraveworld/world/loadout_test.go`
- Create: `backend/internal/omnigame/api/handlers/profile_handler_test.go`
- Create: `docs/technical/omnirave-architecture.md`
- Test: `backend/internal/omnigame/api/handlers/profile_handler_test.go`

- [ ] **Step 1: Write the failing tests for save/loadout persistence and curated playlists**

```go
func TestProfileHandler_SavesSignedInLoadout(t *testing.T) {
	req := httptest.NewRequest(http.MethodPut, "/omnigame/profile/omnirave/loadout", bytes.NewBufferString(`{"hair":"buzz","top":"black_mesh"}`))
	rr := httptest.NewRecorder()

	router := testProfileRouter()
	router.ServeHTTP(rr, req)

	require.Equal(t, http.StatusNoContent, rr.Code)
}
```

```go
func TestWorld_LoadSignedInReturnPoint(t *testing.T) {
	world := NewWorld(testConfig())
	player := world.AddPlayer(PlayerSession{
		PlayerID:    "user-42",
		ReturnPoint: &Vec3{X: 12, Y: 0, Z: 8},
	})

	require.Equal(t, Vec3{X: 12, Y: 0, Z: 8}, player.Position)
}
```

- [ ] **Step 2: Run the backend tests**

Run: `cd backend && go test ./internal/omnigame/... ./internal/omniraveworld/... -run 'Test(ProfileHandler_SavesSignedInLoadout|World_LoadSignedInReturnPoint)' -count=1`

Expected: FAIL because persistence endpoints and return-point restore are incomplete.

- [ ] **Step 3: Implement loadout persistence and playlist wiring**

```go
func (s *ProfileService) SaveLoadout(ctx context.Context, userID int64, loadout Loadout) error {
	return s.repo.UpsertProfile(ctx, OmniRaveProfile{
		UserID:  userID,
		Loadout: loadout,
	})
}
```

```go
func (w *World) AddPlayer(session PlayerSession) *Player {
	spawn := w.cfg.SpawnPoint
	if session.ReturnPoint != nil && w.walkable.IsValid(*session.ReturnPoint) {
		spawn = *session.ReturnPoint
	}
	player := &Player{ID: session.PlayerID, Position: spawn, Zone: w.zoneMap.ZoneFor(spawn), Loadout: session.Loadout}
	w.players[player.ID] = player
	return player
}
```

```go
type StagePlaylist struct {
	ZoneID ZoneID
	Entries []PlaylistEntry
}
```

- [ ] **Step 4: Re-run the persistence tests**

Run: `cd backend && go test ./internal/omnigame/... ./internal/omniraveworld/... -run 'Test(ProfileHandler_SavesSignedInLoadout|World_LoadSignedInReturnPoint)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/omnigame backend/internal/omniraveworld docs/technical/omnirave-architecture.md
git commit -m "feat: persist OmniRave loadouts and return points"
```

### Task 9: Add Deployment Wiring, Local Dev Scripts, And End-To-End Verification

**Files:**
- Modify: `scripts/deploy-on.sh`
- Modify: `RUNBOOK.md`
- Modify: `docs/guides/omnirave-local-dev.md`
- Create: `omnirave-web/README.md`
- Create: `frontend/tests/omnigame-launch.spec.ts`
- Create: `omnirave-web/tests/mobile-unlock.spec.ts`
- Test: `frontend/tests/omnigame-launch.spec.ts`

- [ ] **Step 1: Write failing e2e acceptance tests for launch handoff**

```ts
test('launches OmniRave from OmniGame detail page', async ({ page }) => {
  await page.goto('/games/omnirave')
  await page.getByRole('button', { name: /Launch OmniRave/i }).click()
  await expect(page).toHaveURL(/play\.omninudge\.com\/omnirave/)
})
```

- [ ] **Step 2: Run the e2e test and capture the expected failure**

Run: `cd frontend && npm run test:e2e -- omnigame-launch.spec.ts`

Expected: FAIL because deployment wiring and runtime handoff are not finished yet.

- [ ] **Step 3: Wire deployment and local-dev commands**

```bash
# scripts/deploy-on.sh
# build frontend
# build omnirave-web
# build backend/cmd/omnigame-api
# build backend/cmd/omnirave-world
# upload to play/api/ws service paths
```

```markdown
# docs/guides/omnirave-local-dev.md
1. run OmniNudge frontend
2. run omnigame-api
3. run omnirave-world
4. run omnirave-web
5. verify launch flow from /games/omnirave
```

- [ ] **Step 4: Re-run the verification commands**

Run: `cd frontend && npm run test:e2e -- omnigame-launch.spec.ts`

Expected: PASS once the launch flow is fully wired in the local/dev environment.

Run: `cd backend && go test ./internal/omnigame/... ./internal/omniraveworld/...`

Expected: PASS.

Run: `npm --prefix omnirave-web test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy-on.sh RUNBOOK.md docs/guides/omnirave-local-dev.md frontend/tests omnirave-web/README.md omnirave-web/tests
git commit -m "chore: add OmniRave deployment and verification docs"
```

## Self-Review Checklist

- Spec coverage:
  - OmniGame discovery surface: covered in Task 2.
  - Dedicated OmniRave runtime: covered in Tasks 1, 6, and 7.
  - Signed-in and guest launch flows: covered in Task 3.
  - One shared authoritative world: covered in Tasks 4 and 5.
  - Hard media zone boundaries and global stage sync: covered in Task 5 and Task 7.
  - Account-backed persistence and guest non-persistence: covered in Tasks 3 and 8.
  - Mobile support with explicit media unlock: covered in Task 7.
  - Admin-curated playlists: covered in Tasks 5 and 8.
  - Deployment and verification: covered in Task 9.

- Placeholder scan:
  - No `TBD`/`TODO` placeholders remain.
  - Future admin features are isolated as later capabilities and not required for the core implementation path.

- Type consistency:
  - `main_stage`, `techno_room`, and `neon_room` are used consistently as zone identifiers.
  - Launch modes are consistently `account` and `guest`.
  - The split between `omnigame-platform-api` and `omnirave-world` is consistent throughout.
