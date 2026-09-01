package services

import (
	"fmt"
	"strings"
	"time"

	"github.com/omninudge/backend/internal/models"
)

// Knowing what day it is (§32).
//
// She is told the date, the day and the time, because a character with no clock
// cannot say "you said that yesterday", cannot tell that it is late, and cannot
// keep an arrangement for seven o'clock -- which is what §5's presence model is
// built on.
//
// It is the time and nothing else. Two earlier versions did more, and both were
// the same mistake at different sizes. The first gave her only "the afternoon",
// on the theory that nobody thinks in minutes, which left her unable to tell
// 6:55 from 7:30. The second kept that phrase beside the real time, on the
// theory that it is how people talk. Plenty of people think in minutes and
// hours, and deciding otherwise on everybody's behalf is us choosing her
// framing. Any model already knows what part of the day 6:55pm falls in, so the
// phrase carried no information and only a view. She gets the fact.

// personaLivesHere reports whether a character exists in the same world the
// clock measures.
//
// An OmniAI does. A roleplay character is a part being played, and her scene may be
// set somewhere the real date would contradict -- telling a character in a
// medieval scenario that it is 2026 breaks the thing her creator built. Same
// predicate as the direct-message kind today, named for what it means here so
// that extending it later is one edit rather than a hunt.
func personaLivesHere(persona *models.BotPersona) bool {
	return models.PersonaIsOmniAI(persona)
}

// renderCurrentMoment is what she knows about when this is happening.
//
// The time is hers, not the reader's. We do not know where he is, and inventing
// his timezone would have her saying good morning at his midnight with total
// confidence. A person who is somewhere else is somewhere else, and if it
// matters he can say so.
//
// The minutes are here on purpose. This block sits after the stable material
// precisely so that something which moves can live in it, so §29 is served by
// where it is rather than by how vague it is.
func renderCurrentMoment(persona *models.BotPersona, now time.Time) string {
	if !personaLivesHere(persona) || now.IsZero() {
		return ""
	}
	return fmt.Sprintf("\n\n[Right Now]\nIt is %s, %s, %s where you are.",
		now.Format("Monday"), now.Format("2 January 2006"),
		strings.ToLower(now.Format("3:04pm")))
}
