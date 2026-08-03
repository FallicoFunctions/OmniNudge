package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
)

var (
	ErrOmniChatGenerationResourceNotFound = errors.New("omnichat generation resource not found")
	ErrOmniChatGenerationUnavailable      = errors.New("omnichat generation unavailable")
	ErrOmniChatGenerationSafetyRejected   = errors.New("omnichat generation safety rejected")
)

type OmniChatGenerationPersonaReader interface {
	GetAccessibleByID(ctx context.Context, id int, viewerUserID *int) (*models.BotPersona, error)
}

type OmniChatGenerationConversationReader interface {
	GetByID(ctx context.Context, id, userID int) (*models.BotConversation, error)
}

type OmniChatGenerationStore interface {
	GetConversationSceneOwned(ctx context.Context, conversationID, ownerUserID int) (*models.OmniChatSceneState, error)
	GetRecentConversationEventsOwned(ctx context.Context, conversationID, ownerUserID, limit int) ([]string, error)
	GetMediaAssetOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (*models.OmniChatMediaAsset, error)
	MessageBelongsToConversation(ctx context.Context, messageID, conversationID int) (bool, error)
	CreateGenerationJob(ctx context.Context, ownerUserID int, request models.OmniChatGenerationRequest, provider string) (*models.OmniChatGenerationJob, error)
	MarkGenerationJobFailed(ctx context.Context, id uuid.UUID, safeCode, providerError string) (bool, error)
}

type OmniChatGenerationEnqueuer interface {
	EnqueueOmniChatGeneration(ctx context.Context, id uuid.UUID) error
}

type OmniChatGenerationBilling interface {
	ReserveOwned(context.Context, int, uuid.UUID, string) (*models.OmniCreditsUsageReservation, error)
	RefundOwned(context.Context, int, uuid.UUID) error
}

type OmniChatMediaPromptModerator interface {
	AllowPrivateMedia(ctx context.Context, prompt string, kind models.OmniChatMediaKind) (bool, error)
}

// OmniChatGenerationService authorizes every reference before a job is
// created. The queue payload contains only the opaque job UUID, never prompts
// or storage paths.
type OmniChatGenerationService struct {
	personas      OmniChatGenerationPersonaReader
	conversations OmniChatGenerationConversationReader
	store         OmniChatGenerationStore
	enqueuer      OmniChatGenerationEnqueuer
	provider      string
	billing       OmniChatGenerationBilling
	moderator     OmniChatMediaPromptModerator
}

func (s *OmniChatGenerationService) SetBilling(billing OmniChatGenerationBilling) *OmniChatGenerationService {
	s.billing = billing
	return s
}

func (s *OmniChatGenerationService) SetPromptModerator(moderator OmniChatMediaPromptModerator) *OmniChatGenerationService {
	s.moderator = moderator
	return s
}

func NewOmniChatGenerationService(
	personas OmniChatGenerationPersonaReader,
	conversations OmniChatGenerationConversationReader,
	store OmniChatGenerationStore,
	enqueuer OmniChatGenerationEnqueuer,
	provider string,
) *OmniChatGenerationService {
	return &OmniChatGenerationService{
		personas: personas, conversations: conversations, store: store,
		enqueuer: enqueuer, provider: provider,
	}
}

