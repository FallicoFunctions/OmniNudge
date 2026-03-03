package services_test

import (
	"context"
	"testing"
	"time"

	domainevents "github.com/omninudge/backend/internal/domain/events"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/mocks"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newUserService(repo *mocks.UserRepository, bus *domainevents.EventBus) services.UserService {
	return services.NewUserService(repo, bus)
}

func TestUserService_RegisterUser(t *testing.T) {
	t.Run("valid inputs", func(t *testing.T) {
		repo := mocks.NewUserRepository()
		bus := domainevents.NewEventBus(true)
		svc := newUserService(repo, bus)

		user, err := svc.RegisterUser(context.Background(), "testuser", "test@example.com", "Password123")

		require.NoError(t, err)
		require.NotNil(t, user)
		assert.NotZero(t, user.ID)
		assert.Equal(t, "testuser", user.Username)
	})

	t.Run("invalid email", func(t *testing.T) {
		repo := mocks.NewUserRepository()
		bus := domainevents.NewEventBus(false)
		svc := newUserService(repo, bus)

		_, err := svc.RegisterUser(context.Background(), "testuser", "not-an-email", "Password123")

		require.Error(t, err)
	})

	t.Run("weak password", func(t *testing.T) {
		repo := mocks.NewUserRepository()
		bus := domainevents.NewEventBus(false)
		svc := newUserService(repo, bus)

		_, err := svc.RegisterUser(context.Background(), "testuser", "test@example.com", "weak")

		require.Error(t, err)
	})

	t.Run("duplicate username", func(t *testing.T) {
		repo := mocks.NewUserRepository()
		bus := domainevents.NewEventBus(false)
		svc := newUserService(repo, bus)

		_, err := svc.RegisterUser(context.Background(), "testuser", "first@example.com", "Password123")
		require.NoError(t, err)

		_, err = svc.RegisterUser(context.Background(), "testuser", "second@example.com", "Password123")
		require.Error(t, err)
	})
}

func TestUserService_RegisterUser_PublishesEvent(t *testing.T) {
	repo := mocks.NewUserRepository()
	bus := domainevents.NewEventBus(true)
	svc := newUserService(repo, bus)

	user, err := svc.RegisterUser(context.Background(), "testuser", "test@example.com", "Password123")

	require.NoError(t, err)
	require.NotNil(t, user)

	// Event log is written synchronously before handlers are dispatched.
	eventLog := bus.GetEventLog()
	require.Len(t, eventLog, 1)
	assert.Equal(t, "UserRegistered", eventLog[0].EventName())

	userEvent, ok := eventLog[0].(domainevents.UserRegistered)
	require.True(t, ok, "event must be UserRegistered")
	assert.Equal(t, "testuser", userEvent.Username)
	assert.Equal(t, "test@example.com", userEvent.Email)
	assert.Equal(t, user.ID, userEvent.UserID)
}

func TestUserService_BanUser_PublishesEvent(t *testing.T) {
	repo := mocks.NewUserRepository()
	bus := domainevents.NewEventBus(true)
	svc := newUserService(repo, bus)

	user, err := svc.RegisterUser(context.Background(), "testuser", "test@example.com", "Password123")
	require.NoError(t, err)
	bus.Clear() // discard the RegisterUser event

	err = svc.BanUser(context.Background(), user.ID, "Spam", false, 999)

	require.NoError(t, err)

	// Give async handlers a moment (event is logged synchronously so no sleep needed,
	// but the handler goroutines run async).
	time.Sleep(10 * time.Millisecond)

	eventLog := bus.GetEventLog()
	require.Len(t, eventLog, 1)
	assert.Equal(t, "UserBanned", eventLog[0].EventName())

	banEvent, ok := eventLog[0].(domainevents.UserBanned)
	require.True(t, ok)
	assert.Equal(t, user.ID, banEvent.UserID)
	assert.Equal(t, "Spam", banEvent.Reason)
}

