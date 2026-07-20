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

// ServiceError wraps an underlying error with an HTTP status code and a
// human-readable message safe to return to callers.
type ServiceError struct {
	Code    int
	Message string
	Err     error
}

func (e *ServiceError) Error() string {
	if e.Err != nil {
		return e.Err.Error()
	}
	return e.Message
}

func (e *ServiceError) Unwrap() error { return e.Err }

// NewServiceError is the low-level constructor.
func NewServiceError(code int, message string, err error) *ServiceError {
	return &ServiceError{Code: code, Message: message, Err: err}
}

// Convenience constructors — mirrors standard HTTP semantics.

func BadRequest(err error) *ServiceError {
	return NewServiceError(400, "Bad request", err)
}

func Unauthorized(err error) *ServiceError {
	return NewServiceError(401, "Unauthorized", err)
}

func Forbidden(err error) *ServiceError {
	return NewServiceError(403, "Forbidden", err)
}

func NotFound(err error) *ServiceError {
	return NewServiceError(404, "Not found", err)
}

func Conflict(err error) *ServiceError {
	return NewServiceError(409, "Conflict", err)
}

func InternalError(err error) *ServiceError {
	return NewServiceError(500, "Internal server error", err)
}
