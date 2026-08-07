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

// OmniChatGenerationSourceReader is optional for backwards-compatible store
// implementations. The SQL repository implements it so a request that was
// accepted before a client disconnect cannot create a second provider job when
// the command is retried after idempotency completion is uncertain.
type OmniChatGenerationSourceReader interface {
	GetGenerationJobForSourceMessageOwned(context.Context, int, int) (*models.OmniChatGenerationJob, error)
}

type OmniChatGenerationEnqueuer interface {
	EnqueueOmniChatGeneration(ctx context.Context, id uuid.UUID) error
}

type OmniChatGenerationBilling interface {
	ReserveOwned(context.Context, int, uuid.UUID, string) (*models.OmniCreditsUsageReservation, error)
	RefundOwned(context.Context, int, uuid.UUID) error
}

// OmniChatGenerationMessageWriter persists the user's slash-command turn.
// Keeping this behind a small interface makes the media service responsible
// for the same request-idempotent durable turn that normal chat sends use.
type OmniChatGenerationMessageWriter interface {
	CreateUserTurnWithRequestID(context.Context, int, string, uuid.UUID) (*models.BotMessage, bool, error)
}

type OmniChatGenerationConversationWriter interface {
	UpdateLastMessageAt(context.Context, int) error
}

// OmniChatGenerationService authorizes every reference before a job is
// created. The queue payload contains only the opaque job UUID, never prompts
// or storage paths.
type OmniChatGenerationService struct {
	personas           OmniChatGenerationPersonaReader
	conversations      OmniChatGenerationConversationReader
	store              OmniChatGenerationStore
	enqueuer           OmniChatGenerationEnqueuer
	messages           OmniChatGenerationMessageWriter
	conversationWriter OmniChatGenerationConversationWriter
	provider           string
	billing            OmniChatGenerationBilling
	moderator          OmniChatMediaPromptModerator
}

func (s *OmniChatGenerationService) SetBilling(billing OmniChatGenerationBilling) *OmniChatGenerationService {
	s.billing = billing
	return s
}

// SetPromptModerator installs the pre-provider safety classifier. Leaving it
// unset skips moderation, which keeps local development and tests runnable
// without an OpenRouter credential.
func (s *OmniChatGenerationService) SetPromptModerator(moderator OmniChatMediaPromptModerator) *OmniChatGenerationService {
	s.moderator = moderator
	return s
}

func (s *OmniChatGenerationService) SetMessageWriter(writer OmniChatGenerationMessageWriter) *OmniChatGenerationService {
	s.messages = writer
	return s
}

func (s *OmniChatGenerationService) SetConversationWriter(writer OmniChatGenerationConversationWriter) *OmniChatGenerationService {
	s.conversationWriter = writer
	return s
}

// CreateConversationMediaCommand persists a direct /photo or /video command
// and queues its media job without sending the command through the language
// model. The user turn is request-idempotent and the generated asset is linked
// to that turn by SourceMessageID, so the same command is durable in both the
// conversation and persona gallery.
func (s *OmniChatGenerationService) CreateConversationMediaCommand(
	ctx context.Context,
	ownerUserID, conversationID int,
	input models.OmniChatMediaCommandRequest,
) (*models.OmniChatGenerationJob, *models.BotMessage, error) {
	if ownerUserID <= 0 || conversationID <= 0 || input.RequestID == uuid.Nil {
		return nil, nil, ErrOmniChatGenerationResourceNotFound
	}
	if s.messages == nil {
		return nil, nil, ErrOmniChatGenerationUnavailable
	}
	if s.personas == nil || s.conversations == nil || s.store == nil || !strings.EqualFold(strings.TrimSpace(s.provider), "runpod") {
		return nil, nil, ErrOmniChatGenerationUnavailable
	}

	conversation, err := s.conversations.GetByID(ctx, conversationID, ownerUserID)
	if err != nil {
		return nil, nil, fmt.Errorf("get media command conversation: %w", err)
	}
	if conversation == nil {
		return nil, nil, ErrOmniChatGenerationResourceNotFound
	}
	persona, err := s.personas.GetAccessibleByID(ctx, conversation.PersonaID, &ownerUserID)
	if err != nil {
		return nil, nil, fmt.Errorf("get media command persona: %w", err)
	}
	if persona == nil {
		return nil, nil, ErrOmniChatGenerationResourceNotFound
	}

	generationRequest := models.OmniChatGenerationRequest{
		// The command endpoint owns the request-idempotency record. The inner
		// generation job must not complete that record with a job-only payload;
		// the handler completes it atomically with the persisted command message.
		RequestID:       uuid.Nil,
		Kind:            input.Kind,
		Mode:            models.OmniChatGenerationModeCreate,
		PersonaID:       conversation.PersonaID,
		ConversationID:  &conversationID,
		Prompt:          input.Prompt,
		AspectRatio:     input.AspectRatio,
		DurationSeconds: input.DurationSeconds,
	}
	if _, err := NormalizeOmniChatGenerationRequest(generationRequest); err != nil {
		return nil, nil, err
	}

	commandContent := mediaCommandContent(input.Kind, input.Prompt)
	message, reused, err := s.messages.CreateUserTurnWithRequestID(ctx, conversationID, commandContent, input.RequestID)
	if err != nil {
		return nil, nil, fmt.Errorf("persist media command: %w", err)
	}
	if reused {
		if sourceReader, ok := s.store.(OmniChatGenerationSourceReader); ok {
			existingJob, readErr := sourceReader.GetGenerationJobForSourceMessageOwned(ctx, ownerUserID, message.ID)
			if readErr != nil {
				return nil, message, fmt.Errorf("load existing media command job: %w", readErr)
			}
			if existingJob != nil && existingJob.Status != models.OmniChatGenerationStatusFailed && existingJob.Status != models.OmniChatGenerationStatusCancelled {
				message.RequestID = &input.RequestID
				return existingJob, message, nil
			}
		}
	}
	if s.conversationWriter != nil {
		if err := s.conversationWriter.UpdateLastMessageAt(ctx, conversationID); err != nil {
			return nil, message, fmt.Errorf("update media command conversation: %w", err)
		}
	}
	generationRequest.SourceMessageID = &message.ID
	generationRequest.BillingOperationID = DeriveOmniChatRequestBillingOperationID(ownerUserID, "media_generation", input.RequestID)
	job, err := s.CreateGeneration(ctx, ownerUserID, generationRequest)
	if err != nil {
		return nil, message, err
	}
	message.RequestID = &input.RequestID
	return job, message, nil
}

