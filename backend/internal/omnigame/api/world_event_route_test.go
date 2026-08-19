package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/omnigame/repository"
	"github.com/omninudge/backend/internal/omnigame/service"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/require"
)

const (
	testWorldEventSecret = "world-event-secret-that-is-long-enough-ok"
	worldEventRoute      = "/api/v1/omnigame/world-event/omnirave"
)

// newWorldEventRouter builds the real router against a real database. The
// claims under test are about what ends up in omnichat_memory_episodes, and a
// fake store could be made to report anything.
func newWorldEventRouter(t *testing.T) (*gin.Engine, *pgxpool.Pool, *services.AuthService) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db := testutil.NewTestDatabase(t)

	authService := services.NewAuthService("dev-secret", "OmniGame/1.0", "")
	sessionService := service.NewSessionServiceWithDependencies(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
		authService,
	)

	worldEvents, err := services.NewWorldEventAuth(testWorldEventSecret, "dev-secret")
	require.NoError(t, err)
	admissionAuth, err := services.NewPersonaAdmissionAuth(testAdmitSecret, "dev-secret")
	require.NoError(t, err)

	characterMemory := services.NewOmniChatMemoryService(
		models.NewOmniChatMemoryRepository(db.Pool), nil, nil, nil, nil,
	)

	router := NewRouter(
		sessionService,
		authService,
		service.NewAdmissionService(repository.NewInMemoryPersonaRepository(), repository.NewInMemoryProfileRepository(), authService),
		admissionAuth,
		worldEvents,
		characterMemory,
		[]string{"127.0.0.1/32", "::1/128"},
	)

	return router, db.Pool, authService
}

func insertPlatformPersona(t *testing.T, pool *pgxpool.Pool, slug string) int64 {
	t.Helper()
	var personaID int64
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO bot_personas (slug, name, system_prompt) VALUES ($1, 'Resident', 'x') RETURNING id
	`, slug).Scan(&personaID))
	return personaID
}

func postWorldEvent(t *testing.T, router *gin.Engine, body string, prepare func(*http.Request)) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, worldEventRoute, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if prepare != nil {
		prepare(req)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func worldEventCredential(t *testing.T, personaID int64) string {
	t.Helper()
	auth, err := services.NewWorldEventAuth(testWorldEventSecret, "dev-secret")
	require.NoError(t, err)
	token, err := auth.Mint(personaID, time.Minute)
	require.NoError(t, err)
	return token
}

// The acceptance test for the memory boundary: what the world reports about a
// resident lands in the character's own tier, owned by nobody and derived from
// no conversation. Both are read off the row rather than out of the response,
// because the row is what recall reads and what the tier check constrains.
func TestRouter_WorldEventWritesTheSelfTier(t *testing.T) {
	router, pool, _ := newWorldEventRouter(t)
	personaID := insertPlatformPersona(t, pool, "world-event-resident")

	rec := postWorldEvent(t,
		router,
		`{"title":"Came third on the Moon Circuit","summary":"Held the inside line and finished third."}`,
		func(req *http.Request) {
			req.Header.Set("Authorization", "Bearer "+worldEventCredential(t, personaID))
		},
	)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

	var payload map[string]int64
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &payload))
	require.NotZero(t, payload["episodeId"])

	var (
		ownerUserID    *int
		conversationID *int
		title          string
	)
	require.NoError(t, pool.QueryRow(context.Background(), `
		SELECT owner_user_id, conversation_id, title FROM omnichat_memory_episodes WHERE id = $1
	`, payload["episodeId"]).Scan(&ownerUserID, &conversationID, &title))

	require.Nil(t, ownerUserID, "a world event belongs to the character, not to a user")
	require.Nil(t, conversationID, "a world event comes from no conversation")
	require.Equal(t, "Came third on the Moon Circuit", title)
}

// A user's own character is never a resident, so nothing ever writes it a self
// tier -- not even the world holding a valid credential naming it.
func TestRouter_WorldEventRefusesUserOwnedCharacter(t *testing.T) {
	router, pool, _ := newWorldEventRouter(t)
	ctx := context.Background()

	var ownerID int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO users (username, username_normalized, password_hash)
		VALUES ('world_event_owner', 'world_event_owner', 'x') RETURNING id
	`).Scan(&ownerID))

	var personaID int64
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, system_prompt, owner_user_id, visibility)
		VALUES ('world-event-private', 'Private', 'x', $1, 'private') RETURNING id
	`, ownerID).Scan(&personaID))

	rec := postWorldEvent(t,
		router,
		`{"title":"Came third on the Moon Circuit","summary":"A private character was never there."}`,
		func(req *http.Request) {
			req.Header.Set("Authorization", "Bearer "+worldEventCredential(t, personaID))
		},
	)
	require.Equal(t, http.StatusForbidden, rec.Code)

	var count int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM omnichat_memory_episodes WHERE persona_id = $1`, personaID).Scan(&count))
	require.Zero(t, count, "a refused world event must write nothing")
}

