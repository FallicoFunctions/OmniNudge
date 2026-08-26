package services

import (
	"fmt"
	"strings"
	"unicode"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
)

// Mirror mode: she writes the way you write.
//
// The appeal is that nobody imposes the format. A creator picking a style off a
// menu is a guess about a reader he has never met. Here the reader teaches it
// by example, continuously, without being asked.
//
// Everything below is counted rather than judged. Handing a model "write like
// this person" gets a weak imitation of what it imagines the person is like;
// handing it "their messages average nine words and never contain asterisks"
// gets the actual habit.

const (
	// omniChatMirrorMinimumMessages is how much of somebody's writing has to
	// exist before it is read as a habit. Three messages is a mood. Until there
	// is a sample, mirror falls back to the way she was made to write.
	omniChatMirrorMinimumMessages = 8

	// omniChatMirrorSampleMessages bounds how far back the sample reaches, so
	// mirroring follows how somebody writes now rather than how they wrote when
	// the conversation started.
	omniChatMirrorSampleMessages = 40

	// omniChatMirrorFloorWords is what she will not go below however tersely
	// you write. Somebody who answers in fragments is not asking for a
	// character who answers "k" to everything -- she has not matched him, she
	// has stopped being worth talking to.
	omniChatMirrorFloorWords = 8

	// omniChatMirrorAsteriskThreshold is the share of a person's messages that
	// must carry asterisked action before she keeps writing it. Below this it
	// reads as somebody who does not do that, and she stops.
	omniChatMirrorAsteriskThreshold = 0.1
)

// userWritingStyle is what was counted, not what was concluded.
type userWritingStyle struct {
	Sampled       int
	AverageWords  float64
	LongestWords  int
	UsesAsterisks bool
	MostlyLowered bool
}

// sufficient reports whether there is enough here to be reading a habit.
func (s userWritingStyle) sufficient() bool { return s.Sampled >= omniChatMirrorMinimumMessages }

// observeUserWritingStyle counts how the person in this conversation writes.
//
// It reads their own messages only. Counting hers would make mirroring a loop
// where she converges on herself.
func observeUserWritingStyle(history []*models.BotMessage) userWritingStyle {
	written := make([]string, 0, len(history))
	for _, message := range history {
		if message != nil && message.Role == models.BotMessageRoleUser {
			written = append(written, message.Content)
		}
	}
	return observeWriting(written)
}

// observeUserWritingStyleInPrompt reads the same habit off the messages already
// assembled for the model, for the paths that hold those rather than rows.
func observeUserWritingStyleInPrompt(messages []openrouter.Message) userWritingStyle {
	written := make([]string, 0, len(messages))
	for _, message := range messages {
		if message.Role == openrouter.RoleUser {
			written = append(written, message.Content)
		}
	}
	return observeWriting(written)
}

func observeWriting(written []string) userWritingStyle {
	style := userWritingStyle{}
	lowered, cased := 0, 0
	totalWords := 0
	withAsterisks := 0

	for index := len(written) - 1; index >= 0 && style.Sampled < omniChatMirrorSampleMessages; index-- {
		content := strings.TrimSpace(written[index])
		if content == "" {
			continue
		}
		style.Sampled++

		words := len(strings.Fields(content))
		totalWords += words
		if words > style.LongestWords {
			style.LongestWords = words
		}
		if strings.Contains(content, "*") {
			withAsterisks++
		}
		if first := firstLetter(content); first != 0 {
			cased++
			if unicode.IsLower(first) {
				lowered++
			}
		}
	}

	if style.Sampled == 0 {
		return style
	}
	style.AverageWords = float64(totalWords) / float64(style.Sampled)
	// Asterisks are read as a rate rather than a presence: one stray asterisk
	// in forty messages is a typo, not a way of writing.
	style.UsesAsterisks = float64(withAsterisks)/float64(style.Sampled) >= omniChatMirrorAsteriskThreshold
	style.MostlyLowered = cased > 0 && float64(lowered)/float64(cased) > 0.8
	return style
}

func firstLetter(content string) rune {
	for _, character := range content {
		if unicode.IsLetter(character) {
			return character
		}
	}
	return 0
}

// personaMirrorsUser reports whether this character takes her format from the
// person she is talking to. The schema already refuses mirror on an IAI; this
// refuses it again rather than trusting a row.
func personaMirrorsUser(persona *models.BotPersona) bool {
	if persona == nil || personaDeliversSeparateMessages(persona) {
		return false
	}
	return strings.TrimSpace(persona.MessageStyleMode) == models.MessageStyleModeMirror
}

// mirroredShape leans the enforced shape toward how somebody writes, and stops
// at a floor.
//
// It is a lean rather than a copy on purpose. Absolute mirroring turns a terse
// reader into a character not worth reading.
func mirroredShape(base messageShape, style userWritingStyle) messageShape {
	if !base.countsBlocks() || !style.sufficient() {
		return base
	}
	shaped := base

	// Halfway between what she was made to write and what he actually writes.
	// A lean, in one line: he pulls, he does not replace.
	target := (float64(base.maxBlockWords) + style.AverageWords) / 2
	shaped.maxBlockWords = int(target)
	if shaped.maxBlockWords < omniChatMirrorFloorWords {
		shaped.maxBlockWords = omniChatMirrorFloorWords
	}
	if shaped.maxBlockWords > base.maxBlockWords {
		shaped.maxBlockWords = base.maxBlockWords
	}
	shaped.minBlockWords = omniChatMirrorFloorWords
	if shaped.minBlockWords > shaped.maxBlockWords {
		shaped.minBlockWords = shaped.maxBlockWords
	}

	// Somebody who never writes more than a line does not want three
	// paragraphs back, so the number of messages leans too.
	if style.AverageWords < float64(omniChatMirrorFloorWords)*2 {
		shaped.minBlocks = 1
		shaped.minMediumBlocks = 1
	}
	return shaped
}

// renderMirroredStyle is what she is told about how the other person writes.
//
// Numbers, not adjectives. "Match their style" invites a caricature; a word
// count is a fact she can hold to.
func renderMirroredStyle(style userWritingStyle) string {
	if !style.sufficient() {
		return ""
	}
	var builder strings.Builder
	builder.WriteString("[How They Write]\n")
	fmt.Fprintf(&builder,
		"Their messages run about %d words, and the longest recently was %d. Write at that scale rather than yours.\n",
		int(style.AverageWords+0.5), style.LongestWords)
	if style.UsesAsterisks {
		builder.WriteString("They write actions in asterisks, so it is normal here.\n")
	} else {
		builder.WriteString("They never write actions in asterisks. Do not write any either.\n")
	}
	if style.MostlyLowered {
		builder.WriteString("They mostly do not capitalise. Match that.\n")
	}
	builder.WriteString("Match how they write, not what they say. Do not shrink so far that you stop answering.")
	return builder.String()
}
