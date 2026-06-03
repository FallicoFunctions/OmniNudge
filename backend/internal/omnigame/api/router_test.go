package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omnigame/repository"
	"github.com/omninudge/backend/internal/omnigame/service"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestRouter_ProfileEndpointAcceptsGameSessionToken(t *testing.T) {
	authService := services.NewAuthService("dev-secret", "OmniGame/1.0", "")
	sessionService := service.NewSessionServiceWithDependencies(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
		authService,
	)
	router := NewRouter(sessionService, authService, []string{"127.0.0.1/32", "::1/128"})

	token, err := authService.GenerateGameSessionJWT(42, "alice")
	require.NoError(t, err)

	saveReq := httptest.NewRequest(http.MethodPut, "/api/v1/omnigame/profile/omnirave/loadout", bytes.NewBufferString(`{"hair":"buzz","top":"black_mesh"}`))
	saveReq.Header.Set("Content-Type", "application/json")
	saveReq.Header.Set("Authorization", "Bearer "+token)
	saveRec := httptest.NewRecorder()
	router.ServeHTTP(saveRec, saveReq)
	require.Equal(t, http.StatusNoContent, saveRec.Code)

	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/omnigame/profile/omnirave", nil)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getRec := httptest.NewRecorder()
	router.ServeHTTP(getRec, getReq)
	require.Equal(t, http.StatusOK, getRec.Code)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(getRec.Body.Bytes(), &payload))
	loadout := payload["loadout"].(map[string]any)
	require.Equal(t, "buzz", loadout["hair"])
	require.Equal(t, "black_mesh", loadout["top"])
}

func TestRouter_ProfileEndpointRejectsRevokedTokenVersion(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	authService, router, userRepo, user := newProfileRouterWithLiveUsers(t, db)

	token, err := authService.GenerateGameSessionJWTWithVersion(user.ID, user.Username, user.TokenVersion)
	require.NoError(t, err)
	require.NoError(t, userRepo.IncrementTokenVersion(context.Background(), user.ID))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/omnigame/profile/omnirave", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestRouter_ProfileEndpointRejectsBannedUser(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	authService, router, userRepo, user := newProfileRouterWithLiveUsers(t, db)

	token, err := authService.GenerateGameSessionJWTWithVersion(user.ID, user.Username, user.TokenVersion)
	require.NoError(t, err)
	require.NoError(t, userRepo.BanUser(context.Background(), user.ID, "omnirave review test", false, user.ID))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/omnigame/profile/omnirave", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestRouter_ProfileEndpointRejectsDeletedUser(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	authService, router, userRepo, user := newProfileRouterWithLiveUsers(t, db)

	token, err := authService.GenerateGameSessionJWTWithVersion(user.ID, user.Username, user.TokenVersion)
	require.NoError(t, err)
	require.NoError(t, userRepo.SoftDeleteUser(context.Background(), user.ID, "omnirave review test", user.ID))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/omnigame/profile/omnirave", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestRouter_ProfileEndpointAcceptsSessionExchangeTokenAtCurrentLiveVersion(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	userRepo := models.NewUserRepository(db.Pool)
	user := testutil.NewFixtures(t, &testutil.TestDatabase{DB: db, Pool: db.Pool}).CreateUniqueUser("omnirave_profile")
	require.NoError(t, userRepo.IncrementTokenVersion(ctx, user.ID))
	reloaded, err := userRepo.GetByID(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, reloaded)

	authService := services.NewAuthService("dev-secret", "OmniGame/1.0", "")
	authService.SetUserRepository(userRepo)

	sessionService := service.NewSessionServiceWithDependencies(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
		authService,
	)

	launch, err := sessionService.CreateLaunchSession(ctx, serviceTestLaunchRequestAccount(), serviceTestIdentity(reloaded))
	require.NoError(t, err)

	exchanged, err := sessionService.ExchangeLaunchSession(ctx, serviceTestExchangeRequest(launch.LaunchToken))
	require.NoError(t, err)
	require.NotEmpty(t, exchanged.SessionToken)

	router := NewRouter(sessionService, authService, []string{"127.0.0.1/32", "::1/128"})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/omnigame/profile/omnirave", nil)
	req.Header.Set("Authorization", "Bearer "+exchanged.SessionToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
}

func newProfileRouterWithLiveUsers(t *testing.T, db *testutil.TestDatabase) (*services.AuthService, *gin.Engine, *models.UserRepository, *models.User) {
	t.Helper()

	userRepo := models.NewUserRepository(db.Pool)
	user := testutil.NewFixtures(t, db).CreateUniqueUser("omnirave_profile")
	authService := services.NewAuthService("dev-secret", "OmniGame/1.0", "")
	authService.SetUserRepository(userRepo)

	sessionService := service.NewSessionServiceWithDependencies(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
		authService,
	)
	router := NewRouter(sessionService, authService, []string{"127.0.0.1/32", "::1/128"})

	return authService, router, userRepo, user
}

func serviceTestLaunchRequestAccount() model.LaunchRequest {
	return model.LaunchRequest{Mode: model.LaunchModeAccount}
}

func serviceTestIdentity(user *models.User) model.PlayerIdentity {
	return model.PlayerIdentity{
		UserID:       &user.ID,
		Username:     user.Username,
		TokenVersion: user.TokenVersion,
	}
}

func serviceTestExchangeRequest(handoff string) model.SessionExchangeRequest {
	return model.SessionExchangeRequest{
		Handoff: handoff,
		Mode:    model.LaunchModeAccount,
	}
}