// And the same refusal for a character its owner published. This is the state
// the ownership rule exists for and the one a user reaches without doing
// anything unusual: a character card is created public and active by default.
// The private fixture above cannot show the rule works, because visibility
// refuses that row on its own.
func TestRouter_WorldEventRefusesAPublishedUserOwnedCharacter(t *testing.T) {
	router, pool, _ := newWorldEventRouter(t)
	ctx := context.Background()

	var ownerID int
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO users (username, username_normalized, password_hash)
		VALUES ('world_event_publisher', 'world_event_publisher', 'x') RETURNING id
	`).Scan(&ownerID))

	var personaID int64
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, system_prompt, owner_user_id, visibility, is_active)
		VALUES ('world-event-published', 'Published', 'x', $1, 'public', TRUE) RETURNING id
	`, ownerID).Scan(&personaID))

	rec := postWorldEvent(t,
		router,
		`{"title":"Came third on the Moon Circuit","summary":"A published card is still nobody's resident."}`,
		func(req *http.Request) {
			req.Header.Set("Authorization", "Bearer "+worldEventCredential(t, personaID))
		},
	)
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())

	var count int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM omnichat_memory_episodes WHERE persona_id = $1`, personaID).Scan(&count))
	require.Zero(t, count, "a refused world event must write nothing")
}

// The impersonation case. A logged-in user's browser sends its site cookie
// automatically, so if one could satisfy this route, any page could make a
// signed-in user write into a character's own memory -- which every other user
// of that character then reads back.
func TestRouter_WorldEventRefusesSiteSessionCookie(t *testing.T) {
	router, pool, authService := newWorldEventRouter(t)
	personaID := insertPlatformPersona(t, pool, "world-event-cookie")

	siteToken, err := authService.GenerateJWT(42, "alice", "user")
	require.NoError(t, err)

	for _, tc := range []struct {
		name    string
		prepare func(*http.Request)
	}{
		{
			name: "the cookie the site sets",
			prepare: func(req *http.Request) {
				req.AddCookie(&http.Cookie{Name: services.AccessTokenCookieName, Value: siteToken})
			},
		},
		{
			name: "the same token offered as a bearer",
			prepare: func(req *http.Request) {
				req.Header.Set("Authorization", "Bearer "+siteToken)
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := postWorldEvent(t, router,
				`{"title":"I was there","summary":"A user says so."}`, tc.prepare)
			require.Equal(t, http.StatusUnauthorized, rec.Code)

			var count int
			require.NoError(t, pool.QueryRow(context.Background(),
				`SELECT count(*) FROM omnichat_memory_episodes WHERE persona_id = $1`, personaID).Scan(&count))
			require.Zero(t, count, "a user session must write nothing to a character's own memory")
		})
	}
}

// The key-confusion case, pinned. Admitting a character to a world and writing
// that character's memory are different powers held by different callers, and
// the credentials must not be interchangeable: a runtime that may put a
// character into a venue must not thereby be able to write what it did there.
func TestRouter_WorldEventRefusesAPersonaAdmissionCredential(t *testing.T) {
	router, pool, _ := newWorldEventRouter(t)
	personaID := insertPlatformPersona(t, pool, "world-event-keyconfusion")

	admission, err := services.NewPersonaAdmissionAuth(testAdmitSecret, "dev-secret")
	require.NoError(t, err)
	admitToken, err := admission.Mint(personaID, time.Minute)
	require.NoError(t, err)

	rec := postWorldEvent(t, router,
		`{"title":"Came third on the Moon Circuit","summary":"Reported with the wrong credential."}`,
		func(req *http.Request) {
			req.Header.Set("Authorization", "Bearer "+admitToken)
		},
	)
	require.Equal(t, http.StatusUnauthorized, rec.Code)

	var count int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT count(*) FROM omnichat_memory_episodes WHERE persona_id = $1`, personaID).Scan(&count))
	require.Zero(t, count)

	// And the admission route does not accept the world-event credential
	// either, so this is a boundary rather than a one-way check.
	admitReq := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/admit/omnirave", nil)
	admitReq.Header.Set("Authorization", "Bearer "+worldEventCredential(t, personaID))
	admitRec := httptest.NewRecorder()
	router.ServeHTTP(admitRec, admitReq)
	require.Equal(t, http.StatusUnauthorized, admitRec.Code)
}

