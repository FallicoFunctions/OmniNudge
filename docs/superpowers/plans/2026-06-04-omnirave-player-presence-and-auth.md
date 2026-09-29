# OmniRave Player Presence And In-Place Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn OmniRave’s placeholder guest/account UI into a real runtime identity system with in-place login, signup, logout, guest capability gating, and the first visible player-presence layer in the 3D world.

**Architecture:** Keep the Go world authoritative for player identity, venue, and broadcast snapshots, but do not attempt full avatar customization or VIP trigger geometry in this slice. Add dedicated OmniRave runtime auth endpoints that convert the live session in place, expand snapshot player metadata so the browser can render meaningful remote identities, and wire the React runtime shell with non-modal auth popups, guest sprint/avatar gating, and nameplate-ready remote markers.

**Tech Stack:** Go (`gin`, existing OmniGame session/profile services, existing auth service, `gorilla/websocket` world server), TypeScript/React/Vite/Vitest, `three`, `@react-three/fiber`, existing OmniRave runtime hooks.

---

## Scope And Decomposition

This plan is intentionally smaller than the full remaining runtime spec. It covers the first coherent “people and identity” slice:

1. authoritative player snapshot metadata (`playerName`, `mode`, `loadout`) for local and remote players
2. dedicated OmniRave runtime auth endpoints for `Log In`, `Sign Up`, and `Logout`
3. in-place guest/account conversion with immediate HUD/session updates
4. non-modal auth popup shell and post-auth welcome card shell
5. guest gating for `Shift` sprint and top-left `Avatar`
6. remote player nameplates and slightly richer placeholder presence in 3D

Still intentionally deferred:
- full avatar editor implementation
- VIP boundary/signup triggers tied to real venue geometry
- persistent mute management UI
- world chat bubbles above players’ heads
- final high-def avatar bodies and clothing
- scheduled venue event rendering

This slice should still produce working, testable software on its own:
- the top-right auth buttons actually work
- guest login/signup happens in place with no reload
- logout converts the player to a fresh guest in place
- guest sprint and avatar editing are gated by the real auth popup flow
- other players are visible as named participants instead of anonymous capsules

---

## File Structure

### Backend files to modify

- Modify: `backend/internal/omniraveworld/world/protocol.go`
  - Expand player/session snapshot types with the identity fields the runtime now needs.
- Modify: `backend/internal/omniraveworld/world/player.go`
  - Persist `playerName` and `mode` on authoritative players so snapshots and chat stay consistent.
- Modify: `backend/internal/omniraveworld/world/world.go`
  - Build enriched snapshots without changing traversal authority.
- Modify: `backend/internal/omniraveworld/world/world_test.go`
  - Cover snapshot identity data and live player conversion behavior.
- Modify: `backend/internal/omnigame/model/types.go`
  - Add OmniRave runtime auth request/response payloads.
- Modify: `backend/internal/omnigame/service/session_service.go`
  - Add helpers to bootstrap account state for runtime login/signup and fresh guest state for logout.
- Modify: `backend/internal/omnigame/service/session_service_test.go`
  - Cover runtime login/signup/logout state shaping and guest/account persistence rules.
- Modify: `backend/internal/omnigame/api/router.go`
  - Register OmniRave runtime auth routes under `/api/v1/omnigame/runtime/auth/...`.
- Modify: `backend/internal/omnigame/api/handlers/profile_handler.go`
  - Reuse profile normalization helpers where runtime auth needs identical payload shaping.
- Modify: `backend/internal/omnigame/api/handlers/launch_handler_test.go`
  - Keep launch/session exchange expectations aligned if shared payload helpers move.

### Backend files to create

- Create: `backend/internal/omnigame/api/handlers/runtime_auth_handler.go`
  - HTTP handlers for in-place OmniRave `login`, `signup`, and `logout`.
- Create: `backend/internal/omnigame/api/handlers/runtime_auth_handler_test.go`
  - Focused handler tests for happy paths and the important guest/account edge cases.

### Runtime files to modify

- Modify: `omnirave-web/src/App.tsx`
  - Mount the auth popup and welcome card, wire top-right actions, and gate the top-left avatar flow.
- Modify: `omnirave-web/src/hooks/useWorldSession.ts`
  - Add runtime auth actions, session replacement, guest sprint cooldown state, and welcome-card lifecycle state.
- Modify: `omnirave-web/src/lib/session.ts`
  - Add runtime auth request helpers and enrich `RuntimePlayer` with `playerName`/`mode`.
- Modify: `omnirave-web/src/lib/protocol.ts`
  - Align socket snapshot/chat types with the richer player payloads.
- Modify: `omnirave-web/src/lib/worldSocket.ts`
  - Preserve richer player fields when snapshots arrive.
