package services

import (
	"context"
	"errors"
	"fmt"
	zlog "github.com/rs/zerolog/log"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omninudge/backend/internal/models"
)

// OmniChatOmniAILikenessCandidates is how many pictures somebody chooses from.
//
// Four because a face nobody chose is the thing people reject hardest and she
// is permanent, and because the one they pick is also the identity anchor every
// later render is conditioned on and the input the 3D pipeline takes. That is
// the cheapest place in the product to spend a render.
const OmniChatOmniAILikenessCandidates = 4

// omniChatRerollRefundTimeout bounds releasing what a failed re-roll held. Off
// the caller's context: the request that failed is already going away, and the
// credits have to come back regardless.
const omniChatRerollRefundTimeout = 15 * time.Second

// omniChatLikenessBilling is the credit half of a re-roll. The first set is
// included in what making her costs; every set after it is paid for.
type omniChatLikenessBilling interface {
	ReserveOwned(ctx context.Context, ownerUserID int, operationID uuid.UUID, usageKind string) (*models.OmniCreditsUsageReservation, error)
	RefundOwned(ctx context.Context, ownerUserID int, operationID uuid.UUID) error
}

// omniChatLikenessDiscarder closes the open choice before another is offered.
type omniChatLikenessDiscarder interface {
	DiscardLikenessCandidates(ctx context.Context, personaID, ownerUserID int) (int, error)
}

type omniChatLikenessJobStore interface {
	CreateGenerationJob(ctx context.Context, ownerUserID int, request models.OmniChatGenerationRequest, provider string) (*models.OmniChatGenerationJob, error)
}

// OmniChatOmniAILikenessService asks for the pictures somebody chooses her face
// from.
type OmniChatOmniAILikenessService struct {
	jobs      omniChatLikenessJobStore
	enqueuer  OmniChatGenerationEnqueuer
	provider  string
	billing   omniChatLikenessBilling
	discarder omniChatLikenessDiscarder
}

// SetRerollDependencies wires the two things only a re-roll needs. Kept off the
// constructor so the first set of four -- which is free and does not close an
// existing choice -- carries neither.
func (s *OmniChatOmniAILikenessService) SetRerollDependencies(
	billing omniChatLikenessBilling, discarder omniChatLikenessDiscarder,
) *OmniChatOmniAILikenessService {
	if s != nil {
		s.billing, s.discarder = billing, discarder
	}
	return s
}

