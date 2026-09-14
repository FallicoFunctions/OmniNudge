package main

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

type fakeAccounts struct {
	user *models.User
	err  error
}

func (f fakeAccounts) GetByUsername(context.Context, string) (*models.User, error) {
	return f.user, f.err
}

type fakeGranter struct{ calls int }

func (f *fakeGranter) GrantAdminCredits(_ context.Context, userID int, _ uuid.UUID, amount int64) (*models.OmniCreditsWallet, error) {
	f.calls++
	return &models.OmniCreditsWallet{UserID: userID, PurchasedBalance: amount}, nil
}

func TestGrantTellsAFailedLookupFromAMissingAccount(t *testing.T) {
	down := errors.New("connection refused")
	granter := &fakeGranter{}
	_, _, err := grant(context.Background(), fakeAccounts{err: down}, granter, "sam", uuid.New(), 5)
	require.ErrorIs(t, err, down)
	assert.NotErrorIs(t, err, errNoAccount, "a database failure was reported as a missing account")

	_, _, err = grant(context.Background(), fakeAccounts{}, granter, "sam", uuid.New(), 5)
	assert.ErrorIs(t, err, errNoAccount)
	assert.Zero(t, granter.calls, "credits were granted without an account")

	userID, wallet, err := grant(context.Background(), fakeAccounts{user: &models.User{ID: 7}}, granter, "sam", uuid.New(), 5)
	require.NoError(t, err)
	assert.Equal(t, 7, userID)
	assert.Equal(t, int64(5), wallet.PurchasedBalance)
}