func (s *OmniChatGenerationService) CreateGeneration(ctx context.Context, ownerUserID int, input models.OmniChatGenerationRequest) (*models.OmniChatGenerationJob, error) {
	if ownerUserID <= 0 {
		return nil, ErrOmniChatGenerationResourceNotFound
	}
	if s.personas == nil || s.store == nil || !strings.EqualFold(strings.TrimSpace(s.provider), "fal") {
		return nil, ErrOmniChatGenerationUnavailable
	}

	persona, err := s.personas.GetAccessibleByID(ctx, input.PersonaID, &ownerUserID)
	if err != nil {
		return nil, fmt.Errorf("get generation persona: %w", err)
	}
	if persona == nil {
		return nil, ErrOmniChatGenerationResourceNotFound
	}

	if input.ConversationID != nil {
		if s.conversations == nil {
			return nil, ErrOmniChatGenerationUnavailable
		}
		conversation, err := s.conversations.GetByID(ctx, *input.ConversationID, ownerUserID)
		if err != nil {
			return nil, fmt.Errorf("get generation conversation: %w", err)
		}
		if conversation == nil || conversation.PersonaID != input.PersonaID {
			return nil, ErrOmniChatGenerationResourceNotFound
		}
		if input.SourceMessageID != nil {
			belongs, err := s.store.MessageBelongsToConversation(ctx, *input.SourceMessageID, conversation.ID)
			if err != nil {
				return nil, fmt.Errorf("verify generation source message: %w", err)
			}
			if !belongs {
				return nil, ErrOmniChatGenerationResourceNotFound
			}
		}
		if input.Mode == models.OmniChatGenerationModeContextual {
			if omniChatSceneIsEmpty(input.Scene) {
				scene, err := s.store.GetConversationSceneOwned(ctx, conversation.ID, ownerUserID)
				if err != nil {
					return nil, fmt.Errorf("get conversation scene: %w", err)
				}
				if scene != nil {
					input.Scene = *scene
				}
			}
			recentEvents, err := s.store.GetRecentConversationEventsOwned(ctx, conversation.ID, ownerUserID, omniChatMaxRecentEvents)
			if err != nil {
				return nil, fmt.Errorf("get recent conversation context: %w", err)
			}
			// The persisted conversation is the authoritative source of recent
			// context. Never accept a client-authored transcript snapshot here.
			input.Scene.RecentEvents = recentEvents
		}
	} else if input.SourceMessageID != nil {
		return nil, ErrOmniChatGenerationResourceNotFound
	}

	if input.SourceAssetID != nil {
		asset, err := s.store.GetMediaAssetOwned(ctx, *input.SourceAssetID, ownerUserID)
		if err != nil {
			return nil, fmt.Errorf("get generation source asset: %w", err)
		}
		if asset == nil || asset.Kind != models.OmniChatMediaKindImage || asset.PersonaID != input.PersonaID {
			return nil, ErrOmniChatGenerationResourceNotFound
		}
	}

	normalized, err := NormalizeOmniChatGenerationRequest(input)
	if err != nil {
		return nil, err
	}
	moderationPrompt := "Requested scene:\n" + normalized.EffectivePrompt
	if normalized.NegativePrompt != "" {
		moderationPrompt += "\n\nRequested exclusions:\n" + normalized.NegativePrompt
	}
	if s.moderator == nil {
		return nil, ErrOmniChatGenerationUnavailable
	}
	allowed, moderationErr := s.moderator.AllowPrivateMedia(ctx, moderationPrompt, normalized.Kind)
	if moderationErr != nil {
		return nil, ErrOmniChatGenerationUnavailable
	}
	if !allowed {
		return nil, ErrOmniChatGenerationSafetyRejected
	}
	var billingOperationID uuid.UUID
	if normalized.Kind == models.OmniChatMediaKindImage || normalized.Kind == models.OmniChatMediaKindVideo {
		if s.billing == nil {
			return nil, ErrOmniChatPaidFeatureRequired
		}
		if s.billing != nil {
			usageKind := models.OmniCreditsUsageImage
			if normalized.Kind == models.OmniChatMediaKindVideo {
				usageKind = models.OmniCreditsUsageVideo
			}
			billingOperationID = uuid.New()
			if normalized.BillingOperationID != nil && *normalized.BillingOperationID != uuid.Nil {
				billingOperationID = *normalized.BillingOperationID
			}
			if _, err := s.billing.ReserveOwned(ctx, ownerUserID, billingOperationID, usageKind); err != nil {
				if normalized.BillingOperationID != nil && errors.Is(err, models.ErrOmniCreditsReservationRefunded) {
					// A failed attempt may have already refunded its stable operation.
					// Reservation records are immutable, so a retry uses a fresh,
					// server-created operation after that confirmed closure.
					billingOperationID = uuid.New()
					if _, retryErr := s.billing.ReserveOwned(ctx, ownerUserID, billingOperationID, usageKind); retryErr == nil {
						normalized.BillingOperationID = &billingOperationID
					} else if errors.Is(retryErr, models.ErrOmniCreditsInsufficient) {
						return nil, ErrOmniChatPaidFeatureRequired
					} else {
						return nil, fmt.Errorf("reserve generation retry credits: %w", retryErr)
					}
				} else {
					if errors.Is(err, models.ErrOmniCreditsInsufficient) {
						return nil, ErrOmniChatPaidFeatureRequired
					}
					return nil, fmt.Errorf("reserve video generation credits: %w", err)
				}
			}
			normalized.BillingOperationID = &billingOperationID
		}
	}
	refundReservation := func() error {
		if billingOperationID == uuid.Nil {
			return nil
		}
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
		defer cancel()
		return s.billing.RefundOwned(cleanupCtx, ownerUserID, billingOperationID)
	}
	withRefund := func(base error) error {
		if refundErr := refundReservation(); refundErr != nil {
			return errors.Join(base, fmt.Errorf("refund generation reservation: %w", refundErr))
		}
		return base
	}
	job, err := s.store.CreateGenerationJob(ctx, ownerUserID, normalized, s.provider)
	if err != nil {
		return nil, withRefund(fmt.Errorf("create generation job: %w", err))
	}
	if s.enqueuer == nil {
		if err := s.markQueueFailure(ctx, job.ID); err != nil {
			return nil, withRefund(ErrOmniChatGenerationUnavailable)
		}
		return nil, withRefund(ErrOmniChatGenerationUnavailable)
	}
	if err := s.enqueuer.EnqueueOmniChatGeneration(ctx, job.ID); err != nil {
		if markErr := s.markQueueFailure(ctx, job.ID); markErr != nil {
			return nil, withRefund(ErrOmniChatGenerationUnavailable)
		}
		return nil, withRefund(fmt.Errorf("%w: enqueue generation", ErrOmniChatGenerationUnavailable))
	}
	return job, nil
}

// markQueueFailure uses a short independent context so a client disconnect
// cannot leave a just-created job queued after enqueueing has already failed.
// The detail is intentionally static: provider and infrastructure errors may
// include credentials, signed URLs, or topology and must not be persisted with
// a user-visible job.
func (s *OmniChatGenerationService) markQueueFailure(ctx context.Context, jobID uuid.UUID) error {
	if s == nil || s.store == nil {
		return ErrOmniChatGenerationUnavailable
	}
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
	defer cancel()
	_, err := s.store.MarkGenerationJobFailed(cleanupCtx, jobID, "queue_unavailable", "generation could not be queued")
	return err
}

func omniChatSceneIsEmpty(scene models.OmniChatSceneState) bool {
	return scene.Location == "" && scene.TimeOfDay == "" && scene.Weather == "" &&
		scene.Lighting == "" && scene.Activity == "" && scene.Outfit == "" &&
		scene.Pose == "" && scene.Expression == "" && scene.Mood == "" &&
		scene.CameraDirection == "" && len(scene.OtherCharacters) == 0 && len(scene.RecentEvents) == 0
}
