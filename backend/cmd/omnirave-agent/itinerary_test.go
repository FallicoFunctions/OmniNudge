package main

import (
	"math/rand"
	"strings"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/omniraveworld/world"
)

func TestReportDescribesWhereTheTimeActuallyWent(t *testing.T) {
	start := time.Date(2026, 8, 14, 12, 0, 0, 0, time.UTC)
	itin := newItinerary("Nova", start)

	itin.observe(start, world.Vec3{X: 0, Z: -48}, world.ZoneMainStage)
	itin.observe(start.Add(2*time.Minute), world.Vec3{X: 0, Z: -38}, world.ZoneMainStage)
	itin.observe(start.Add(3*time.Minute), world.Vec3{X: 42, Z: 36}, world.ZoneUnderground)

	title, summary, ok := itin.report(start.Add(4 * time.Minute))
	if !ok {
		t.Fatal("a four minute visit should be worth remembering")
	}
	if !strings.Contains(title, "the main stage") {
		t.Errorf("title = %q, want the zone it spent longest in", title)
	}
	if !strings.Contains(summary, "Nova was in OmniRave for 4m0s.") {
		t.Errorf("summary does not state the visit length: %q", summary)
	}
	// Three minutes on the main stage, one in the Underground: both are stated,
	// in that order, and neither is rounded away.
	if !strings.Contains(summary, "the main stage for 3m0s") {
		t.Errorf("summary does not credit the main stage correctly: %q", summary)
	}
	if !strings.Contains(summary, "the Underground for 1m0s") {
		t.Errorf("summary does not credit the Underground correctly: %q", summary)
	}
	if !strings.Contains(summary, "x 42, z 36") {
		t.Errorf("summary does not say where it ended up: %q", summary)
	}
}

// The distance reported is the distance the world confirmed, which is what
// makes the report honest: it is built from snapshots, and a step the server
// refused simply never appears in one.
func TestReportedDistanceComesFromConfirmedPositions(t *testing.T) {
	start := time.Date(2026, 8, 14, 12, 0, 0, 0, time.UTC)
	itin := newItinerary("Nova", start)

	itin.observe(start, world.Vec3{X: 0, Z: 0}, world.ZoneMainStage)
	itin.observe(start.Add(time.Minute), world.Vec3{X: 3, Z: 4}, world.ZoneMainStage)
	// A refused step: the world keeps reporting the same position, so no
	// distance is credited for it.
	itin.observe(start.Add(2*time.Minute), world.Vec3{X: 3, Z: 4}, world.ZoneMainStage)

	_, summary, ok := itin.report(start.Add(3 * time.Minute))
	if !ok {
		t.Fatal("expected a reportable visit")
	}
	if !strings.Contains(summary, "about 5 metres") {
		t.Errorf("summary = %q, want the 5 metres the world confirmed", summary)
	}
}

func TestShortVisitsAreNotRemembered(t *testing.T) {
	start := time.Date(2026, 8, 14, 12, 0, 0, 0, time.UTC)
	itin := newItinerary("Nova", start)
	itin.observe(start, world.Vec3{X: 0, Z: -48}, world.ZoneMainStage)

	if _, _, ok := itin.report(start.Add(5 * time.Second)); ok {
		t.Error("a five second connection should not become a memory")
	}
}

func TestAVisitNoSnapshotEverConfirmedIsNotRemembered(t *testing.T) {
	start := time.Date(2026, 8, 14, 12, 0, 0, 0, time.UTC)
	itin := newItinerary("Nova", start)

	if _, _, ok := itin.report(start.Add(10 * time.Minute)); ok {
		t.Error("nothing was observed, so there is nothing to remember")
	}
}

// The wanderer must never ask for a step the world would refuse, and never one
// large enough to be clamped. A character in high spirits takes the longest
// stride the policy allows, so it is the one this is checked against.
func TestWanderStaysWalkableAndWithinTheWorldsStepLimit(t *testing.T) {
	walkable := world.DefaultConfig().Walkable.IsValid
	walker := newWanderer(rand.New(rand.NewSource(1)), walkable, disposition{Mood: 1, Warmth: 1}, nil)

	position := world.Vec3{X: 0, Z: -48}
	moved := 0
	for i := 0; i < 5000; i++ {
		next, ok := walker.nextStep(position)
		if !ok {
			continue
		}
		if !walkable(next) {
			t.Fatalf("step %d asked to move outside the walkable area: %+v", i, next)
		}
		if step := distanceBetween(position, next); step > 2.25 {
			t.Fatalf("step %d of %.2fm would be clamped by the world", i, step)
		}
		position = next
		moved++
	}
	if moved == 0 {
		t.Fatal("the character never moved at all")
	}
}
