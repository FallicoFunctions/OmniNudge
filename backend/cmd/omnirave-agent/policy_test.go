package main

import (
	"math"
	"math/rand"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/omniraveworld/world"
)

// goOutRate is how often a character actually leaves, over enough trials that
// the answer is about the policy rather than about the seed.
func goOutRate(t *testing.T, self disposition, seed int64) float64 {
	t.Helper()
	rng := rand.New(rand.NewSource(seed))
	const trials = 20000
	went := 0
	for i := 0; i < trials; i++ {
		if self.goesOut(rng) {
			went++
		}
	}
	return float64(went) / trials
}

// The claim the whole slice exists to make: what happens to a character in a
// world changes what it does next.
func TestALowMoodCharacterGoesOutLessOftenThanAHighMoodOne(t *testing.T) {
	flat := goOutRate(t, disposition{Mood: -0.9, Warmth: -0.5}, 20260818)
	bright := goOutRate(t, disposition{Mood: 0.9, Warmth: 0.5}, 20260818)

	if flat >= bright {
		t.Fatalf("a flat character went out %.3f of the time and a bright one %.3f; the policy is doing nothing", flat, bright)
	}
	if bright < 0.99 {
		t.Errorf("a character in good spirits should go out essentially every time, got %.3f", bright)
	}
	// It goes less, and it does not stop. A character that never left could
	// never collect the evening that would lift it back out again.
	if flat < 0.4 || flat > 0.8 {
		t.Errorf("a flat character should go out sometimes and not usually, got %.3f", flat)
	}
}

// A character nothing has happened to must be recognisably the agent that
// existed before there was a policy at all: it goes out, it takes the same
// stride, it pauses for the same length of time.
func TestANeutralCharacterBehavesLikeTheAgentAlwaysDid(t *testing.T) {
	neutral := disposition{}

	if rate := goOutRate(t, neutral, 7); rate < 0.93 {
		t.Errorf("a neutral character stayed in too often: went out %.3f of the time", rate)
	}
	if scale := neutral.stepScale(); scale != 1 {
		t.Errorf("stepScale = %v, want the unchanged stride", scale)
	}
	if scale := neutral.pauseScale(); scale != 1 {
		t.Errorf("pauseScale = %v, want the unchanged pause", scale)
	}
	if chance := neutral.approachChance(); chance != 0 {
		t.Errorf("approachChance = %v, want the uniform wander it always had", chance)
	}

	// And it walks the same way: with a nil company view and a zero
	// disposition the walker is the old one, so an identical seed gives an
	// identical path.
	walkable := world.DefaultConfig().Walkable.IsValid
	before := newWanderer(rand.New(rand.NewSource(3)), walkable, neutral, nil)
	after := newWanderer(rand.New(rand.NewSource(3)), walkable, neutral, func() []world.Vec3 { return nil })
	position := world.Vec3{X: 0, Z: -48}
	other := position
	for i := 0; i < 2000; i++ {
		next, ok := before.nextStep(position)
		alsoNext, alsoOK := after.nextStep(other)
		if ok != alsoOK || next != alsoNext {
			t.Fatalf("step %d diverged: %+v/%v vs %+v/%v", i, next, ok, alsoNext, alsoOK)
		}
		if ok {
			position, other = next, alsoNext
		}
	}

	// The budget is the base with nothing but jitter on it.
	rng := rand.New(rand.NewSource(11))
	for i := 0; i < 500; i++ {
		budget := neutral.visitBudget(rng)
		low := time.Duration(float64(visitBase) * (1 - visitJitter))
		high := time.Duration(float64(visitBase) * (1 + visitJitter))
		if budget < low || budget > high {
			t.Fatalf("neutral budget %s is outside the unweighted band %s..%s", budget, low, high)
		}
	}
}

// A low character moves less and stands still longer; a bright one does the
// reverse. Both stay inside what the world will accept, which the walkable and
// step-limit test already pins down.
func TestMoodColoursHowTheCharacterMoves(t *testing.T) {
	flat := disposition{Mood: -0.9}
	bright := disposition{Mood: 0.9}

	if flat.stepScale() >= 1 || bright.stepScale() <= 1 {
		t.Errorf("stride does not follow mood: flat %v, bright %v", flat.stepScale(), bright.stepScale())
	}
	if flat.pauseScale() <= 1 || bright.pauseScale() >= 1 {
		t.Errorf("lingering does not follow mood: flat %v, bright %v", flat.pauseScale(), bright.pauseScale())
	}
}

// Warmth is a pull towards where people already are, and the pull is only ever
// towards positions the world confirmed.
func TestAWarmCharacterDriftsTowardsPeople(t *testing.T) {
	walkable := world.DefaultConfig().Walkable.IsValid
	crowd := world.Vec3{X: 10, Z: -40}
	company := func() []world.Vec3 { return []world.Vec3{crowd} }

	meanDistance := func(self disposition) float64 {
		walker := newWanderer(rand.New(rand.NewSource(99)), walkable, self, company)
		total, samples := 0.0, 0
		for i := 0; i < 4000; i++ {
			target, ok := walker.chooseTarget()
			if !ok {
				continue
			}
			total += distanceBetween(crowd, target)
			samples++
		}
		if samples == 0 {
			t.Fatal("the walker never chose anywhere at all")
		}
		return total / float64(samples)
	}

	warm := meanDistance(disposition{Warmth: 0.9})
	indifferent := meanDistance(disposition{})
	if warm >= indifferent {
		t.Fatalf("a warm character chose targets %.1fm from the crowd and an indifferent one %.1fm", warm, indifferent)
	}

	// With nobody there, warmth changes nothing: there is no one to drift
	// towards and nothing is invented to stand in for them.
	empty := newWanderer(rand.New(rand.NewSource(5)), walkable, disposition{Warmth: 1}, func() []world.Vec3 { return nil })
	alone := newWanderer(rand.New(rand.NewSource(5)), walkable, disposition{Warmth: 1}, nil)
	for i := 0; i < 500; i++ {
		a, aok := empty.chooseTarget()
		b, bok := alone.chooseTarget()
		if aok != bok || a != b {
			t.Fatalf("an empty room and no room at all should walk the same: %+v vs %+v", a, b)
		}
	}
}