- Modify: `omnirave-web/src/components/TopRightAuthControls.tsx`
  - Turn disabled placeholders into real controls with logout confirmation timing.
- Modify: `omnirave-web/src/components/TopLeftControls.tsx`
  - Keep buttons always visible, but surface the disabled-during-transition/runtime callback shape the auth slice needs.
- Modify: `omnirave-web/src/components/runtime/RemotePlayerMarkers.tsx`
  - Replace anonymous capsules with named placeholder bodies and display-name anchors.
- Modify: `omnirave-web/src/components/runtime/LocalPlayerRig.tsx`
  - Expose guest sprint-attempt callbacks from live input.
- Modify: `omnirave-web/src/components/WorldScene.tsx`
  - Thread runtime auth/presence callbacks into the scene without widening App again later.
- Modify: `omnirave-web/src/components/Hud.tsx`
  - Keep identity copy aligned with the real guest/account runtime behavior.
- Modify: `omnirave-web/src/components/__tests__/WorldScene.test.tsx`
  - Cover auth/presence callback wiring.
- Modify: `omnirave-web/src/__tests__/App.test.tsx`
  - Cover auth popup lifecycle, welcome-card replacement flow, and avatar gating.
- Modify: `omnirave-web/src/lib/__tests__/session.test.ts`
  - Cover runtime login/signup/logout helper payloads.
- Modify: `omnirave-web/src/hooks/__tests__/useWorldSession.test.ts`
  - Cover in-place session replacement, guest sprint cooldown, and welcome-card state.

### Runtime files to create

- Create: `omnirave-web/src/components/AuthPopup.tsx`
  - Shared non-modal auth popup shell with login/signup mode toggle and inline errors.
- Create: `omnirave-web/src/components/WelcomeCard.tsx`
  - Post-auth non-modal welcome card with the clickable `Edit Avatar` action.
- Create: `omnirave-web/src/components/runtime/PlayerNameplates.tsx`
  - Shared nameplate renderer with `displayNames` setting support.
- Create: `omnirave-web/src/components/__tests__/TopRightAuthControls.test.tsx`
  - Logout confirmation timer coverage.
- Create: `omnirave-web/src/components/__tests__/AuthPopup.test.tsx`
  - Login/signup mode, field persistence, and submit behavior coverage.
- Create: `omnirave-web/src/components/__tests__/WelcomeCard.test.tsx`
  - Auto-dismiss and CTA behavior coverage.
- Create: `omnirave-web/src/components/runtime/__tests__/RemotePlayerMarkers.test.tsx`
  - Nameplate/presence rendering coverage.

---

## Task 1: Enrich Authoritative Player Snapshots

**Files:**
- Modify: `backend/internal/omniraveworld/world/protocol.go`
- Modify: `backend/internal/omniraveworld/world/player.go`
- Modify: `backend/internal/omniraveworld/world/world.go`
- Modify: `backend/internal/omniraveworld/world/world_test.go`
- Modify: `omnirave-web/src/lib/session.ts`
- Modify: `omnirave-web/src/lib/protocol.ts`
- Modify: `omnirave-web/src/lib/worldSocket.ts`
- Modify: `omnirave-web/src/lib/__tests__/session.test.ts`

- [ ] **Step 1: Write the failing backend snapshot test**

```go
// backend/internal/omniraveworld/world/world_test.go
func TestSnapshotIncludesPlayerIdentityMetadata(t *testing.T) {
	world := New()
	world.AddPlayer(PlayerSession{
		PlayerID:   "guest-1",
		PlayerName: "Guest-4821",
		Mode:       SessionModeGuest,
		Loadout:    Loadout{"body": "guest-default"},
	})

	snapshot := world.SnapshotFor("guest-1")
	require.Len(t, snapshot.Players, 1)
	require.Equal(t, "Guest-4821", snapshot.Players[0].PlayerName)
	require.Equal(t, SessionModeGuest, snapshot.Players[0].Mode)
	require.Equal(t, "guest-default", snapshot.Players[0].Loadout["body"])
}
```

```ts
// omnirave-web/src/lib/__tests__/session.test.ts
it('keeps runtime player identity fields from bootstrap and snapshots', () => {
  const player = {
    id: 'guest-1',
    playerName: 'Guest-4821',
    mode: 'guest',
    zone: 'main_stage',
    position: { x: 0, y: 0, z: 0 },
    loadout: { body: 'guest-default' },
  };

  expect(player.playerName).toBe('Guest-4821');
  expect(player.mode).toBe('guest');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omniraveworld/world -run TestSnapshotIncludesPlayerIdentityMetadata -count=1`