func TestUserService_BanUser_CannotBanAdmin(t *testing.T) {
	repo := mocks.NewUserRepository()
	bus := domainevents.NewEventBus(false)
	svc := newUserService(repo, bus)

	user, _ := svc.RegisterUser(context.Background(), "adminuser", "admin@example.com", "Password123")
	// Promote to admin directly on the repo.
	_ = repo.UpdateRole(context.Background(), user.ID, "admin")

	err := svc.BanUser(context.Background(), user.ID, "Test", false, 999)

	require.Error(t, err)
}

func TestUserService_DeleteUser_PublishesEvent(t *testing.T) {
	repo := mocks.NewUserRepository()
	bus := domainevents.NewEventBus(true)
	svc := newUserService(repo, bus)

	user, _ := svc.RegisterUser(context.Background(), "testuser", "test@example.com", "Password123")
	bus.Clear()

	err := svc.DeleteUser(context.Background(), user.ID, "TOS violation", 999)

	require.NoError(t, err)

	eventLog := bus.GetEventLog()
	require.Len(t, eventLog, 1)
	assert.Equal(t, "UserDeleted", eventLog[0].EventName())
}

func TestUserService_DeleteUser_AlreadyDeleted(t *testing.T) {
	repo := mocks.NewUserRepository()
	bus := domainevents.NewEventBus(false)
	svc := newUserService(repo, bus)

	user, _ := svc.RegisterUser(context.Background(), "testuser", "test@example.com", "Password123")
	_ = svc.DeleteUser(context.Background(), user.ID, "TOS violation", 999)

	err := svc.DeleteUser(context.Background(), user.ID, "Again", 999)

	require.Error(t, err)
}

func TestUserService_UnbanUser_PublishesEvent(t *testing.T) {
	repo := mocks.NewUserRepository()
	bus := domainevents.NewEventBus(true)
	svc := newUserService(repo, bus)

	user, _ := svc.RegisterUser(context.Background(), "testuser", "test@example.com", "Password123")
	_ = svc.BanUser(context.Background(), user.ID, "Spam", false, 999)
	bus.Clear()

	err := svc.UnbanUser(context.Background(), user.ID, "Appeal granted", 999)

	require.NoError(t, err)

	eventLog := bus.GetEventLog()
	require.Len(t, eventLog, 1)
	assert.Equal(t, "UserUnbanned", eventLog[0].EventName())
}

func TestUserService_ChangePassword(t *testing.T) {
	repo := mocks.NewUserRepository()
	bus := domainevents.NewEventBus(true)
	svc := newUserService(repo, bus)

	user, _ := svc.RegisterUser(context.Background(), "testuser", "test@example.com", "Password123")
	bus.Clear()

	err := svc.ChangePassword(context.Background(), user.ID, "Password123", "NewPassword456")

	require.NoError(t, err)

	eventLog := bus.GetEventLog()
	require.Len(t, eventLog, 1)
	assert.Equal(t, "PasswordChanged", eventLog[0].EventName())
}

func TestUserService_ChangePassword_WrongOldPassword(t *testing.T) {
	repo := mocks.NewUserRepository()
	bus := domainevents.NewEventBus(false)
	svc := newUserService(repo, bus)

	user, _ := svc.RegisterUser(context.Background(), "testuser", "test@example.com", "Password123")

	err := svc.ChangePassword(context.Background(), user.ID, "WrongPassword", "NewPassword456")

	require.Error(t, err)
}

func TestUserService_UserNotFound(t *testing.T) {
	repo := mocks.NewUserRepository()
	bus := domainevents.NewEventBus(false)
	svc := newUserService(repo, bus)

	t.Run("BanUser not found", func(t *testing.T) {
		err := svc.BanUser(context.Background(), 999999, "Spam", false, 1)
		require.Error(t, err)
	})

	t.Run("DeleteUser not found", func(t *testing.T) {
		err := svc.DeleteUser(context.Background(), 999999, "reason", 1)
		require.Error(t, err)
	})

	t.Run("ChangePassword not found", func(t *testing.T) {
		err := svc.ChangePassword(context.Background(), 999999, "Password123", "NewPassword456")
		require.Error(t, err)
	})
}