// A token with no exp is refused rather than honoured forever. The TTL cap
// lives in Mint and so binds only an honest issuer; what binds anyone holding
// the secret is that validation demands an expiry.
func TestRouter_WorldEventRefusesCredentialWithoutExpiry(t *testing.T) {
	router, pool, _ := newWorldEventRouter(t)
	personaID := insertPlatformPersona(t, pool, "world-event-noexp")

	claims := services.WorldEventClaims{
		PersonaID: personaID,
		Use:       services.WorldEventTokenUse,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt: jwt.NewNumericDate(time.Now()),
			Issuer:   "OmniNudge",
		},
	}
	forged, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testWorldEventSecret))
	require.NoError(t, err)

	rec := postWorldEvent(t, router,
		`{"title":"Came third on the Moon Circuit","summary":"Reported with an immortal credential."}`,
		func(req *http.Request) {
			req.Header.Set("Authorization", "Bearer "+forged)
		},
	)
	require.Equal(t, http.StatusUnauthorized, rec.Code)

	var count int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT count(*) FROM omnichat_memory_episodes WHERE persona_id = $1`, personaID).Scan(&count))
	require.Zero(t, count)
}

// The character is named in the signed credential and never in the body. If
// the body could name it, one credential would be able to write memories into
// every resident, and naming the persona inside the token would stop meaning
// anything.
//
// Both spellings are sent, because a body is only ignored if it is ignored
// however it is written.
func TestRouter_WorldEventIgnoresPersonaNamedInTheBody(t *testing.T) {
	for _, body := range []string{
		`{"persona_id": 999, "title":"Came third on the Moon Circuit","summary":"Third place."}`,
		`{"personaID": 999, "title":"Came third on the Moon Circuit","summary":"Third place."}`,
	} {
		t.Run(body, func(t *testing.T) {
			router, pool, _ := newWorldEventRouter(t)
			credentialed := insertPlatformPersona(t, pool, "world-event-body-credentialed")
			named := insertPlatformPersona(t, pool, "world-event-body-named")

			rec := postWorldEvent(t, router, body, func(req *http.Request) {
				req.Header.Set("Authorization", "Bearer "+worldEventCredential(t, credentialed))
			})
			require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

			var payload map[string]int64
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &payload))

			var personaID int64
			require.NoError(t, pool.QueryRow(context.Background(),
				`SELECT persona_id FROM omnichat_memory_episodes WHERE id = $1`, payload["episodeId"]).Scan(&personaID))
			require.Equal(t, credentialed, personaID, "the credential names the character, not the body")

			var count int
			require.NoError(t, pool.QueryRow(context.Background(),
				`SELECT count(*) FROM omnichat_memory_episodes WHERE persona_id = $1`, named).Scan(&count))
			require.Zero(t, count, "the character named in the body must be untouched")
		})
	}
}

// An event with nothing in it is not a memory, and saying so is a 400 rather
// than a refusal about the character.
func TestRouter_WorldEventRequiresTitleAndSummary(t *testing.T) {
	router, pool, _ := newWorldEventRouter(t)
	personaID := insertPlatformPersona(t, pool, "world-event-blank")

	for _, body := range []string{`{}`, `{"title":"   ","summary":"x"}`, `{"title":"x","summary":""}`} {
		t.Run(body, func(t *testing.T) {
			rec := postWorldEvent(t, router, body, func(req *http.Request) {
				req.Header.Set("Authorization", "Bearer "+worldEventCredential(t, personaID))
			})
			require.Equal(t, http.StatusBadRequest, rec.Code)
		})
	}
}

// Unconfigured is not unguarded: a deployment without the secret refuses every
// report rather than accepting them uncredentialed.
func TestRouter_WorldEventRefusesWhenSecretIsUnconfigured(t *testing.T) {
	gin.SetMode(gin.TestMode)
	authService := services.NewAuthService("dev-secret", "OmniGame/1.0", "")
	sessionService := service.NewSessionServiceWithDependencies(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
		authService,
	)
	router := NewRouter(sessionService, authService, nil, nil, nil, nil, []string{"127.0.0.1/32", "::1/128"})

	rec := postWorldEvent(t, router, `{"title":"x","summary":"y"}`, func(req *http.Request) {
		req.Header.Set("Authorization", "Bearer anything")
	})
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
}

// And a deployment with the secret but no database refuses too, rather than
// accepting a report it cannot store: the world must not be left believing a
// character remembers something it does not.
func TestRouter_WorldEventRefusesWithoutADatabase(t *testing.T) {
	gin.SetMode(gin.TestMode)
	authService := services.NewAuthService("dev-secret", "OmniGame/1.0", "")
	sessionService := service.NewSessionServiceWithDependencies(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
		authService,
	)
	worldEvents, err := services.NewWorldEventAuth(testWorldEventSecret, "dev-secret")
	require.NoError(t, err)

	router := NewRouter(sessionService, authService, nil, nil, worldEvents, nil, []string{"127.0.0.1/32", "::1/128"})

	rec := postWorldEvent(t, router, `{"title":"x","summary":"y"}`, func(req *http.Request) {
		req.Header.Set("Authorization", "Bearer "+worldEventCredential(t, 7))
	})
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
}

// The end of the circuit, over the wire: what the world reports about how a
// visit felt becomes who the character is, in the tier everybody shares.
func TestRouter_WorldEventValenceMovesTheSelfTier(t *testing.T) {
	router, pool, _ := newWorldEventRouter(t)
	personaID := insertPlatformPersona(t, pool, "world-event-valence")

	rec := postWorldEvent(t,
		router,
		`{"title":"Wandered the main stage in OmniRave","summary":"Was there with a crowd all evening.","emotionalValence":0.9}`,
		func(req *http.Request) {
			req.Header.Set("Authorization", "Bearer "+worldEventCredential(t, personaID))
		},
	)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

	traits, err := models.NewOmniChatCharacterTraitRepository(pool).
		Load(context.Background(), int(personaID), models.OmniChatMemoryTierSelf)
	require.NoError(t, err)
	require.Greater(t, traits.Mood, 0.0)
	require.Greater(t, traits.Warmth, 0.0)
}

// Omitting the valence is the ordinary report and must stay free: the memory is
// kept and the character is unchanged.
func TestRouter_WorldEventWithoutValenceLeavesTheCharacterAlone(t *testing.T) {
	router, pool, _ := newWorldEventRouter(t)
	personaID := insertPlatformPersona(t, pool, "world-event-no-valence")

	rec := postWorldEvent(t,
		router,
		`{"title":"Wandered the main stage in OmniRave","summary":"Walked about for a while."}`,
		func(req *http.Request) {
			req.Header.Set("Authorization", "Bearer "+worldEventCredential(t, personaID))
		},
	)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

	traits, err := models.NewOmniChatCharacterTraitRepository(pool).
		Load(context.Background(), int(personaID), models.OmniChatMemoryTierSelf)
	require.NoError(t, err)
	require.Zero(t, traits.Mood)
	require.Zero(t, traits.Warmth)
}

// A number that is not a valence is told so, rather than being quietly pinned
// to the end of the scale and moving the character anyway.
func TestRouter_WorldEventRefusesValenceOutOfRange(t *testing.T) {
	router, pool, _ := newWorldEventRouter(t)
	personaID := insertPlatformPersona(t, pool, "world-event-bad-valence")

	for _, body := range []string{
		`{"title":"x","summary":"y","emotionalValence":1.5}`,
		`{"title":"x","summary":"y","emotionalValence":-4}`,
	} {
		rec := postWorldEvent(t, router, body, func(req *http.Request) {
			req.Header.Set("Authorization", "Bearer "+worldEventCredential(t, personaID))
		})
		require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	}

	var episodes int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM omnichat_memory_episodes WHERE persona_id = $1`, personaID).Scan(&episodes))
	require.Zero(t, episodes)
}
