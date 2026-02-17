package websocket

import (
	"context"
	"errors"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

type stubAuthorizer struct {
	participants map[int][]int
}

func (a *stubAuthorizer) CanAccessConversation(ctx context.Context, userID, conversationID int) (bool, error) {
	ids := a.participants[conversationID]
	for _, id := range ids {
		if id == userID {
			return true, nil
		}
	}
	return false, nil
}

func (a *stubAuthorizer) ListConversationParticipantIDs(ctx context.Context, conversationID int) ([]int, error) {
	return a.participants[conversationID], nil
}

type stubSettingsRepo struct {
	show map[int]bool
}

func (s *stubSettingsRepo) GetByUserID(ctx context.Context, userID int) (*models.UserSettings, error) {
	// Default behavior for missing rows matches production (nil means defaults).
	val, ok := s.show[userID]
	if !ok {
		return nil, nil
	}
	return &models.UserSettings{UserID: userID, ShowTypingIndicators: val}, nil
}

func TestBuildTypingBroadcasts_DoesNotTrustRecipientID(t *testing.T) {
	a := &stubAuthorizer{
		participants: map[int][]int{
			10: {1, 2},
		},
	}

	c := NewClient(&Hub{}, nil, 1, "", "", a, &stubSettingsRepo{show: map[int]bool{1: true, 2: true}})
	msgs, err := c.buildTypingBroadcasts(context.Background(), typingPayload{
		ConversationID: 10,
		RecipientID:    999, // should be ignored
		IsTyping:       true,
	})
	require.NoError(t, err)
	require.Len(t, msgs, 1)
	require.Equal(t, 2, msgs[0].RecipientID)
}

func TestBuildTypingBroadcasts_SenderMustBeConversationMember(t *testing.T) {
	a := &stubAuthorizer{
		participants: map[int][]int{
			10: {2, 3},
		},
	}

	c := NewClient(&Hub{}, nil, 1, "", "", a, &stubSettingsRepo{show: map[int]bool{1: true, 2: true, 3: true}})
	msgs, err := c.buildTypingBroadcasts(context.Background(), typingPayload{
		ConversationID: 10,
		RecipientID:    2,
		IsTyping:       true,
	})
	require.Error(t, err)
	require.True(t, errors.Is(err, errUnauthorizedConversationAccess))
	require.Empty(t, msgs)
}
