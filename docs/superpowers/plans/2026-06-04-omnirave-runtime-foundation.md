# OmniRave Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the first production-quality OmniRave runtime slice: renamed authoritative venues, persisted account-backed runtime settings/last-venue state, and the new non-modal HUD/settings/chat shell wired to real backend data.

**Architecture:** This plan intentionally does **not** try to implement the entire 3D festival in one pass. It hardens the shared contracts between `omnigame-api`, `omnirave-world`, and `omnirave-web`, expands the persisted OmniRave profile model to include runtime state, and replaces the current minimal runtime chrome with the approved persistent HUD shell. It leaves full 3D movement/camera, in-world auth conversion, avatar generation/editor depth, and scheduled venue event rendering to follow-on plans.

**Tech Stack:** Go (`gin`, existing OmniGame services/repositories, Postgres migrations), TypeScript/React/Vite/Vitest in `omnirave-web`, existing WebSocket world protocol.

---

## Scope And Decomposition

This spec is too large for one safe implementation plan. The approved design breaks naturally into multiple deliverable plans:

1. **This plan:** runtime foundation, naming, persistence, HUD/settings/chat shell
2. **Follow-on plan:** true 3D movement/camera/collision/runtime scene replacement
3. **Follow-on plan:** avatar generator + editor + persistence UX
4. **Follow-on plan:** scheduled venue event system + screen/event state machine
5. **Follow-on plan:** in-runtime guest login/signup/logout conversion flow

This plan should produce working, testable software on its own:
- launch still works
- backend/world/runtime all agree on venue IDs and display names
- logged-in users receive saved OmniRave settings and last venue from bootstrap
- logged-in users can update those settings through the runtime shell
- runtime renders the approved top-left/top-right/bottom HUD structure with non-modal settings/chat behavior

---

## File Structure

### Backend files to modify

- Modify: `backend/internal/omnigame/model/types.go`
  - Extend OmniRave profile and session exchange contract with settings and last-venue fields.
- Modify: `backend/internal/omnigame/service/profile_service.go`
  - Add save/get support for runtime settings and remembered venue state.
- Modify: `backend/internal/omnigame/service/session_service.go`
  - Include saved settings and last venue in launch exchange responses before the runtime renders.
- Modify: `backend/internal/omnigame/api/handlers/profile_handler.go`
  - Add profile endpoints for runtime settings and last venue writes.
- Modify: `backend/internal/omnigame/api/router.go`
  - Register the new profile endpoints.
- Modify: `backend/internal/omnigame/repository/profile_repository.go`
  - Expand repository interface and helpers for persisted settings and last venue.
- Modify: `backend/internal/omnigame/repository/profile_repository_postgres.go`
  - Read/write new JSONB/text fields.
- Modify: `backend/internal/omnigame/repository/profile_repository_postgres_test.go`
  - Cover the expanded schema contract.
- Modify: `backend/internal/omniraveworld/world/protocol.go`
  - Rename world zone IDs to the approved names.
- Modify: `backend/internal/omniraveworld/world/zones.go`
  - Rename default authoritative zones.
- Modify: `backend/internal/omniraveworld/world/media_state.go`
  - Update playlist/media zone IDs to match renamed zones.
- Modify: `backend/internal/omniraveworld/world/zones_test.go`
  - Assert renamed zones and default mapping.
- Modify: `backend/internal/omnigame/service/session_service_test.go`
  - Assert exchange includes settings and last venue.
- Modify: `backend/internal/omnigame/api/handlers/profile_handler_test.go`
  - Assert new runtime-settings and last-venue routes.

### Backend files to create

- Create: `backend/internal/database/migrations/107_omnirave_runtime_state.up.sql`
- Create: `backend/internal/database/migrations/107_omnirave_runtime_state.down.sql`
  - Add `settings` JSONB and `last_venue` text columns to `omnirave_profiles`.

### Runtime files to modify

- Modify: `omnirave-web/src/lib/session.ts`
  - Extend runtime bootstrap types with `settings` and `lastVenue`.
- Modify: `omnirave-web/src/lib/zones.ts`
  - Rename runtime zone IDs, labels, and move targets.
- Modify: `omnirave-web/src/hooks/useWorldSession.ts`
  - Load bootstrap settings/last venue, expose save helpers, and keep session state authoritative.
