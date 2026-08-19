package main

import (
	"fmt"
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
	// Coordinates and metres walked are telemetry about the process, not
	// anything a character would remember about an evening.
	if strings.Contains(summary, "x 42") || strings.Contains(summary, "metres") {
		t.Errorf("summary reads like instrumentation: %q", summary)
	}
}

// A visit with company names the company, and names only the people a
// snapshot actually showed.
func TestReportNamesWhoTheWorldShowedWasThere(t *testing.T) {
	start := time.Date(2026, 8, 14, 12, 0, 0, 0, time.UTC)
	itin := newItinerary("Dr. Harold Whitcomb", start)

	for i := 0; i < 60; i++ {
		itin.observe(start.Add(time.Duration(i)*time.Second), world.Vec3{X: float64(i % 7)}, world.ZoneMainStage)
		itin.observeOthers([]observedPlayer{
			{ID: "p-scarlett", Name: "Scarlett Voss", Position: world.Vec3{X: 4}},
			{ID: "p-nova", Name: "Nova", Position: world.Vec3{X: -4}},
		})
	}

	_, summary, ok := itin.report(start.Add(time.Minute))
	if !ok {
		t.Fatal("expected a reportable visit")
	}
	// Both were there for every snapshot, so the tie falls to the name, and it
	// falls the same way every time.
	if !strings.Contains(summary, "Nova and Scarlett Voss were there too.") {
		t.Errorf("summary does not name the company: %q", summary)
	}
	if strings.Contains(summary, "itself") {
		t.Errorf("summary claims solitude on an evening with company: %q", summary)
	}
	// Presence is the whole claim. Nothing here talked to anyone.
	for _, invented := range []string{"talked", "spoke", "with Scarlett", "together"} {
		if strings.Contains(summary, invented) {
			t.Errorf("summary claims an interaction that never happened (%q): %q", invented, summary)
		}
	}
}

// Being alone is a real memory. Inventing company to fill the sentence is not.
func TestReportSaysSoWhenTheCharacterWasAlone(t *testing.T) {
	start := time.Date(2026, 8, 14, 12, 0, 0, 0, time.UTC)
	itin := newItinerary("Nova", start)

	for i := 0; i < 60; i++ {
		itin.observe(start.Add(time.Duration(i)*time.Second), world.Vec3{X: float64(i % 7)}, world.ZoneMainStage)
		itin.observeOthers(nil)
	}

	_, summary, ok := itin.report(start.Add(time.Minute))
	if !ok {
		t.Fatal("expected a reportable visit")
	}
	if !strings.Contains(summary, "Had the place to itself.") {
		t.Errorf("summary does not say it was alone: %q", summary)
	}
	if strings.Contains(summary, "there too") {
		t.Errorf("summary names company on an empty evening: %q", summary)
	}
}

// A busy venue must not turn into a guest list, and which names survive the cap
// must not depend on map order.
func TestReportCapsTheNamesAndPicksThemDeterministically(t *testing.T) {
	start := time.Date(2026, 8, 14, 12, 0, 0, 0, time.UTC)

	summarise := func() string {
		itin := newItinerary("Nova", start)
		for i := 0; i < 60; i++ {
			itin.observe(start.Add(time.Duration(i)*time.Second), world.Vec3{}, world.ZoneMainStage)
			var others []observedPlayer
			for p := 0; p < 30; p++ {
				// The lower-numbered guests are there for more of the evening,
				// so most-seen is a real ordering rather than a tie.
				if i%(p+1) != 0 {
					continue
				}
				others = append(others, observedPlayer{
					ID:   fmt.Sprintf("p-%02d", p),
					Name: fmt.Sprintf("Guest %02d", p),
				})
			}
			itin.observeOthers(others)
		}
		_, summary, ok := itin.report(start.Add(time.Minute))
		if !ok {
			t.Fatal("expected a reportable visit")
		}
		return summary
	}

	summary := summarise()
	if !strings.Contains(summary, "Guest 00, Guest 01 and Guest 02 were there too, along with 27 others.") {
		t.Errorf("summary does not cap the names the way it should: %q", summary)
	}
	for run := 0; run < 20; run++ {
		if again := summarise(); again != summary {
			t.Fatalf("the same evening summarised two ways:\n%q\n%q", summary, again)
		}
	}
}

// The title is what the memory store links recurrences on, so the same kind of
// evening has to keep producing the same one however the company changed.
func TestTitleStaysStableAcrossVisitsSoRecurrenceLinks(t *testing.T) {
	start := time.Date(2026, 8, 14, 12, 0, 0, 0, time.UTC)

	alone := newItinerary("Nova", start)
	alone.observe(start, world.Vec3{}, world.ZoneMainStage)
	alone.observeOthers(nil)
	firstTitle, _, ok := alone.report(start.Add(4 * time.Minute))
	if !ok {
		t.Fatal("expected a reportable visit")
	}

	crowded := newItinerary("Nova", start)
	crowded.observe(start, world.Vec3{}, world.ZoneMainStage)
	crowded.observeOthers([]observedPlayer{{ID: "p-1", Name: "Scarlett Voss"}})
	secondTitle, _, ok := crowded.report(start.Add(11 * time.Minute))
	if !ok {
		t.Fatal("expected a reportable visit")
	}

	if firstTitle != secondTitle {
		t.Errorf("two evenings on the main stage titled differently: %q and %q", firstTitle, secondTitle)
	}
}

// Company reaches the report the same way position does: only out of a
// snapshot the world sent.
func TestReportedCompanyComesFromConfirmedSnapshotsOnly(t *testing.T) {
	start := time.Date(2026, 8, 14, 12, 0, 0, 0, time.UTC)
	itin := newItinerary("Nova", start)

	itin.observe(start, world.Vec3{X: 0, Z: 0}, world.ZoneMainStage)
	itin.observeOthers([]observedPlayer{{ID: "p-1", Name: "Scarlett Voss", Position: world.Vec3{X: 3, Z: 4}}})
	// A snapshot the world sent without her in it: she is still remembered as
	// having been there, and nobody new appears.
	itin.observe(start.Add(time.Minute), world.Vec3{X: 3, Z: 4}, world.ZoneMainStage)
	itin.observeOthers(nil)

	_, summary, ok := itin.report(start.Add(3 * time.Minute))
	if !ok {
		t.Fatal("expected a reportable visit")
	}
	if !strings.Contains(summary, "Scarlett Voss was there too.") {
		t.Errorf("summary = %q, want the one person the world confirmed", summary)
	}
	if company := itin.company(); len(company) != 0 {
		t.Errorf("the walker was told about %d people the latest snapshot did not report", len(company))
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
