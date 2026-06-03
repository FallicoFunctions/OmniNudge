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
	jwtSecret := envOrDefault("JWT_SECRET", "dev-secret")
	authService := services.NewAuthService(jwtSecret, "OmniGame/1.0", "")

	var profiles repository.ProfileRepository = repository.NewInMemoryProfileRepository()
	var sanctions repository.SanctionRepository = repository.NewInMemorySanctionRepository()
	var mediaState = omniraveworld.NewMediaState()
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
		profiles = repository.NewPostgresProfileRepository(db.Pool)
		sanctions = repository.NewPostgresSanctionRepository(db.Pool)

		playlists, err := loadStagePlaylists(context.Background(), omniraveplaylist.NewPostgresStagePlaylistRepository(db.Pool))
		if err != nil {
			log.Fatal(err)
		}
		mediaState = omniraveworld.NewMediaStateWithPlaylists(playlists, time.Now().UTC())
	}

	sessionService := service.NewSessionServiceWithMediaState(
		runtimeURL,
		worldSocketURL,
		profiles,
		sanctions,
		mediaState,
		authService,
	)

	router := omnigameapi.NewRouter(
		sessionService,
		authService,
		trustedProxiesFromEnv(),
	)
	addr := ":" + port

	log.Printf("omnigame-api listening on %s", addr)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatal(err)
	}
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
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