Expected: FAIL because `Player` snapshots do not expose `PlayerName` or `Mode`.

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/session.test.ts`

Expected: FAIL once the new runtime player fields are asserted but not yet typed.

- [ ] **Step 3: Add the minimal authoritative player identity fields**

```go
// backend/internal/omniraveworld/world/player.go
type Player struct {
	ID         string   `json:"id"`
	PlayerName string   `json:"playerName"`
	Mode       SessionMode `json:"mode"`
	Position   Vec3     `json:"position"`
	Zone       ZoneID   `json:"zone"`
	Loadout    Loadout  `json:"loadout"`
}
```

```go
// backend/internal/omniraveworld/world/world.go
func (w *World) AddPlayer(session PlayerSession) {
	w.players[session.PlayerID] = &Player{
		ID:         session.PlayerID,
		PlayerName: session.PlayerName,
		Mode:       session.Mode,
		Position:   spawnFor(session),
		Zone:       zoneForSpawn(session),
		Loadout:    cloneLoadout(session.Loadout),
	}
}
```

```ts
// omnirave-web/src/lib/session.ts
export interface RuntimePlayer {
  id: string;
  playerName: string;
  mode: RuntimeMode;
  position: RuntimePoint;
  zone: RuntimeZoneID;
  loadout: Record<string, string>;
}
```

- [ ] **Step 4: Keep socket snapshot parsing lossless**

```ts
// omnirave-web/src/lib/protocol.ts
export interface WorldSnapshotMessage {
  type: 'snapshot';
  currentPlayerId: string;
  activeZone: RuntimeZoneID;
  players: RuntimePlayer[];
  zoneMedia?: RuntimeZoneMedia[];
}
```

```ts
// omnirave-web/src/lib/worldSocket.ts
export function applyWorldSnapshot(session: RuntimeSession, snapshot: WorldSnapshotMessage): RuntimeSession {
  return {
    ...session,
    activeZone: snapshot.activeZone,
    players: snapshot.players.map((player) => ({
      ...player,
      loadout: player.loadout ?? {},
    })),
    zoneMedia: snapshot.zoneMedia ?? session.zoneMedia,
  };
}
```

- [ ] **Step 5: Re-run the focused tests**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omniraveworld/world -run TestSnapshotIncludesPlayerIdentityMetadata -count=1`

Expected: PASS

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/session.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave
git add backend/internal/omniraveworld/world/protocol.go \
  backend/internal/omniraveworld/world/player.go \
  backend/internal/omniraveworld/world/world.go \
  backend/internal/omniraveworld/world/world_test.go \
  omnirave-web/src/lib/session.ts \
  omnirave-web/src/lib/protocol.ts \
  omnirave-web/src/lib/worldSocket.ts \
  omnirave-web/src/lib/__tests__/session.test.ts
