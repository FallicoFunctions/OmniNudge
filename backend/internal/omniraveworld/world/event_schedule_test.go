package world

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestEventSchedule_MainStageLeadInAndActive(t *testing.T) {
	schedule := NewEventSchedule()

	leadIn := time.Date(2026, 6, 4, 14, 59, 52, 0, time.UTC)
	active := time.Date(2026, 6, 4, 15, 1, 0, 0, time.UTC)

	mainLead := schedule.StateFor(ZoneMainStage, leadIn)
	mainActive := schedule.StateFor(ZoneMainStage, active)

	require.Equal(t, EventPhaseLeadIn, mainLead.Phase)
	require.Equal(t, "fireworks", mainLead.EventName)
	require.Equal(t, int64(8), mainLead.CountdownSeconds)
	require.Equal(t, EventPhaseActive, mainActive.Phase)
	require.Equal(t, 2, mainActive.ActiveMinute)
}

func TestEventSchedule_UndergroundAndPlurrWindows(t *testing.T) {
	schedule := NewEventSchedule()

	underground := schedule.StateFor(ZoneUnderground, time.Date(2026, 6, 4, 15, 31, 0, 0, time.UTC))
	plurrLead := schedule.StateFor(ZonePlurrPartay, time.Date(2026, 6, 4, 15, 44, 50, 0, time.UTC))

	require.Equal(t, EventPhaseActive, underground.Phase)
	require.Equal(t, "collapse", underground.EventName)
	require.Equal(t, EventPhaseLeadIn, plurrLead.Phase)
	require.Equal(t, "unity_peak", plurrLead.EventName)
	require.Equal(t, int64(10), plurrLead.CountdownSeconds)
}

func TestEventSchedule_RecoveryAndNoneWindows(t *testing.T) {
	schedule := NewEventSchedule()

	mainRecovery := schedule.StateFor(ZoneMainStage, time.Date(2026, 6, 4, 15, 3, 2, 0, time.UTC))
	undergroundRecovery := schedule.StateFor(ZoneUnderground, time.Date(2026, 6, 4, 15, 33, 4, 0, time.UTC))
	plurrRecovery := schedule.StateFor(ZonePlurrPartay, time.Date(2026, 6, 4, 15, 48, 7, 0, time.UTC))
	mainNone := schedule.StateFor(ZoneMainStage, time.Date(2026, 6, 4, 15, 10, 0, 0, time.UTC))

	require.Equal(t, EventPhaseRecovery, mainRecovery.Phase)
	require.Equal(t, int64(3), mainRecovery.RecoverySeconds)
	require.Equal(t, EventPhaseRecovery, undergroundRecovery.Phase)
	require.Equal(t, int64(1), undergroundRecovery.RecoverySeconds)
	require.Equal(t, EventPhaseRecovery, plurrRecovery.Phase)
	require.Equal(t, int64(3), plurrRecovery.RecoverySeconds)
	require.Equal(t, EventPhaseNone, mainNone.Phase)
	require.Empty(t, mainNone.EventName)
}

func TestEventSchedule_SnapshotReturnsAllZones(t *testing.T) {
	schedule := NewEventSchedule()

	snapshot := schedule.Snapshot(time.Date(2026, 6, 4, 15, 44, 50, 0, time.UTC))

	require.Len(t, snapshot, 3)
	require.Equal(t, ZoneMainStage, snapshot[0].ZoneID)
	require.Equal(t, ZoneUnderground, snapshot[1].ZoneID)
	require.Equal(t, ZonePlurrPartay, snapshot[2].ZoneID)
	require.Equal(t, EventPhaseLeadIn, snapshot[2].Phase)
}
