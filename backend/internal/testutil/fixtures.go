package testutil

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/models"
)

// Fixtures provides builder helpers for inserting test data rows into the
// database. All methods fail the test immediately on any database error.
type Fixtures struct {
	db *TestDatabase
	t  *testing.T
}

// NewFixtures creates a new Fixtures helper backed by the provided TestDatabase.
func NewFixtures(t *testing.T, db *TestDatabase) *Fixtures {
	t.Helper()
	return &Fixtures{db: db, t: t}
}

// CreateUser inserts a test user with the given username and returns the
// created record. The password hash is set to a constant safe placeholder so
// tests do not need to bcrypt anything.
func (f *Fixtures) CreateUser(username string) *models.User {
	f.t.Helper()
	ctx := context.Background()

	repo := models.NewUserRepository(f.db.Pool)
	user := &models.User{
		Username:     username,
		PasswordHash: "test_hash_not_real",
		CreatedAt:    time.Now(),
	}
	if err := repo.Create(ctx, user); err != nil {
		f.t.Fatalf("CreateUser(%q): %v", username, err)
	}
	return user
}

// CreateUniqueUser inserts a test user with a username guaranteed to be unique
// within this test run by appending the current nanosecond timestamp.
func (f *Fixtures) CreateUniqueUser(base string) *models.User {
	f.t.Helper()
	return f.CreateUser(fmt.Sprintf("%s_%d", base, time.Now().UnixNano()))
}

// CreateHub inserts a test hub with the given name, created by createdByUserID,
// and returns the created record. Type defaults to "public" and ContentOptions
// to "any" (the repository handles these defaults).
func (f *Fixtures) CreateHub(name string, createdByUserID int) *models.Hub {
	f.t.Helper()
	ctx := context.Background()

	repo := models.NewHubRepository(f.db.Pool)
	hub := &models.Hub{
		Name:      name,
		CreatedBy: &createdByUserID,
	}
	if err := repo.Create(ctx, hub); err != nil {
		f.t.Fatalf("CreateHub(%q): %v", name, err)
	}
	return hub
}

// CreateConversation inserts a DM conversation between user1ID and user2ID and
// returns the created record.
func (f *Fixtures) CreateConversation(user1ID, user2ID int) *models.Conversation {
	f.t.Helper()
	ctx := context.Background()

	repo := models.NewConversationRepository(f.db.Pool)
	conv, err := repo.Create(ctx, user1ID, user2ID)
	if err != nil {
		f.t.Fatalf("CreateConversation(%d, %d): %v", user1ID, user2ID, err)
	}
	return conv
}

// CreateMessage inserts a plaintext (unencrypted) test message in convID from
// senderID to recipientID and returns the created record. recipientID is
// required by the schema; callers who only have convID and senderID should
// derive recipientID from the conversation first.
func (f *Fixtures) CreateMessage(convID, senderID, recipientID int, content string) *models.Message {
	f.t.Helper()
	ctx := context.Background()

	repo := models.NewMessageRepository(f.db.Pool)
	msg := &models.Message{
		ConversationID:    convID,
		SenderID:          senderID,
		RecipientID:       recipientID,
		EncryptedContent:  content,
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	if err := repo.Create(ctx, msg); err != nil {
		f.t.Fatalf("CreateMessage(conv=%d, sender=%d): %v", convID, senderID, err)
	}
	return msg
}