- Modify: `omnirave-web/src/App.tsx`
  - Replace current topbar/utility-sheet shell with the new non-modal HUD scaffold.
- Modify: `omnirave-web/src/components/Hud.tsx`
  - Replace minimal crowd card with bottom-right venue status block.
- Modify: `omnirave-web/src/components/ChatPanel.tsx`
  - Refactor to the new persistent chat shell and collapsed/open behavior foundations.
- Modify: `omnirave-web/src/styles.css`
  - Add the approved HUD anchor system and non-modal shell styling.
- Modify: `omnirave-web/src/__tests__/App.test.tsx`
  - Assert the new layout/state hooks instead of the old utility-sheet shell.
- Modify: `omnirave-web/src/components/__tests__/ChatPanel.test.tsx`
  - Assert collapsed/open behavior and preserved input line.
- Modify: `omnirave-web/src/lib/__tests__/session.test.ts`
  - Assert bootstrap parsing of settings and last venue.
- Modify: `omnirave-web/src/lib/__tests__/zones.test.ts`
  - Assert renamed venue IDs and labels.

### Runtime files to create

- Create: `omnirave-web/src/lib/settings.ts`
  - Shared runtime settings types, defaults, serializer helpers.
- Create: `omnirave-web/src/components/SettingsPanel.tsx`
  - New top-left settings window shell.
- Create: `omnirave-web/src/components/VenueStatusPanel.tsx`
  - New bottom-right venue/track/count block.
- Create: `omnirave-web/src/components/TopLeftControls.tsx`
  - `Settings` / `Avatar` buttons and popup-open state.
- Create: `omnirave-web/src/components/TopRightAuthControls.tsx`
  - Guest `Log In` / `Sign Up` and account `Logout` button shell.
- Create: `omnirave-web/src/components/EmoteBar.tsx`
  - Bottom-center shell with placeholder slots and stamina bar foundation.

---

## Task 1: Rename The Authoritative Venue Model

**Files:**
- Modify: `backend/internal/omniraveworld/world/protocol.go`
- Modify: `backend/internal/omniraveworld/world/zones.go`
- Modify: `backend/internal/omniraveworld/world/media_state.go`
- Modify: `backend/internal/omniraveworld/world/zones_test.go`
- Modify: `backend/internal/omnigame/model/types.go`
- Modify: `omnirave-web/src/lib/session.ts`
- Modify: `omnirave-web/src/lib/zones.ts`
- Modify: `omnirave-web/src/lib/__tests__/zones.test.ts`

- [ ] **Step 1: Write failing zone-renaming tests**

```go
// backend/internal/omniraveworld/world/zones_test.go
func TestDefaultZoneMap_UsesApprovedVenueIDs(t *testing.T) {
	zoneMap := DefaultZoneMap()

	mainZone := zoneMap.ZoneFor(Vec3{X: 0, Y: 0, Z: 0})
	undergroundZone := zoneMap.ZoneFor(Vec3{X: 42, Y: 0, Z: 9})
	plurrZone := zoneMap.ZoneFor(Vec3{X: -34, Y: 0, Z: 11})

	require.Equal(t, ZoneMainStage, mainZone)
	require.Equal(t, ZoneUnderground, undergroundZone)
	require.Equal(t, ZonePlurrPartay, plurrZone)
}
```

```ts
// omnirave-web/src/lib/__tests__/zones.test.ts
import { describe, expect, it } from 'vitest';
import { zoneDisplayName, zoneMoveTarget, ZONE_ORDER } from '../zones';

describe('zones', () => {
  it('uses the approved runtime venue IDs and labels', () => {
    expect(ZONE_ORDER).toEqual(['main_stage', 'underground', 'plurr_partay']);
    expect(zoneDisplayName('underground')).toBe('The Underground');
    expect(zoneDisplayName('plurr_partay')).toBe('P.L.U.R.R. Partay');
    expect(zoneMoveTarget('main_stage')).toEqual({ x: 0, y: 0, z: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omniraveworld/world -run TestDefaultZoneMap_UsesApprovedVenueIDs -count=1`

Expected: FAIL because `ZoneUnderground` / `ZonePlurrPartay` do not exist yet.

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/zones.test.ts`

Expected: FAIL because `underground` and `plurr_partay` are not valid current runtime IDs.

- [ ] **Step 3: Implement the renamed venue IDs across backend and runtime**

```go
// backend/internal/omniraveworld/world/protocol.go
type ZoneID string

