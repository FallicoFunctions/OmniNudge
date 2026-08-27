package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// The two refusals are different answers to different situations.
//
// A full shelf can be cleared. A limit of zero cannot: making characters is a
// paid feature, and telling somebody with none to delete one is advice they
// cannot take.

func refusalFor(t *testing.T, limit int) (int, string, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/omnichat/personas", nil)
	respondRoleplayLimit(c, limit)

	var body struct {
		Code    string `json:"code"`
		Error   string `json:"error"`
		Message string `json:"message"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))

	text := body.Message
	if text == "" {
		text = body.Error
	}
	return recorder.Code, body.Code, text
}

func TestAnAccountWithNoAllowanceIsToldToUpgradeNotToDelete(t *testing.T) {
	status, code, message := refusalFor(t, 0)

	require.Equal(t, http.StatusForbidden, status,
		"nothing is in conflict -- the account does not have the feature")
	require.Equal(t, "character_creation_requires_upgrade", code)
	require.NotContains(t, message, "Delete", "they have none to delete")
}

func TestAFullShelfIsToldItIsFull(t *testing.T) {
	status, code, message := refusalFor(t, 5)

	require.Equal(t, http.StatusConflict, status)
	require.Equal(t, "character_limit_reached", code)
	require.Contains(t, message, "Delete", "which is a choice they can actually make")
}

func TestANegativeLimitIsReadAsNoAllowance(t *testing.T) {
	// Nothing produces one, but a limit that went wrong should refuse the way
	// zero does rather than fall through to the message about deleting.
	status, code, _ := refusalFor(t, -1)

	require.Equal(t, http.StatusForbidden, status)
	require.Equal(t, "character_creation_requires_upgrade", code)
}
