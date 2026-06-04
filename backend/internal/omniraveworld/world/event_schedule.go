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

	activeEnd := rule.activeStart + rule.activeDuration
	if secondOfHour >= rule.activeStart && secondOfHour < activeEnd {
		return ZoneEventState{
			ZoneID:        zone,
			Phase:         EventPhaseActive,
			EventName:     rule.eventName,
			ActiveMinute:  int((secondOfHour-rule.activeStart)/60) + 1,
		}
	}

	recoveryEnd := activeEnd + rule.recoveryDuration
	if secondOfHour >= activeEnd && secondOfHour < recoveryEnd {
		return ZoneEventState{
			ZoneID:          zone,
			Phase:           EventPhaseRecovery,
			EventName:       rule.eventName,
			RecoverySeconds: recoveryEnd - secondOfHour,
		}
	}

	return ZoneEventState{ZoneID: zone, Phase: EventPhaseNone}
}

func (s EventSchedule) Snapshot(now time.Time) []ZoneEventState {
	return []ZoneEventState{
		s.StateFor(ZoneMainStage, now),
		s.StateFor(ZoneUnderground, now),
		s.StateFor(ZonePlurrPartay, now),
	}
}

func (r eventScheduleRule) countdown(secondOfHour int64) (int64, bool) {
	if r.leadInDuration == 0 {
		return 0, false
	}

	leadInStart := r.activeStart - r.leadInDuration
	if leadInStart >= 0 {
		if secondOfHour >= leadInStart && secondOfHour < r.activeStart {
			return r.activeStart - secondOfHour, true
		}
		return 0, false
	}

	if secondOfHour >= secondsPerHour+leadInStart {
		return secondsPerHour - secondOfHour + r.activeStart, true
	}
	if secondOfHour < r.activeStart {
		return r.activeStart - secondOfHour, true
	}

	return 0, false
}
