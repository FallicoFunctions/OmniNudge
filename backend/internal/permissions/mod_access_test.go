package permissions

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRequireHubModeratorOrAdminRejectsMalformedUserContext(t *testing.T) {
	gin.SetMode(gin.TestMode)
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest("GET", "/", nil)
	context.Set("user_id", "not-an-int")

	allowed, err := RequireHubModeratorOrAdmin(context, 1, nil)
	require.False(t, allowed)
	require.EqualError(t, err, "invalid user_id")
}
