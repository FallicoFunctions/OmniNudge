package mocks

import (
	"context"
	"time"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/ports"
)

// Compile-time check.
var _ ports.ConversationRepository = (*ConversationRepository)(nil)

// ConversationRepository is an in-memory mock of ports.ConversationRepository.
type ConversationRepository struct {
	conversations map[int]*domain.Conversation
	nextID        int

	// Optional overrides — set in test cases to inject specific behaviour.
	CreateFunc                      func(ctx context.Context, user1ID, user2ID int) (*domain.Conversation, error)
	GetByIDFunc                     func(ctx context.Context, id int) (*domain.Conversation, error)
	GetByUsersFunc                  func(ctx context.Context, user1ID, user2ID int) (*domain.Conversation, error)
	GetByUserIDFunc                 func(ctx context.Context, userID int, limit, offset int, includeArchived bool) ([]*domain.Conversation, error)
	GetByUserIDWithCursorFunc       func(ctx context.Context, userID int, limit int, includeArchived bool, cursor *domain.TimeCursor) ([]*domain.Conversation, error)
	GetArchivedByUserIDFunc         func(ctx context.Context, userID int, limit, offset int) ([]*domain.Conversation, error)
	GetArchivedByUserIDWithCursorFunc func(ctx context.Context, userID int, limit int, cursor *domain.TimeCursor) ([]*domain.Conversation, error)
	UpdateLastMessageAtFunc         func(ctx context.Context, conversationID int) error
	DeleteFunc                      func(ctx context.Context, conversationID int) error
}

// NewConversationRepository returns an empty ConversationRepository mock.
func NewConversationRepository() *ConversationRepository {
	return &ConversationRepository{
		conversations: make(map[int]*domain.Conversation),
		nextID:        1,
	}
}

func (m *ConversationRepository) Create(ctx context.Context, user1ID, user2ID int) (*domain.Conversation, error) {
	if m.CreateFunc != nil {
		return m.CreateFunc(ctx, user1ID, user2ID)
	}
	now := time.Now()
	c := &domain.Conversation{
		ID:               m.nextID,
		User1ID:          &user1ID,
		User2ID:          &user2ID,
		ConversationType: "dm",
		CreatedAt:        now,
		LastMessageAt:    now,
	}
	m.nextID++
	copy := *c
	m.conversations[copy.ID] = &copy
	return &copy, nil
}

func (m *ConversationRepository) GetByID(ctx context.Context, id int) (*domain.Conversation, error) {
	if m.GetByIDFunc != nil {
		return m.GetByIDFunc(ctx, id)
	}
	c := m.conversations[id]
	if c == nil {
		return nil, nil
	}
	copy := *c
	return &copy, nil
}

func (m *ConversationRepository) GetByUsers(ctx context.Context, user1ID, user2ID int) (*domain.Conversation, error) {
	if m.GetByUsersFunc != nil {
		return m.GetByUsersFunc(ctx, user1ID, user2ID)
	}
	for _, c := range m.conversations {
		if c.User1ID != nil && c.User2ID != nil {
			if (*c.User1ID == user1ID && *c.User2ID == user2ID) ||
				(*c.User1ID == user2ID && *c.User2ID == user1ID) {
				copy := *c
				return &copy, nil
			}
		}
	}
	return nil, nil
}

func (m *ConversationRepository) GetByUserID(ctx context.Context, userID int, limit, offset int, includeArchived bool) ([]*domain.Conversation, error) {
	if m.GetByUserIDFunc != nil {
		return m.GetByUserIDFunc(ctx, userID, limit, offset, includeArchived)
	}
	var out []*domain.Conversation
	for _, c := range m.conversations {
		if (c.User1ID != nil && *c.User1ID == userID) ||
			(c.User2ID != nil && *c.User2ID == userID) {
			copy := *c
			out = append(out, &copy)
		}
	}
	return out, nil
}

func (m *ConversationRepository) GetByUserIDWithCursor(ctx context.Context, userID int, limit int, includeArchived bool, cursor *domain.TimeCursor) ([]*domain.Conversation, error) {
	if m.GetByUserIDWithCursorFunc != nil {
		return m.GetByUserIDWithCursorFunc(ctx, userID, limit, includeArchived, cursor)
	}
	return m.GetByUserID(ctx, userID, limit, 0, includeArchived)
}

func (m *ConversationRepository) GetArchivedByUserID(ctx context.Context, userID int, limit, offset int) ([]*domain.Conversation, error) {
	if m.GetArchivedByUserIDFunc != nil {
		return m.GetArchivedByUserIDFunc(ctx, userID, limit, offset)
	}
	return nil, nil
}

func (m *ConversationRepository) GetArchivedByUserIDWithCursor(ctx context.Context, userID int, limit int, cursor *domain.TimeCursor) ([]*domain.Conversation, error) {
	if m.GetArchivedByUserIDWithCursorFunc != nil {
		return m.GetArchivedByUserIDWithCursorFunc(ctx, userID, limit, cursor)
	}
	return nil, nil
}

func (m *ConversationRepository) UpdateLastMessageAt(ctx context.Context, conversationID int) error {
	if m.UpdateLastMessageAtFunc != nil {
		return m.UpdateLastMessageAtFunc(ctx, conversationID)
	}
	if c, ok := m.conversations[conversationID]; ok {
		c.LastMessageAt = time.Now()
	}
	return nil
}

func (m *ConversationRepository) Delete(ctx context.Context, conversationID int) error {
	if m.DeleteFunc != nil {
		return m.DeleteFunc(ctx, conversationID)
	}
	delete(m.conversations, conversationID)
	return nil
}

func (m *ConversationRepository) Archive(_ context.Context, _ int, _ int) error         { return nil }
func (m *ConversationRepository) ArchiveBatch(_ context.Context, _ []int, _ int) error  { return nil }
func (m *ConversationRepository) Unarchive(_ context.Context, _ int, _ int) error       { return nil }
func (m *ConversationRepository) SoftDeleteForUser(_ context.Context, _ int, _ int) error { return nil }
func (m *ConversationRepository) HardDeleteMessages(_ context.Context, _ int, _ int) error { return nil }
func (m *ConversationRepository) HardDeleteIfBothDeleted(_ context.Context, _ int) error { return nil }
func (m *ConversationRepository) SetMuted(_ context.Context, _ int, _ int, _ bool) error { return nil }
