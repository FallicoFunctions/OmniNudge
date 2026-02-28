package services

import (
	"context"
	"errors"
	"fmt"

	"github.com/omninudge/backend/internal/domain"
	domainevents "github.com/omninudge/backend/internal/domain/events"
	domainservices "github.com/omninudge/backend/internal/domain/services"
	"github.com/omninudge/backend/internal/ports"
)

// UserService is the application-layer interface for user operations.
// It is a thin orchestrator: business rules are enforced in domain aggregates;
// this layer coordinates persistence and event publication.
type UserService interface {
	// RegisterUser creates a new user, validates inputs via value objects, and
	// publishes a UserRegistered domain event.
	RegisterUser(ctx context.Context, username, email, plainPassword string) (*domain.User, error)

	// BanUser bans the target user after enforcing business invariants via the
	// UserAggregate and publishes a UserBanned event.
	BanUser(ctx context.Context, userID int, reason string, showReason bool, bannedBy int) error

	// UnbanUser removes a ban and publishes a UserUnbanned event.
	UnbanUser(ctx context.Context, userID int, reason string, unbannedBy int) error

	// DeleteUser soft-deletes the target user after checking deletion rules
	// via the UserAggregate and publishes a UserDeleted event.
	DeleteUser(ctx context.Context, userID int, reason string, deletedBy int) error

	// ChangePassword changes a user's password, verifying the old one first.
	ChangePassword(ctx context.Context, userID int, oldPassword, newPassword string) error

	// UpdateProfile updates optional profile fields (bio, avatar URL).
	UpdateProfile(ctx context.Context, userID int, bio *string, avatarURL *string) error
}

// userServiceImpl is the default production implementation of UserService.
type userServiceImpl struct {
	userRepo ports.UserRepository
	eventBus *domainevents.EventBus
}

// NewUserService creates a production UserService.
func NewUserService(userRepo ports.UserRepository, eventBus *domainevents.EventBus) UserService {
	return &userServiceImpl{
		userRepo: userRepo,
		eventBus: eventBus,
	}
}

// RegisterUser creates a new user account.
// Validation is performed via value objects; uniqueness is checked via the
// UserDomainService; the entity is persisted and a UserRegistered event is
// published with the real DB-assigned ID.
func (s *userServiceImpl) RegisterUser(ctx context.Context, username, email, plainPassword string) (*domain.User, error) {
	// Build and validate the aggregate (value objects enforce rules).
	agg, err := domain.NewUserAggregate(username, email, plainPassword)
	if err != nil {
		return nil, BadRequest(err)
	}

	// Check uniqueness via domain service.
	ds := domainservices.NewUserDomainService(s.userRepo)

	if err := ds.CheckUsernameAvailable(ctx, username); err != nil {
		if errors.Is(err, domainservices.ErrUsernameTaken) {
			return nil, Conflict(err)
		}
		return nil, InternalError(fmt.Errorf("check username: %w", err))
	}

	if err := ds.CheckEmailAvailable(ctx, email); err != nil {
		if errors.Is(err, domainservices.ErrEmailTaken) {
			return nil, Conflict(err)
		}
		return nil, InternalError(fmt.Errorf("check email: %w", err))
	}

	// Persist — convert aggregate to entity first.
	user := agg.ToEntity()
	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, InternalError(fmt.Errorf("create user: %w", err))
	}

	// Propagate the DB-assigned ID back to the aggregate, then record the
	// UserRegistered event so it carries the real user ID.
	agg.SetID(user.ID)
	agg.RecordRegistration()

	// Publish pending domain events.
	s.publishEvents(agg.GetEvents())

	return user, nil
}

