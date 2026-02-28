// Package services contains domain services — business logic that spans multiple
// aggregates or requires external lookups but does not belong to any single
// aggregate root.
package services

import (
	"context"
	"errors"

	"github.com/omninudge/backend/internal/domain"
)

var (
	ErrUsernameTaken = errors.New("username is already taken")
	ErrEmailTaken    = errors.New("email is already registered")
)

// UserRepository is the minimal read interface required by UserDomainService.
// It is a subset of ports.UserRepository, which satisfies it automatically.
// Defining the subset here keeps the domain layer free of a direct dependency
// on the ports package (dependency inversion).
type UserRepository interface {
	GetByUsername(ctx context.Context, username string) (*domain.User, error)
	GetByEmail(ctx context.Context, email string) (*domain.User, error)
}

// UserDomainService contains business logic that spans multiple user aggregates
// or requires cross-entity lookups (e.g. uniqueness constraints).
type UserDomainService struct {
	userRepo UserRepository
}

// NewUserDomainService creates a new UserDomainService.
func NewUserDomainService(userRepo UserRepository) *UserDomainService {
	return &UserDomainService{userRepo: userRepo}
}

// CheckUsernameAvailable returns ErrUsernameTaken if the username is already
// in use.
func (s *UserDomainService) CheckUsernameAvailable(ctx context.Context, username string) error {
	existing, err := s.userRepo.GetByUsername(ctx, username)
	if err != nil {
		return err
	}
	if existing != nil {
		return ErrUsernameTaken
	}
	return nil
}

// CheckEmailAvailable returns ErrEmailTaken if the email is already registered.
func (s *UserDomainService) CheckEmailAvailable(ctx context.Context, email string) error {
	existing, err := s.userRepo.GetByEmail(ctx, email)
	if err != nil {
		return err
	}
	if existing != nil {
		return ErrEmailTaken
	}
	return nil
}

// CanUserBan checks whether the acting user has permission to ban the target.
// Business rules:
//   - Only admins may ban.
//   - Admins cannot ban other admins.
func (s *UserDomainService) CanUserBan(banner, target *domain.User) error {
	if banner.Role != "admin" {
		return errors.New("only administrators can ban users")
	}
	if target.Role == "admin" {
		return domain.ErrCannotBanAdmin
	}
	return nil
}

// CanUserDelete checks whether the acting user has permission to delete the
// target.
// Business rules:
//   - Users may not delete their own account through this path.
//   - Only admins may delete other users.
//   - Admins may not delete other admin accounts.
func (s *UserDomainService) CanUserDelete(deleter, target *domain.User) error {
	if deleter.ID == target.ID {
		return errors.New("cannot delete your own account")
	}
	if deleter.Role != "admin" {
		return errors.New("only administrators can delete users")
	}
	if target.Role == "admin" {
		return errors.New("cannot delete administrator accounts")
	}
	return nil
}
