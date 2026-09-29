package service

import (
	"context"
	"fmt"
	"sync"
	"testing"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omnigame/repository"
	"github.com/stretchr/testify/require"
)

func checkConcurrentProfileWrites(t *testing.T, repo repository.ProfileRepository) {
	t.Helper()
	svc := NewProfileService(repo)
	ctx := context.Background()
	for round := 0; round < 8; round++ {
		look := map[string]string{"av": "1", "cv": "1", "cp": "female", "cw": "110111", "test_revision": fmt.Sprint(round)}
		settings := model.DefaultOmniRaveSettings()
		settings.UITheme = fmt.Sprintf("theme-%d", round)
		point := &model.SavedPoint{X: float64(round), Y: 2.285, Z: -45}
		start := make(chan struct{})
		errors := make(chan error, 4)
		var group sync.WaitGroup
		writes := []func() error{
			func() error { return svc.SaveLoadout(ctx, 42, look) },
			func() error { return svc.SaveSettings(ctx, 42, settings) },
			func() error { return svc.SaveReturnPoint(ctx, 42, point) },
			func() error { return svc.SaveLastVenue(ctx, 42, "underground") },
		}
		for _, write := range writes {
			group.Add(1)
			go func(write func() error) { defer group.Done(); <-start; errors <- write() }(write)
		}
		close(start)
		group.Wait()
		close(errors)
		for err := range errors {
			require.NoError(t, err)
		}
		profile, err := svc.GetProfile(ctx, 42)
		require.NoError(t, err)
		require.Equal(t, look, profile.Loadout)
		require.Equal(t, settings, profile.Settings)
		require.Equal(t, point, profile.ReturnPoint)
		require.Equal(t, "underground", profile.LastVenue)
		// Returned values and caller maps must not mutate the stored profile.
		look["cw"] = "000000"
		point.X = 999
		profile.Loadout["cw"] = "001111"
		again, err := svc.GetProfile(ctx, 42)
		require.NoError(t, err)
		require.Equal(t, "110111", again.Loadout["cw"])
		require.Equal(t, float64(round), again.ReturnPoint.X)
	}
	before, err := svc.GetProfile(ctx, 42)
	require.NoError(t, err)
	require.NoError(t, svc.SaveReturnPoint(ctx, 42, nil))
	after, err := svc.GetProfile(ctx, 42)
	require.NoError(t, err)
	require.Nil(t, after.ReturnPoint)
	require.Equal(t, before.Loadout, after.Loadout)
	require.Equal(t, before.Settings, after.Settings)
	require.Error(t, repo.UpdateProfileField(ctx, model.DefaultOmniRaveProfile(42), repository.ProfileField("unknown")))
}

func TestProfileService_ConcurrentMemoryUpdates(t *testing.T) {
	checkConcurrentProfileWrites(t, repository.NewInMemoryProfileRepository())
}

func TestProfileService_ConcurrentPostgresUpdates(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	checkConcurrentProfileWrites(t, repository.NewPostgresProfileRepository(db.Pool))
	// A new reader sees the stored look, not process-local service state.
	fresh, err := NewProfileService(repository.NewPostgresProfileRepository(db.Pool)).GetProfile(ctx, 42)
	require.NoError(t, err)
	require.Equal(t, "female", fresh.Loadout["cp"])
	require.Equal(t, "110111", fresh.Loadout["cw"])
}
