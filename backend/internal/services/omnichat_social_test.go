package services

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

type omniChatSocialStoreFake struct {
	shareText       string
	shareDigest     string
	publishedDigest string
	assetPublished  bool
	commentAdded    bool
}

func (f *omniChatSocialStoreFake) PublishAssetOwned(_ context.Context, _ int, _ uuid.UUID, _ string) (*models.OmniChatPublication, error) {
	f.assetPublished = true
	return &models.OmniChatPublication{ID: uuid.New()}, nil
}
func (f *omniChatSocialStoreFake) ReadChatShareTextOwned(_ context.Context, _, _ int, _ []int) (string, string, error) {
	return f.shareText, f.shareDigest, nil
}
func (f *omniChatSocialStoreFake) PublishChatSnapshotOwned(_ context.Context, _, _ int, _ []int, _, _, digest string) (*models.OmniChatPublication, error) {
	f.publishedDigest = digest
	return &models.OmniChatPublication{ID: uuid.New()}, nil
}
func (f *omniChatSocialStoreFake) AddPublicationComment(_ context.Context, _ uuid.UUID, _ int, _ *uuid.UUID, _ string) (*models.OmniChatPublicationComment, error) {
	f.commentAdded = true
	return &models.OmniChatPublicationComment{ID: uuid.New()}, nil
}

type omniChatModeratorFake struct {
	allowed bool
	err     error
	texts   []string
}

func (f *omniChatModeratorFake) AllowPublicContent(_ context.Context, text string) (bool, error) {
	f.texts = append(f.texts, text)
	return f.allowed, f.err
}

func TestOmniChatSocialServiceFailsClosedWhenModerationRejectsOrFails(t *testing.T) {
	for _, moderator := range []*omniChatModeratorFake{
		{allowed: false},
		{err: errors.New("moderator unavailable")},
	} {
		store := &omniChatSocialStoreFake{}
		service := NewOmniChatSocialService(store, moderator)
		_, err := service.PublishAsset(context.Background(), 7, uuid.New(), "public caption")
		require.ErrorIs(t, err, ErrOmniChatPublicContentRejected)
		require.False(t, store.assetPublished)
	}
}

func TestOmniChatSocialServiceModeratesExactChatSnapshotBeforePublish(t *testing.T) {
	store := &omniChatSocialStoreFake{shareText: "user: At the park\nassistant: I wave\n", shareDigest: "digest-1"}
	moderator := &omniChatModeratorFake{allowed: true}
	service := NewOmniChatSocialService(store, moderator)

	publication, err := service.PublishChat(context.Background(), 7, 9, []int{11, 12}, "Park meeting", "A good memory")
	require.NoError(t, err)
	require.NotNil(t, publication)
	require.Equal(t, "digest-1", store.publishedDigest)
	require.Len(t, moderator.texts, 1)
	require.Contains(t, moderator.texts[0], "assistant: I wave")
}

func TestOmniChatSocialServiceModeratesComments(t *testing.T) {
	store := &omniChatSocialStoreFake{}
	service := NewOmniChatSocialService(store, &omniChatModeratorFake{allowed: true})
	_, err := service.AddComment(context.Background(), uuid.New(), 8, nil, "  Great scene!  ")
	require.NoError(t, err)
	require.True(t, store.commentAdded)
}