func mediaCommandContent(kind models.OmniChatMediaKind, prompt string) string {
	command := "/photo"
	if kind == models.OmniChatMediaKindVideo {
		command = "/video"
	}
	return command + " " + strings.TrimSpace(prompt)
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
	if s.personas == nil || s.store == nil || !strings.EqualFold(strings.TrimSpace(s.provider), "runpod") {
		return nil, ErrOmniChatGenerationUnavailable
	}
	// Discard caller-supplied values for the server-owned scene fields before
	// anything reads them. They are resolved below from tracked conversation
	// state and the persona record, and must not be settable from a request:
	// SubjectAppearance is injected verbatim into the image prompt and would
	// otherwise override the persona's own description.
	stripServerOwnedSceneFields(&input.Scene)

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
	// Classify before reserving credits, so a rejected request never bills.
	if err := moderateGenerationPrompt(ctx, s.moderator, normalized); err != nil {
		return nil, err
	}
	billingRequired := true
	var billingOperationID uuid.UUID
	if normalized.Kind == models.OmniChatMediaKindImage || normalized.Kind == models.OmniChatMediaKindVideo {
		if s.billing == nil {
			return nil, ErrOmniChatPaidFeatureRequired
		}
		usageKind := models.OmniCreditsUsageImage
		if normalized.Kind == models.OmniChatMediaKindVideo {
			usageKind = models.OmniCreditsUsageVideo
		}
		billingOperationID = uuid.New()
		if normalized.BillingOperationID != nil && *normalized.BillingOperationID != uuid.Nil {
			billingOperationID = *normalized.BillingOperationID
		}
		reservation, reserveErr := s.billing.ReserveOwned(ctx, ownerUserID, billingOperationID, usageKind)
		if reserveErr != nil {
			if normalized.BillingOperationID != nil && errors.Is(reserveErr, models.ErrOmniCreditsReservationRefunded) {
				// A failed attempt may have already refunded its stable operation.
				// Reservation records are immutable, so a retry uses a fresh,
				// server-created operation after that confirmed closure.
				billingOperationID = uuid.New()
				reservation, reserveErr = s.billing.ReserveOwned(ctx, ownerUserID, billingOperationID, usageKind)
			}
			if reserveErr != nil {
				if errors.Is(reserveErr, models.ErrOmniCreditsInsufficient) {
					return nil, ErrOmniChatPaidFeatureRequired
				}
				return nil, fmt.Errorf("reserve generation credits: %w", reserveErr)
			}
		}
		if reservation == nil {
			return nil, errors.New("reserve generation credits: billing returned no reservation")
		}
		if reservation.AdminBypass {
			billingRequired = false
			billingOperationID = uuid.Nil
			normalized.BillingOperationID = nil
		} else {
			normalized.BillingOperationID = &billingOperationID
		}
	}
	normalized.BillingRequired = &billingRequired
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

// stripServerOwnedSceneFields clears the scene fields the server derives.
// They carry JSON tags because the same struct is persisted and sent to the
// provider, so a request body can populate them; only this scrub keeps that
// from being authoritative.
func stripServerOwnedSceneFields(scene *models.OmniChatSceneState) {
	if scene == nil {
		return
	}
	scene.SubjectAppearance = ""
	scene.ViewerPosition = ""
	scene.IncludeUserBody = false
}
