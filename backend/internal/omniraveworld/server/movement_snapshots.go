package server

import (
	"sync"
	"time"
)

// Movement inputs are applied immediately. Publish their latest combined state
// at most 30 times per second instead of sending a whole room per input.
const movementSnapshotInterval = time.Second / 30

type movementSnapshots struct {
	mu        sync.Mutex
	queued    bool
	dirty     bool
	schedule  func(func())
	broadcast func()
}

func newMovementSnapshots(broadcast func()) *movementSnapshots {
	return &movementSnapshots{
		broadcast: broadcast,
		schedule: func(flush func()) {
			time.AfterFunc(movementSnapshotInterval, flush)
		},
	}
}

func (m *movementSnapshots) request() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.dirty = true
	if m.queued {
		return
	}
	m.queued = true
	m.schedule(m.flush)
}

func (m *movementSnapshots) flush() {
	m.mu.Lock()
	m.dirty = false
	m.mu.Unlock()
	m.broadcast()
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.dirty {
		// Inputs received while sending still need a trailing publication.
		// Only this timer owns a movement broadcast, even for slow clients.
		m.schedule(m.flush)
	} else {
		m.queued = false
	}
}
