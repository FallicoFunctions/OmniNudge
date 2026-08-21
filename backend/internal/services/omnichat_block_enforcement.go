package services

import (
	"context"
	"errors"
	"time"

	"github.com/omninudge/backend/internal/models"
	zlog "github.com/rs/zerolog/log"
)

// ErrOmniChatBlockedByPersona is returned when a character has stopped talking
// to this person and the block is still in force.
//
// The person is told rather than left wondering. §6 gives them a review to
// appeal to, and an appeal nobody knows they need is not one -- a wrongly
// blocked person is somebody shut out of a character they liked, and silence
// would leave them with nothing to argue about.
var ErrOmniChatBlockedByPersona = errors.New("chatbot: the character is not talking to this person")

// How much of the exchange a block keeps for review.
//
// Not the whole window. A reviewer will not read two hundred messages, and the
// storage per block is real -- but more importantly the transcript is *context*
// rather than the evidence the decision was made on. The decision came from
// accumulated warmth across the whole relationship, which no transcript shows.
// What the reviewer is judging is whether the pattern was fair, and this is a
// sample of it big enough to hold the "I already said no" three turns back.
const omniChatBlockTranscriptTurns = 40

// The decision outlives the request that produced it, but not indefinitely.
const omniChatBlockRecordTimeout = 5 * time.Second

// blockInForce reports the standing block between this character and this
// person, or nil. Called before anything is generated or billed.
//
// A lookup failure returns nil rather than refusing. Failing closed here would
// let a database blip silence every character at once, which is a far worse
// outcome than one blocked person getting one more reply than they should.
func (s *ChatbotService) blockInForce(
	ctx context.Context, persona *models.BotPersona, userID int,
) *models.OmniChatPersonaBlock {
	if s == nil || s.blocks == nil || persona == nil || userID < 1 {
		return nil
	}
	block, err := s.blocks.ActiveBlock(ctx, persona.ID, userID)
	if err != nil {
		zlog.Warn().Err(err).Int("persona_id", persona.ID).
			Msg("chatbot: could not check for a standing block")
		return nil
	}
	return block
}

// considerBlocking asks whether this person has worn out their welcome, and
// records it if they have.
//
// It runs *after* the reply, which is deliberate. She has already been at the
// floor for this whole turn, so the disposition in the prompt has her cold
// and the answer they just received reads like somebody who is done. Then the
// door closes. Blocking first would have taken even that away, and being cut
// off mid-sentence with no last word is worse than being told.
//
// Nothing here reads the conversation. The judgment is a number that moved over
// many exchanges; the transcript goes along only so a human can see what it
// looked like from outside.
func (s *ChatbotService) considerBlocking(
	ctx context.Context,
	persona *models.BotPersona,
	userID int,
	disposition loadedDisposition,
	history []*models.BotMessage,
) {
	if s == nil || s.blocks == nil || persona == nil || userID < 1 {
		return
	}
	if !models.ShouldBlock(disposition.Baseline, disposition.Relationship) {
		return
	}

	// Detached from the request, which is very likely already finishing. Tying
	// the decision to it means somebody who closes the tab after her last reply
	// is never blocked at all -- and they are exactly the person who would.
	// Synchronous rather than fired into a goroutine: the write is one insert,
	// and a block that lands after the next message is a block that did not
	// stop it.
	blockCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), omniChatBlockRecordTimeout)
	defer cancel()

	if _, err := s.blocks.Block(blockCtx, models.OmniChatBlockRequest{
		PersonaID: persona.ID,
		UserID:    userID,
		// Her own words for this come later, written by a short generation once
		// the decision is already made. Until then the record says plainly what
		// happened, which the transcript beside it makes reviewable.
		Reason:           "Warmth toward this person reached the point where the character stops talking to them.",
		Transcript:       blockTranscript(history),
		DischargedWarmth: models.OmniChatDischargedWarmth(disposition.Baseline),
	}); err != nil {
		zlog.Error().Err(err).Int("persona_id", persona.ID).Int("user_id", userID).
			Msg("chatbot: failed to record a block")
		return
	}

	zlog.Info().Int("persona_id", persona.ID).Int("user_id", userID).
		Float64("relationship_warmth", disposition.Relationship.Warmth).
		Msg("chatbot: character stopped talking to this person")
}

// blockTranscript takes the tail of what she had in front of her.
func blockTranscript(history []*models.BotMessage) []models.OmniChatBlockTranscriptEntry {
	if len(history) == 0 {
		return nil
	}
	from := len(history) - omniChatBlockTranscriptTurns
	if from < 0 {
		from = 0
	}

	entries := make([]models.OmniChatBlockTranscriptEntry, 0, len(history)-from)
	for _, message := range history[from:] {
		if message == nil {
			continue
		}
		entries = append(entries, models.OmniChatBlockTranscriptEntry{
			Role:      message.Role,
			Content:   message.Content,
			CreatedAt: message.CreatedAt.UTC().Truncate(time.Second),
		})
	}
	return entries
}
