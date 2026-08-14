package main

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/omninudge/backend/internal/omniraveworld/world"
)

// minReportableSession is how long a visit has to last before it is worth
// filing as a memory. A connection that dropped after two seconds is not
// something the character did; it is something that happened to the network,
// and recording it would fill a character's own history with noise it would
// then carry into every conversation about itself.
const minReportableSession = 30 * time.Second

// itinerary is the record of one visit, built only from what the world said
// happened.
//
// It is fed from the snapshots the server broadcasts, never from the positions
// this process asked for. The server clamps movement and rejects steps outside
// the walkable area, so the two disagree whenever a request was refused --
// and the report has to describe where the character actually was. This is the
// whole reason the reporting is honest rather than merely well-intentioned:
// there is no path by which an invented movement could reach it.
type itinerary struct {
	mu sync.Mutex

	playerName string
	startedAt  time.Time

	seen       bool
	firstZone  world.ZoneID
	lastZone   world.ZoneID
	lastSeenAt time.Time
	position   world.Vec3
	distance   float64
	zoneTime   map[world.ZoneID]time.Duration
}

func newItinerary(playerName string, startedAt time.Time) *itinerary {
	return &itinerary{
		playerName: playerName,
		startedAt:  startedAt,
		zoneTime:   make(map[world.ZoneID]time.Duration),
	}
}

// observe records one server snapshot of this character.
func (i *itinerary) observe(at time.Time, position world.Vec3, zone world.ZoneID) {
	i.mu.Lock()
	defer i.mu.Unlock()

	if !i.seen {
		i.seen = true
		i.firstZone = zone
		i.lastZone = zone
		i.lastSeenAt = at
		i.position = position
		return
	}

	i.distance += distanceBetween(i.position, position)
	// Time is credited to the zone the character was in for that interval, not
	// the one it has just arrived in.
	if elapsed := at.Sub(i.lastSeenAt); elapsed > 0 {
		i.zoneTime[i.lastZone] += elapsed
	}
	i.position = position
	i.lastZone = zone
	i.lastSeenAt = at
}

// current returns the last position the world confirmed, and whether the
// character has been seen at all yet. Movement is steered from this rather
// than from a position this process keeps for itself, so a step the server
// refused does not leave the two drifting apart forever.
func (i *itinerary) current() (world.Vec3, bool) {
	i.mu.Lock()
	defer i.mu.Unlock()
	return i.position, i.seen
}

// report describes the visit as the character's own memory of it, and says
// whether it is worth recording at all.
func (i *itinerary) report(endedAt time.Time) (title string, summary string, ok bool) {
	i.mu.Lock()
	defer i.mu.Unlock()

	if !i.seen {
		return "", "", false
	}
	visit := endedAt.Sub(i.startedAt)
	if visit < minReportableSession {
		return "", "", false
	}

	// Close the open zone interval so the durations add up to the visit.
	zoneTime := make(map[world.ZoneID]time.Duration, len(i.zoneTime))
	for zone, spent := range i.zoneTime {
		zoneTime[zone] = spent
	}
	if trailing := endedAt.Sub(i.lastSeenAt); trailing > 0 {
		zoneTime[i.lastZone] += trailing
	}

	longest := longestZone(zoneTime)
	title = fmt.Sprintf("Spent %s in OmniRave", roundedDuration(visit))
	if longest != "" {
		title = fmt.Sprintf("Wandered %s in OmniRave", zoneLabel(longest))
	}

	var sentences []string
	sentences = append(sentences, fmt.Sprintf(
		"%s was in OmniRave for %s.", i.playerName, roundedDuration(visit)))
	if where := zoneBreakdown(zoneTime); where != "" {
		sentences = append(sentences, where)
	}
	sentences = append(sentences, fmt.Sprintf(
		"Walked about %.0f metres in that time, and was standing at x %.0f, z %.0f when the visit ended.",
		i.distance, i.position.X, i.position.Z))

	return title, strings.Join(sentences, " "), true
}

// zoneBreakdown says where the time went, in order, and nothing else. It is
// deliberately dull: the character did not do anything in the world yet beyond
// being in it and moving around, and a summary that implied otherwise would be
// a memory of something that never happened.
func zoneBreakdown(zoneTime map[world.ZoneID]time.Duration) string {
	if len(zoneTime) == 0 {
		return ""
	}

	type entry struct {
		zone  world.ZoneID
		spent time.Duration
	}
	entries := make([]entry, 0, len(zoneTime))
	for zone, spent := range zoneTime {
		if spent <= 0 {
			continue
		}
		entries = append(entries, entry{zone: zone, spent: spent})
	}
	if len(entries) == 0 {
		return ""
	}
	sort.Slice(entries, func(a, b int) bool {
		if entries[a].spent == entries[b].spent {
			return entries[a].zone < entries[b].zone
		}
		return entries[a].spent > entries[b].spent
	})

	parts := make([]string, 0, len(entries))
	for _, e := range entries {
		parts = append(parts, fmt.Sprintf("%s for %s", zoneLabel(e.zone), roundedDuration(e.spent)))
	}
	if len(parts) == 1 {
		return "Wandered " + parts[0] + "."
	}
	return "Wandered " + strings.Join(parts[:len(parts)-1], ", ") + " and then " + parts[len(parts)-1] + "."
}

func longestZone(zoneTime map[world.ZoneID]time.Duration) world.ZoneID {
	var longest world.ZoneID
	var best time.Duration
	for zone, spent := range zoneTime {
		if spent > best || (spent == best && zone < longest) {
			longest, best = zone, spent
		}
	}
	return longest
}

// zoneLabel names a zone the way a resident would, falling back to the raw id
// rather than inventing a name for a venue this build has not been told about.
func zoneLabel(zone world.ZoneID) string {
	switch zone {
	case world.ZoneMainStage:
		return "the main stage"
	case world.ZoneUnderground:
		return "the Underground"
	case world.ZonePlurrPartay:
		return "Plurr Partay"
	default:
		return string(zone)
	}
}

// roundedDuration keeps report text free of nanosecond noise.
func roundedDuration(d time.Duration) string {
	return d.Round(time.Second).String()
}

func distanceBetween(from, to world.Vec3) float64 {
	return math.Hypot(to.X-from.X, to.Z-from.Z)
}
