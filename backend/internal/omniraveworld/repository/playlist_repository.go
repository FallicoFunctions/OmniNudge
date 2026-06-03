package repository

import (
	"context"

	"github.com/omninudge/backend/internal/omniraveworld/world"
)

type StagePlaylistRepository interface {
	LoadActiveStagePlaylists(ctx context.Context) ([]world.StagePlaylist, error)
}
