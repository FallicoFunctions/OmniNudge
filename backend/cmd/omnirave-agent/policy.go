package main

import (
	"math"
	"math/rand"
	"time"
)

// disposition is who the character is at this moment, as the API reports it:
// its own tier alone, with the mood already decayed to now.
//
// The zero value is a character nothing has happened to, and that is what makes
// everything below a colouring rather than a rewrite -- every weight is applied
// to a trait, so a neutral character lands on the base constant exactly and
// behaves as this agent did before it read anything about itself.
//
// Trust is carried and deliberately unread. It is what a character is like
// about being hurt again, and nothing in a wander has anything to do with that;
// reading it here would be finding a use for a number rather than a reason.
type disposition struct {
	Mood   float64 `json:"mood"`
	Trust  float64 `json:"trust"`
	Warmth float64 `json:"warmth"`
}

const (
	// goOutBaseChance is what a character with nothing on its mind does. It is
	// deliberately not 1: something that has never once stayed in is a process
	// rather than a person. Nineteen evenings in twenty is near enough the old
	// always-go behaviour that a neutral character is recognisably the same
	// agent, and it leaves room above for good spirits to go every time.
	goOutBaseChance   = 0.95
	goOutMoodWeight   = 0.35
	goOutWarmthWeight = 0.15
	// Even at the bottom of both scales it still goes out sometimes. A
	// character that stopped leaving entirely could never collect the evening
	// that would lift it back out again, and low mood would become permanent
	// through nothing but arithmetic.
	goOutFloor = 0.35

	// How long the character is not in the world for. One notion rather than
	// two, because whether it stayed in or came home early, the same thing is
	// happening: it is somewhere else. Good spirits shorten it; low mood
	// lengthens it.
	homeBase       = 4 * time.Minute
	homeSpread     = 4 * time.Minute
	homeMoodWeight = 2 * time.Minute
	homeFloor      = 30 * time.Second

	// How long an outing is meant to last. The agent used to stay forever,
	// re-admitting until it was killed; the base is what the middle of every
	// scale now means instead.
	visitBase         = 45 * time.Minute
	visitMoodWeight   = 20 * time.Minute
	visitWarmthWeight = 10 * time.Minute
	visitJitter       = 0.25
	visitFloor        = 5 * time.Minute
)

// goesOut decides whether the character leaves at all this time.
func (d disposition) goesOut(rng *rand.Rand) bool {
	return rng.Float64() < d.goOutChance()
}

func (d disposition) goOutChance() float64 {
	chance := goOutBaseChance + goOutMoodWeight*d.Mood + goOutWarmthWeight*d.Warmth
	return math.Max(goOutFloor, math.Min(1, chance))
}

// timeAtHome is how long before the question is asked again.
func (d disposition) timeAtHome(rng *rand.Rand) time.Duration {
	home := float64(homeBase) - d.Mood*float64(homeMoodWeight) + rng.Float64()*float64(homeSpread)
	return time.Duration(math.Max(float64(homeFloor), home))
}

// visitBudget is how long the character means to be out for.
//
// It is spent across sessions rather than within one: a world token lasts five
// minutes and the world ends the session when it expires, so an outing is
// several sessions and the budget is what decides whether the next one happens.
// That is the whole difference from before, where the answer was always yes.
func (d disposition) visitBudget(rng *rand.Rand) time.Duration {
	budget := float64(visitBase) + d.Mood*float64(visitMoodWeight) + d.Warmth*float64(visitWarmthWeight)
	budget *= 1 + visitJitter*(2*rng.Float64()-1)
	return time.Duration(math.Max(float64(visitFloor), budget))
}

const (
	// moveMoodWeight thins or thickens the stride. Someone flat does not walk
	// briskly, and this is the cheapest true thing to do about it.
	moveMoodWeight = 0.3
	// pauseMoodWeight lengthens the standing-still. Lingering is what low mood
	// looks like from the outside.
	pauseMoodWeight = 0.5
	// approachWarmthWeight is how often a warm character picks somewhere near
	// somebody rather than somewhere at random. It is only ever a preference
	// about where to walk; nothing here talks to anyone, and pretending
	// otherwise is what the cognition this process does not have would be for.
	approachWarmthWeight = 0.6
	// approachSpread is how near "near somebody" is, in metres. Close enough to
	// be in the same part of the room, not so close as to stand on them.
	approachSpread = 6.0
)

// stillOut says whether the character means to be admitted again, given how
// long this outing has already run. It is the one decision that used to have
// no policy at all: the answer was yes, always, until the process was killed.
func (d disposition) stillOut(elapsed, budget time.Duration) bool {
	return elapsed < budget
}

// stepScale and pauseScale are the disposition's colouring of the wander, both
// exactly 1 for a character nothing has happened to.
func (d disposition) stepScale() float64 {
	return math.Max(0.4, 1+moveMoodWeight*d.Mood)
}

func (d disposition) pauseScale() float64 {
	return math.Max(0.4, 1-pauseMoodWeight*d.Mood)
}

// approachChance is how readily the character drifts towards other people.
// Warmth below neutral is not aversion, it is indifference: it picks at random
// like it always did.
func (d disposition) approachChance() float64 {
	return math.Max(0, approachWarmthWeight*d.Warmth)
}

const (
	// A visit says nothing about how it felt unless there was enough of it to
	// judge. The world broadcasts a snapshot a second, so this is half a minute
	// of actually being there.
	minValenceSnapshots = 30
	// An evening counts as company or as solitude only when it was decisively
	// one of them. Everything in between is an ordinary night out, and an
	// ordinary night out is nil -- which is most of them.
	companyRatioTogether = 0.75
	companyRatioAlone    = 0.05
	// The size of an ordinary feeling. It is far below the threshold at which a
	// trait becomes lasting, and that is the point: an evening colours a
	// character's day. It takes much more than an evening to change who it is.
	companyValence = 0.25
	// Below this the character genuinely does not mind either way, and saying
	// that it did would be inventing the feeling rather than reporting one.
	minCompanyCare = 0.2
)

// companyFelt turns an evening's company into a valence, or into nothing.
//
// Company and solitude are the only two things this agent honestly knows about
// how a visit went. It does not talk to anyone, is not talked to, and wins
// nothing; the snapshots say who else was there and that is the entire list of
// what actually happened. Anything richer would be drama invented to fill a
// field.
func companyFelt(warmth float64, snapshots, withCompany int) *float64 {
	if snapshots < minValenceSnapshots {
		return nil
	}
	care := math.Max(0, math.Min(1, 0.5+0.5*warmth))
	if care < minCompanyCare {
		return nil
	}

	ratio := float64(withCompany) / float64(snapshots)
	switch {
	case ratio >= companyRatioTogether:
		felt := companyValence * care
		return &felt
	case ratio <= companyRatioAlone:
		felt := -companyValence * care
		return &felt
	default:
		return nil
	}
}
