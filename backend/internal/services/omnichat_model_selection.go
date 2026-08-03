package services

import (
	"context"
	"errors"
	"strings"
	"time"
)

const (
	OmniChatModelScopeThisChat = "this_chat"
	OmniChatModelScopeAllChats = "all_chats"
)

var (
	ErrInvalidOmniChatModelSelection = errors.New("invalid omnichat model selection")
	ErrOmniChatModelUpgradeRequired  = errors.New("omnichat model requires an upgrade")
)

type OmniChatModelSelectionStore interface {
	GetModelSelection(ctx context.Context, userID, conversationID int) (string, *string, error)
	SetConversationModel(ctx context.Context, userID, conversationID int, key string) error
	SetAllChatsModel(ctx context.Context, userID int, key string) error
}

type OmniChatModelSelection struct {
	AccountTier       OmniChatModelTier `json:"account_tier"`
	DefaultModelKey   string            `json:"default_model_key"`
	ConversationModel *string           `json:"conversation_model_key,omitempty"`
	EffectiveModelKey string            `json:"effective_model_key"`
}

type OmniChatModelSelectionService struct {
	plans OmniChatPlanReader
	store OmniChatModelSelectionStore
}

func NewOmniChatModelSelectionService(plans OmniChatPlanReader, store OmniChatModelSelectionStore) *OmniChatModelSelectionService {
	return &OmniChatModelSelectionService{plans: plans, store: store}
}

func (s *OmniChatModelSelectionService) Get(ctx context.Context, userID, conversationID int) (*OmniChatModelSelection, error) {
	entitlement, err := s.accountTier(ctx, userID)
	if err != nil {
		return nil, err
	}
	defaultKey, overrideKey, err := s.store.GetModelSelection(ctx, userID, conversationID)
	if err != nil {
		return nil, err
	}
	effectiveKey := defaultKey
	if overrideKey != nil {
		effectiveKey = *overrideKey
	}
	_, allowed := ResolveOmniChatModelProfile(OmniChatModelProfileKey(effectiveKey), entitlement)
	if !allowed {
		effectiveKey = string(OmniChatModelProfileStandard)
	}
	return &OmniChatModelSelection{
		AccountTier:       entitlement,
		DefaultModelKey:   defaultKey,
		ConversationModel: overrideKey,
		EffectiveModelKey: effectiveKey,
	}, nil
}

func (s *OmniChatModelSelectionService) Set(ctx context.Context, userID, conversationID int, modelKey, scope string) (*OmniChatModelSelection, error) {
	key := strings.ToLower(strings.TrimSpace(modelKey))
	profile, found := FindOmniChatModelProfile(OmniChatModelProfileKey(key))
	if !found {
		return nil, ErrInvalidOmniChatModelSelection
	}
	if scope != OmniChatModelScopeThisChat && scope != OmniChatModelScopeAllChats {
		return nil, ErrInvalidOmniChatModelSelection
	}
	entitlement, err := s.accountTier(ctx, userID)
	if err != nil {
		return nil, err
	}
	if omniChatModelTierRank(profile.RequiredTier) > omniChatModelTierRank(entitlement) {
		return nil, ErrOmniChatModelUpgradeRequired
	}
	selection, err := s.Get(ctx, userID, conversationID)
	if err != nil {
		return nil, err
	}
	if scope == OmniChatModelScopeThisChat {
		if err := s.store.SetConversationModel(ctx, userID, conversationID, key); err != nil {
			return nil, err
		}
		selection.ConversationModel = &key
		selection.EffectiveModelKey = key
		return selection, nil
	}
	if err := s.store.SetAllChatsModel(ctx, userID, key); err != nil {
		return nil, err
	}
	selection.DefaultModelKey = key
	selection.ConversationModel = nil
	selection.EffectiveModelKey = key
	return selection, nil
}

func (s *OmniChatModelSelectionService) accountTier(ctx context.Context, userID int) (OmniChatModelTier, error) {
	plan, expiresAt, err := s.plans.GetPlan(ctx, userID)
	if err != nil {
		return OmniChatModelTierFree, err
	}
	if expiresAt != nil && !expiresAt.After(time.Now()) {
		return OmniChatModelTierFree, nil
	}
	return modelTierForStoredPlan(plan), nil
}