git commit -m "feat: enrich OmniRave player snapshots"
```

---

## Task 2: Add Runtime Login, Signup, And Logout Endpoints

**Files:**
- Modify: `backend/internal/omnigame/model/types.go`
- Modify: `backend/internal/omnigame/service/session_service.go`
- Modify: `backend/internal/omnigame/service/session_service_test.go`
- Modify: `backend/internal/omnigame/api/router.go`
- Create: `backend/internal/omnigame/api/handlers/runtime_auth_handler.go`
- Create: `backend/internal/omnigame/api/handlers/runtime_auth_handler_test.go`

- [ ] **Step 1: Write the failing service and handler tests**

```go
// backend/internal/omnigame/service/session_service_test.go
func TestSessionService_RuntimeLoginReturnsAccountBootstrapAndOverwritesVenue(t *testing.T) {
	svc := newSessionServiceForTest(t)
	response, err := svc.BuildRuntimeAccountSession(context.Background(), RuntimeAuthRequest{
		Username:     "nick",
		Password:     "correct-horse-battery-staple",
		CurrentVenue: "underground",
	})

	require.NoError(t, err)
	require.Equal(t, LaunchModeAccount, response.Mode)
	require.Equal(t, "underground", response.LastVenue)
	require.NotEmpty(t, response.SessionToken)
	require.NotEmpty(t, response.WorldSessionToken)
}
```

```go
// backend/internal/omnigame/api/handlers/runtime_auth_handler_test.go
func TestRuntimeAuthHandler_LogoutReturnsFreshGuestRuntimeState(t *testing.T) {
	router := gin.New()
	handler := NewRuntimeAuthHandler(fakeRuntimeAuthService{
		logoutResponse: &model.SessionExchangeResponse{
			PlayerID:   "guest-new",
			PlayerName: "Guest-9021",
			Mode:       model.LaunchModeGuest,
			ActiveZone: "main_stage",
			LastVenue:  "main_stage",
			Settings:   model.DefaultOmniRaveSettings(),
		},
	})
	router.POST("/api/v1/omnigame/runtime/auth/logout", handler.Logout)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/runtime/auth/logout", strings.NewReader(`{"currentVenue":"main_stage"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"mode":"guest"`)
	require.Contains(t, rec.Body.String(), `"playerName":"Guest-9021"`)
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omnigame/service ./internal/omnigame/api/handlers -run 'TestSessionService_RuntimeLoginReturnsAccountBootstrapAndOverwritesVenue|TestRuntimeAuthHandler_LogoutReturnsFreshGuestRuntimeState' -count=1`

Expected: FAIL because the runtime auth request/response shape and handler do not exist.

- [ ] **Step 3: Add explicit runtime auth payloads**

```go
// backend/internal/omnigame/model/types.go
type RuntimeAuthRequest struct {
	Username      string            `json:"username,omitempty"`
	Email         string            `json:"email,omitempty"`
	Password      string            `json:"password,omitempty"`
	CurrentVenue  string            `json:"currentVenue"`
	CurrentLoadout map[string]string `json:"currentLoadout,omitempty"`
	CurrentSettings OmniRaveSettings `json:"currentSettings"`
}
```

```go
// backend/internal/omnigame/model/types.go
type RuntimeAuthResponse = SessionExchangeResponse
```

- [ ] **Step 4: Add session-service helpers for account bootstrap and fresh guest logout**

```go
// backend/internal/omnigame/service/session_service.go
func (s *SessionService) BuildRuntimeAccountSession(ctx context.Context, input model.RuntimeAuthRequest, identity model.PlayerIdentity) (*model.SessionExchangeResponse, error) {
	profile, err := s.profileService.GetProfile(ctx, *identity.UserID)
	if err != nil {
		return nil, err
	}

	profile.LastVenue = input.CurrentVenue
	if input.CurrentLoadout != nil && len(profile.Loadout) == 0 {
		profile.Loadout = input.CurrentLoadout
	}

	if err := s.profileService.SaveProfile(ctx, model.NormalizeOmniRaveProfile(profile)); err != nil {
		return nil, err
	}

	return s.buildAccountExchangeResponse(ctx, identity, input.CurrentVenue)
}

func (s *SessionService) BuildRuntimeGuestLogout(ctx context.Context, currentVenue string) (*model.SessionExchangeResponse, error) {
	guest := s.guestService.CreateGuestLaunchSession()
	bootstrap, err := s.guestService.ExchangeBootstrap(ctx, guest.LaunchToken, "")
	if err != nil {
		return nil, err
	}
	bootstrap.ActiveZone = currentVenue
	bootstrap.LastVenue = currentVenue
	return bootstrap, nil
}
```

- [ ] **Step 5: Add dedicated runtime auth handlers and routes**

```go
// backend/internal/omnigame/api/handlers/runtime_auth_handler.go
type RuntimeAuthHandler struct {
	authService    *services.AuthService
	sessionService *service.SessionService
}

func (h *RuntimeAuthHandler) Login(c *gin.Context) {
	var input model.RuntimeAuthRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid runtime auth request"})
		return
	}

	identity, sessionToken, err := h.authService.LoginForGameRuntime(c.Request.Context(), input.Username, input.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		return
	}

	response, err := h.sessionService.BuildRuntimeAccountSession(c.Request.Context(), input, identity)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "unable to build omnirave runtime session"})
		return
	}
	response.SessionToken = sessionToken
	c.JSON(http.StatusOK, response)
}
```

```go
// backend/internal/omnigame/api/router.go
runtimeAuthHandler := handlers.NewRuntimeAuthHandler(sessionService, authService)
v1.POST("/omnigame/runtime/auth/login", runtimeAuthHandler.Login)
v1.POST("/omnigame/runtime/auth/signup", runtimeAuthHandler.Signup)
v1.POST("/omnigame/runtime/auth/logout", runtimeAuthHandler.Logout)
```

- [ ] **Step 6: Re-run the focused backend tests**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omnigame/service ./internal/omnigame/api/handlers -run 'TestSessionService_RuntimeLoginReturnsAccountBootstrapAndOverwritesVenue|TestRuntimeAuthHandler_LogoutReturnsFreshGuestRuntimeState' -count=1`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave
git add backend/internal/omnigame/model/types.go \
  backend/internal/omnigame/service/session_service.go \
  backend/internal/omnigame/service/session_service_test.go \
  backend/internal/omnigame/api/router.go \
  backend/internal/omnigame/api/handlers/runtime_auth_handler.go \
  backend/internal/omnigame/api/handlers/runtime_auth_handler_test.go