const (
	ZoneMainStage  ZoneID = "main_stage"
	ZoneUnderground ZoneID = "underground"
	ZonePlurrPartay ZoneID = "plurr_partay"
)
```

```go
// backend/internal/omniraveworld/world/zones.go
func DefaultZoneMap() ZoneMap {
	return ZoneMap{
		zones: map[ZoneID]Bounds{
			ZoneMainStage:   {MinX: -20, MaxX: 20, MinZ: -20, MaxZ: 20},
			ZoneUnderground: {MinX: 30, MaxX: 60, MinZ: 0, MaxZ: 20},
			ZonePlurrPartay: {MinX: -50, MaxX: -20, MinZ: 0, MaxZ: 20},
		},
	}
}
```

```go
// backend/internal/omniraveworld/world/media_state.go
for _, zone := range []ZoneID{ZoneMainStage, ZoneUnderground, ZonePlurrPartay} {
	current := m.zones[zone]
	// existing snapshot logic unchanged
}
```

```ts
// omnirave-web/src/lib/session.ts
export type RuntimeZoneID = 'main_stage' | 'underground' | 'plurr_partay';
```

```ts
// omnirave-web/src/lib/zones.ts
const ZONE_LABELS: Record<ZoneID, string> = {
  main_stage: 'Main Stage',
  underground: 'The Underground',
  plurr_partay: 'P.L.U.R.R. Partay',
};

const ZONE_MOVE_TARGETS: Record<ZoneID, RuntimePoint> = {
  main_stage: { x: 0, y: 0, z: 0 },
  underground: { x: 42, y: 0, z: 9 },
  plurr_partay: { x: -34, y: 0, z: 11 },
};

export const ZONE_ORDER: ZoneID[] = ['main_stage', 'underground', 'plurr_partay'];
```

- [ ] **Step 4: Run tests to verify the venue rename passes**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omniraveworld/world -run TestDefaultZoneMap_UsesApprovedVenueIDs -count=1`

Expected: PASS

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/zones.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  backend/internal/omniraveworld/world/protocol.go \
  backend/internal/omniraveworld/world/zones.go \
  backend/internal/omniraveworld/world/media_state.go \
  backend/internal/omniraveworld/world/zones_test.go \
  backend/internal/omnigame/model/types.go \
  omnirave-web/src/lib/session.ts \
  omnirave-web/src/lib/zones.ts \
  omnirave-web/src/lib/__tests__/zones.test.ts
