package world

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestEventSchedule_MainStageLeadInAndActive(t *testing.T) {
	schedule := NewEventSchedule()

	beforeLeadIn := time.Date(2026, 6, 4, 14, 59, 49, 0, time.UTC)
	leadInStart := time.Date(2026, 6, 4, 14, 59, 50, 0, time.UTC)
	leadIn := time.Date(2026, 6, 4, 14, 59, 52, 0, time.UTC)
	activeStart := time.Date(2026, 6, 4, 15, 0, 0, 0, time.UTC)
	active := time.Date(2026, 6, 4, 15, 1, 0, 0, time.UTC)
	activeEnd := time.Date(2026, 6, 4, 15, 3, 0, 0, time.UTC)
	recoveryEnd := time.Date(2026, 6, 4, 15, 3, 5, 0, time.UTC)

	mainBeforeLead := schedule.StateFor(ZoneMainStage, beforeLeadIn)
	mainLeadStart := schedule.StateFor(ZoneMainStage, leadInStart)
	mainLead := schedule.StateFor(ZoneMainStage, leadIn)
	mainActiveStart := schedule.StateFor(ZoneMainStage, activeStart)
	mainActive := schedule.StateFor(ZoneMainStage, active)
	mainRecoveryStart := schedule.StateFor(ZoneMainStage, activeEnd)
	mainRecoveryEnd := schedule.StateFor(ZoneMainStage, recoveryEnd)

	require.Equal(t, EventPhaseNone, mainBeforeLead.Phase)
	require.Equal(t, EventPhaseLeadIn, mainLeadStart.Phase)
	require.Equal(t, int64(10), mainLeadStart.CountdownSeconds)

	require.Equal(t, EventPhaseLeadIn, mainLead.Phase)
	require.Equal(t, "fireworks", mainLead.EventName)
	require.Equal(t, int64(8), mainLead.CountdownSeconds)
	require.Equal(t, EventPhaseActive, mainActiveStart.Phase)
	require.Equal(t, 1, mainActiveStart.ActiveMinute)
	require.Equal(t, EventPhaseActive, mainActive.Phase)
	require.Equal(t, 2, mainActive.ActiveMinute)
	require.Equal(t, EventPhaseRecovery, mainRecoveryStart.Phase)
	require.Equal(t, int64(5), mainRecoveryStart.RecoverySeconds)
	require.Equal(t, EventPhaseNone, mainRecoveryEnd.Phase)
}

func TestEventSchedule_UndergroundAndPlurrWindows(t *testing.T) {
	schedule := NewEventSchedule()

	undergroundBefore := schedule.StateFor(ZoneUnderground, time.Date(2026, 6, 4, 15, 29, 59, 0, time.UTC))
	undergroundStart := schedule.StateFor(ZoneUnderground, time.Date(2026, 6, 4, 15, 30, 0, 0, time.UTC))
	underground := schedule.StateFor(ZoneUnderground, time.Date(2026, 6, 4, 15, 31, 0, 0, time.UTC))
	undergroundRecovery := schedule.StateFor(ZoneUnderground, time.Date(2026, 6, 4, 15, 33, 0, 0, time.UTC))
	undergroundDone := schedule.StateFor(ZoneUnderground, time.Date(2026, 6, 4, 15, 33, 5, 0, time.UTC))
	plurrBeforeLead := schedule.StateFor(ZonePlurrPartay, time.Date(2026, 6, 4, 15, 44, 44, 0, time.UTC))
	plurrLead := schedule.StateFor(ZonePlurrPartay, time.Date(2026, 6, 4, 15, 44, 50, 0, time.UTC))
	plurrStart := schedule.StateFor(ZonePlurrPartay, time.Date(2026, 6, 4, 15, 45, 0, 0, time.UTC))
	plurrRecovery := schedule.StateFor(ZonePlurrPartay, time.Date(2026, 6, 4, 15, 48, 0, 0, time.UTC))

	require.Equal(t, EventPhaseNone, undergroundBefore.Phase)
	require.Equal(t, EventPhaseActive, undergroundStart.Phase)
	require.Equal(t, 1, undergroundStart.ActiveMinute)
	require.Equal(t, EventPhaseActive, underground.Phase)
	require.Equal(t, "collapse", underground.EventName)
	require.Equal(t, EventPhaseRecovery, undergroundRecovery.Phase)
	require.Equal(t, int64(5), undergroundRecovery.RecoverySeconds)
	require.Equal(t, EventPhaseNone, undergroundDone.Phase)
	require.Equal(t, EventPhaseNone, plurrBeforeLead.Phase)
	require.Equal(t, EventPhaseLeadIn, plurrLead.Phase)
	require.Equal(t, "unity_peak", plurrLead.EventName)
	require.Equal(t, int64(10), plurrLead.CountdownSeconds)
	require.Equal(t, EventPhaseActive, plurrStart.Phase)
	require.Equal(t, 1, plurrStart.ActiveMinute)
	require.Equal(t, EventPhaseRecovery, plurrRecovery.Phase)
	require.Equal(t, int64(10), plurrRecovery.RecoverySeconds)
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
