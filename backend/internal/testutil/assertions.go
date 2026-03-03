package testutil

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/services"
)

// AssertServiceError asserts that err is a *services.ServiceError with the
// expected HTTP status code. The test is failed immediately if the assertion
// does not hold.
func AssertServiceError(t *testing.T, err error, expectedCode int) {
	t.Helper()
	var svcErr *services.ServiceError
	require.True(t, errors.As(err, &svcErr), "expected *services.ServiceError, got %T: %v", err, err)
	require.Equal(t, expectedCode, svcErr.Code, "unexpected ServiceError.Code")
}
