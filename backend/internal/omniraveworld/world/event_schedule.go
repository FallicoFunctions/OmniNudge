package world

import "time"

const secondsPerHour = int64((60 * time.Minute) / time.Second)

type EventPhase string

const (
	EventPhaseNone     EventPhase = "none"
	EventPhaseLeadIn   EventPhase = "lead_in"
	EventPhaseActive   EventPhase = "active"
	EventPhaseRecovery EventPhase = "recovery"
)

type ZoneEventState struct {
	ZoneID           ZoneID     `json:"zoneId"`
	Phase            EventPhase `json:"phase"`
	EventName        string     `json:"eventName"`
	CountdownSeconds int64      `json:"countdownSeconds,omitempty"`
	RecoverySeconds  int64      `json:"recoverySeconds,omitempty"`
	ActiveMinute     int        `json:"activeMinute,omitempty"`
}

type EventSchedule struct {
	rules map[ZoneID]eventScheduleRule
	order []ZoneID
}

type eventScheduleRule struct {
	eventName        string
	activeStart      int64
	leadInDuration   int64
	activeDuration   int64
	recoveryDuration int64
}

func NewEventSchedule() EventSchedule {
	return EventSchedule{
		rules: map[ZoneID]eventScheduleRule{
			ZoneMainStage: {
				eventName:        "fireworks",
				activeStart:      0,
				leadInDuration:   10,
				activeDuration:   int64((3 * time.Minute) / time.Second),
				recoveryDuration: 5,
			},
			ZoneUnderground: {
				eventName:        "collapse",
				activeStart:      int64((30 * time.Minute) / time.Second),
				activeDuration:   int64((3 * time.Minute) / time.Second),
				recoveryDuration: 5,
			},
			ZonePlurrPartay: {
				eventName:        "unity_peak",
				activeStart:      int64((45 * time.Minute) / time.Second),
				leadInDuration:   15,
				activeDuration:   int64((3 * time.Minute) / time.Second),
				recoveryDuration: 10,
			},
		},
		order: []ZoneID{ZoneMainStage, ZoneUnderground, ZonePlurrPartay},
	}
}

func (s EventSchedule) StateFor(zone ZoneID, now time.Time) ZoneEventState {
	rule, ok := s.rules[zone]
	if !ok {
		return ZoneEventState{ZoneID: zone, Phase: EventPhaseNone}
	}

	secondOfHour := int64(now.UTC().Minute()*60 + now.UTC().Second())

	if countdownSeconds, ok := rule.countdown(secondOfHour); ok {
		return ZoneEventState{
			ZoneID:           zone,
			Phase:            EventPhaseLeadIn,
			EventName:        rule.eventName,
			CountdownSeconds: countdownSeconds,
		}
	}

	if activeOffset, ok := windowOffset(secondOfHour, rule.activeStart, rule.activeDuration); ok {
		return ZoneEventState{
			ZoneID:       zone,
			Phase:        EventPhaseActive,
			EventName:    rule.eventName,
			ActiveMinute: int(activeOffset/60) + 1,
		}
	}

	recoveryStart := (rule.activeStart + rule.activeDuration) % secondsPerHour
	if recoveryOffset, ok := windowOffset(secondOfHour, recoveryStart, rule.recoveryDuration); ok {
		return ZoneEventState{
			ZoneID:          zone,
			Phase:           EventPhaseRecovery,
			EventName:       rule.eventName,
			RecoverySeconds: rule.recoveryDuration - recoveryOffset,
		}
	}

	return ZoneEventState{ZoneID: zone, Phase: EventPhaseNone}
}

func (s EventSchedule) Snapshot(now time.Time) []ZoneEventState {
	snapshot := make([]ZoneEventState, 0, len(s.order))
	for _, zone := range s.order {
		snapshot = append(snapshot, s.StateFor(zone, now))
	}
	return snapshot
}

func (r eventScheduleRule) countdown(secondOfHour int64) (int64, bool) {
	if r.leadInDuration == 0 {
		return 0, false
	}

	leadInStart := (r.activeStart - r.leadInDuration + secondsPerHour) % secondsPerHour
	if offset, ok := windowOffset(secondOfHour, leadInStart, r.leadInDuration); ok {
		return r.leadInDuration - offset, true
	}

	return 0, false
}

func windowOffset(secondOfHour, start, duration int64) (int64, bool) {
	if duration <= 0 {
		return 0, false
	}

	offset := secondOfHour - start
	if offset < 0 {
		offset += secondsPerHour
	}
	if offset >= duration {
		return 0, false
	}
	return offset, true
}
