package database_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func TestMigratedCompanionPersonaFixturesHaveApprovedFingerprint(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	catalog, err := models.NewBotPersonaRepository(db.Pool).ListCatalog(ctx, "", nil)
	require.NoError(t, err)
	personas := make(map[string]*models.BotPersona, len(catalog))
	for _, persona := range catalog {
		personas[persona.Slug] = persona
	}

	fingerprint := services.PersonaQualityPersonaFingerprint(
		personas,
		services.DefaultOmniChatCompanionBakeOffCases(),
	)
	require.Equal(t, services.OmniChatCompanionPersonaFingerprint, fingerprint)
}
