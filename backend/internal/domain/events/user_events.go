package events

import "time"

// UserRegistered is published when a new user registers.
type UserRegistered struct {
	UserID       int
	Username     string
	Email        string
	RegisteredAt time.Time
}

func (e UserRegistered) EventName() string  { return "UserRegistered" }
func (e UserRegistered) OccurredAt() time.Time { return e.RegisteredAt }

// UserBanned is published when a user is banned.
type UserBanned struct {
	UserID       int
	Username     string
	Reason       string
	ReasonPublic bool // whether the ban reason is shown to the user
	BannedBy     int
	BannedAt     time.Time
}

func (e UserBanned) EventName() string  { return "UserBanned" }
func (e UserBanned) OccurredAt() time.Time { return e.BannedAt }

// UserUnbanned is published when a user ban is lifted.
type UserUnbanned struct {
	UserID     int
	Username   string
	UnbannedBy int
	UnbannedAt time.Time
}

func (e UserUnbanned) EventName() string  { return "UserUnbanned" }
func (e UserUnbanned) OccurredAt() time.Time { return e.UnbannedAt }

// UserDeleted is published when a user account is soft-deleted.
type UserDeleted struct {
	UserID    int
	Username  string
	Reason    string
	DeletedBy int
	DeletedAt time.Time
}

func (e UserDeleted) EventName() string  { return "UserDeleted" }
func (e UserDeleted) OccurredAt() time.Time { return e.DeletedAt }

// PasswordChanged is published when a user changes their password.
type PasswordChanged struct {
	UserID    int
	ChangedAt time.Time
}

func (e PasswordChanged) EventName() string  { return "PasswordChanged" }
func (e PasswordChanged) OccurredAt() time.Time { return e.ChangedAt }