// BanUser enforces ban invariants via the UserAggregate then delegates
// persistence to the dedicated repository method.
func (s *userServiceImpl) BanUser(ctx context.Context, userID int, reason string, showReason bool, bannedBy int) error {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return InternalError(fmt.Errorf("get user: %w", err))
	}
	if user == nil {
		return NotFound(fmt.Errorf("user %d not found", userID))
	}

	agg, err := domain.UserAggregateFromEntity(user)
	if err != nil {
		return InternalError(fmt.Errorf("load aggregate: %w", err))
	}

	// Enforce business rules (cannot ban admin, cannot ban deleted user).
	if err := agg.Ban(reason, bannedBy); err != nil {
		return BadRequest(err)
	}

	// Persist via dedicated method.
	if err := s.userRepo.BanUser(ctx, userID, reason, showReason, bannedBy); err != nil {
		return InternalError(fmt.Errorf("ban user: %w", err))
	}

	s.publishEvents(agg.GetEvents())
	return nil
}

// UnbanUser lifts a ban and publishes a UserUnbanned event.
func (s *userServiceImpl) UnbanUser(ctx context.Context, userID int, reason string, unbannedBy int) error {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return InternalError(fmt.Errorf("get user: %w", err))
	}
	if user == nil {
		return NotFound(fmt.Errorf("user %d not found", userID))
	}

	agg, err := domain.UserAggregateFromEntity(user)
	if err != nil {
		return InternalError(fmt.Errorf("load aggregate: %w", err))
	}

	agg.Unban(unbannedBy)

	if err := s.userRepo.UnbanUser(ctx, userID, reason, unbannedBy); err != nil {
		return InternalError(fmt.Errorf("unban user: %w", err))
	}

	s.publishEvents(agg.GetEvents())
	return nil
}

// DeleteUser soft-deletes a user via the aggregate (business rule enforcement)
// and the dedicated repository method.
func (s *userServiceImpl) DeleteUser(ctx context.Context, userID int, reason string, deletedBy int) error {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return InternalError(fmt.Errorf("get user: %w", err))
	}
	if user == nil {
		return NotFound(fmt.Errorf("user %d not found", userID))
	}

	agg, err := domain.UserAggregateFromEntity(user)
	if err != nil {
		return InternalError(fmt.Errorf("load aggregate: %w", err))
	}

	// Enforce business rules (cannot delete already-deleted user).
	if err := agg.Delete(deletedBy); err != nil {
		return BadRequest(err)
	}

	if err := s.userRepo.SoftDeleteUser(ctx, userID, reason, deletedBy); err != nil {
		return InternalError(fmt.Errorf("delete user: %w", err))
	}

	s.publishEvents(agg.GetEvents())
	return nil
}

// ChangePassword verifies the old password via the aggregate, then persists
// the new hash and publishes a PasswordChanged event.
func (s *userServiceImpl) ChangePassword(ctx context.Context, userID int, oldPassword, newPassword string) error {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return InternalError(fmt.Errorf("get user: %w", err))
	}
	if user == nil {
		return NotFound(fmt.Errorf("user %d not found", userID))
	}

	agg, err := domain.UserAggregateFromEntity(user)
	if err != nil {
		return InternalError(fmt.Errorf("load aggregate: %w", err))
	}

	if err := agg.ChangePassword(oldPassword, newPassword); err != nil {
		return BadRequest(err)
	}

	// Persist the new hash via the dedicated repo method.
	if err := s.userRepo.UpdatePassword(ctx, userID, agg.ToEntity().PasswordHash); err != nil {
		return InternalError(fmt.Errorf("update password: %w", err))
	}

	s.publishEvents(agg.GetEvents())
	return nil
}

// UpdateProfile delegates to the repository's dedicated profile-update method.
func (s *userServiceImpl) UpdateProfile(ctx context.Context, userID int, bio *string, avatarURL *string) error {
	if err := s.userRepo.UpdateProfile(ctx, userID, bio, avatarURL); err != nil {
		return InternalError(fmt.Errorf("update profile: %w", err))
	}
	return nil
}

// publishEvents dispatches each pending domain event to the event bus.
func (s *userServiceImpl) publishEvents(evts []domainevents.Event) {
	for _, e := range evts {
		s.eventBus.Publish(e)
	}
}