func NewOmniChatOmniAILikenessService(jobs omniChatLikenessJobStore, enqueuer OmniChatGenerationEnqueuer, provider string) *OmniChatOmniAILikenessService {
	return &OmniChatOmniAILikenessService{jobs: jobs, enqueuer: enqueuer, provider: provider}
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
func (s *OmniChatOmniAILikenessService) Start(ctx context.Context, persona *models.BotPersona) ([]uuid.UUID, error) {
	if s == nil || s.jobs == nil || s.enqueuer == nil {
		return nil, errors.New("omnichat likeness: service is not configured")
	}
	if persona == nil || persona.OwnerUserID == nil {
		return nil, errors.New("omnichat likeness: an owned persona is required")
	}
	if models.PersonaPerformsAScene(persona) {
		// Only OmniAIs are drawn from their answers. A roleplay
		// card's picture is whatever its author uploaded.
		return nil, errors.New("omnichat likeness: only an OmniAI is drawn from her answers")
	}

	prompt := BuildOmniAILikenessPrompt(ResolveOmniChatMediaIdentityProfile(persona))

	started := make([]uuid.UUID, 0, OmniChatOmniAILikenessCandidates)
	var failed error
	for i := 0; i < OmniChatOmniAILikenessCandidates; i++ {
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

// StartReferences asks for the supporting pictures once somebody has chosen.
//
// One reference reproduces identity only weakly, which is why the profile's
// limit is six rather than one. These are the other five: three portraits for
// facial detail and two more full-length for proportions, each conditioned on
// the picture that was actually picked.
//
// Called after the pick has committed rather than inside it. A pick must not
// fail because a render could not be queued -- she is already wearing the face
// somebody chose, and the supporting set only makes her more consistent in
// scenes. The same reason creation does not fail when her first four cannot be
// queued.
//
// A partial set is kept, again. Every one of these is optional by construction:
// six is better than two and two is better than one, and throwing away the ones
// that started because a later one could not would leave her worse off.
func (s *OmniChatOmniAILikenessService) StartReferences(
	ctx context.Context, persona *models.BotPersona, anchorURL string,
) ([]uuid.UUID, error) {
	if s == nil || s.jobs == nil || s.enqueuer == nil {
		return nil, errors.New("omnichat likeness: service is not configured")
	}
	if persona == nil || persona.OwnerUserID == nil {
		return nil, errors.New("omnichat likeness: an owned persona is required")
	}
	if models.PersonaPerformsAScene(persona) {
		return nil, errors.New("omnichat likeness: only an OmniAI is drawn from her answers")
	}
	if strings.TrimSpace(anchorURL) == "" {
		// Without the picked picture there is nothing to condition on, and five
		// unconditioned renders would be five more strangers rather than five
		// more looks at her.
		return nil, errors.New("omnichat likeness: the chosen picture is required")
	}

	profile := ResolveOmniChatMediaIdentityProfile(persona)
	variants := OmniAIReferenceVariantKeys()
	started := make([]uuid.UUID, 0, len(variants))
	var failed error

	for _, variant := range variants {
		request, err := NormalizeOmniChatReferenceRequest(models.OmniChatGenerationRequest{
			Kind:      models.OmniChatMediaKindImage,
			PersonaID: persona.ID,
			Prompt:    BuildOmniAIReferencePrompt(profile, variant),
		}, variant)
		if err != nil {
			return started, fmt.Errorf("omnichat likeness: prepare %s: %w", variant, err)
		}

		job, err := s.jobs.CreateGenerationJob(ctx, *persona.OwnerUserID, request, s.provider)
		if err != nil {
			failed = fmt.Errorf("omnichat likeness: create %s: %w", variant, err)
			break
		}
		if err := s.enqueuer.EnqueueOmniChatGeneration(ctx, job.ID); err != nil {
			failed = fmt.Errorf("omnichat likeness: enqueue %s (%s): %w", variant, job.ID, err)
			break
		}
		started = append(started, job.ID)
	}
	return started, failed
}

// Reroll draws her four more faces, and charges for them.
//
// The first set is included in what making an OmniAI costs. This is every set
// after it, at the ordinary image price per picture, because four renders is
// four renders however they were asked for.
//
// All four are reserved before any is queued. A set is the unit somebody is
// choosing from, so half a set for half the money is the wrong answer to not
// having enough credits -- better to refuse while nothing has been spent.
//
// Refused outright once she has been picked. That face is her avatar, the
// conditioning for every later render and the 3D pipeline's input, so redrawing
// her is not a new choice; it is a different character wearing her name.
func (s *OmniChatOmniAILikenessService) Reroll(
	ctx context.Context, persona *models.BotPersona,
) ([]uuid.UUID, error) {
	if s == nil || s.jobs == nil || s.enqueuer == nil {
		return nil, errors.New("omnichat likeness: service is not configured")
	}
	if s.billing == nil || s.discarder == nil {
		return nil, errors.New("omnichat likeness: re-rolling is not configured")
	}
	if persona == nil || persona.OwnerUserID == nil {
		return nil, errors.New("omnichat likeness: an owned persona is required")
	}
	if models.PersonaPerformsAScene(persona) {
		return nil, errors.New("omnichat likeness: only an OmniAI is drawn from her answers")
	}
	ownerUserID := *persona.OwnerUserID

	// Before the money. Somebody whose face is already chosen is refused
	// without being charged for finding that out.
	if _, err := s.discarder.DiscardLikenessCandidates(ctx, persona.ID, ownerUserID); err != nil {
		return nil, err
	}

	operations := make([]uuid.UUID, 0, OmniChatOmniAILikenessCandidates)
	refundAll := func(from int) {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), omniChatRerollRefundTimeout)
		defer cancel()
		for _, operation := range operations[from:] {
			if operation == uuid.Nil {
				continue
			}
			if err := s.billing.RefundOwned(cleanupCtx, ownerUserID, operation); err != nil {
				zlog.Error().Err(err).Int("user_id", ownerUserID).Str("operation", operation.String()).
					Msg("omnichat likeness: could not release a re-roll reservation")
			}
		}
	}

	for i := 0; i < OmniChatOmniAILikenessCandidates; i++ {
		operation := uuid.New()
		reservation, err := s.billing.ReserveOwned(ctx, ownerUserID, operation, models.OmniCreditsUsageImage)
		if err != nil {
			refundAll(0)
			if errors.Is(err, models.ErrOmniCreditsInsufficient) {
				return nil, ErrOmniChatPaidFeatureRequired
			}
			return nil, fmt.Errorf("omnichat likeness: reserve a re-roll: %w", err)
		}
		if reservation == nil {
			refundAll(0)
			return nil, errors.New("omnichat likeness: billing returned no reservation")
		}
		if reservation.AdminBypass {
			// Nothing was held, so there is nothing to capture or release. The
			// zero id is what tells the request not to claim one.
			operation = uuid.Nil
		}
		operations = append(operations, operation)
	}

	prompt := BuildOmniAILikenessPrompt(ResolveOmniChatMediaIdentityProfile(persona))
	started := make([]uuid.UUID, 0, OmniChatOmniAILikenessCandidates)
	for i, operation := range operations {
		request, err := NormalizeOmniChatRerollRequest(models.OmniChatGenerationRequest{
			Kind:      models.OmniChatMediaKindImage,
			PersonaID: persona.ID,
			Prompt:    prompt,
		}, operation)
		if err != nil {
			refundAll(i)
			return started, fmt.Errorf("omnichat likeness: prepare a re-roll: %w", err)
		}

		job, err := s.jobs.CreateGenerationJob(ctx, ownerUserID, request, s.provider)
		if err != nil {
			// Only the reservations with no job behind them. The ones already
			// created are the worker's to capture or refund, and releasing them
			// here would refund a render that is about to succeed.
			refundAll(i)
			return started, fmt.Errorf("omnichat likeness: create a re-roll: %w", err)
		}
		if err := s.enqueuer.EnqueueOmniChatGeneration(ctx, job.ID); err != nil {
			refundAll(i + 1)
			return started, fmt.Errorf("omnichat likeness: enqueue re-roll %s: %w", job.ID, err)
		}
		started = append(started, job.ID)
	}
	return started, nil
}
