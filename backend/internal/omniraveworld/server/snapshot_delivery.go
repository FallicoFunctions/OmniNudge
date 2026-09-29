package server

import "sync"

// One writer per connection retains at most one newer snapshot request.
// A blocked socket cannot stall movement publication to healthy connections.
type snapshotDelivery struct {
	mu      sync.Mutex
	pending func()
	running bool
	closed  bool
}

func (d *snapshotDelivery) enqueue(send func()) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.closed {
		return
	}
	d.pending = send
	if d.running {
		return
	}
	d.running = true
	go d.drain()
}

func (d *snapshotDelivery) drain() {
	for {
		d.mu.Lock()
		send := d.pending
		d.pending = nil
		if send == nil {
			d.running = false
			d.mu.Unlock()
			return
		}
		d.mu.Unlock()
		send()
	}
}

func (d *snapshotDelivery) close() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.closed = true
	d.pending = nil
}
