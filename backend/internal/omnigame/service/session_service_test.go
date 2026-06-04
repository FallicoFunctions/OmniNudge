package service

import (
	"context"
	"net/url"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omnigame/repository"
	omniraveworld "github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

type stubSessionTokenIssuer struct {
	token      string
	worldToken string
	err        error
}

func (s stubSessionTokenIssuer) GenerateGameSessionJWTWithVersion(_ int, _ string, _ int) (string, error) {
	return s.token, s.err
}

func (s stubSessionTokenIssuer) GenerateOmniRaveWorldJWT(_ services.OmniRaveWorldTokenInput) (string, error) {
	return s.worldToken, s.err
}

func TestSessionService_CreateSignedInLaunchSession(t *testing.T) {
	userID := 42
	svc := NewSessionService("http://localhost:4173/omnirave", "ws://localhost:8092/ws")

	session, err := svc.CreateLaunchSession(context.Background(), model.LaunchRequest{
		Mode: model.LaunchModeAccount,
	}, model.PlayerIdentity{
		UserID:   &userID,
		Username: "alice",
	})

	require.NoError(t, err)
	require.Equal(t, "omnirave", session.GameSlug)
	require.Equal(t, model.LaunchModeAccount, session.Mode)
	require.NotEmpty(t, session.LaunchToken)
	require.Equal(t, "alice", session.PlayerName)
}

func TestSessionService_CreateGuestLaunchSession(t *testing.T) {
	svc := NewSessionService("http://localhost:4173/omnirave", "ws://localhost:8092/ws")

	session, err := svc.CreateLaunchSession(context.Background(), model.LaunchRequest{
		Mode: model.LaunchModeGuest,
	}, model.PlayerIdentity{})

	require.NoError(t, err)
	require.Equal(t, model.LaunchModeGuest, session.Mode)
	require.NotEmpty(t, session.GuestName)
	require.NotEmpty(t, session.LaunchToken)
}

func TestSessionService_BuildLaunchURLIncludesModeAndHandoff(t *testing.T) {
	svc := NewSessionService("http://localhost:4173/omnirave", "ws://localhost:8092/ws")

	session := &model.LaunchSession{
		GameSlug:    "omnirave",
		Mode:        model.LaunchModeGuest,
		LaunchToken: "handoff-1",
	}
	launchURL, err := svc.BuildLaunchURL(session)
	require.NoError(t, err)

	parsed, err := url.Parse(launchURL)
	require.NoError(t, err)
	require.Equal(t, "/omnirave", parsed.Path)
	require.Equal(t, "guest", parsed.Query().Get("mode"))
	require.Equal(t, "handoff-1", parsed.Query().Get("handoff"))
}

func TestSessionService_ExchangeLaunchSessionReturnsWorldBootstrap(t *testing.T) {
	svc := NewSessionService("http://localhost:4173/omnirave", "ws://localhost:8092/ws")

	session, err := svc.CreateLaunchSession(context.Background(), model.LaunchRequest{
		Mode: model.LaunchModeGuest,
	}, model.PlayerIdentity{})
	require.NoError(t, err)

	bootstrap, err := svc.ExchangeLaunchSession(context.Background(), model.SessionExchangeRequest{
		Handoff: session.LaunchToken,
		Mode:    model.LaunchModeGuest,
	})
	require.NoError(t, err)
	require.Equal(t, "ws://localhost:8092/ws", bootstrap.WorldSocketURL)
	require.NotEmpty(t, bootstrap.PlayerID)
	require.NotEmpty(t, bootstrap.PlayerName)
}

func TestSessionService_ExchangeSignedInSessionReturnsPersistedLoadoutAndReturnPoint(t *testing.T) {
	userID := 42
	svc := NewSessionServiceWithDependencies(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
		stubSessionTokenIssuer{token: "session-token-1"},
	)
	require.NoError(t, svc.ProfileService().SaveLoadout(context.Background(), userID, map[string]string{
		"hair": "buzz",
		"top":  "black_mesh",
	}))
	require.NoError(t, svc.ProfileService().SaveReturnPoint(context.Background(), userID, &model.SavedPoint{
		X: 12,
		Y: 0,
		Z: 8,
	}))
	require.NoError(t, svc.ProfileService().SaveSettings(context.Background(), userID, model.OmniRaveSettings{
		UITheme:       "Luminous Panels",
		GraphicsMode:  "auto",
		DisplayNames:  true,
		ChatCollapsed: false,
		CrouchMode:    "hold",
		CameraFollow:  "free",
	}))
	require.NoError(t, svc.ProfileService().SaveLastVenue(context.Background(), userID, "underground"))

	session, err := svc.CreateLaunchSession(context.Background(), model.LaunchRequest{
		Mode: model.LaunchModeAccount,
	}, model.PlayerIdentity{
		UserID:   &userID,
		Username: "alice",
	})
	require.NoError(t, err)

	bootstrap, err := svc.ExchangeLaunchSession(context.Background(), model.SessionExchangeRequest{
		Handoff: session.LaunchToken,
		Mode:    model.LaunchModeAccount,
	})
	require.NoError(t, err)
	require.Equal(t, "buzz", bootstrap.Loadout["hair"])
	require.Equal(t, "black_mesh", bootstrap.Loadout["top"])
	require.NotNil(t, bootstrap.ReturnPoint)
	require.Equal(t, 12.0, bootstrap.ReturnPoint.X)
	require.Equal(t, "underground", bootstrap.LastVenue)
	require.Equal(t, "Luminous Panels", bootstrap.Settings.UITheme)
	require.Equal(t, "session-token-1", bootstrap.SessionToken)
}

func TestSessionService_RuntimeLoginReturnsAccountBootstrapAndOverwritesVenue(t *testing.T) {
	userID := 42
	svc := NewSessionServiceWithDependencies(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
		stubSessionTokenIssuer{
			token:      "runtime-session-token-1",
			worldToken: "runtime-world-token-1",
		},
	)
	require.NoError(t, svc.ProfileService().SaveLastVenue(context.Background(), userID, "main_stage"))

	response, err := svc.BuildRuntimeAccountSession(context.Background(), model.RuntimeAuthRequest{
		CurrentVenue: "underground",
	}, model.PlayerIdentity{
		UserID:   &userID,
		Username: "nick",
	})

	require.NoError(t, err)
	require.Equal(t, model.LaunchModeAccount, response.Mode)
	require.Equal(t, "underground", response.ActiveZone)
	require.Equal(t, "underground", response.LastVenue)
	require.NotEmpty(t, response.SessionToken)
	require.NotEmpty(t, response.WorldSessionToken)

	profile, err := svc.ProfileService().GetProfile(context.Background(), userID)
	require.NoError(t, err)
	require.Equal(t, "underground", profile.LastVenue)
}

func TestSessionService_ExchangeSignedInSessionUsesDefaultRuntimeStateWhenProfileMissing(t *testing.T) {
	userID := 42
	svc := NewSessionServiceWithRepositories(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
	)

	session, err := svc.CreateLaunchSession(context.Background(), model.LaunchRequest{
		Mode: model.LaunchModeAccount,
	}, model.PlayerIdentity{
		UserID:   &userID,
		Username: "alice",
	})
	require.NoError(t, err)

	bootstrap, err := svc.ExchangeLaunchSession(context.Background(), model.SessionExchangeRequest{
		Handoff: session.LaunchToken,
		Mode:    model.LaunchModeAccount,
	})
	require.NoError(t, err)
	require.Equal(t, "main_stage", bootstrap.LastVenue)
	require.Equal(t, "Luminous Panels", bootstrap.Settings.UITheme)
	require.Equal(t, "auto", bootstrap.Settings.GraphicsMode)
	require.True(t, bootstrap.Settings.DisplayNames)
	require.False(t, bootstrap.Settings.ChatCollapsed)
	require.Equal(t, "hold", bootstrap.Settings.CrouchMode)
	require.Equal(t, "free", bootstrap.Settings.CameraFollow)
}

func TestSessionService_ExchangeGuestSessionDoesNotReturnPersistedData(t *testing.T) {
	svc := NewSessionService("http://localhost:4173/omnirave", "ws://localhost:8092/ws")

	session, err := svc.CreateLaunchSession(context.Background(), model.LaunchRequest{
		Mode: model.LaunchModeGuest,
	}, model.PlayerIdentity{})
	require.NoError(t, err)

	bootstrap, err := svc.ExchangeLaunchSession(context.Background(), model.SessionExchangeRequest{
		Handoff: session.LaunchToken,
		Mode:    model.LaunchModeGuest,
	})
	require.NoError(t, err)
	require.Empty(t, bootstrap.Loadout)
	require.Nil(t, bootstrap.ReturnPoint)
}

func TestSessionService_ExchangeLaunchSessionReturnsInjectedZoneMedia(t *testing.T) {
	mediaState := omniraveworld.NewMediaStateWithPlaylists([]omniraveworld.StagePlaylist{
		{
			ZoneID: omniraveworld.ZoneMainStage,
			Entries: []omniraveworld.PlaylistEntry{
				{VideoID: "custom-main-stage", Duration: 30 * time.Minute},
			},
		},
		{
			ZoneID: omniraveworld.ZoneUnderground,
			Entries: []omniraveworld.PlaylistEntry{
				{VideoID: "custom-techno-room", Duration: 30 * time.Minute},
			},
		},
		{
			ZoneID: omniraveworld.ZonePlurrPartay,
			Entries: []omniraveworld.PlaylistEntry{
				{VideoID: "custom-neon-room", Duration: 30 * time.Minute},
			},
		},
	}, time.Unix(1000, 0))

	svc := NewSessionServiceWithMediaState(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
		mediaState,
		nil,
	)

	session, err := svc.CreateLaunchSession(context.Background(), model.LaunchRequest{
		Mode: model.LaunchModeGuest,
	}, model.PlayerIdentity{})
	require.NoError(t, err)

	bootstrap, err := svc.ExchangeLaunchSession(context.Background(), model.SessionExchangeRequest{
		Handoff: session.LaunchToken,
		Mode:    model.LaunchModeGuest,
	})
	require.NoError(t, err)
	require.NotEmpty(t, bootstrap.ZoneMedia)
	require.Equal(t, "custom-main-stage", bootstrap.ZoneMedia[0].VideoID)
	require.Equal(t, "custom-techno-room", bootstrap.ZoneMedia[1].VideoID)
	require.Equal(t, "custom-neon-room", bootstrap.ZoneMedia[2].VideoID)
}

func TestSessionService_BuildRuntimeGuestLogoutIncludesZoneEvents(t *testing.T) {
	svc := NewSessionService("http://localhost:4173/omnirave", "ws://localhost:8092/ws")
	svc.now = func() time.Time {
		return time.Date(2026, 6, 4, 15, 44, 50, 0, time.UTC)
	}

	response, err := svc.BuildRuntimeGuestLogout(context.Background(), "main_stage")
	require.NoError(t, err)
	require.Len(t, response.ZoneEvents, 3)
	require.Equal(t, "main_stage", response.ZoneEvents[0].ZoneID)
	require.Equal(t, "none", response.ZoneEvents[0].Phase)
	require.Equal(t, "plurr_partay", response.ZoneEvents[2].ZoneID)
	require.Equal(t, "lead_in", response.ZoneEvents[2].Phase)
	require.Equal(t, "unity_peak", response.ZoneEvents[2].EventName)
	require.EqualValues(t, 10, response.ZoneEvents[2].CountdownSeconds)
}

func TestSessionService_ExchangeLaunchSessionReturnsZoneEventsForAccountBootstrap(t *testing.T) {
	userID := 42
	svc := NewSessionServiceWithRepositories(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
	)
	svc.now = func() time.Time {
		return time.Date(2026, 6, 4, 15, 30, 5, 0, time.UTC)
	}

	session, err := svc.CreateLaunchSession(context.Background(), model.LaunchRequest{
		Mode: model.LaunchModeAccount,
	}, model.PlayerIdentity{
		UserID:   &userID,
		Username: "alice",
	})
	require.NoError(t, err)

	bootstrap, err := svc.ExchangeLaunchSession(context.Background(), model.SessionExchangeRequest{
		Handoff: session.LaunchToken,
		Mode:    model.LaunchModeAccount,
	})
	require.NoError(t, err)
	require.Len(t, bootstrap.ZoneEvents, 3)
	require.Equal(t, "underground", bootstrap.ZoneEvents[1].ZoneID)
	require.Equal(t, "active", bootstrap.ZoneEvents[1].Phase)
	require.Equal(t, "collapse", bootstrap.ZoneEvents[1].EventName)
	require.EqualValues(t, 1, bootstrap.ZoneEvents[1].ActiveMinute)
}

func TestSessionService_ExchangeSignedInSessionReturnsPersistedDataAcrossServiceInstances(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	profiles := repository.NewPostgresProfileRepository(db.Pool)
	sanctions := repository.NewPostgresSanctionRepository(db.Pool)
	writer := NewSessionServiceWithRepositories("http://localhost:4173/omnirave", "ws://localhost:8092/ws", profiles, sanctions)
	require.NoError(t, writer.ProfileService().SaveLoadout(ctx, 42, map[string]string{
		"hair": "buzz",
		"top":  "black_mesh",
	}))
	require.NoError(t, writer.ProfileService().SaveReturnPoint(ctx, 42, &model.SavedPoint{
		X: 12,
		Y: 0,
		Z: 8,
	}))
	require.NoError(t, writer.ProfileService().SaveSettings(ctx, 42, model.OmniRaveSettings{
		UITheme:       "Luminous Panels",
		GraphicsMode:  "auto",
		DisplayNames:  true,
		ChatCollapsed: false,
		CrouchMode:    "hold",
		CameraFollow:  "free",
	}))
	require.NoError(t, writer.ProfileService().SaveLastVenue(ctx, 42, "underground"))

	reader := NewSessionServiceWithRepositories(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewPostgresProfileRepository(db.Pool),
		repository.NewPostgresSanctionRepository(db.Pool),
	)
	userID := 42
	session, err := reader.CreateLaunchSession(ctx, model.LaunchRequest{Mode: model.LaunchModeAccount}, model.PlayerIdentity{
		UserID:   &userID,
		Username: "alice",
	})
	require.NoError(t, err)

	bootstrap, err := reader.ExchangeLaunchSession(ctx, model.SessionExchangeRequest{
		Handoff: session.LaunchToken,
		Mode:    model.LaunchModeAccount,
	})
	require.NoError(t, err)
	require.Equal(t, "buzz", bootstrap.Loadout["hair"])
	require.Equal(t, "black_mesh", bootstrap.Loadout["top"])
	require.NotNil(t, bootstrap.ReturnPoint)
	require.Equal(t, 12.0, bootstrap.ReturnPoint.X)
	require.Equal(t, 8.0, bootstrap.ReturnPoint.Z)
	require.Equal(t, "underground", bootstrap.LastVenue)
	require.Equal(t, "Luminous Panels", bootstrap.Settings.UITheme)
}

func TestSessionService_RejectsFreshGuestLaunchFromSanctionedNetworkIdentifier(t *testing.T) {
	ctx := context.Background()
	sanctions := repository.NewInMemorySanctionRepository()
	svc := NewSessionServiceWithRepositories(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		sanctions,
	)

	first, err := svc.CreateLaunchSession(ctx, model.LaunchRequest{Mode: model.LaunchModeGuest}, model.PlayerIdentity{
		RemoteIP: "203.0.113.42",
	})
	require.NoError(t, err)
	sanctions.BlockBootstrap(first.LaunchToken, hashGuestNetwork("203.0.113.42"))

	second, err := svc.CreateLaunchSession(ctx, model.LaunchRequest{Mode: model.LaunchModeGuest}, model.PlayerIdentity{
		RemoteIP: "203.0.113.42",
	})
	require.NoError(t, err)

	_, err = svc.ExchangeLaunchSession(ctx, model.SessionExchangeRequest{
		Handoff:  second.LaunchToken,
		Mode:     model.LaunchModeGuest,
		RemoteIP: "203.0.113.42",
	})
	require.ErrorIs(t, err, ErrSanctionedGuest)
}

func TestSessionService_RejectsGuestExchangeWhenSanctionAppliesAtExchangeTime(t *testing.T) {
	ctx := context.Background()
	sanctions := repository.NewInMemorySanctionRepository()
	svc := NewSessionServiceWithRepositories(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		sanctions,
	)

	session, err := svc.CreateLaunchSession(ctx, model.LaunchRequest{Mode: model.LaunchModeGuest}, model.PlayerIdentity{})
	require.NoError(t, err)

	networkHash := hashGuestNetwork("203.0.113.90")
	sanctions.BlockBootstrap("other-bootstrap", networkHash)

	_, err = svc.ExchangeLaunchSession(ctx, model.SessionExchangeRequest{
		Handoff:  session.LaunchToken,
		Mode:     model.LaunchModeGuest,
		RemoteIP: "203.0.113.90",
	})
	require.ErrorIs(t, err, ErrSanctionedGuest)
}

func TestSessionService_UnresolvedGuestIdentityDoesNotInheritNetworkSanctionBucket(t *testing.T) {
	ctx := context.Background()
	sanctions := repository.NewInMemorySanctionRepository()
	svc := NewSessionServiceWithRepositories(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		sanctions,
	)

	session, err := svc.CreateLaunchSession(ctx, model.LaunchRequest{Mode: model.LaunchModeGuest}, model.PlayerIdentity{})
	require.NoError(t, err)

	sanctions.BlockBootstrap("other-bootstrap", hashGuestNetwork("198.51.100.20"))

	bootstrap, err := svc.ExchangeLaunchSession(ctx, model.SessionExchangeRequest{
		Handoff: session.LaunchToken,
		Mode:    model.LaunchModeGuest,
	})
	require.NoError(t, err)
	require.NotEmpty(t, bootstrap.WorldSocketURL)
}

func TestSessionService_MissingGuestNetworkIdentityDoesNotCreateSharedSanctionBucket(t *testing.T) {
	ctx := context.Background()
	sanctions := repository.NewInMemorySanctionRepository()
	svc := NewSessionServiceWithRepositories(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		sanctions,
	)

	first, err := svc.CreateLaunchSession(ctx, model.LaunchRequest{Mode: model.LaunchModeGuest}, model.PlayerIdentity{})
	require.NoError(t, err)
	sanctions.BlockBootstrap(first.LaunchToken)

	second, err := svc.CreateLaunchSession(ctx, model.LaunchRequest{Mode: model.LaunchModeGuest}, model.PlayerIdentity{})
	require.NoError(t, err)

	bootstrap, err := svc.ExchangeLaunchSession(ctx, model.SessionExchangeRequest{
		Handoff: second.LaunchToken,
		Mode:    model.LaunchModeGuest,
	})
	require.NoError(t, err)
	require.NotEmpty(t, bootstrap.WorldSocketURL)
}

func TestSessionService_UnresolvedGuestIdentityStillRejectsBlockedBootstrapAtExchange(t *testing.T) {
	ctx := context.Background()
	sanctions := repository.NewInMemorySanctionRepository()
	svc := NewSessionServiceWithRepositories(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		sanctions,
	)

	session, err := svc.CreateLaunchSession(ctx, model.LaunchRequest{Mode: model.LaunchModeGuest}, model.PlayerIdentity{})
	require.NoError(t, err)

	sanctions.BlockBootstrap(session.LaunchToken)

	_, err = svc.ExchangeLaunchSession(ctx, model.SessionExchangeRequest{
		Handoff: session.LaunchToken,
		Mode:    model.LaunchModeGuest,
	})
	require.ErrorIs(t, err, ErrSanctionedGuest)
}

func TestSessionService_PostgresUnresolvedIdentityDoesNotCreateDurableSharedBucket(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	sanctions := repository.NewPostgresSanctionRepository(db.Pool)
	svc := NewSessionServiceWithRepositories(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewPostgresProfileRepository(db.Pool),
		sanctions,
	)

	first, err := svc.CreateLaunchSession(ctx, model.LaunchRequest{Mode: model.LaunchModeGuest}, model.PlayerIdentity{})
	require.NoError(t, err)
	require.NoError(t, sanctions.BlockBootstrap(ctx, first.LaunchToken, "", "mute", time.Now().Add(30*time.Minute)))

	second, err := svc.CreateLaunchSession(ctx, model.LaunchRequest{Mode: model.LaunchModeGuest}, model.PlayerIdentity{})
	require.NoError(t, err)

	bootstrap, err := svc.ExchangeLaunchSession(ctx, model.SessionExchangeRequest{
		Handoff: second.LaunchToken,
		Mode:    model.LaunchModeGuest,
	})
	require.NoError(t, err)
	require.NotEmpty(t, bootstrap.WorldSocketURL)
}

func TestSessionService_PostgresTrustedGuestIdentityBlocksFreshBootstrap(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	sanctions := repository.NewPostgresSanctionRepository(db.Pool)
	svc := NewSessionServiceWithRepositories(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewPostgresProfileRepository(db.Pool),
		sanctions,
	)

	first, err := svc.CreateLaunchSession(ctx, model.LaunchRequest{Mode: model.LaunchModeGuest}, model.PlayerIdentity{})
	require.NoError(t, err)
	require.NoError(t, sanctions.BlockBootstrap(ctx, first.LaunchToken, hashGuestNetwork("203.0.113.101"), "mute", time.Now().Add(30*time.Minute)))

	second, err := svc.CreateLaunchSession(ctx, model.LaunchRequest{Mode: model.LaunchModeGuest}, model.PlayerIdentity{})
	require.NoError(t, err)

	_, err = svc.ExchangeLaunchSession(ctx, model.SessionExchangeRequest{
		Handoff:  second.LaunchToken,
		Mode:     model.LaunchModeGuest,
		RemoteIP: "203.0.113.101",
	})
	require.ErrorIs(t, err, ErrSanctionedGuest)
}

func TestSessionService_ExchangeLaunchSessionMatchesWorldMediaAcrossSeparateServiceRestarts(t *testing.T) {
	fixedAnchor := time.Unix(1_700_000_000, 0).UTC()
	fixedNow := fixedAnchor.Add(17*time.Minute + 9*time.Second)
	playlists := []omniraveworld.StagePlaylist{
		{
			ZoneID:    omniraveworld.ZoneMainStage,
			StartedAt: fixedAnchor,
			Entries: []omniraveworld.PlaylistEntry{
				{VideoID: "shared-main-stage", Duration: 30 * time.Minute},
			},
		},
		{
			ZoneID:    omniraveworld.ZoneUnderground,
			StartedAt: fixedAnchor,
			Entries: []omniraveworld.PlaylistEntry{
				{VideoID: "shared-techno-room", Duration: 30 * time.Minute},
			},
		},
		{
			ZoneID:    omniraveworld.ZonePlurrPartay,
			StartedAt: fixedAnchor,
			Entries: []omniraveworld.PlaylistEntry{
				{VideoID: "shared-neon-room", Duration: 30 * time.Minute},
			},
		},
	}

	apiMediaState := omniraveworld.NewMediaStateWithPlaylists(playlists, fixedAnchor.Add(2*time.Hour))
	worldMediaState := omniraveworld.NewMediaStateWithPlaylists(playlists, fixedAnchor.Add(6*time.Hour))
	svc := NewSessionServiceWithMediaState(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
		apiMediaState,
		nil,
	)
	svc.now = func() time.Time { return fixedNow }

	launch, err := svc.CreateLaunchSession(context.Background(), model.LaunchRequest{
		Mode: model.LaunchModeGuest,
	}, model.PlayerIdentity{})
	require.NoError(t, err)

	bootstrap, err := svc.ExchangeLaunchSession(context.Background(), model.SessionExchangeRequest{
		Handoff: launch.LaunchToken,
		Mode:    model.LaunchModeGuest,
	})
	require.NoError(t, err)

	worldSnapshots := worldMediaState.Snapshots(fixedNow)
	require.Len(t, bootstrap.ZoneMedia, len(worldSnapshots))
	for index, snapshot := range worldSnapshots {
		require.Equal(t, string(snapshot.ZoneID), bootstrap.ZoneMedia[index].ZoneID)
		require.Equal(t, snapshot.VideoID, bootstrap.ZoneMedia[index].VideoID)
		require.Equal(t, snapshot.Index, bootstrap.ZoneMedia[index].PlaylistIndex)
		require.Equal(t, int64(snapshot.Playhead/time.Second), bootstrap.ZoneMedia[index].PlayheadSeconds)
	}
}
