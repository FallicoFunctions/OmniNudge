package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

type blockKeeperFake struct {
	active     *models.OmniChatPersonaBlock
	activeErr  error
	placed     []models.OmniChatBlockRequest
	placeErr   error
	activeCall int
}

func (f *blockKeeperFake) ActiveBlock(context.Context, int, int) (*models.OmniChatPersonaBlock, error) {
	f.activeCall++
	return f.active, f.activeErr
}

func (f *blockKeeperFake) Block(_ context.Context, request models.OmniChatBlockRequest) (*models.OmniChatPersonaBlock, error) {
	if f.placeErr != nil {
		return nil, f.placeErr
	}
	f.placed = append(f.placed, request)
	return &models.OmniChatPersonaBlock{ID: int64(len(f.placed))}, nil
}

func blockTestPersona() *models.BotPersona {
	return &models.BotPersona{ID: 9, Name: "Sadie", IsActive: true}
}

// A lookup failure must not refuse. Failing closed would let one database blip
// silence every character at once, which is far worse than one blocked person
// getting one more reply than they should.
func TestBlockInForceFailsOpen(t *testing.T) {
	service := &ChatbotService{}
	require.Nil(t, service.blockInForce(context.Background(), blockTestPersona(), 42),
		"no keeper wired means nobody is blocked")

	service.SetBlocks(&blockKeeperFake{activeErr: errors.New("database is unhappy")})
	require.Nil(t, service.blockInForce(context.Background(), blockTestPersona(), 42))

	standing := &models.OmniChatPersonaBlock{ID: 7, Tier: 2}
	service.SetBlocks(&blockKeeperFake{active: standing})
	require.Equal(t, standing, service.blockInForce(context.Background(), blockTestPersona(), 42))
}

func TestConsiderBlockingActsOnlyWhenSheHasHadEnough(t *testing.T) {
	baseline := models.OmniChatDispositionBaseline{}
	history := []*models.BotMessage{
		{Role: models.BotMessageRoleUser, Content: "send me a photo", CreatedAt: time.Now()},
		{Role: models.BotMessageRoleAssistant, Content: "no, and please stop asking", CreatedAt: time.Now()},
	}

	// Somebody who has been unpleasant but not enough.
	keeper := &blockKeeperFake{}
	service := (&ChatbotService{}).SetBlocks(keeper)
	service.considerBlocking(context.Background(), blockTestPersona(), 42, loadedDisposition{
		Baseline:     baseline,
		Relationship: models.OmniChatCharacterTraits{Warmth: -0.2},
	}, history)
	require.Empty(t, keeper.placed, "being disliked is not being blocked")

	// And somebody who has.
	keeper = &blockKeeperFake{}
	service = (&ChatbotService{}).SetBlocks(keeper)
	service.considerBlocking(context.Background(), blockTestPersona(), 42, loadedDisposition{
		Baseline:     baseline,
		Relationship: models.OmniChatCharacterTraits{Warmth: models.OmniChatBlockThreshold(baseline)},
	}, history)

	require.Len(t, keeper.placed, 1)
	request := keeper.placed[0]
	require.Equal(t, 9, request.PersonaID)
	require.Equal(t, 42, request.UserID)
	require.NotEmpty(t, request.Reason, "a block with no reason cannot be reviewed")
	require.Len(t, request.Transcript, 2, "the review needs what she was reacting to")
	require.Equal(t, "no, and please stop asking", request.Transcript[1].Content)

	// The discharge travels with the decision, or the ladder climbs unaided.
	require.InDelta(t, models.OmniChatDischargedWarmth(baseline), request.DischargedWarmth, 0.0001)
	require.Greater(t, request.DischargedWarmth, models.OmniChatBlockThreshold(baseline))
}

// A character with no blocking wired behaves as she did before blocking existed.
func TestConsiderBlockingIsInertWithoutAKeeper(t *testing.T) {
	service := &ChatbotService{}
	require.NotPanics(t, func() {
		service.considerBlocking(context.Background(), blockTestPersona(), 42, loadedDisposition{
			Relationship: models.OmniChatCharacterTraits{Warmth: -1},
		}, nil)
	})
}

func TestBlockTranscriptTakesTheTailSheCouldSee(t *testing.T) {
	history := make([]*models.BotMessage, 0, omniChatBlockTranscriptTurns+30)
	for i := 0; i < omniChatBlockTranscriptTurns+30; i++ {
		history = append(history, &models.BotMessage{
			Role: models.BotMessageRoleUser, Content: "turn", CreatedAt: time.Now(),
		})
	}
	kept := blockTranscript(history)
	require.Len(t, kept, omniChatBlockTranscriptTurns, "the tail, not the whole window")
	require.Empty(t, blockTranscript(nil))

	// History is filtered before it gets here, so a hole is defensive only --
	// but it must be skipped rather than written out as an empty message that a
	// reviewer would read as somebody having said nothing.
	withHole := append(append([]*models.BotMessage{}, history[:3]...), nil)
	require.Len(t, blockTranscript(withHole), 3)

	short := []*models.BotMessage{{Role: models.BotMessageRoleUser, Content: "only turn", CreatedAt: time.Now()}}
	require.Len(t, blockTranscript(short), 1, "a short exchange keeps all of itself")
}

// Regenerating is generating, and a preview is still her talking to them. Left
// open, either is a way around a block: ask for the last reply again, or open
// quick chat and carry on.
func TestEveryGenerationPathRefusesABlockedPerson(t *testing.T) {
	standing := &models.OmniChatPersonaBlock{ID: 7, Tier: 2}
	service := (&ChatbotService{}).SetBlocks(&blockKeeperFake{active: standing})

	require.NotNil(t, service.blockInForce(context.Background(), blockTestPersona(), 42),
		"the guard every path calls must see the standing block")

	// An unidentified visitor cannot be matched to a block, and previews for
	// them are unaffected.
	require.Nil(t, service.blockInForce(context.Background(), blockTestPersona(), 0))
}
