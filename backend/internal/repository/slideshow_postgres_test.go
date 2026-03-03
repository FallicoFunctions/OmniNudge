package repository_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresSlideshowRepository_CreateAndGet(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresSlideshowRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("ss_u1")
	u2 := fx.CreateUniqueUser("ss_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)

	session := &domain.SlideshowSession{
		ConversationID:      conv.ID,
		ControllerUserID:    u1.ID,
		SlideshowType:       "personal",
		CurrentIndex:        0,
		AutoAdvance:         false,
		AutoAdvanceInterval: 5,
	}

	err := repo.CreateSession(ctx, session)
	require.NoError(t, err)
	assert.NotZero(t, session.ID)

	got, err := repo.GetByID(ctx, session.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, session.ID, got.ID)
}

func TestPostgresSlideshowRepository_GetByConversationID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresSlideshowRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("ss_conv_u1")
	u2 := fx.CreateUniqueUser("ss_conv_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)

	session := &domain.SlideshowSession{
		ConversationID: conv.ID, ControllerUserID: u1.ID,
		SlideshowType: "personal", CurrentIndex: 0, AutoAdvance: false, AutoAdvanceInterval: 3,
	}
	_ = repo.CreateSession(ctx, session)

	got, err := repo.GetByConversationID(ctx, conv.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, session.ID, got.ID)
}

func TestPostgresSlideshowRepository_UpdateCurrentIndex(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresSlideshowRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("ss_idx_u1")
	u2 := fx.CreateUniqueUser("ss_idx_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)

	session := &domain.SlideshowSession{
		ConversationID: conv.ID, ControllerUserID: u1.ID,
		SlideshowType: "personal", CurrentIndex: 0, AutoAdvance: false, AutoAdvanceInterval: 3,
	}
	_ = repo.CreateSession(ctx, session)

	err := repo.UpdateCurrentIndex(ctx, session.ID, 3)
	require.NoError(t, err)
}

func TestPostgresSlideshowRepository_UpdateController(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresSlideshowRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("ss_ctrl_u1")
	u2 := fx.CreateUniqueUser("ss_ctrl_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)

	session := &domain.SlideshowSession{
		ConversationID: conv.ID, ControllerUserID: u1.ID,
		SlideshowType: "personal", CurrentIndex: 0, AutoAdvance: false, AutoAdvanceInterval: 3,
	}
	_ = repo.CreateSession(ctx, session)

	err := repo.UpdateController(ctx, session.ID, u2.ID)
	require.NoError(t, err)
}

func TestPostgresSlideshowRepository_Delete(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresSlideshowRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("ss_del_u1")
	u2 := fx.CreateUniqueUser("ss_del_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)

	session := &domain.SlideshowSession{
		ConversationID: conv.ID, ControllerUserID: u1.ID,
		SlideshowType: "personal", CurrentIndex: 0, AutoAdvance: false, AutoAdvanceInterval: 3,
	}
	_ = repo.CreateSession(ctx, session)

	err := repo.Delete(ctx, session.ID)
	require.NoError(t, err)

	got, err := repo.GetByID(ctx, session.ID)
	require.NoError(t, err)
	assert.Nil(t, got)
}
