package services

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/omninudge/backend/internal/models"
)

// OmniChatIAILikenessCandidates is how many pictures somebody chooses from.
//
// Four because a face nobody chose is the thing people reject hardest and she
// is permanent, and because the one they pick is also the identity anchor every
// later render is conditioned on and the input the 3D pipeline takes. That is
// the cheapest place in the product to spend a render.
const OmniChatIAILikenessCandidates = 4

type omniChatLikenessJobStore interface {
	CreateGenerationJob(ctx context.Context, ownerUserID int, request models.OmniChatGenerationRequest, provider string) (*models.OmniChatGenerationJob, error)
}

// OmniChatIAILikenessService asks for the pictures somebody chooses her face
// from.
type OmniChatIAILikenessService struct {
	jobs     omniChatLikenessJobStore
	enqueuer OmniChatGenerationEnqueuer
	provider string
}

func NewOmniChatIAILikenessService(jobs omniChatLikenessJobStore, enqueuer OmniChatGenerationEnqueuer, provider string) *OmniChatIAILikenessService {
	return &OmniChatIAILikenessService{jobs: jobs, enqueuer: enqueuer, provider: provider}
}

// Start queues her candidates and reports how many were asked for.
//
// It is deliberately not part of creating her. She exists whether or not a
// picture ever renders, and a provider outage must not be able to fail the ten
// screens somebody just answered -- so this is called after she is made, and
// its error is something to report rather than something to undo her with.
//
// A partial set is a real outcome and is returned rather than rolled back. An
// individual render can fail anyway, so anything reading these has to cope with
// fewer than four; throwing away three good jobs because the fourth could not be
// queued would be the worse answer.
func (s *OmniChatIAILikenessService) Start(ctx context.Context, persona *models.BotPersona) ([]uuid.UUID, error) {
	if s == nil || s.jobs == nil || s.enqueuer == nil {
		return nil, errors.New("omnichat likeness: service is not configured")
	}
	if persona == nil || persona.OwnerUserID == nil {
		return nil, errors.New("omnichat likeness: an owned persona is required")
	}
	if models.PersonaPerformsAScene(persona) {
		// Only independent characters are drawn from their answers. A roleplay
		// card's picture is whatever its author uploaded.
		return nil, errors.New("omnichat likeness: only an independent character is drawn from her answers")
	}

	prompt := BuildIAILikenessPrompt(ResolveOmniChatMediaIdentityProfile(persona))

	started := make([]uuid.UUID, 0, OmniChatIAILikenessCandidates)
	var failed error
	for i := 0; i < OmniChatIAILikenessCandidates; i++ {
		request, err := NormalizeOmniChatLikenessRequest(models.OmniChatGenerationRequest{
			Kind:      models.OmniChatMediaKindImage,
			PersonaID: persona.ID,
			Prompt:    prompt,
		})
		if err != nil {
			// The same prompt every time, so this cannot fail on the fourth
			// having worked on the first.
			return started, fmt.Errorf("omnichat likeness: prepare request: %w", err)
		}

		job, err := s.jobs.CreateGenerationJob(ctx, *persona.OwnerUserID, request, s.provider)
		if err != nil {
			failed = fmt.Errorf("omnichat likeness: create job: %w", err)
			break
		}
		if err := s.enqueuer.EnqueueOmniChatGeneration(ctx, job.ID); err != nil {
			// The row exists and nothing will pick it up. Reported rather than
			// hidden: a candidate that never renders is a gap in the choice,
			// and the caller decides whether to say so.
			failed = fmt.Errorf("omnichat likeness: enqueue job %s: %w", job.ID, err)
			break
		}
		started = append(started, job.ID)
	}
	return started, failed
}
