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

// namedCompanions is how many people a visit will name before it stops
// counting them individually. A memory of an evening is not a guest list: past
// a few names the character remembers that the place was busy, which is what
// the tail is summarised as.
const namedCompanions = 3

// observedPlayer is somebody else the world said was there, as the snapshot
// described them.
type observedPlayer struct {
	ID       string
	Name     string
	Position world.Vec3
}

// companion is one other person across the whole visit, counted by how many
// snapshots they appeared in. The count is what decides which names a busy
// evening keeps: somebody present all night is more of the memory than
// somebody who crossed the room once.
type companion struct {
	name string
	seen int
}

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
	zoneTime   map[world.ZoneID]time.Duration

	// Who else was there, counted the same honest way as everything else here:
	// out of the snapshots, never out of what this process hoped for. others is
	// the latest reading, companions and the two counters are the whole visit.
	others      []world.Vec3
	companions  map[string]*companion
	snapshots   int
	withCompany int
}

func newItinerary(playerName string, startedAt time.Time) *itinerary {
	return &itinerary{
		playerName: playerName,
		startedAt:  startedAt,
		zoneTime:   make(map[world.ZoneID]time.Duration),
		companions: make(map[string]*companion),
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

	// Time is credited to the zone the character was in for that interval, not
	// the one it has just arrived in.
	if elapsed := at.Sub(i.lastSeenAt); elapsed > 0 {
		i.zoneTime[i.lastZone] += elapsed
	}
	i.position = position
	i.lastZone = zone
	i.lastSeenAt = at
}

// observeOthers records who else the world says was there in the same snapshot.
// It is separate from observe because it answers a different question -- not
// where the character was, but who it was with -- and the two are only ever
// called together, for the same snapshot, once the character itself has been
// found in it.
func (i *itinerary) observeOthers(others []observedPlayer) {
	i.mu.Lock()
	defer i.mu.Unlock()

	i.others = i.others[:0]
	for _, other := range others {
		i.others = append(i.others, other.Position)
		known, ok := i.companions[other.ID]
		if !ok {
			known = &companion{}
			i.companions[other.ID] = known
		}
		known.seen++
		// A name can arrive late or not at all; the person is company either
		// way, and is named only once the world has said what to call them.
		if known.name == "" {
			known.name = strings.TrimSpace(other.Name)
		}
	}

	i.snapshots++
	if len(others) > 0 {
		i.withCompany++
	}
}

// company is where the world last said everyone else was standing.
func (i *itinerary) company() []world.Vec3 {
	i.mu.Lock()
	defer i.mu.Unlock()
	return append([]world.Vec3(nil), i.others...)
}

// felt is how the visit felt, or nil when there is nothing honest to say --
// which is the ordinary answer. See companyFelt for what is and is not
// knowable here.
func (i *itinerary) felt(warmth float64) *float64 {
	i.mu.Lock()
	defer i.mu.Unlock()
	return companyFelt(warmth, i.snapshots, i.withCompany)
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
//
// The title stays the same phrase for the same kind of evening on purpose: the
// memory store links recurrences by exact title within the self tier, so a
// title that named the company would give every evening its own chain and the
// character would never notice it had done this before.
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
	sentences = append(sentences, companySentence(i.companions))

	return title, strings.Join(sentences, " "), true
}

// companySentence says who else was there, and says it flatly. These
// characters walk near each other and nothing more, so the most it can claim
// is presence: naming somebody is true, and anything about an evening spent
// together would be a memory of a conversation that never happened.
//
// Every name in it came out of a snapshot the world sent. There is no path by
// which somebody who was not there could be remembered as having been.
func companySentence(companions map[string]*companion) string {
	if len(companions) == 0 {
		return "Had the place to itself."
	}

	ordered := make([]*companion, 0, len(companions))
	for _, known := range companions {
		ordered = append(ordered, known)
	}
	// Most-seen first, then by name, so the same evening always keeps the same
	// names -- map order must not decide who a character remembers.
	sort.Slice(ordered, func(a, b int) bool {
		if ordered[a].seen != ordered[b].seen {
			return ordered[a].seen > ordered[b].seen
		}
		return ordered[a].name < ordered[b].name
	})

	names := make([]string, 0, namedCompanions)
	for _, known := range ordered {
		if len(names) == namedCompanions {
			break
		}
		if known.name != "" {
			names = append(names, known.name)
		}
	}

	rest := len(companions) - len(names)
	if len(names) == 0 {
		if rest == 1 {
			return "Somebody else was around, going by no name the world knew."
		}
		return fmt.Sprintf("%d other people were around, going by no names the world knew.", rest)
	}

	listed := names[0]
	if len(names) > 1 {
		listed = strings.Join(names[:len(names)-1], ", ") + " and " + names[len(names)-1]
	}
	if rest > 0 {
		return fmt.Sprintf("%s were there too, along with %d others.", listed, rest)
	}
	if len(names) == 1 {
		return listed + " was there too."
	}
	return listed + " were there too."
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
