package mocks

import (
	"context"
	"time"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/ports"
)

// Compile-time check.
var _ ports.MessageRepository = (*MessageRepository)(nil)

// MessageRepository is an in-memory mock of ports.MessageRepository.
type MessageRepository struct {
	messages map[int]*domain.Message
	nextID   int

	// Optional overrides — set in test cases to inject specific behaviour.
	CreateFunc                          func(ctx context.Context, message *domain.Message) error
	GetByIDFunc                         func(ctx context.Context, id int) (*domain.Message, error)
	GetByConversationIDFunc             func(ctx context.Context, conversationID int, userID int, limit int, offset int) ([]*domain.Message, error)
	GetByConversationIDWithCursorFunc   func(ctx context.Context, conversationID int, userID int, limit int, cursor *domain.TimeCursor) ([]*domain.Message, error)
	GetLatestMessageFunc                func(ctx context.Context, conversationID int, viewerID int) (*domain.Message, error)
	GetUnreadCountFunc                  func(ctx context.Context, conversationID int, userID int) (int, error)
}

// NewMessageRepository returns an empty MessageRepository mock.
func NewMessageRepository() *MessageRepository {
	return &MessageRepository{
		messages: make(map[int]*domain.Message),
		nextID:   1,
	}
}

func (m *MessageRepository) Create(ctx context.Context, message *domain.Message) error {
	if m.CreateFunc != nil {
		return m.CreateFunc(ctx, message)
	}
	message.ID = m.nextID
	m.nextID++
	message.SentAt = time.Now()
	copy := *message
	m.messages[copy.ID] = &copy
	return nil
}

func (m *MessageRepository) GetByID(ctx context.Context, id int) (*domain.Message, error) {
	if m.GetByIDFunc != nil {
		return m.GetByIDFunc(ctx, id)
	}
	msg := m.messages[id]
	if msg == nil {
		return nil, nil
	}
	copy := *msg
	return &copy, nil
}

func (m *MessageRepository) GetByConversationID(ctx context.Context, conversationID int, userID int, limit int, offset int) ([]*domain.Message, error) {
	if m.GetByConversationIDFunc != nil {
		return m.GetByConversationIDFunc(ctx, conversationID, userID, limit, offset)
	}
	var out []*domain.Message
	for _, msg := range m.messages {
		if msg.ConversationID == conversationID {
			copy := *msg
			out = append(out, &copy)
		}
	}
	return out, nil
}

func (m *MessageRepository) GetByConversationIDWithCursor(ctx context.Context, conversationID int, userID int, limit int, cursor *domain.TimeCursor) ([]*domain.Message, error) {
	if m.GetByConversationIDWithCursorFunc != nil {
		return m.GetByConversationIDWithCursorFunc(ctx, conversationID, userID, limit, cursor)
	}
	return m.GetByConversationID(ctx, conversationID, userID, limit, 0)
}

func (m *MessageRepository) GetByConversationIDForAll(_ context.Context, conversationID int, _ int, limit int, _ int) ([]*domain.Message, error) {
	var out []*domain.Message
	for _, msg := range m.messages {
		if msg.ConversationID == conversationID {
			copy := *msg
			out = append(out, &copy)
		}
	}
	return out, nil
}

func (m *MessageRepository) GetByConversationIDForAllWithCursor(_ context.Context, conversationID int, _ int, _ int, _ *domain.TimeCursor) ([]*domain.Message, error) {
	var out []*domain.Message
	for _, msg := range m.messages {
		if msg.ConversationID == conversationID {
			copy := *msg
			out = append(out, &copy)
		}
	}
	return out, nil
}

func (m *MessageRepository) MarkAsDelivered(_ context.Context, messageID int) error {
	if msg, ok := m.messages[messageID]; ok {
		now := time.Now()
		msg.DeliveredAt = &now
	}
	return nil
}

func (m *MessageRepository) MarkUndeliveredAsDelivered(_ context.Context, _ int, _ int) ([]domain.DeliveredMessage, error) {
	return nil, nil
}

func (m *MessageRepository) MarkAsRead(_ context.Context, messageID int) error {
	if msg, ok := m.messages[messageID]; ok {
		now := time.Now()
		msg.ReadAt = &now
	}
	return nil
}

func (m *MessageRepository) MarkAllAsRead(_ context.Context, _ int, _ int) error { return nil }

func (m *MessageRepository) SoftDeleteForUser(_ context.Context, messageID int, userID int) error {
	if msg, ok := m.messages[messageID]; ok {
		if msg.SenderID == userID {
			msg.DeletedForSender = true
		} else {
			msg.DeletedForRecipient = true
		}
	}
	return nil
}

func (m *MessageRepository) SoftDeleteForBoth(_ context.Context, messageID int) error {
	if msg, ok := m.messages[messageID]; ok {
		msg.DeletedForSender = true
		msg.DeletedForRecipient = true
	}
	return nil
}

func (m *MessageRepository) HardDelete(_ context.Context, messageID int) error {
	delete(m.messages, messageID)
	return nil
}

func (m *MessageRepository) GetUnreadCount(ctx context.Context, conversationID int, userID int) (int, error) {
	if m.GetUnreadCountFunc != nil {
		return m.GetUnreadCountFunc(ctx, conversationID, userID)
	}
	count := 0
	for _, msg := range m.messages {
		if msg.ConversationID == conversationID && msg.RecipientID == userID && msg.ReadAt == nil {
			count++
		}
	}
	return count, nil
}

func (m *MessageRepository) GetLatestMessage(ctx context.Context, conversationID int, viewerID int) (*domain.Message, error) {
	if m.GetLatestMessageFunc != nil {
		return m.GetLatestMessageFunc(ctx, conversationID, viewerID)
	}
	var latest *domain.Message
	for _, msg := range m.messages {
		if msg.ConversationID != conversationID {
			continue
		}
		if latest == nil || msg.SentAt.After(latest.SentAt) {
			copy := *msg
			latest = &copy
		}
	}
	return latest, nil
}
