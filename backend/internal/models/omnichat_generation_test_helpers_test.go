package models_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func withGenerationBillingReservation(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	userID int,
	request models.OmniChatGenerationRequest,
) models.OmniChatGenerationRequest {
	t.Helper()

	credits := models.NewOmniCreditsRepository(pool)
	_, err := credits.CreditPurchased(ctx, userID, uuid.New(), 1)
	require.NoError(t, err)

	operationID := uuid.New()
	_, err = credits.ReserveUsage(ctx, userID, operationID, string(request.Kind), 1)
	require.NoError(t, err)
	request.BillingOperationID = &operationID
	return request
}
