package domain

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewUserAggregate(t *testing.T) {
	user, err := NewUserAggregate("testuser", "test@example.com", "Password123")

	require.NoError(t, err)
	require.NotNil(t, user)
	assert.Equal(t, "testuser", user.Username().String())
	assert.Equal(t, "test@example.com", user.Email().String())

	// No events are recorded in the constructor — UserRegistered is recorded
	// by RecordRegistration() after the aggregate has been persisted and assigned
	// a real ID.
	assert.Empty(t, user.GetEvents())
}

func TestUserAggregate_RecordRegistration(t *testing.T) {
	user, _ := NewUserAggregate("testuser", "test@example.com", "Password123")
	user.SetID(42)
	user.RecordRegistration()

	evts := user.GetEvents()
	require.Len(t, evts, 1)
	assert.Equal(t, "UserRegistered", evts[0].EventName())
	assert.Empty(t, user.GetEvents()) // clears after first call
}

func TestNewUserAggregate_InvalidInputs(t *testing.T) {
	tests := []struct {
		name     string
		username string
		email    string
		password string
	}{
		{"bad username", "ab", "test@example.com", "Password123"},
		{"bad email", "testuser", "not-an-email", "Password123"},
		{"bad password", "testuser", "test@example.com", "weak"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewUserAggregate(tt.username, tt.email, tt.password)
			require.Error(t, err)
		})
	}
}

func TestUserAggregate_Ban(t *testing.T) {
	t.Run("can ban regular user", func(t *testing.T) {
		user, _ := NewUserAggregate("testuser", "test@example.com", "Password123")
		user.GetEvents() // clear registration event

		err := user.Ban("Spam", 999)

		require.NoError(t, err)
		evts := user.GetEvents()
		require.Len(t, evts, 1)
		assert.Equal(t, "UserBanned", evts[0].EventName())
	})

	t.Run("ban is idempotent", func(t *testing.T) {
		user, _ := NewUserAggregate("testuser", "test@example.com", "Password123")
		user.GetEvents()

		_ = user.Ban("Spam", 999)
		err := user.Ban("Spam again", 999) // should not error

		require.NoError(t, err)
		// Only the first ban records an event; second call is a no-op.
		evts := user.GetEvents()
		assert.Len(t, evts, 1)
	})

	t.Run("cannot ban admin", func(t *testing.T) {
		user, _ := NewUserAggregate("admin", "admin@example.com", "Password123")
		user.role = "admin"

		err := user.Ban("Test", 999)

		require.ErrorIs(t, err, ErrCannotBanAdmin)
	})

	t.Run("cannot ban deleted user", func(t *testing.T) {
		user, _ := NewUserAggregate("testuser", "test@example.com", "Password123")
		_ = user.Delete(999)

		err := user.Ban("Test", 999)

		require.ErrorIs(t, err, ErrUserDeleted)
	})
}

func TestUserAggregate_Unban(t *testing.T) {
	user, _ := NewUserAggregate("testuser", "test@example.com", "Password123")
	user.GetEvents()

	_ = user.Ban("Spam", 999)
	user.GetEvents() // clear ban event

	user.Unban(999)

	evts := user.GetEvents()
	require.Len(t, evts, 1)
	assert.Equal(t, "UserUnbanned", evts[0].EventName())
}

func TestUserAggregate_Delete(t *testing.T) {
	t.Run("delete records event", func(t *testing.T) {
		user, _ := NewUserAggregate("testuser", "test@example.com", "Password123")
		user.GetEvents()

		err := user.Delete(999)

		require.NoError(t, err)
		evts := user.GetEvents()
		require.Len(t, evts, 1)
		assert.Equal(t, "UserDeleted", evts[0].EventName())
	})

	t.Run("cannot delete twice", func(t *testing.T) {
		user, _ := NewUserAggregate("testuser", "test@example.com", "Password123")
		_ = user.Delete(999)

		err := user.Delete(999)

		require.ErrorIs(t, err, ErrUserDeleted)
	})
}

func TestUserAggregate_ChangePassword(t *testing.T) {
	user, _ := NewUserAggregate("testuser", "test@example.com", "Password123")
	user.GetEvents()

	t.Run("successful change", func(t *testing.T) {
		err := user.ChangePassword("Password123", "NewPassword456")

		require.NoError(t, err)
		assert.True(t, user.VerifyPassword("NewPassword456"))
		assert.False(t, user.VerifyPassword("Password123"))

		evts := user.GetEvents()
		require.Len(t, evts, 1)
		assert.Equal(t, "PasswordChanged", evts[0].EventName())
	})

	t.Run("wrong old password", func(t *testing.T) {
		err := user.ChangePassword("WrongPassword", "NewPassword789")

		require.ErrorIs(t, err, ErrInvalidPassword)
	})

	t.Run("weak new password", func(t *testing.T) {
		err := user.ChangePassword("NewPassword456", "weak")

		require.Error(t, err)
	})
}

func TestUserAggregate_CanLogin(t *testing.T) {
	t.Run("active user can login", func(t *testing.T) {
		user, _ := NewUserAggregate("testuser", "test@example.com", "Password123")

		assert.NoError(t, user.CanLogin())
	})

	t.Run("banned user cannot login", func(t *testing.T) {
		user, _ := NewUserAggregate("testuser", "test@example.com", "Password123")
		_ = user.Ban("Spam", 999)

		require.ErrorIs(t, user.CanLogin(), ErrUserBanned)
	})

	t.Run("deleted user cannot login", func(t *testing.T) {
		user, _ := NewUserAggregate("testuser", "test@example.com", "Password123")
		_ = user.Delete(999)

		require.ErrorIs(t, user.CanLogin(), ErrUserDeleted)
	})
}

func TestUserAggregate_ToFromEntity(t *testing.T) {
	agg, _ := NewUserAggregate("testuser", "test@example.com", "Password123")
	agg.SetID(42)

	entity := agg.ToEntity()
	assert.Equal(t, 42, entity.ID)
	assert.Equal(t, "testuser", entity.Username)
	assert.NotNil(t, entity.Email)
	assert.Equal(t, "test@example.com", *entity.Email)

	loaded, err := UserAggregateFromEntity(entity)
	require.NoError(t, err)
	assert.Equal(t, agg.id, loaded.id)
	assert.Equal(t, agg.username, loaded.username)
	assert.Equal(t, agg.email, loaded.email)
}

func TestUserAggregateFromEntity_NilEmail(t *testing.T) {
	// Reddit-only users have no email. The aggregate must load successfully
	// with a zero Email value object rather than returning an error.
	entity := &User{
		ID:           1,
		Username:     "testuser",
		Email:        nil,
		PasswordHash: "hash",
	}

	agg, err := UserAggregateFromEntity(entity)

	require.NoError(t, err)
	require.NotNil(t, agg)
	assert.Equal(t, "", agg.Email().String()) // zero email
}

func TestUserAggregateFromEntity_LegacyShortUsername(t *testing.T) {
	// Users created before the 3-char minimum rule must still load successfully.
	// UserAggregateFromEntity is lenient: it uses UsernameFromString rather than
	// NewUsername so legacy records are never blocked.
	email := "test@example.com"
	entity := &User{
		ID:           1,
		Username:     "ab", // shorter than current minimum — legacy record
		Email:        &email,
		PasswordHash: "hash",
	}

	agg, err := UserAggregateFromEntity(entity)

	require.NoError(t, err)
	require.NotNil(t, agg)
	assert.Equal(t, "ab", agg.Username().String())
}