git commit -m "refactor: rename OmniRave venues"
```

---

## Task 2: Persist Runtime Settings And Last Venue In OmniRave Profiles

**Files:**
- Create: `backend/internal/database/migrations/107_omnirave_runtime_state.up.sql`
- Create: `backend/internal/database/migrations/107_omnirave_runtime_state.down.sql`
- Modify: `backend/internal/omnigame/model/types.go`
- Modify: `backend/internal/omnigame/repository/profile_repository.go`
- Modify: `backend/internal/omnigame/repository/profile_repository_postgres.go`
- Modify: `backend/internal/omnigame/repository/profile_repository_postgres_test.go`
- Modify: `backend/internal/omnigame/service/profile_service.go`
- Modify: `backend/internal/omnigame/service/session_service.go`
- Modify: `backend/internal/omnigame/service/session_service_test.go`
- Modify: `backend/internal/omnigame/api/handlers/profile_handler.go`
- Modify: `backend/internal/omnigame/api/handlers/profile_handler_test.go`
- Modify: `backend/internal/omnigame/api/router.go`

- [ ] **Step 1: Write failing persistence/exchange tests**

```go
// backend/internal/omnigame/service/session_service_test.go
func TestExchangeLaunchSession_IncludesSavedRuntimeState(t *testing.T) {
	profiles := repository.NewInMemoryProfileRepository()
	require.NoError(t, profiles.UpsertProfile(context.Background(), model.OmniRaveProfile{
		UserID: 42,
		Loadout: map[string]string{"top": "festival-top-01"},
		LastVenue: "underground",
		Settings: model.OmniRaveSettings{
			UITheme:       "Hybrid Premium",
			GraphicsMode:  "auto",
			DisplayNames:  true,
			ChatCollapsed: false,
		},
	}))

	svc := NewSessionServiceWithRepositories("http://runtime", "ws://world", profiles, repository.NewInMemorySanctionRepository())
	userID := 42
	launch, err := svc.CreateLaunchSession(context.Background(), model.LaunchRequest{Mode: model.LaunchModeAccount}, model.PlayerIdentity{
		UserID:   &userID,
		Username: "nick",
	})
	require.NoError(t, err)

	resp, err := svc.ExchangeLaunchSession(context.Background(), model.SessionExchangeRequest{
		Handoff: launch.LaunchToken,
		Mode:    model.LaunchModeAccount,
	})
	require.NoError(t, err)
	require.Equal(t, "underground", resp.LastVenue)
	require.Equal(t, "Hybrid Premium", resp.Settings.UITheme)
}
```

```go
// backend/internal/omnigame/api/handlers/profile_handler_test.go
func TestSaveRuntimeSettings(t *testing.T) {
	// assert PUT /api/v1/omnigame/profile/omnirave/settings persists settings JSON
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omnigame/service -run TestExchangeLaunchSession_IncludesSavedRuntimeState -count=1`

Expected: FAIL because `Settings` and `LastVenue` do not exist on the profile/session exchange contract.

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omnigame/api/handlers -run TestSaveRuntimeSettings -count=1`

Expected: FAIL because there is no runtime settings route yet.

- [ ] **Step 3: Add migration and model/repository support**

```sql
-- backend/internal/database/migrations/107_omnirave_runtime_state.up.sql
ALTER TABLE omnirave_profiles
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_venue TEXT NOT NULL DEFAULT 'main_stage';
```

```sql
-- backend/internal/database/migrations/107_omnirave_runtime_state.down.sql
ALTER TABLE omnirave_profiles
  DROP COLUMN IF EXISTS settings,
  DROP COLUMN IF EXISTS last_venue;
```

```go
// backend/internal/omnigame/model/types.go
type OmniRaveSettings struct {
	UITheme       string `json:"uiTheme"`
	GraphicsMode  string `json:"graphicsMode"`
	GraphicsLevel int    `json:"graphicsLevel,omitempty"`
	DisplayNames  bool   `json:"displayNames"`
	ChatCollapsed bool   `json:"chatCollapsed"`
	CrouchMode    string `json:"crouchMode"`
	CameraFollow  string `json:"cameraFollow"`
}

type OmniRaveProfile struct {
	UserID      int               `json:"userId"`
	Loadout     map[string]string `json:"loadout"`
	ReturnPoint *SavedPoint       `json:"returnPoint,omitempty"`
	LastVenue   string            `json:"lastVenue"`
	Settings    OmniRaveSettings  `json:"settings"`
}

type SessionExchangeResponse struct {
	// existing fields...
	LastVenue string           `json:"lastVenue"`
	Settings  OmniRaveSettings `json:"settings"`
}
```

```go
// backend/internal/omnigame/repository/profile_repository.go
type ProfileRepository interface {
	GetProfile(ctx context.Context, userID int) (*model.OmniRaveProfile, error)
	UpsertProfile(ctx context.Context, profile model.OmniRaveProfile) error
}
```

```go
// backend/internal/omnigame/service/profile_service.go
func (s *ProfileService) SaveSettings(ctx context.Context, userID int, settings model.OmniRaveSettings) error {
	profile, err := s.repo.GetProfile(ctx, userID)
	if err != nil {
		return err
	}

	next := model.OmniRaveProfile{UserID: userID, Loadout: map[string]string{}, LastVenue: "main_stage", Settings: settings}
	if profile != nil {
		next.Loadout = profile.Loadout
		next.ReturnPoint = profile.ReturnPoint
		next.LastVenue = profile.LastVenue
	}
	return s.repo.UpsertProfile(ctx, next)
}

func (s *ProfileService) SaveLastVenue(ctx context.Context, userID int, venue string) error {
	profile, err := s.repo.GetProfile(ctx, userID)
	if err != nil {
		return err
	}

	next := model.OmniRaveProfile{UserID: userID, Loadout: map[string]string{}, LastVenue: venue}
	if profile != nil {
		next.Loadout = profile.Loadout
		next.ReturnPoint = profile.ReturnPoint
		next.Settings = profile.Settings
	}
	return s.repo.UpsertProfile(ctx, next)
}
```

- [ ] **Step 4: Expose the new profile state through session exchange and profile routes**

```go
// backend/internal/omnigame/service/session_service.go
response := &model.SessionExchangeResponse{
	PlayerID:       session.PlayerID,
	PlayerName:     session.PlayerName,
	WorldSocketURL: s.worldSocketURL,
	Mode:           session.Mode,
	ActiveZone:     "main_stage",
	Loadout:        map[string]string{},
	LastVenue:      "main_stage",
	Settings: model.OmniRaveSettings{
		UITheme:       "Luminous Panels",
		GraphicsMode:  "auto",
		DisplayNames:  true,
		ChatCollapsed: false,
		CrouchMode:    "hold",
		CameraFollow:  "free",
	},
	ZoneMedia: s.currentZoneMedia(),
}

if profile != nil {
	response.Loadout = profile.Loadout
	response.ReturnPoint = profile.ReturnPoint
	response.LastVenue = profile.LastVenue
	response.Settings = profile.Settings
}
```

```go
// backend/internal/omnigame/api/handlers/profile_handler.go
func (h *ProfileHandler) SaveRuntimeSettings(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		utils.RespondUnauthorized(c, "Unauthorized")
		return
	}

	var payload model.OmniRaveSettings
	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.RespondBadRequest(c, "Invalid request body", err)
		return
	}

	if err := h.profiles.SaveSettings(c.Request.Context(), userID.(int), payload); err != nil {
		utils.RespondInternalError(c, "Internal Server Error", err)
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *ProfileHandler) SaveLastVenue(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		utils.RespondUnauthorized(c, "Unauthorized")
		return
	}

	var payload struct {
		LastVenue string `json:"lastVenue"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.RespondBadRequest(c, "Invalid request body", err)
		return
	}

	if err := h.profiles.SaveLastVenue(c.Request.Context(), userID.(int), payload.LastVenue); err != nil {
		utils.RespondInternalError(c, "Internal Server Error", err)
		return
	}

	c.Status(http.StatusNoContent)
}
```

```go
// backend/internal/omnigame/api/router.go
auth.PUT("/profile/omnirave/settings", profileHandler.SaveRuntimeSettings)
auth.PUT("/profile/omnirave/last-venue", profileHandler.SaveLastVenue)
```

- [ ] **Step 5: Run backend tests**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omnigame/service ./internal/omnigame/api/handlers ./internal/omnigame/repository -count=1`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add \
  backend/internal/database/migrations/107_omnirave_runtime_state.up.sql \
  backend/internal/database/migrations/107_omnirave_runtime_state.down.sql \
  backend/internal/omnigame/model/types.go \
  backend/internal/omnigame/repository/profile_repository.go \
  backend/internal/omnigame/repository/profile_repository_postgres.go \
  backend/internal/omnigame/repository/profile_repository_postgres_test.go \
  backend/internal/omnigame/service/profile_service.go \
  backend/internal/omnigame/service/session_service.go \
  backend/internal/omnigame/service/session_service_test.go \
  backend/internal/omnigame/api/handlers/profile_handler.go \
  backend/internal/omnigame/api/handlers/profile_handler_test.go \
  backend/internal/omnigame/api/router.go
