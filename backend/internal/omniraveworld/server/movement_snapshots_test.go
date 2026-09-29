package server

import (
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMovementSnapshotsCoalesceConcurrentInputsAndStopWhenIdle(t *testing.T) {
	var scheduled []func()
	broadcasts := 0
	m := newMovementSnapshots(func() { broadcasts++ })
	m.schedule = func(callback func()) { scheduled = append(scheduled, callback) }
	var group sync.WaitGroup
	for i := 0; i < 100; i++ {
		group.Add(1)
		go func() { defer group.Done(); m.request() }()
	}
	group.Wait()
	require.Len(t, scheduled, 1)
	require.Zero(t, broadcasts)
	scheduled[0]()
	require.Equal(t, 1, broadcasts)
	require.Len(t, scheduled, 1, "an idle room must not keep scheduling work")
	m.request()
	require.Len(t, scheduled, 2)
	scheduled[1]()
	require.Equal(t, 2, broadcasts)
}

func TestMovementSnapshotsPublishLatestStateAndRetainInputsDuringBroadcast(t *testing.T) {
	var scheduled []func()
	var sent []int
	position := 0
	m := newMovementSnapshots(nil)
	m.schedule = func(callback func()) { scheduled = append(scheduled, callback) }
	m.broadcast = func() {
		sent = append(sent, position)
		if len(sent) == 1 {
			// Simulate concurrent movement while a socket write is in progress.
			for i := 10; i <= 20; i++ {
				position = i
				m.request()
			}
		}
	}
	for i := 1; i <= 9; i++ {
		position = i
		m.request()
	}
	require.Len(t, scheduled, 1)
	scheduled[0]()
	require.Equal(t, []int{9}, sent)
	require.Len(t, scheduled, 2)
	scheduled[1]()
	require.Equal(t, []int{9, 20}, sent)
	require.Len(t, scheduled, 2)
}