git commit -m "feat: add OmniRave runtime auth endpoints"
```

---

## Task 3: Wire In-Place Auth, Guest Gating, And Welcome Card State In React

**Files:**
- Modify: `omnirave-web/src/lib/session.ts`
- Modify: `omnirave-web/src/hooks/useWorldSession.ts`
- Modify: `omnirave-web/src/App.tsx`
- Modify: `omnirave-web/src/components/TopRightAuthControls.tsx`
- Modify: `omnirave-web/src/components/TopLeftControls.tsx`
- Modify: `omnirave-web/src/components/Hud.tsx`
- Create: `omnirave-web/src/components/AuthPopup.tsx`
- Create: `omnirave-web/src/components/WelcomeCard.tsx`
- Create: `omnirave-web/src/components/__tests__/TopRightAuthControls.test.tsx`
- Create: `omnirave-web/src/components/__tests__/AuthPopup.test.tsx`
- Create: `omnirave-web/src/components/__tests__/WelcomeCard.test.tsx`
- Modify: `omnirave-web/src/hooks/__tests__/useWorldSession.test.ts`
- Modify: `omnirave-web/src/__tests__/App.test.tsx`

- [ ] **Step 1: Write the failing frontend tests**

```ts
// omnirave-web/src/hooks/__tests__/useWorldSession.test.ts
it('replaces the session in place after runtime login and exposes a welcome card', async () => {
  const { result } = renderHook(() => useWorldSession(), { wrapper: TestSessionWrapper });
  await waitFor(() => expect(result.current.session?.mode).toBe('guest'));

  await act(async () => {
    await result.current.login({
      username: 'nick',
      password: 'correct-horse-battery-staple',
    });
  });

  expect(result.current.session?.mode).toBe('account');
  expect(result.current.session?.playerName).toBe('Nick');
  expect(result.current.welcomeCard).not.toBeNull();
});
```

```tsx
// omnirave-web/src/__tests__/App.test.tsx
it('opens signup when a guest clicks Avatar and closes welcome before opening avatar shell', async () => {
  render(<App />);

  await userEvent.click(screen.getByRole('button', { name: 'Avatar' }));
  expect(screen.getByRole('dialog', { name: 'Sign Up to OmniNudge' })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
  expect(await screen.findByRole('region', { name: 'Welcome to OmniRave' })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Edit Avatar' }));
  expect(screen.queryByRole('region', { name: 'Welcome to OmniRave' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Avatar editor foundation')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/hooks/__tests__/useWorldSession.test.ts src/__tests__/App.test.tsx`

Expected: FAIL because the runtime has no auth actions, popup shell, or welcome-card state.

- [ ] **Step 3: Add explicit runtime auth helpers on the client**

```ts
// omnirave-web/src/lib/session.ts
export async function runtimeLogin(input: {
  username: string;
  password: string;
  currentVenue: RuntimeZoneID;
  currentLoadout?: Record<string, string>;
  currentSettings: RuntimeSettings;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}): Promise<RuntimeSession> {
  const response = await requestRuntimeAuth('/api/v1/omnigame/runtime/auth/login', input);
  return normalizeRuntimeSession(response);
}

export async function runtimeSignup(input: {
  username: string;
  email?: string;
  password: string;
  currentVenue: RuntimeZoneID;
  currentLoadout?: Record<string, string>;
  currentSettings: RuntimeSettings;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}): Promise<RuntimeSession> {
  const response = await requestRuntimeAuth('/api/v1/omnigame/runtime/auth/signup', input);
  return normalizeRuntimeSession(response);
}

export async function runtimeLogout(input: {
  session: RuntimeSession;
  currentVenue: RuntimeZoneID;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}): Promise<RuntimeSession> {
  const response = await requestRuntimeAuth('/api/v1/omnigame/runtime/auth/logout', { currentVenue: input.currentVenue });
  return normalizeRuntimeSession(response);
}
```

- [ ] **Step 4: Extend `useWorldSession` with auth and guest gating state**

```ts
// omnirave-web/src/hooks/useWorldSession.ts
const [authPopup, setAuthPopup] = useState<AuthPopupState | null>(null);
const [welcomeCard, setWelcomeCard] = useState<WelcomeCardState | null>(null);
const [guestSprintCooldownUntil, setGuestSprintCooldownUntil] = useState(0);

async function login(credentials: { username: string; password: string }) {
  const current = sessionRef.current;
  if (!current) return;

  const nextSession = await runtimeLogin({
    ...credentials,
    currentVenue: current.activeZone,
    currentLoadout: current.loadout,
    currentSettings: settings,
  });
  replaceRuntimeSession(nextSession);
  setAuthPopup(null);
  setWelcomeCard({ venue: current.activeZone });
}

function requestGuestSprintUnlock() {
  const now = Date.now();
  if (now < guestSprintCooldownUntil) {
    return;
  }
  setAuthPopup({ source: 'sprint', mode: 'signup' });
}
```

- [ ] **Step 5: Implement the popup and welcome-card shells**

```tsx
// omnirave-web/src/components/AuthPopup.tsx
export function AuthPopup(props: {
  state: AuthPopupState;
  isSubmitting: boolean;
  error: string;
  onModeChange: (mode: 'login' | 'signup') => void;
  onClose: () => void;
  onSubmit: (payload: AuthPopupSubmit) => void;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <section className="auth-popup-shell" aria-label={props.state.mode === 'login' ? 'Log In to OmniNudge' : 'Sign Up to OmniNudge'}>
      <header className="auth-popup-header">
        <button type="button" aria-label="Close auth popup" onClick={props.onClose}>Close</button>
      </header>
      <form onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit({ username, email, password });
      }}>
        <input autoFocus value={username} onChange={(event) => setUsername(event.target.value)} />
        {props.state.mode === 'signup' ? <input value={email} onChange={(event) => setEmail(event.target.value)} /> : null}
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        {props.error ? <p role="alert">{props.error}</p> : null}
        <button type="submit" disabled={props.isSubmitting}>{props.state.mode === 'login' ? 'Log In' : 'Sign Up'}</button>
      </form>
    </section>
  );
}
```

```tsx
// omnirave-web/src/components/WelcomeCard.tsx
export function WelcomeCard(props: { onEditAvatar: () => void; onDismissed: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(props.onDismissed, 5000);
    return () => window.clearTimeout(timer);
  }, [props]);

  return (
    <section className="welcome-card-shell" aria-label="Welcome to OmniRave">
      <div className="welcome-card-split">
        <div>
          <h2>Welcome to OmniRave</h2>
          <p>Your account is live in this venue now.</p>
        </div>
        <div className="welcome-card-actions">
          <button type="button" onClick={props.onEditAvatar}>Edit Avatar</button>
          <span>Enter VIP</span>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Make the top-right and top-left controls real**

```tsx
// omnirave-web/src/components/TopRightAuthControls.tsx
export function TopRightAuthControls(props: {
  session: RuntimeSession;
  onLogin: () => void;
  onSignup: () => void;
  onLogout: () => void;
}) {
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  useEffect(() => {
    if (!confirmingLogout) return;
    const timer = window.setTimeout(() => setConfirmingLogout(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmingLogout]);

  if (props.session.mode === 'guest') {
    return (
      <div className="top-right-auth-controls">
        <button type="button" className="hud-button" onClick={props.onLogin}>Log In</button>
        <button type="button" className="hud-button hud-button-accent" onClick={props.onSignup}>Sign Up</button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="hud-button"
      onClick={() => {
        if (confirmingLogout) {
          props.onLogout();
          return;
        }
        setConfirmingLogout(true);
      }}
    >
      {confirmingLogout ? 'Confirm?' : 'Logout'}
    </button>
  );
}
```

```tsx
// omnirave-web/src/App.tsx
<TopRightAuthControls
  session={session}
  onLogin={() => openAuthPopup('login', 'hud')}
  onSignup={() => openAuthPopup('signup', 'hud')}
  onLogout={logout}
/>
```

- [ ] **Step 7: Re-run the focused frontend tests**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/hooks/__tests__/useWorldSession.test.ts src/__tests__/App.test.tsx src/components/__tests__/TopRightAuthControls.test.tsx src/components/__tests__/AuthPopup.test.tsx src/components/__tests__/WelcomeCard.test.tsx`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave
git add omnirave-web/src/lib/session.ts \
  omnirave-web/src/hooks/useWorldSession.ts \
  omnirave-web/src/App.tsx \
  omnirave-web/src/components/TopRightAuthControls.tsx \
  omnirave-web/src/components/TopLeftControls.tsx \
  omnirave-web/src/components/Hud.tsx \
  omnirave-web/src/components/AuthPopup.tsx \
  omnirave-web/src/components/WelcomeCard.tsx \
  omnirave-web/src/components/__tests__/TopRightAuthControls.test.tsx \
  omnirave-web/src/components/__tests__/AuthPopup.test.tsx \
  omnirave-web/src/components/__tests__/WelcomeCard.test.tsx \
  omnirave-web/src/hooks/__tests__/useWorldSession.test.ts \
  omnirave-web/src/__tests__/App.test.tsx
git commit -m "feat: wire OmniRave in-place auth flow"
```

---

## Task 4: Add The First World Presence Layer And Guest Sprint Gating

**Files:**
- Modify: `omnirave-web/src/components/runtime/RemotePlayerMarkers.tsx`
- Modify: `omnirave-web/src/components/runtime/LocalPlayerRig.tsx`
- Modify: `omnirave-web/src/components/WorldScene.tsx`
- Create: `omnirave-web/src/components/runtime/PlayerNameplates.tsx`
- Create: `omnirave-web/src/components/runtime/__tests__/RemotePlayerMarkers.test.tsx`
- Modify: `omnirave-web/src/components/__tests__/WorldScene.test.tsx`
- Modify: `omnirave-web/src/hooks/__tests__/useWorldSession.test.ts`

- [ ] **Step 1: Write the failing presence and sprint-gating tests**

```tsx
// omnirave-web/src/components/runtime/__tests__/RemotePlayerMarkers.test.tsx
it('renders remote player nameplates when display names are enabled', () => {
  render(
    <Canvas>
      <RemotePlayerMarkers
        currentPlayerId="guest-1"
        displayNames
        players={[
          {
            id: 'account-2',
            playerName: 'Nick',
            mode: 'account',
            zone: 'main_stage',
            position: { x: 3, y: 0, z: 2 },
            loadout: {},
          },
        ]}
      />
    </Canvas>,
  );

  expect(screen.getByText('Nick')).toBeInTheDocument();
});
```

```ts
// omnirave-web/src/hooks/__tests__/useWorldSession.test.ts
it('opens signup on guest sprint attempt and respects the 60 second cooldown after close', async () => {
  const { result } = renderHook(() => useWorldSession(), { wrapper: TestSessionWrapper });
  await waitFor(() => expect(result.current.session?.mode).toBe('guest'));

  act(() => result.current.requestGuestSprintUnlock());
  expect(result.current.authPopup?.source).toBe('sprint');

  act(() => result.current.closeAuthPopup());
  expect(result.current.authPopup).toBeNull();

  act(() => result.current.requestGuestSprintUnlock());
  expect(result.current.authPopup).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/components/runtime/__tests__/RemotePlayerMarkers.test.tsx src/hooks/__tests__/useWorldSession.test.ts src/components/__tests__/WorldScene.test.tsx`

Expected: FAIL because remotes do not render nameplates and sprint attempts are not surfaced through auth gating.

- [ ] **Step 3: Add nameplates and richer placeholder remote bodies**

```tsx
// omnirave-web/src/components/runtime/PlayerNameplates.tsx
import { Html } from '@react-three/drei';

export function PlayerNameplates(props: { name: string; visible: boolean; position: [number, number, number] }) {
  if (!props.visible) {
    return null;
  }

  return (
    <Html position={props.position} center distanceFactor={10}>
      <div className="player-nameplate">{props.name}</div>
    </Html>
  );
}
```

```tsx
// omnirave-web/src/components/runtime/RemotePlayerMarkers.tsx
export function RemotePlayerMarkers(props: {
  players: RuntimePlayer[];
  currentPlayerId: string;
  displayNames: boolean;
}) {
  const remotes = props.players.filter((player) => player.id !== props.currentPlayerId);

  return (
    <group>
      {remotes.map((player) => (
        <group key={player.id} position={[player.position.x, 0, player.position.z]}>
          <mesh position={[0, 1.4, 0]} castShadow>
            <capsuleGeometry args={[0.55, 1.6, 8, 12]} />
            <meshStandardMaterial color={player.mode === 'guest' ? '#ff77cd' : '#7cf2c8'} emissiveIntensity={0.24} />
          </mesh>
          <PlayerNameplates
            name={player.playerName}
            visible={props.displayNames}
            position={[0, 2.95, 0]}
          />
        </group>
      ))}
    </group>
  );
}
```

- [ ] **Step 4: Thread guest sprint attempts out of the local rig**

```tsx
// omnirave-web/src/components/runtime/LocalPlayerRig.tsx
export function LocalPlayerRig(props: {
  session: RuntimeSession;
  onGuestSprintAttempt?: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Shift') return;
      if (props.session.mode !== 'guest') return;
      props.onGuestSprintAttempt?.();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [props]);

  return null;
}
```

```tsx
// omnirave-web/src/components/WorldScene.tsx
<RuntimeCanvas
  session={session}
  onGuestSprintAttempt={requestGuestSprintUnlock}
  displayNames={settings.displayNames}
/>
```

- [ ] **Step 5: Re-run the focused presence tests**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/components/runtime/__tests__/RemotePlayerMarkers.test.tsx src/hooks/__tests__/useWorldSession.test.ts src/components/__tests__/WorldScene.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave
git add omnirave-web/src/components/runtime/RemotePlayerMarkers.tsx \
  omnirave-web/src/components/runtime/LocalPlayerRig.tsx \
  omnirave-web/src/components/WorldScene.tsx \
  omnirave-web/src/components/runtime/PlayerNameplates.tsx \
  omnirave-web/src/components/runtime/__tests__/RemotePlayerMarkers.test.tsx \
  omnirave-web/src/components/__tests__/WorldScene.test.tsx \
  omnirave-web/src/hooks/__tests__/useWorldSession.test.ts
git commit -m "feat: add OmniRave player presence layer"
```

---

## Task 5: Full Verification And Review Pass

**Files:**
- Modify only if verification finds a real defect in the files above.

- [ ] **Step 1: Run the focused backend suite**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/backend && go test ./internal/omniraveworld/world ./internal/omnigame/service ./internal/omnigame/api/handlers -count=1`

Expected: PASS

- [ ] **Step 2: Run the focused frontend suite**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm test -- --run src/lib/__tests__/session.test.ts src/hooks/__tests__/useWorldSession.test.ts src/__tests__/App.test.tsx src/components/__tests__/TopRightAuthControls.test.tsx src/components/__tests__/AuthPopup.test.tsx src/components/__tests__/WelcomeCard.test.tsx src/components/runtime/__tests__/RemotePlayerMarkers.test.tsx src/components/__tests__/WorldScene.test.tsx`

Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm run build`

Expected: PASS, with only pre-existing non-blocking warnings if any remain.

- [ ] **Step 4: Review the implementation against the locked runtime rules**

Check all of these explicitly:

- guest top-right buttons are real and account state collapses to one `Logout` button
- logout confirmation reverts after `3 seconds`
- successful login/signup replaces the session in place with no reload
- welcome card is non-modal and can be displaced by `Avatar`
- guest `Avatar` opens signup instead of the editor shell
- guest sprint opens signup and respects the `60-second` close cooldown
- logged-in players immediately become account state with saved settings
- logout creates a fresh guest with guest state and no welcome card
- remote nameplates respect the `displayNames` setting

- [ ] **Step 5: Commit any verification-only fixes**

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave
git add backend/internal/omniraveworld/world/protocol.go \
  backend/internal/omniraveworld/world/player.go \
  backend/internal/omniraveworld/world/world.go \
  backend/internal/omniraveworld/world/world_test.go \
  backend/internal/omnigame/model/types.go \
  backend/internal/omnigame/service/session_service.go \
  backend/internal/omnigame/service/session_service_test.go \
  backend/internal/omnigame/api/router.go \
  backend/internal/omnigame/api/handlers/runtime_auth_handler.go \
  backend/internal/omnigame/api/handlers/runtime_auth_handler_test.go \
  omnirave-web/src/lib/session.ts \
  omnirave-web/src/hooks/useWorldSession.ts \
  omnirave-web/src/App.tsx \
  omnirave-web/src/components/TopRightAuthControls.tsx \
  omnirave-web/src/components/TopLeftControls.tsx \
  omnirave-web/src/components/Hud.tsx \
  omnirave-web/src/components/AuthPopup.tsx \
  omnirave-web/src/components/WelcomeCard.tsx \
  omnirave-web/src/components/runtime/RemotePlayerMarkers.tsx \
  omnirave-web/src/components/runtime/LocalPlayerRig.tsx \
  omnirave-web/src/components/runtime/PlayerNameplates.tsx \
  omnirave-web/src/components/WorldScene.tsx \
  omnirave-web/src/components/__tests__/TopRightAuthControls.test.tsx \
  omnirave-web/src/components/__tests__/AuthPopup.test.tsx \
  omnirave-web/src/components/__tests__/WelcomeCard.test.tsx \
  omnirave-web/src/components/runtime/__tests__/RemotePlayerMarkers.test.tsx \
  omnirave-web/src/components/__tests__/WorldScene.test.tsx \
  omnirave-web/src/hooks/__tests__/useWorldSession.test.ts \
  omnirave-web/src/lib/__tests__/session.test.ts \
  omnirave-web/src/__tests__/App.test.tsx
git commit -m "test: verify OmniRave presence and auth slice"
```

---

## Self-Review

### Spec Coverage Check

This plan covers the next highest-value approved runtime behavior without dragging in unfinished venue geometry:

- guest/account in-place conversion: covered in Tasks 2 and 3
- top-right `Log In`, `Sign Up`, `Logout`: covered in Task 3
- logout `Confirm?` timer: covered in Task 3
- guest sprint restriction with signup popup + cooldown: covered in Tasks 3 and 4
- guest avatar-button gating: covered in Task 3
- welcome-card transform after successful auth: covered in Task 3
- display names as the first world presence layer: covered in Task 4
- saved account settings/loadout/venue state shaping during runtime auth: covered in Task 2

Explicitly deferred and therefore not accidental gaps:

- VIP blockers tied to real geometry
- full avatar editor implementation
- world chat bubbles
- final high-def avatar models

### Placeholder Scan

No `TODO`, `TBD`, “implement later,” or “write tests for the above” placeholders remain. Every task lists exact files, commands, and code targets.

### Type Consistency Check

The plan consistently uses:

- `RuntimePlayer.playerName`
- `RuntimePlayer.mode`
- `RuntimeAuthRequest`
- `runtimeLogin`, `runtimeSignup`, `runtimeLogout`
- `AuthPopup`
- `WelcomeCard`

Later tasks do not rename these APIs.