git commit -m "feat: persist OmniRave runtime state"
```

---

## Task 3: Load Bootstrap Runtime State In The Browser

**Files:**
- Create: `omnirave-web/src/lib/settings.ts`
- Modify: `omnirave-web/src/lib/session.ts`
- Modify: `omnirave-web/src/lib/__tests__/session.test.ts`
- Modify: `omnirave-web/src/hooks/useWorldSession.ts`

- [ ] **Step 1: Write failing bootstrap/session tests**

```ts
// omnirave-web/src/lib/__tests__/session.test.ts
import { describe, expect, it, vi } from 'vitest';
import { bootstrapSession } from '../session';

describe('bootstrapSession', () => {
  it('parses OmniRave settings and last venue from exchange payload', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        playerId: 'user-42',
        playerName: 'nick',
        worldSocketUrl: 'ws://example',
        mode: 'account',
        activeZone: 'main_stage',
        lastVenue: 'underground',
        settings: {
          uiTheme: 'Hybrid Premium',
          graphicsMode: 'auto',
          displayNames: true,
          chatCollapsed: false,
          crouchMode: 'hold',
          cameraFollow: 'free',
        },
      }),
    });

    const session = await bootstrapSession({ search: '?handoff=abc&mode=account', fetcher: fetcher as never });
    expect(session.lastVenue).toBe('underground');
    expect(session.settings.uiTheme).toBe('Hybrid Premium');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/session.test.ts`

Expected: FAIL because `lastVenue` and `settings` are not part of the current runtime contract.

- [ ] **Step 3: Add runtime settings types and bootstrap handling**

```ts
// omnirave-web/src/lib/settings.ts
export type UiThemeName = 'Obsidian Glass' | 'Luminous Panels' | 'Hybrid Premium';
export type GraphicsMode = 'auto' | 'manual';
export type CameraFollowMode = 'auto-follow' | 'free';
export type CrouchMode = 'hold' | 'toggle';

