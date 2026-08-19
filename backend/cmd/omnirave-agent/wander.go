package main

import (
	"math"
	"math/rand"

	"github.com/omninudge/backend/internal/omniraveworld/world"
)

const (
	// moveInterval is how often a move frame is sent. The Babylon client sends
	// at 10Hz and the world drops anything past 20 events per second per
	// connection; 5Hz is an unhurried pace well inside that budget.
	moveIntervalHz = 5
	// stepMeters is how far one frame asks to travel. The world clamps a single
	// step at 2.25m, so this is far below the point where a request would be
	// truncated -- at 5Hz it works out to roughly 1.3 m/s, an amble.
	stepMeters = 0.26
	// arrivedMeters is how close counts as arrived, so the walker does not
	// oscillate around a target it can never land on exactly.
	arrivedMeters = 0.5
	// pauseFrames is how long the walker stands still on arrival before
	// choosing somewhere new. Continuous motion for hours reads as a machine;
	// standing still for a few seconds now and then does not.
	minPauseFrames = 5
	maxPauseFrames = 40
	// targetAttempts bounds the search for a walkable destination. The walkable
	// area is mostly rectangle, so this succeeds on the first or second try;
	// the bound only exists so a future layout change cannot spin here.
	targetAttempts = 32
)

// wanderer picks somewhere to be and walks there, slowly.
//
// It is not navigation and is not pretending to be: it steps straight towards
// a point it chose at random inside the world's own walkable area, and the
// world remains the authority on whether each step is allowed. Anything
// cleverer than this belongs with the cognition that this process deliberately
// does not have.
type wanderer struct {
	rng      *rand.Rand
	walkable func(world.Vec3) bool
	bounds   world.Bounds
	self     disposition
	// company reports where the world last said other people were standing. It
	// is a function rather than a slice so the walker reads the latest snapshot
	// at the moment it chooses, and so it can only ever see positions the world
	// confirmed.
	company func() []world.Vec3

	target    world.Vec3
	hasTarget bool
	pause     int
}

// mainStageWander is the area this character wanders. It is the Main Stage
// rectangle inset by a couple of metres so a chosen target is never exactly on
// the boundary the server checks against.
var mainStageWander = world.Bounds{MinX: -60, MaxX: 60, MinZ: -86, MaxZ: 20}

// newWanderer builds a walker with a disposition and a view of where everyone
// else is. A zero disposition and a nil company view give exactly the uniform
// amble this had before either existed.
func newWanderer(rng *rand.Rand, walkable func(world.Vec3) bool, self disposition, company func() []world.Vec3) *wanderer {
	return &wanderer{rng: rng, walkable: walkable, bounds: mainStageWander, self: self, company: company}
}

// nextStep returns where to ask the world to move to, given where the world
// says the character currently is. ok is false when the character is standing
// still this frame.
func (w *wanderer) nextStep(from world.Vec3) (world.Vec3, bool) {
	if w.pause > 0 {
		w.pause--
		return world.Vec3{}, false
	}

	if !w.hasTarget || distanceBetween(from, w.target) <= arrivedMeters {
		target, ok := w.chooseTarget()
		if !ok {
			return world.Vec3{}, false
		}
		w.target = target
		w.hasTarget = true
		pause := float64(minPauseFrames+w.rng.Intn(maxPauseFrames-minPauseFrames+1)) * w.self.pauseScale()
		w.pause = int(math.Round(pause))
		return world.Vec3{}, false
	}

	dx := w.target.X - from.X
	dz := w.target.Z - from.Z
	length := math.Hypot(dx, dz)
	if length == 0 {
		return world.Vec3{}, false
	}
	step := math.Min(stepMeters*w.self.stepScale(), length)
	next := world.Vec3{
		X: from.X + dx/length*step,
		Y: from.Y,
		Z: from.Z + dz/length*step,
	}
	if !w.walkable(next) {
		// The straight line left the walkable area, which means the target is
		// not reachable this way. Give it up rather than pressing against a
		// wall the server will keep refusing.
		w.hasTarget = false
		return world.Vec3{}, false
	}
	return next, true
}

func (w *wanderer) chooseTarget() (world.Vec3, bool) {
	// A warm character drifts towards where people already are. The draw is a
	// preference, not a pursuit: it picks a spot near somebody and walks there
	// the same way it walks anywhere, and if that spot is unwalkable it falls
	// straight back to picking at random.
	if w.rng.Float64() < w.self.approachChance() {
		if target, ok := w.nearSomebody(); ok {
			return target, true
		}
	}

	for attempt := 0; attempt < targetAttempts; attempt++ {
		candidate := world.Vec3{
			X: w.bounds.MinX + w.rng.Float64()*(w.bounds.MaxX-w.bounds.MinX),
			Z: w.bounds.MinZ + w.rng.Float64()*(w.bounds.MaxZ-w.bounds.MinZ),
		}
		if w.walkable(candidate) {
			return candidate, true
		}
	}
	return world.Vec3{}, false
}

// nearSomebody picks a point beside one of the people the world last reported.
// Everything it uses came out of a server snapshot, so there is no way for it
// to walk towards somebody who is not there.
func (w *wanderer) nearSomebody() (world.Vec3, bool) {
	if w.company == nil {
		return world.Vec3{}, false
	}
	others := w.company()
	if len(others) == 0 {
		return world.Vec3{}, false
	}

	for attempt := 0; attempt < targetAttempts; attempt++ {
		beside := others[w.rng.Intn(len(others))]
		candidate := world.Vec3{
			X: beside.X + (2*w.rng.Float64()-1)*approachSpread,
			Y: beside.Y,
			Z: beside.Z + (2*w.rng.Float64()-1)*approachSpread,
		}
		if w.walkable(candidate) {
			return candidate, true
		}
	}
	return world.Vec3{}, false
}
