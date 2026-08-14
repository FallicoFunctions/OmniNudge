package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	omnigameapi "github.com/omninudge/backend/internal/omnigame/api"
	"github.com/omninudge/backend/internal/omnigame/repository"
	"github.com/omninudge/backend/internal/omnigame/service"
	omniraveplaylist "github.com/omninudge/backend/internal/omniraveworld/repository"
	omniraveworld "github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
)

func main() {
	port := envOrDefault("OMNIGAME_API_PORT", "8091")
	runtimeURL := envOrDefault("OMNIRAVE_RUNTIME_URL", "http://localhost:4173/omnirave")
	worldSocketURL := envOrDefault("OMNIRAVE_WORLD_SOCKET_URL", "ws://localhost:8092/ws")
	jwtSecret := requireEnv("JWT_SECRET")
	authService := services.NewAuthService(jwtSecret, "OmniGame/1.0", "")

	var profiles repository.ProfileRepository = repository.NewInMemoryProfileRepository()
	var sanctions repository.SanctionRepository = repository.NewInMemorySanctionRepository()
	// An empty in-memory eligibility source admits nothing. Without a database
	// there is no way to establish that a character is a platform character, and
	// the safe reading of "cannot tell" is "no" -- admission fails closed rather
	// than degrading into a world that anything can walk into.
	var personas repository.PersonaRepository = repository.NewInMemoryPersonaRepository()
	var mediaState = omniraveworld.NewMediaState()
	// Character memory needs a real database; there is no in-memory stand-in
	// and there should not be one. Without it nothing is recordable, and the
	// world-event endpoint says so rather than accepting reports and dropping
	// them, which would leave the world believing a character remembers
	// something it does not.
	var characterMemory *services.OmniChatMemoryService
	if databaseURL := os.Getenv("DATABASE_URL"); databaseURL != "" {
		db, err := database.New(databaseURL)
		if err != nil {
			log.Fatal(err)
		}
		defer db.Close()

		if err := db.Migrate(context.Background()); err != nil {
			log.Fatal(err)
		}

		authService.SetUserRepository(models.NewUserRepository(db.Pool))
		// Browser access tokens carry a SessionID, and ValidateJWTContext fails
		// closed when it cannot check one. Without this, every cookie from the
		// site is rejected here as "invalid or expired token" while remaining
		// perfectly valid on the main API -- account launches included.
		authService.SetSessionService(services.NewAuthSessionService(db.Pool, authService))
		profiles = repository.NewPostgresProfileRepository(db.Pool)
		sanctions = repository.NewPostgresSanctionRepository(db.Pool)
		personas = repository.NewPostgresPersonaRepository(db.Pool)
		// Only the store is supplied. Extraction, conversations and the model
		// client belong to chat, and this service reaches none of them: the
		// world writes self-tier memory and does nothing else with it.
		characterMemory = services.NewOmniChatMemoryService(
			models.NewOmniChatMemoryRepository(db.Pool), nil, nil, nil, nil,
		)

		playlists, err := loadStagePlaylists(context.Background(), omniraveplaylist.NewPostgresStagePlaylistRepository(db.Pool))
		if err != nil {
			log.Fatal(err)
		}
		mediaState = omniraveworld.NewMediaStateWithPlaylists(playlists, time.Now().UTC())
	} else {
		// Without a database there is no session service, so ValidateJWTContext
		// rejects every session-bound cookie the site issues. That is fine for
		// guest-only runtime work and misleading for anything else: account
		// launches fail in a way that looks like a bug in the caller, so say so
		// at startup rather than leaving it to be rediscovered.
		log.Println("omnigame-api: DATABASE_URL unset, running with in-memory profiles; " +
			"cookie-authenticated requests from the site will be rejected")
	}

	sessionService := service.NewSessionServiceWithMediaState(
		runtimeURL,
		worldSocketURL,
		profiles,
		sanctions,
		mediaState,
		authService,
	)

	admissionService := service.NewAdmissionService(personas, profiles, authService)

	// Optional: a deployment that does not run the agent runtime has no reason
	// to hold this secret. Leaving it unset leaves personaAdmission nil, and
	// the middleware answers every admission with 503 -- unconfigured, not
	// unguarded. A secret that is present but unusable is fatal instead, so a
	// misconfigured admission secret is found at startup and not by whoever
	// exploits it.
	var personaAdmission *services.PersonaAdmissionAuth
	if secret := os.Getenv("PERSONA_ADMISSION_SECRET"); secret != "" {
		admissionAuth, admissionErr := services.NewPersonaAdmissionAuth(secret, jwtSecret)
		if admissionErr != nil {
			log.Fatal(admissionErr)
		}
		personaAdmission = admissionAuth
	} else {
		log.Println("omnigame-api: PERSONA_ADMISSION_SECRET unset, persona admission is disabled")
	}

	// Optional on the same terms as the admission secret, and separate from it
	// on purpose: admitting a character to a world and writing that
	// character's own memory are different powers, and a deployment may well
	// grant one without the other. Unset leaves worldEvents nil and the
	// middleware answers every report with 503 -- unconfigured, not unguarded.
	var worldEvents *services.WorldEventAuth
	if secret := os.Getenv("WORLD_EVENT_SECRET"); secret != "" {
		worldEventAuth, worldEventErr := services.NewWorldEventAuth(secret, jwtSecret)
		if worldEventErr != nil {
			log.Fatal(worldEventErr)
		}
		worldEvents = worldEventAuth
	} else {
		log.Println("omnigame-api: WORLD_EVENT_SECRET unset, world events are disabled")
	}

	router := omnigameapi.NewRouter(
		sessionService,
		authService,
		admissionService,
		personaAdmission,
		worldEvents,
		characterMemory,
		trustedProxiesFromEnv(),
	)
	addr := ":" + port

	// Plain REST API (no long-lived connections), so timeouts can be tight:
	// ReadHeaderTimeout/ReadTimeout guard against Slowloris-style slow requests,
	// WriteTimeout bounds handler execution, and IdleTimeout reclaims idle
	// keep-alive connections.
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("omnigame-api listening on %s", addr)
	if err := httpServer.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func requireEnv(key string) string {
	value := os.Getenv(key)
	if value == "" {
		log.Fatalf("required environment variable %s is not set", key)
	}
	return value
}

func trustedProxiesFromEnv() []string {
	value := strings.TrimSpace(os.Getenv("OMNIGAME_TRUSTED_PROXIES"))
	if value == "" {
		return []string{"127.0.0.1/32", "::1/128"}
	}

	parts := strings.Split(value, ",")
	proxies := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		proxies = append(proxies, part)
	}
	if len(proxies) == 0 {
		return []string{"127.0.0.1/32", "::1/128"}
	}
	return proxies
}

func loadStagePlaylists(ctx context.Context, repo omniraveplaylist.StagePlaylistRepository) ([]omniraveworld.StagePlaylist, error) {
	if repo == nil {
		return omniraveworld.DefaultStagePlaylists(), nil
	}

	playlists, err := repo.LoadActiveStagePlaylists(ctx)
	if err != nil {
		return nil, err
	}
	if len(playlists) == 0 {
		return omniraveworld.DefaultStagePlaylists(), nil
	}
	return playlists, nil
}