export interface RuntimeSettings {
  uiTheme: UiThemeName;
  graphicsMode: GraphicsMode;
  graphicsLevel: number;
  displayNames: boolean;
  chatCollapsed: boolean;
  crouchMode: CrouchMode;
  cameraFollow: CameraFollowMode;
}

export const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  uiTheme: 'Luminous Panels',
  graphicsMode: 'auto',
  graphicsLevel: 7,
  displayNames: true,
  chatCollapsed: false,
  crouchMode: 'hold',
  cameraFollow: 'free',
};
```

```ts
// omnirave-web/src/lib/session.ts
import type { RuntimeSettings } from './settings';

export interface RuntimeSession {
  // existing fields...
  lastVenue: RuntimeZoneID;
  settings: RuntimeSettings;
}
```

```ts
// omnirave-web/src/hooks/useWorldSession.ts
const [settings, setSettings] = useState(DEFAULT_RUNTIME_SETTINGS);

void bootstrapPromiseRef.current.then((nextSession) => {
  if (!cancelled) {
    setSession(nextSession);
    setSettings(nextSession.settings);
  }
});

return {
  session,
  settings,
  setSettings,
  // existing return fields...
};
```

- [ ] **Step 4: Run runtime bootstrap tests**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/session.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  omnirave-web/src/lib/settings.ts \
  omnirave-web/src/lib/session.ts \
  omnirave-web/src/lib/__tests__/session.test.ts \
  omnirave-web/src/hooks/useWorldSession.ts
git commit -m "feat: load OmniRave runtime state on bootstrap"
```

---

## Task 4: Replace The Runtime Shell With The Approved HUD Foundation

**Files:**
- Create: `omnirave-web/src/components/SettingsPanel.tsx`
- Create: `omnirave-web/src/components/VenueStatusPanel.tsx`
- Create: `omnirave-web/src/components/TopLeftControls.tsx`
- Create: `omnirave-web/src/components/TopRightAuthControls.tsx`
- Create: `omnirave-web/src/components/EmoteBar.tsx`
- Modify: `omnirave-web/src/App.tsx`
- Modify: `omnirave-web/src/components/Hud.tsx`
- Modify: `omnirave-web/src/components/ChatPanel.tsx`
- Modify: `omnirave-web/src/styles.css`
- Modify: `omnirave-web/src/__tests__/App.test.tsx`
- Modify: `omnirave-web/src/components/__tests__/ChatPanel.test.tsx`

- [ ] **Step 1: Write failing UI-shell tests**

```tsx
// omnirave-web/src/__tests__/App.test.tsx
it('renders the persistent OmniRave HUD anchors', async () => {
  render(<App />);

  expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Avatar' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Chat' })).not.toBeInTheDocument();
  expect(screen.getByText('Current Venue')).toBeInTheDocument();
});
```

```tsx
// omnirave-web/src/components/__tests__/ChatPanel.test.tsx
it('keeps the input line visible when the history shell is collapsed', () => {
  render(<ChatPanel messages={[]} onSendMessage={() => {}} isSending={false} />);
  expect(screen.getByPlaceholderText('Type message...')).toBeVisible();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/__tests__/App.test.tsx src/components/__tests__/ChatPanel.test.tsx`

Expected: FAIL because the current runtime still renders `Chat` / `Style` utility buttons and lacks the approved HUD structure.

- [ ] **Step 3: Build the new HUD shell components**

