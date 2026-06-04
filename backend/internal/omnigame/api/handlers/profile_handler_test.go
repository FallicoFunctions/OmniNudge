package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/omnigame/repository"
	"github.com/omninudge/backend/internal/omnigame/service"
	"github.com/stretchr/testify/require"
)

func testProfileRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)

	repo := repository.NewInMemoryProfileRepository()
	handler := NewProfileHandler(service.NewProfileService(repo))
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user_id", 42)
		c.Next()
	})
	router.PUT("/omnigame/profile/omnirave/loadout", handler.SaveLoadout)
	router.PUT("/omnigame/profile/omnirave/settings", handler.SaveRuntimeSettings)
	router.PUT("/omnigame/profile/omnirave/last-venue", handler.SaveLastVenue)
	router.PUT("/omnigame/profile/omnirave/return-point", handler.SaveReturnPoint)
	router.GET("/omnigame/profile/omnirave", handler.GetProfile)
	return router
}

func TestProfileHandler_SavesSignedInLoadout(t *testing.T) {
	req := httptest.NewRequest(http.MethodPut, "/omnigame/profile/omnirave/loadout", bytes.NewBufferString(`{"hair":"buzz","top":"black_mesh"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	router := testProfileRouter()
	router.ServeHTTP(rr, req)

	require.Equal(t, http.StatusNoContent, rr.Code)
}

func TestProfileHandler_LoadoutRoundTrips(t *testing.T) {
	router := testProfileRouter()

	saveReq := httptest.NewRequest(http.MethodPut, "/omnigame/profile/omnirave/loadout", bytes.NewBufferString(`{"hair":"buzz","top":"black_mesh"}`))
	saveReq.Header.Set("Content-Type", "application/json")
	saveRec := httptest.NewRecorder()
	router.ServeHTTP(saveRec, saveReq)
	require.Equal(t, http.StatusNoContent, saveRec.Code)

	getReq := httptest.NewRequest(http.MethodGet, "/omnigame/profile/omnirave", nil)
	getRec := httptest.NewRecorder()
	router.ServeHTTP(getRec, getReq)
	require.Equal(t, http.StatusOK, getRec.Code)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(getRec.Body.Bytes(), &payload))
	loadout := payload["loadout"].(map[string]any)
	require.Equal(t, "buzz", loadout["hair"])
	require.Equal(t, "black_mesh", loadout["top"])
}

func TestProfileHandler_ReturnPointRoundTrips(t *testing.T) {
	router := testProfileRouter()

	saveReq := httptest.NewRequest(http.MethodPut, "/omnigame/profile/omnirave/return-point", bytes.NewBufferString(`{"x":12,"y":0,"z":8}`))
	saveReq.Header.Set("Content-Type", "application/json")
	saveRec := httptest.NewRecorder()
	router.ServeHTTP(saveRec, saveReq)
	require.Equal(t, http.StatusNoContent, saveRec.Code)

	getReq := httptest.NewRequest(http.MethodGet, "/omnigame/profile/omnirave", nil)
	getRec := httptest.NewRecorder()
	router.ServeHTTP(getRec, getReq)
	require.Equal(t, http.StatusOK, getRec.Code)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(getRec.Body.Bytes(), &payload))
	returnPoint := payload["returnPoint"].(map[string]any)
	require.Equal(t, float64(12), returnPoint["x"])
	require.Equal(t, float64(8), returnPoint["z"])
}

func TestProfileHandler_RuntimeSettingsRoundTrip(t *testing.T) {
	router := testProfileRouter()

	saveReq := httptest.NewRequest(http.MethodPut, "/omnigame/profile/omnirave/settings", bytes.NewBufferString(`{"uiTheme":"Luminous Panels","graphicsMode":"auto","displayNames":true,"chatCollapsed":false,"crouchMode":"hold","cameraFollow":"free"}`))
	saveReq.Header.Set("Content-Type", "application/json")
	saveRec := httptest.NewRecorder()
	router.ServeHTTP(saveRec, saveReq)
	require.Equal(t, http.StatusNoContent, saveRec.Code)

	getReq := httptest.NewRequest(http.MethodGet, "/omnigame/profile/omnirave", nil)
	getRec := httptest.NewRecorder()
	router.ServeHTTP(getRec, getReq)
	require.Equal(t, http.StatusOK, getRec.Code)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(getRec.Body.Bytes(), &payload))
	settings := payload["settings"].(map[string]any)
	require.Equal(t, "Luminous Panels", settings["uiTheme"])
	require.Equal(t, "auto", settings["graphicsMode"])
	require.Equal(t, true, settings["displayNames"])
	require.Equal(t, false, settings["chatCollapsed"])
	require.Equal(t, "hold", settings["crouchMode"])
	require.Equal(t, "free", settings["cameraFollow"])
}

func TestProfileHandler_LastVenueRoundTrips(t *testing.T) {
	router := testProfileRouter()

	saveReq := httptest.NewRequest(http.MethodPut, "/omnigame/profile/omnirave/last-venue", bytes.NewBufferString(`{"lastVenue":"underground"}`))
	saveReq.Header.Set("Content-Type", "application/json")
	saveRec := httptest.NewRecorder()
	router.ServeHTTP(saveRec, saveReq)
	require.Equal(t, http.StatusNoContent, saveRec.Code)

	getReq := httptest.NewRequest(http.MethodGet, "/omnigame/profile/omnirave", nil)
	getRec := httptest.NewRecorder()
	router.ServeHTTP(getRec, getReq)
	require.Equal(t, http.StatusOK, getRec.Code)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(getRec.Body.Bytes(), &payload))
	require.Equal(t, "underground", payload["lastVenue"])
}
