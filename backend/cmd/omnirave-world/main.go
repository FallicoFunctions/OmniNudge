package main

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/omniraveworld/repository"
	"github.com/omninudge/backend/internal/omniraveworld/server"
	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
)

func main() {
	port := envOrDefault("OMNIRAVE_WORLD_PORT", "8092")
	runtimeURL := envOrDefault("OMNIRAVE_RUNTIME_URL", "http://localhost:4173/omnirave")
	jwtSecret := envOrDefault("JWT_SECRET", "dev-secret")
	authService := services.NewAuthService(jwtSecret, "OmniRaveWorld/1.0", "")
	mediaState, cleanup, userRepo, err := buildMediaState(context.Background())
	if err != nil {
		log.Fatal(err)
	}
	if cleanup != nil {
		defer cleanup()
	}
	if userRepo != nil {
		authService.SetUserRepository(userRepo)
	}

	handler := server.New(world.NewWorld(world.DefaultConfig()), mediaState, authService, allowedRuntimeOrigins(runtimeURL))
	addr := ":" + port

	log.Printf("omnirave-world listening on %s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func buildMediaState(ctx context.Context) (*world.MediaState, func(), *models.UserRepository, error) {
	if databaseURL := os.Getenv("DATABASE_URL"); databaseURL != "" {
		db, err := database.New(databaseURL)
		if err != nil {
			return nil, nil, nil, err
		}

		if err := db.Migrate(ctx); err != nil {
			db.Close()
			return nil, nil, nil, err
		}

		playlists, err := loadStagePlaylists(ctx, repository.NewPostgresStagePlaylistRepository(db.Pool))
		if err != nil {
			db.Close()
			return nil, nil, nil, err
		}

		return world.NewMediaStateWithPlaylists(playlists, envStartTime()), db.Close, models.NewUserRepository(db.Pool), nil
	}

	playlists, err := loadStagePlaylists(ctx, nil)
	if err != nil {
		return nil, nil, nil, err
	}
	return world.NewMediaStateWithPlaylists(playlists, envStartTime()), nil, nil, nil
}

func loadStagePlaylists(ctx context.Context, repo repository.StagePlaylistRepository) ([]world.StagePlaylist, error) {
	if repo == nil {
		return world.DefaultStagePlaylists(), nil
	}

	playlists, err := repo.LoadActiveStagePlaylists(ctx)
	if err != nil {
		return nil, err
	}
	if len(playlists) == 0 {
		return world.DefaultStagePlaylists(), nil
	}
	return playlists, nil
}

func envStartTime() time.Time {
	return time.Now().UTC()
}

func allowedRuntimeOrigins(runtimeURL string) []string {
	origins := []string{"https://play.omninudge.com"}
	parsed, err := url.Parse(runtimeURL)
	if err == nil && parsed.Scheme != "" && parsed.Host != "" {
		origins = append(origins, parsed.Scheme+"://"+parsed.Host)
	}
	return origins
}