```tsx
// omnirave-web/src/components/TopLeftControls.tsx
export function TopLeftControls(props: {
  openPanel: 'settings' | 'avatar' | null;
  onToggleSettings: () => void;
  onToggleAvatar: () => void;
}) {
  return (
    <div className="top-left-controls">
      <button type="button" className="hud-button" onClick={props.onToggleSettings}>
        Settings
      </button>
      <button type="button" className="hud-button" onClick={props.onToggleAvatar}>
        Avatar
      </button>
    </div>
  );
}
```

```tsx
// omnirave-web/src/components/VenueStatusPanel.tsx
import type { RuntimeSession } from '../lib/session';
import { zoneDisplayName } from '../lib/zones';

export function VenueStatusPanel({ session }: { session: RuntimeSession }) {
  return (
    <section className="venue-status-panel">
      <p className="venue-status-kicker">Current Venue</p>
      <h2>{zoneDisplayName(session.activeZone)}</h2>
      <p className="venue-status-track">
        {session.nowPlayingTitle ?? 'Track metadata pending'}
      </p>
      <p>OmniRavers: {session.globalPopulation ?? 0}</p>
      <p>{session.activeZone === 'main_stage' ? 'Main Stagers' : session.activeZone === 'underground' ? 'Undergrounders' : 'P.L.U.R.R. Partiers'}: {session.venuePopulation ?? 0}</p>
    </section>
  );
}
```

```tsx
// omnirave-web/src/App.tsx
const [openTopLeftPanel, setOpenTopLeftPanel] = useState<'settings' | 'avatar' | null>(null);

return (
  <div className="omnirave-shell">
    <StageAudioDeck zoneMedia={session.zoneMedia} onPlayersReady={/* existing callback */} />
    <WorldScene session={session} unlocked={mediaUnlock.unlocked} />

    <TopLeftControls
      openPanel={openTopLeftPanel}
      onToggleSettings={() => setOpenTopLeftPanel((current) => (current === 'settings' ? null : 'settings'))}
      onToggleAvatar={() => setOpenTopLeftPanel((current) => (current === 'avatar' ? null : 'avatar'))}
    />
    <TopRightAuthControls session={session} />
    {openTopLeftPanel === 'settings' ? <SettingsPanel settings={settings} /> : null}

    <ChatPanel messages={chatMessages} onSendMessage={sendChatMessage} isSending={false} />
    <EmoteBar />
    <VenueStatusPanel session={session} />
  </div>
);
```

```css
/* omnirave-web/src/styles.css */
.top-left-controls {
  position: absolute;
  top: 24px;
  left: 24px;
  display: flex;
  gap: 12px;
  z-index: 20;
}

.venue-status-panel {
  position: absolute;
  right: 24px;
  bottom: 24px;
  width: 320px;
  border-radius: 20px;
}

.emote-bar-shell {
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  width: 460px;
}
```

- [ ] **Step 4: Run runtime UI tests**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/__tests__/App.test.tsx src/components/__tests__/ChatPanel.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  omnirave-web/src/components/SettingsPanel.tsx \
  omnirave-web/src/components/VenueStatusPanel.tsx \
  omnirave-web/src/components/TopLeftControls.tsx \
  omnirave-web/src/components/TopRightAuthControls.tsx \
  omnirave-web/src/components/EmoteBar.tsx \
  omnirave-web/src/App.tsx \
  omnirave-web/src/components/Hud.tsx \
  omnirave-web/src/components/ChatPanel.tsx \
  omnirave-web/src/styles.css \
  omnirave-web/src/__tests__/App.test.tsx \
  omnirave-web/src/components/__tests__/ChatPanel.test.tsx
git commit -m "feat: add OmniRave HUD foundation"
```

---

## Task 5: Wire Immediate Settings Persistence Through The Runtime Shell

**Files:**
- Modify: `omnirave-web/src/lib/session.ts`
- Modify: `omnirave-web/src/hooks/useWorldSession.ts`
- Modify: `omnirave-web/src/components/SettingsPanel.tsx`
- Modify: `omnirave-web/src/lib/__tests__/session.test.ts`
- Modify: `omnirave-web/src/__tests__/App.test.tsx`

- [ ] **Step 1: Write failing persistence tests**

```ts
// omnirave-web/src/lib/__tests__/session.test.ts
import { saveRuntimeSettings } from '../session';

