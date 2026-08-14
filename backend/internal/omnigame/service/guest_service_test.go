package service

import (
	"context"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/omnigame/repository"
	"github.com/stretchr/testify/require"
)

func TestGuestService_RejectsSanctionedBootstrap(t *testing.T) {
	sanctions := repository.NewInMemorySanctionRepository()
	svc := NewGuestService(sanctions, "ws://localhost:8092/ws")
	sanctions.BlockBootstrap("bootstrap-1")

	_, err := svc.ExchangeBootstrap(context.Background(), "bootstrap-1", "")

	require.ErrorContains(t, err, "sanctioned")
}

func TestGuestService_RejectsPersistedSanctionAcrossServiceInstances(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	sanctions := repository.NewPostgresSanctionRepository(db.Pool)
	require.NoError(t, sanctions.BlockBootstrap(ctx, "bootstrap-2", "ip-hash-2", "mute", time.Now().Add(30*time.Minute)))

	svc := NewGuestService(repository.NewPostgresSanctionRepository(db.Pool), "ws://localhost:8092/ws")
	_, err = svc.ExchangeBootstrap(ctx, "bootstrap-2", "")

	require.ErrorContains(t, err, "sanctioned")
}

func TestHashGuestNetwork_EmptyIdentityStaysEmpty(t *testing.T) {
	require.Equal(t, "", hashGuestNetwork(""))
}
