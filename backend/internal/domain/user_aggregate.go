package domain

import (
	"errors"
	"time"

	domainevents "github.com/omninudge/backend/internal/domain/events"
	"github.com/omninudge/backend/internal/domain/valueobjects"
)

// Aggregate-level sentinel errors.
var (
	ErrUserBanned      = errors.New("user is banned")
	ErrUserDeleted     = errors.New("user is deleted")
	ErrCannotBanAdmin  = errors.New("cannot ban an administrator")
	ErrInvalidPassword = errors.New("invalid password")
)

// UserAggregate wraps a User entity and encapsulates all business rules.
// External code manipulates a user only through the aggregate's methods;
// direct field access is intentionally unavailable.
type UserAggregate struct {
	// Identity
	id       int
	username valueobjects.Username
	email    valueobjects.Email

	// Authentication
	password valueobjects.Password

	// Profile
	bio       *string
	avatarURL *string
	nsfw      bool

	// Status
	role         string
	banned       bool
	shadowBanned bool
	banReason    *string
	bannedAt     *time.Time
	deleted      bool

	// Timestamps
	createdAt time.Time
	lastSeen  time.Time

	// Pending domain events (cleared by GetEvents).
	pendingEvents []domainevents.Event
}

// NewUserAggregate creates a fresh UserAggregate, validating all inputs via
// value objects. A UserRegistered event is recorded so callers can publish it
// after the entity is persisted and given a real ID.
func NewUserAggregate(username, email, plainPassword string) (*UserAggregate, error) {
	un, err := valueobjects.NewUsername(username)
	if err != nil {
		return nil, err
	}

	em, err := valueobjects.NewEmail(email)
	if err != nil {
		return nil, err
	}

	pwd, err := valueobjects.NewPassword(plainPassword)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	u := &UserAggregate{
		username:      un,
		email:         em,
		password:      pwd,
		role:          "user",
		nsfw:          false,
		banned:        false,
		deleted:       false,
		createdAt:     now,
		lastSeen:      now,
		pendingEvents: make([]domainevents.Event, 0),
	}

	// NOTE: UserRegistered is NOT recorded here because the aggregate has no ID
	// yet (ID is assigned by the database after insertion). The application
	// service must call RecordRegistration(id, email) after persisting the entity.

	return u, nil
}

// RecordRegistration records a UserRegistered domain event. Must be called by
// the application service after the entity has been persisted and assigned an
// ID (i.e., after SetID has been called).
func (u *UserAggregate) RecordRegistration() {
	u.recordEvent(domainevents.UserRegistered{
		UserID:       u.id,
		Username:     u.username.String(),
		Email:        u.email.String(),
		RegisteredAt: time.Now(),
	})
}

// ID returns the aggregate's identity (0 until persisted).
func (u *UserAggregate) ID() int { return u.id }

// SetID sets the identity after the entity has been inserted into the DB.
func (u *UserAggregate) SetID(id int) { u.id = id }

// Username returns the username value object.
func (u *UserAggregate) Username() valueobjects.Username { return u.username }

// Email returns the email value object.
func (u *UserAggregate) Email() valueobjects.Email { return u.email }

// Ban bans the user with a reason. Returns an error if the user is an admin,
// already deleted, or already banned (idempotent — no error on re-ban).
func (u *UserAggregate) Ban(reason string, bannedBy int) error {
	if u.role == "admin" {
		return ErrCannotBanAdmin
	}
	if u.deleted {
		return ErrUserDeleted
	}
	if u.banned {
		return nil // already banned; idempotent
	}

	now := time.Now()
	u.banned = true
	u.banReason = &reason
	u.bannedAt = &now

	u.recordEvent(domainevents.UserBanned{
		UserID:   u.id,
		Username: u.username.String(),
		Reason:   reason,
		BannedBy: bannedBy,
		BannedAt: now,
	})

	return nil
}

// Unban lifts the ban. Idempotent — no-op if not currently banned.
func (u *UserAggregate) Unban(unbannedBy int) {
	if !u.banned {
		return
	}

	u.banned = false
	u.banReason = nil
	u.bannedAt = nil

	u.recordEvent(domainevents.UserUnbanned{
		UserID:     u.id,
		Username:   u.username.String(),
		UnbannedBy: unbannedBy,
		UnbannedAt: time.Now(),
	})
}

