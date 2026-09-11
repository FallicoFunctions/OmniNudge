package queue

import (
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/openrouter"
)

// The same drift as the generation handler, with a worse result.
//
// The API server's embedded worker registered every handler but this one,
// while consuming the same queue as the standalone worker. A memory job it
// picked up had nowhere to go, was retried three times and discarded -- and
// with the standalone worker not running, that was every memory job. The
// watermark means nothing is lost for good, but nothing is remembered either
// until a job happens to land on the other process.

// NewOmniChatMemoryJobHandler builds the memory-extraction handler both
// processes register.
//
// Only a job calls the extraction model, which keeps a reasoning pass that
// can take twenty seconds off the send path entirely.
func NewOmniChatMemoryJobHandler(cfg *config.Config, pool *pgxpool.Pool) JobHandler {
	conversations := models.NewBotConversationRepository(pool)
	memory := services.NewOmniChatMemoryService(
		models.NewOmniChatMemoryRepository(pool),
		models.NewBotMessageRepository(pool),
		conversations,
		models.NewBotPersonaRepository(pool),
		services.NewModelOmniChatMemoryExtractor(
			openrouter.NewClient(cfg.OpenRouter.APIKey, omniChatMemoryExtractionModel(cfg)),
		),
	// Without a store, extraction reads what an exchange promised and throws it
	// away. The worker ran that way from the start, so recall's list of what is
	// still outstanding was always empty.
	).SetCommitments(models.NewOmniChatCommitmentRepository(pool))
	return NewOmniChatMemoryHandler(memory, conversations)
}

// omniChatMemoryExtractionModel is the extraction model, or the standard
// fallback when a deployment has not named one.
func omniChatMemoryExtractionModel(cfg *config.Config) string {
	if model := strings.TrimSpace(cfg.OpenRouter.ExtractionModel); model != "" {
		return model
	}
	return strings.TrimSpace(cfg.OpenRouter.StandardFallback)
}
