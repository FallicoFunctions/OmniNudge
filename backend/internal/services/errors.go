package services

import "errors"

// Common sentinel errors used across services.
var (
	// Authentication
	ErrInvalidCredentials = errors.New("invalid credentials")

	// Authorization
	ErrUnauthorized = errors.New("unauthorized")
	ErrForbidden    = errors.New("forbidden")

	// Resource
	ErrNotFound                = errors.New("resource not found")
	ErrAlreadyExists           = errors.New("resource already exists")
	ErrMessageNotRegeneratable = errors.New("message cannot be regenerated")
	ErrMessageNotEditable      = errors.New("message cannot be edited")

	// Validation
	ErrInvalidInput     = errors.New("invalid input")
	ErrMissingField     = errors.New("required field missing")
	ErrNoFieldsToUpdate = errors.New("no fields to update")

	// Business rules — password/username/email validation is now owned by
	// domain/valueobjects; ban/delete rules are owned by domain.UserAggregate.
	// ErrCannotDeleteSelf is kept here as it is a cross-service rule not
	// expressible inside a single aggregate.
	ErrCannotDeleteSelf = errors.New("cannot delete your own account")
)