// Delete soft-deletes the user. Returns ErrUserDeleted if already deleted.
func (u *UserAggregate) Delete(deletedBy int) error {
	if u.deleted {
		return ErrUserDeleted
	}

	u.deleted = true

	u.recordEvent(domainevents.UserDeleted{
		UserID:    u.id,
		Username:  u.username.String(),
		DeletedBy: deletedBy,
		DeletedAt: time.Now(),
	})

	return nil
}

// ChangePassword validates the old password then replaces it with a newly
// created Password value object (which enforces strength requirements).
func (u *UserAggregate) ChangePassword(oldPassword, newPassword string) error {
	if !u.password.Verify(oldPassword) {
		return ErrInvalidPassword
	}

	newPwd, err := valueobjects.NewPassword(newPassword)
	if err != nil {
		return err
	}

	u.password = newPwd

	u.recordEvent(domainevents.PasswordChanged{
		UserID:    u.id,
		ChangedAt: time.Now(),
	})

	return nil
}

// UpdateProfile sets optional profile fields. Nil pointers are ignored.
func (u *UserAggregate) UpdateProfile(avatarURL, bio *string, nsfw *bool) {
	if avatarURL != nil {
		u.avatarURL = avatarURL
	}
	if bio != nil {
		u.bio = bio
	}
	if nsfw != nil {
		u.nsfw = *nsfw
	}
}

// CanLogin returns an error explaining why the user cannot log in, or nil.
func (u *UserAggregate) CanLogin() error {
	if u.deleted {
		return ErrUserDeleted
	}
	if u.banned {
		return ErrUserBanned
	}
	return nil
}

// VerifyPassword checks whether the plain text matches the stored hash.
func (u *UserAggregate) VerifyPassword(plainPassword string) bool {
	return u.password.Verify(plainPassword)
}

// RecordLastSeen updates the last-seen timestamp.
func (u *UserAggregate) RecordLastSeen() {
	u.lastSeen = time.Now()
}

// GetEvents returns all pending domain events and clears the internal list.
func (u *UserAggregate) GetEvents() []domainevents.Event {
	evts := u.pendingEvents
	u.pendingEvents = make([]domainevents.Event, 0)
	return evts
}

// ToEntity converts the aggregate back to a plain User entity for persistence.
// Note: fields that live only on the DB model (reddit tokens, encrypted email,
// etc.) are not tracked by the aggregate; callers must preserve them by loading
// the entity first, then merging changed fields.
func (u *UserAggregate) ToEntity() *User {
	email := u.email.String()
	return &User{
		ID:           u.id,
		Username:     u.username.String(),
		Email:        &email,
		PasswordHash: u.password.Hash(),
		Bio:          u.bio,
		AvatarURL:    u.avatarURL,
		NSFW:         u.nsfw,
		Role:         u.role,
		ShadowBanned: u.shadowBanned,
		Banned:       u.banned,
		BanReason:    u.banReason,
		BannedAt:     u.bannedAt,
		Deleted:      u.deleted,
		CreatedAt:    u.createdAt,
		LastSeen:     u.lastSeen,
	}
}

// UserAggregateFromEntity reconstructs an aggregate from a persisted entity.
// Returns an error if the entity has an invalid email or username (which
// would indicate data corruption in the database).
func UserAggregateFromEntity(user *User) (*UserAggregate, error) {
	if user.Email == nil {
		return nil, errors.New("user email cannot be nil")
	}

	username, err := valueobjects.NewUsername(user.Username)
	if err != nil {
		return nil, err
	}

	email, err := valueobjects.NewEmail(*user.Email)
	if err != nil {
		return nil, err
	}

	return &UserAggregate{
		id:            user.ID,
		username:      username,
		email:         email,
		password:      valueobjects.PasswordFromHash(user.PasswordHash),
		bio:           user.Bio,
		avatarURL:     user.AvatarURL,
		nsfw:          user.NSFW,
		role:          user.Role,
		shadowBanned:  user.ShadowBanned,
		banned:        user.Banned,
		banReason:     user.BanReason,
		bannedAt:      user.BannedAt,
		deleted:       user.Deleted,
		createdAt:     user.CreatedAt,
		lastSeen:      user.LastSeen,
		pendingEvents: make([]domainevents.Event, 0),
	}, nil
}

// recordEvent appends an event to the pending list.
func (u *UserAggregate) recordEvent(event domainevents.Event) {
	u.pendingEvents = append(u.pendingEvents, event)
}
