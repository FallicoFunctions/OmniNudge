package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omninudge/backend/internal/websocket"
)

// OmniChatCallSpeech offers each sentence of a call reply to the caller.
//
// Two things here are deliberate.
//
// The sentence is stored rather than synthesised. The audio is made when the
// browser asks for it, so a caller who hangs up mid-reply is never billed for
// words nobody heard, and generation is never held up waiting on a synthesiser.
//
// The browser is told over the websocket but fetches over HTTP. The hub drops
// messages when its channel is full, and a dropped notice costs one sentence
// that the next one recovers from -- where a dropped audio frame would be a
// hole in her voice that nothing could put back.
type OmniChatCallSpeech struct {
	cache Cache
	hub   *websocket.Hub
}

func NewOmniChatCallSpeech(cache Cache, hub *websocket.Hub) *OmniChatCallSpeech {
	return &OmniChatCallSpeech{cache: cache, hub: hub}
}

// callSentenceTTL outlives one turn and nothing more. A sentence nobody asked
// for within three minutes belongs to a call that has ended.
const callSentenceTTL = 3 * time.Minute

// maxCallSentenceRunes bounds what is stored, and therefore what one fetch can
// ask a synthesiser to say.
const maxCallSentenceRunes = 600

// callSentenceKey names one sentence of one turn.
//
// The turn is in the key because sequence numbers restart at one, and without
// it the first sentence of a new turn and the first sentence of the last one
// are the same key. The caller supplies the turn, so it is validated as a UUID
// before it reaches this -- a key is not a place to put unchecked input.
func callSentenceKey(userID, conversationID int, turn string, sequence int) string {
	return fmt.Sprintf("omnichat:call_sentence:%d:%d:%s:%d", userID, conversationID, turn, sequence)
}

// ValidCallTurn reports whether a turn identifier is one this ever issued.
func ValidCallTurn(turn string) bool {
	parsed, err := uuid.Parse(strings.TrimSpace(turn))
	return err == nil && parsed != uuid.Nil
}

// Sentence stores one sentence of a turn and tells the caller it is ready.
func (s *OmniChatCallSpeech) Sentence(ctx context.Context, userID, conversationID int, turn string, sequence int, sentence string) error {
	if s == nil || s.cache == nil {
		return errors.New("omnichat: call speech is unavailable")
	}
	if !ValidCallTurn(turn) || sequence < 1 {
		return errors.New("omnichat: call sentence is not addressable")
	}
	sentence = strings.TrimSpace(sentence)
	if sentence == "" {
		return nil
	}
	if runes := []rune(sentence); len(runes) > maxCallSentenceRunes {
		sentence = strings.TrimSpace(string(runes[:maxCallSentenceRunes]))
	}
	if err := s.cache.Set(ctx, callSentenceKey(userID, conversationID, turn, sequence), sentence, callSentenceTTL); err != nil {
		return fmt.Errorf("omnichat: store call sentence: %w", err)
	}
	// Announced only after it is stored. A caller told to fetch something that
	// is not there yet gets a 404 and stops, which is worse than a late notice.
	s.announce(userID, "omnichat_call_sentence", map[string]interface{}{
		"conversation_id": conversationID,
		"turn":            turn,
		"sequence":        sequence,
	})
	return nil
}

// Done says the turn has no more sentences coming.
func (s *OmniChatCallSpeech) Done(ctx context.Context, userID, conversationID int, turn string, spoken int) error {
	if s == nil {
		return errors.New("omnichat: call speech is unavailable")
	}
	if !ValidCallTurn(turn) {
		return errors.New("omnichat: call sentence is not addressable")
	}
	s.announce(userID, "omnichat_call_sentences_done", map[string]interface{}{
		"conversation_id": conversationID,
		"turn":            turn,
		"spoken":          spoken,
	})
	return nil
}

// Read returns a stored sentence, for the route that turns it into audio.
func (s *OmniChatCallSpeech) Read(ctx context.Context, userID, conversationID int, turn string, sequence int) (string, bool, error) {
	if s == nil || s.cache == nil {
		return "", false, errors.New("omnichat: call speech is unavailable")
	}
	if !ValidCallTurn(turn) || sequence < 1 {
		return "", false, nil
	}
	return s.cache.Get(ctx, callSentenceKey(userID, conversationID, turn, sequence))
}

func (s *OmniChatCallSpeech) announce(userID int, messageType string, payload map[string]interface{}) {
	if s.hub == nil {
		return
	}
	s.hub.Broadcast(&websocket.Message{RecipientID: userID, Type: messageType, Payload: payload})
}
