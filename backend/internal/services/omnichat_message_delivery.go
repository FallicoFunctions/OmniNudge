package services

import (
	"strings"
	"time"

	"github.com/omninudge/backend/internal/models"
)

// Sending a reply as several messages is delivery, not generation. The model
// already writes in blocks separated by blank lines; joining them into one
// message is a decision the delivery code makes, and this is where it stops
// making it for characters who did not ask for it.

const (
	// omniChatMaxDeliveredMessages bounds one reply. A model that emits a dozen
	// blank lines should not turn into a dozen notifications, and nobody sends
	// twelve texts in a row about one thing.
	omniChatMaxDeliveredMessages = 6

	// omniChatTypingPauseFloor is the gap before a message however short it is.
	// Even "ok" takes a moment to arrive after the message before it.
	omniChatTypingPauseFloor = 600 * time.Millisecond

	// omniChatTypingPausePerWord is roughly how long a word takes to type. It
	// does not need to be accurate. It needs a longer message to take longer
	// than a short one, because a burst that arrives at a constant rate reads
	// as a machine dealing cards.
	omniChatTypingPausePerWord = 90 * time.Millisecond

	// omniChatTypingPauseCeiling stops a long block holding up the rest.
	omniChatTypingPauseCeiling = 3 * time.Second
)

// omniChatMaxDeliverySpread is the worst case the pacing can add to one reply,
// used to size the context the delivery runs under.
const omniChatMaxDeliverySpread = omniChatMaxDeliveredMessages * omniChatTypingPauseCeiling

// personaDeliversSeparateMessages reports whether this character's blocks are
// sent one at a time.
//
// True for an IAI, because §13 says the notation is available to her and the
// count is not imposed: if she wrote two pieces, she meant two messages. False
// for a roleplay character until her creator chooses it on the form, since
// changing how every existing character arrives is the creator's call and not
// ours.
func personaDeliversSeparateMessages(persona *models.BotPersona) bool {
	if persona == nil {
		return false
	}
	return strings.TrimSpace(persona.ResponseStyleProfile) == models.ResponseStyleProfileDirectMessage
}

// splitDeliverableMessages turns one generated reply into the messages it was
// written as. A reply with no blank line is one message, which is the ordinary
// case and stays untouched.
func splitDeliverableMessages(text string) []string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return nil
	}
	parts := blankLinePattern.Split(trimmed, -1)
	messages := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		messages = append(messages, part)
	}
	if len(messages) == 0 {
		return nil
	}
	if len(messages) <= omniChatMaxDeliveredMessages {
		return messages
	}
	// Past the cap the tail is rejoined rather than dropped. Losing what she
	// wrote would be worse than sending a longer last message.
	capped := messages[:omniChatMaxDeliveredMessages-1]
	capped = append(capped, strings.Join(messages[omniChatMaxDeliveredMessages-1:], "\n\n"))
	return capped
}

// typingPause is how long to wait before the next message arrives, from how
// much there is to type.
func typingPause(next string) time.Duration {
	words := len(strings.Fields(next))
	pause := omniChatTypingPauseFloor + time.Duration(words)*omniChatTypingPausePerWord
	if pause > omniChatTypingPauseCeiling {
		return omniChatTypingPauseCeiling
	}
	return pause
}

// omniChatDeliveredMessage is a message on its way to the client, plus whether
// another one is following it.
//
// The client hides the typing indicator when a reply lands. Without this it
// would hide it after the first of three, and she would appear to stop talking
// twice in the middle of answering.
type omniChatDeliveredMessage struct {
	*models.BotMessage
	MoreComing bool `json:"more_coming,omitempty"`
}