// What a visit felt like comes from the only two things this agent honestly
// knows: whether anybody else was there, and how much this character minds.
func TestCompanyAndSolitudeAreTheOnlyThingsFelt(t *testing.T) {
	const snapshots = 600

	together := companyFelt(0.6, snapshots, snapshots)
	if together == nil || *together <= 0 {
		t.Fatalf("a warm character with company all evening should feel mildly good, got %v", together)
	}
	alone := companyFelt(0.6, snapshots, 0)
	if alone == nil || *alone >= 0 {
		t.Fatalf("a warm character alone all evening should feel mildly bad, got %v", alone)
	}

	// Mild means mild. Anything at or past the lasting threshold would change
	// who the character is, and an ordinary evening does not do that.
	for _, felt := range []*float64{together, alone} {
		if math.Abs(*felt) > 0.3 {
			t.Errorf("an ordinary evening reported %v, which is not an ordinary feeling", *felt)
		}
	}

	// A character that does not care either way says nothing.
	if felt := companyFelt(-0.8, snapshots, 0); felt != nil {
		t.Errorf("a cold character alone reported %v; it does not mind", *felt)
	}

	// Half an evening with people and half without is an ordinary night, and
	// an ordinary night is nil.
	if felt := companyFelt(0.6, snapshots, snapshots/2); felt != nil {
		t.Errorf("a mixed evening reported %v; there is nothing to say about it", *felt)
	}

	// Too little of the visit was observed to judge it.
	if felt := companyFelt(0.6, minValenceSnapshots-1, 0); felt != nil {
		t.Errorf("a barely-observed visit reported %v", *felt)
	}
}

// The valence is built from snapshots and nothing else, on the same terms the
// reported distance is: what the world did not confirm cannot reach it.
func TestFeelingComesFromConfirmedSnapshotsOnly(t *testing.T) {
	start := time.Date(2026, 8, 14, 12, 0, 0, 0, time.UTC)
	itin := newItinerary("Nova", start)

	if felt := itin.felt(0.9); felt != nil {
		t.Errorf("a visit nothing was observed of reported %v", *felt)
	}

	for i := 0; i < 400; i++ {
		itin.observe(start.Add(time.Duration(i)*time.Second), world.Vec3{X: float64(i % 10)}, world.ZoneMainStage)
		itin.observeOthers(nil)
	}
	felt := itin.felt(0.9)
	if felt == nil || *felt >= 0 {
		t.Fatalf("an evening the world showed nobody else in should read as solitude, got %v", felt)
	}

	if company := itin.company(); len(company) != 0 {
		t.Errorf("the walker was told about %d people the world never reported", len(company))
	}
}

// A session ending is a question now, not an automatic re-admission. Over a
// run of outings, some of them end.
func TestOutingsEndAndSometimesWithoutAnImmediateReadmit(t *testing.T) {
	// A world token lasts five minutes, so this is one session's worth.
	const session = 5 * time.Minute

	sessionsPerOuting := func(self disposition, seed int64) float64 {
		rng := rand.New(rand.NewSource(seed))
		const outings = 2000
		total := 0
		for i := 0; i < outings; i++ {
			budget := self.visitBudget(rng)
			elapsed := time.Duration(0)
			for self.stillOut(elapsed, budget) {
				elapsed += session
				total++
				if total > outings*1000 {
					t.Fatal("an outing never ended")
				}
			}
		}
		return float64(total) / outings
	}

	flat := sessionsPerOuting(disposition{Mood: -0.9, Warmth: -0.9}, 4)
	neutral := sessionsPerOuting(disposition{}, 4)

	if neutral <= 1 {
		t.Errorf("a neutral character should still re-admit several times per outing, got %.2f sessions", neutral)
	}
	if flat >= neutral {
		t.Errorf("a flat character stayed out for %.2f sessions and a neutral one %.2f", flat, neutral)
	}
	// Every outing ends, which is the whole change: the old agent's answer to
	// "again?" was yes, forever.
	if flat > 5 {
		t.Errorf("a flat character stayed out for %.2f sessions, which is not going home early", flat)
	}
}

// None of the above is allowed to be an anecdote.
func TestTheSeedMakesTheCharacterReproducible(t *testing.T) {
	self := disposition{Mood: -0.4, Warmth: 0.7}

	decisions := func(seed int64) []string {
		rng := rand.New(rand.NewSource(seed))
		out := make([]string, 0, 300)
		for i := 0; i < 100; i++ {
			if !self.goesOut(rng) {
				out = append(out, "in "+self.timeAtHome(rng).String())
				continue
			}
			out = append(out, "out "+self.visitBudget(rng).String(), "home "+self.timeAtHome(rng).String())
		}
		return out
	}

	first, second, other := decisions(12345), decisions(12345), decisions(54321)
	if len(first) != len(second) {
		t.Fatalf("the same seed produced %d decisions and then %d", len(first), len(second))
	}
	for i := range first {
		if first[i] != second[i] {
			t.Fatalf("decision %d differed between identical seeds: %q vs %q", i, first[i], second[i])
		}
	}
	same := 0
	for i := range other {
		if i < len(first) && first[i] == other[i] {
			same++
		}
	}
	if same == len(other) {
		t.Fatal("a different seed produced an identical life, so the seed is not being used")
	}
}
