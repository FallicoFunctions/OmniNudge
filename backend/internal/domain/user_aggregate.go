package domain

import (
	"errors"
	"log"
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
//
// Concurrency: UserAggregate is NOT safe for concurrent use. In keeping with
// standard DDD practice, an aggregate is always loaded, mutated, and persisted
// within a single request/transaction; it must never be shared across goroutines.
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
	role string
	// shadowBanned is set via repository.ShadowBanUser only — not exposed
	// as an aggregate mutation. Shadow-banned users can still log in; the
	// feed layer silently restricts their content without surfacing this flag.
	shadowBanned bool
	banned       bool
	banReason    *string
	bannedAt     *time.Time
	deleted      bool

	// Timestamps
	createdAt time.Time
	lastSeen  time.Time

	// registered guards RecordRegistration so the UserRegistered event is
	// emitted exactly once, even if the method is called more than once.
	registered bool

	// Pending domain events (cleared by GetEvents).
	pendingEvents []domainevents.Event
}

// NewUserAggregate creates a fresh UserAggregate, validating all inputs via
// value objects. No domain events are recorded at construction time because the
// aggregate has no ID yet. The application service must call SetID followed by
// RecordRegistration after the entity has been persisted.
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

// RecordRegistration records a UserRegistered domain event. Must be called
// exactly once by the application service after the entity has been persisted
// and SetID has been called. Subsequent calls are a no-op.
func (u *UserAggregate) RecordRegistration() {
	if u.id == 0 {
		// Called before persistence — programmer error; silently ignore so we
		// don't publish an event with a meaningless zero ID.
		return
	}
	if u.registered {
		return // idempotent
	}
	u.registered = true
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
// showReason controls whether the ban reason is visible to the banned user.
func (u *UserAggregate) Ban(reason string, showReason bool, bannedBy int) error {
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
		UserID:       u.id,
		Username:     u.username.String(),
		Reason:       reason,
		ReasonPublic: showReason,
		BannedBy:     bannedBy,
		BannedAt:     now,
	})

	return nil
}

// Unban lifts the ban. Idempotent — no-op if not currently banned.
// reason is the moderator's explanation (persisted in the event for the audit trail).
func (u *UserAggregate) Unban(reason string, unbannedBy int) {
	if !u.banned {
		return
	}

	u.banned = false
	u.banReason = nil
	u.bannedAt = nil

	u.recordEvent(domainevents.UserUnbanned{
		UserID:     u.id,
		Username:   u.username.String(),
		Reason:     reason,
		UnbannedBy: unbannedBy,
		UnbannedAt: time.Now(),
	})
}

// Delete soft-deletes the user. Returns ErrUserDeleted if already deleted.
func (u *UserAggregate) Delete(reason string, deletedBy int) error {
	if u.deleted {
		return ErrUserDeleted
	}

	u.deleted = true

	u.recordEvent(domainevents.UserDeleted{
		UserID:    u.id,
		Username:  u.username.String(),
		Reason:    reason,
		DeletedBy: deletedBy,
		DeletedAt: time.Now(),
	})

	return nil
}

// ChangePassword validates the old password then replaces it with a newly
// created Password value object (which enforces strength requirements).
// Returns ErrUserDeleted or ErrUserBanned if the account is not active.
// Deleted is checked before banned because deletion is the terminal state.
func (u *UserAggregate) ChangePassword(oldPassword, newPassword string) error {
	if u.deleted {
		return ErrUserDeleted
	}
	if u.banned {
		return ErrUserBanned
	}
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

// UpdateProfile sets optional profile fields. Nil pointers are ignored (no-op
// for that field), allowing callers to update a subset of fields.
func (u *UserAggregate) UpdateProfile(bio, avatarURL *string, nsfw *bool) {
	if bio != nil {
		u.bio = bio
	}
	if avatarURL != nil {
		u.avatarURL = avatarURL
	}
	if nsfw != nil {
		u.nsfw = *nsfw
	}
}

// CanLogin returns an error explaining why the user cannot log in, or nil.
// Note: shadow-banned users are intentionally allowed to log in; the feed
// layer silently restricts their visibility without revealing the restriction.
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

// PasswordHash returns the bcrypt hash of the current password.
// Use this instead of ToEntity().PasswordHash when only the hash is needed.
func (u *UserAggregate) PasswordHash() string {
	return u.password.Hash()
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
// Only fields tracked by the aggregate are written; fields that live solely on
// the DB model (e.g. reddit tokens, encrypted email, karma counters) are NOT
// touched. Callers should load the full entity first and merge only the fields
// they need to update rather than blindly saving the aggregate's ToEntity()
// output, to avoid clobbering DB-side fields that the aggregate doesn't own.
func (u *UserAggregate) ToEntity() *User {
	// Preserve nil email for Reddit-only users. A zero Email value object
	// (empty string) must not be persisted as a pointer-to-empty-string,
	// because that would break the nil vs "no email" distinction on reload.
	var emailPtr *string
	if s := u.email.String(); s != "" {
		emailPtr = &s
	}
	return &User{
		ID:           u.id,
		Username:     u.username.String(),
		Email:        emailPtr,
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
//
// Intentional leniency for legacy/OAuth compatibility: validation rules applied
// by NewUserAggregate are NOT re-enforced here so that users created under old
// rules can still load and operate without errors. The aggregate accepts:
//   - nil / empty email  (Reddit OAuth accounts that never set an email)
//   - short usernames    (pre-dates the 3-char minimum)
//   - malformed emails   (legacy rows; a WARN is logged and the raw value used)
//
// This is a deliberate design choice, not an oversight.
func UserAggregateFromEntity(user *User) (*UserAggregate, error) {
	// Username: use the lenient loader so legacy short usernames don't block.
	username := valueobjects.UsernameFromString(user.Username)

	// Email: Reddit-only users have no email; use a zero Email value object.
	var email valueobjects.Email
	if user.Email != nil && *user.Email != "" {
		var err error
		email, err = valueobjects.NewEmail(*user.Email)
		if err != nil {
			// Stored value is malformed — log a warning and continue with the
			// raw value rather than blocking all operations on this user.
			log.Printf("WARN UserAggregateFromEntity: user %d has malformed email %q: %v", user.ID, *user.Email, err)
			email = valueobjects.EmailFromString(*user.Email)
		}
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
		// Any user that exists in the DB has already been registered.
		// Setting registered=true prevents RecordRegistration from
		// re-publishing a UserRegistered event on a reloaded aggregate.
		registered:    user.ID != 0,
		pendingEvents: make([]domainevents.Event, 0),
	}, nil
}

// recordEvent appends an event to the pending list.
func (u *UserAggregate) recordEvent(event domainevents.Event) {
	u.pendingEvents = append(u.pendingEvents, event)
}