it('persists runtime settings for account sessions', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true });

  await saveRuntimeSettings({
    session: {
      playerId: 'user-42',
      playerName: 'nick',
      mode: 'account',
      worldSocketUrl: 'ws://example',
      activeZone: 'main_stage',
      settings: DEFAULT_RUNTIME_SETTINGS,
      lastVenue: 'main_stage',
      sessionToken: 'token',
    },
    settings: { ...DEFAULT_RUNTIME_SETTINGS, uiTheme: 'Hybrid Premium' },
    fetcher: fetcher as never,
  });

  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining('/api/v1/omnigame/profile/omnirave/settings'),
    expect.objectContaining({ method: 'PUT' }),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/session.test.ts`

Expected: FAIL because there is no `saveRuntimeSettings` helper yet.

- [ ] **Step 3: Add immediate-apply settings persistence**

```ts
// omnirave-web/src/lib/session.ts
export async function saveRuntimeSettings(input: {
  session: RuntimeSession;
  settings: RuntimeSettings;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}): Promise<void> {
  if (input.session.mode !== 'account' || !input.session.sessionToken) {
    return;
  }

  const fetcher = input.fetcher ?? fetch;
  const apiBaseUrl = input.apiBaseUrl ?? import.meta.env.VITE_OMNIGAME_API_URL ?? 'http://localhost:8091';
  const response = await fetcher(`${apiBaseUrl}/api/v1/omnigame/profile/omnirave/settings`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${input.session.sessionToken}`,
    },
    body: JSON.stringify(input.settings),
  });

  if (!response.ok) {
    throw new Error(`Runtime settings save failed with ${response.status}`);
  }
}
```

```ts
// omnirave-web/src/hooks/useWorldSession.ts
async function updateSettings(nextSettings: RuntimeSettings) {
  setSettings(nextSettings);
  setSession((current) => (current ? { ...current, settings: nextSettings } : current));

  if (!session) {
    return;
  }

  try {
    await saveRuntimeSettings({ session, settings: nextSettings });
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unable to save runtime settings');
    throw err;
  }
}
```

```tsx
// omnirave-web/src/components/SettingsPanel.tsx
export function SettingsPanel(props: {
  settings: RuntimeSettings;
  onUpdateSettings: (next: RuntimeSettings) => void;
}) {
  return (
    <section className="settings-window">
      <header className="settings-window-header">
        <h2>Settings</h2>
        <button type="button">Close</button>
      </header>

      <div className="settings-section">
        <p>Interface</p>
        <div className="settings-choice-row">
          {(['Obsidian Glass', 'Luminous Panels', 'Hybrid Premium'] as const).map((theme) => (
            <button
              key={theme}
              type="button"
              className={theme === props.settings.uiTheme ? 'active' : undefined}
              onClick={() => props.onUpdateSettings({ ...props.settings, uiTheme: theme })}
            >
              {theme}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run runtime tests**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/session.test.ts src/__tests__/App.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  omnirave-web/src/lib/session.ts \
  omnirave-web/src/hooks/useWorldSession.ts \
  omnirave-web/src/components/SettingsPanel.tsx \
  omnirave-web/src/lib/__tests__/session.test.ts \
  omnirave-web/src/__tests__/App.test.tsx
git commit -m "feat: persist OmniRave runtime settings"
```

---

## Self-Review

### Spec coverage for this plan

Covered by this plan:
- renamed venue IDs and labels
- persisted logged-in runtime settings
- persisted last venue
- bootstrap loading of saved settings before visible runtime render
- guest-vs-account settings behavior foundation
- approved HUD anchor structure
- bottom-right venue status shell
- settings window immediate-apply behavior foundation
- chat shell foundation

Intentionally deferred to later plans:
- actual 3D camera/movement/physics implementation
- authoritative venue-crossing state machine tied to free movement
- guest in-runtime login/signup/logout conversion implementation
- avatar generator, high-detail editor, save/cancel preview model behavior
- scheduled venue events and screen/event systems
- hosted audio timeline replacement and visualizer architecture

### Placeholder scan

No `TBD`, `TODO`, or “similar to previous task” placeholders are intentionally left in the task steps above.

### Type consistency

This plan consistently uses:
- `main_stage`
- `underground`
- `plurr_partay`
- `OmniRaveSettings`
- `lastVenue`

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-04-omnirave-runtime-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
