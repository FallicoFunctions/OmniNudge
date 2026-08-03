package services

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
)

func ParseOmniChatBillingOffers(raw string) ([]OmniChatBillingOffer, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []OmniChatBillingOffer{}, nil
	}
	var offers []OmniChatBillingOffer
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&offers); err != nil {
		return nil, fmt.Errorf("omnichat billing: decode offers: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return nil, errors.New("omnichat billing: offers contain trailing data")
	}
	validator := NewOmniChatBillingService(nil, nil)
	if err := validator.ConfigureOffers(offers); err != nil {
		return nil, err
	}
	return offers, nil
}

var (
	ErrOmniChatPaidFeatureRequired = errors.New("omnichat: paid feature requires OmniCredits")
	ErrOmniChatGuestFeatureDenied  = errors.New("omnichat: feature requires an account")
)

type OmniChatBillingCredits interface {
	GetWallet(context.Context, int) (*models.OmniCreditsWallet, error)
	ListUsageOwned(context.Context, int, int) ([]models.OmniCreditsUsageEntry, error)
	ReserveUsage(context.Context, int, uuid.UUID, string, int64) (*models.OmniCreditsUsageReservation, error)
	CaptureUsage(context.Context, int, uuid.UUID) (*models.OmniCreditsUsageReservation, error)
	RefundUsage(context.Context, int, uuid.UUID) (*models.OmniCreditsUsageReservation, error)
	CreditPurchased(context.Context, int, uuid.UUID, int64) (*models.OmniCreditsWallet, error)
	GrantSubscription(context.Context, int, uuid.UUID, int64, time.Time) (*models.OmniCreditsWallet, error)
}

type OmniChatBillingOffer struct {
	ID         string `json:"id"`
	Kind       string `json:"kind"`
	Credits    int64  `json:"credits,omitempty"`
	PriceCents int64  `json:"price_cents"`
	Currency   string `json:"currency"`
	Plan       string `json:"plan,omitempty"`
	PeriodDays int    `json:"period_days,omitempty"`
}

type OmniChatCheckoutStore interface {
	CreateOrGet(context.Context, models.OmniChatCheckoutSession) (*models.OmniChatCheckoutSession, error)
	BindProvider(context.Context, uuid.UUID, int, string, string) error
	ActivateConfirmed(context.Context, models.OmniChatConfirmedBillingEvent) error
}

type OmniChatProviderCheckoutRequest struct {
	CheckoutID uuid.UUID
	UserID     int
	Offer      OmniChatBillingOffer
}

type OmniChatProviderCheckoutResult struct {
	Provider  string
	SessionID string
	URL       string
}

type OmniChatProviderCheckoutAdapter interface {
	CreateCheckout(context.Context, OmniChatProviderCheckoutRequest) (*OmniChatProviderCheckoutResult, error)
}

// OmniChatCheckoutService persists the server-authoritative offer snapshot
// before invoking a provider. Provider retries receive the same CheckoutID.
type OmniChatCheckoutService struct {
	store   OmniChatCheckoutStore
	adapter OmniChatProviderCheckoutAdapter
}

func NewOmniChatCheckoutService(store OmniChatCheckoutStore, adapter OmniChatProviderCheckoutAdapter) *OmniChatCheckoutService {
	return &OmniChatCheckoutService{store: store, adapter: adapter}
}

func (s *OmniChatCheckoutService) CreateCheckout(ctx context.Context, userID int, idempotencyID uuid.UUID, offer OmniChatBillingOffer) (string, error) {
	if s == nil || s.store == nil || s.adapter == nil {
		return "", errors.New("omnichat billing: checkout adapter unavailable")
	}
	session := models.OmniChatCheckoutSession{
		UserID: userID, ClientIdempotencyID: idempotencyID, OfferID: offer.ID,
		OfferKind: offer.Kind, ExpectedPriceCents: offer.PriceCents,
		Currency: offer.Currency, Credits: offer.Credits,
	}
	if offer.Plan != "" {
		plan := offer.Plan
		session.Plan = &plan
	}
	if offer.PeriodDays > 0 {
		periodDays := offer.PeriodDays
		session.PeriodDays = &periodDays
	}
	persisted, err := s.store.CreateOrGet(ctx, session)
	if err != nil {
		if errors.Is(err, models.ErrOmniChatCheckoutConflict) {
			return "", models.ErrOmniCreditsConflict
		}
		return "", err
	}
	result, err := s.adapter.CreateCheckout(ctx, OmniChatProviderCheckoutRequest{
		CheckoutID: persisted.ID, UserID: userID, Offer: offer,
	})
	if err != nil {
		return "", err
	}
	if result == nil || strings.TrimSpace(result.Provider) == "" || strings.TrimSpace(result.SessionID) == "" {
		return "", errors.New("omnichat billing: provider returned an invalid checkout")
	}
	checkoutURL, err := url.Parse(result.URL)
	if err != nil || checkoutURL.Scheme != "https" || checkoutURL.Host == "" || checkoutURL.User != nil {
		return "", errors.New("omnichat billing: provider returned an unsafe checkout URL")
	}
	if err := s.store.BindProvider(ctx, persisted.ID, userID, result.Provider, result.SessionID); err != nil {
		return "", err
	}
	return checkoutURL.String(), nil
}

type OmniChatVerifiedBillingEvent struct {
	Provider          string
	EventID           string
	ProviderSessionID string
	AmountCents       int64
	Currency          string
	Confirmed         bool
}

type OmniChatBillingEventVerifier interface {
	Verify(context.Context, []byte, string) (*OmniChatVerifiedBillingEvent, error)
}

type OmniChatBillingWebhookService struct {
	store    OmniChatCheckoutStore
	verifier OmniChatBillingEventVerifier
}

func NewOmniChatBillingWebhookService(store OmniChatCheckoutStore, verifier OmniChatBillingEventVerifier) *OmniChatBillingWebhookService {
	return &OmniChatBillingWebhookService{store: store, verifier: verifier}
}

// Handle verifies the raw signed payload before any parsed field is trusted.
// No runtime verifier is configured until a concrete payment vendor is chosen.
func (s *OmniChatBillingWebhookService) Handle(ctx context.Context, payload []byte, signature string) error {
	if s == nil || s.store == nil || s.verifier == nil {
		return errors.New("omnichat billing: webhook verifier unavailable")
	}
	if len(payload) == 0 || len(payload) > 1<<20 || strings.TrimSpace(signature) == "" {
		return errors.New("omnichat billing: invalid webhook")
	}
	event, err := s.verifier.Verify(ctx, payload, signature)
	if err != nil {
		return fmt.Errorf("omnichat billing: verify webhook: %w", err)
	}
	if event == nil || !event.Confirmed || event.Provider == "" || event.EventID == "" ||
		event.ProviderSessionID == "" || event.AmountCents <= 0 || event.Currency == "" {
		return errors.New("omnichat billing: unconfirmed or invalid webhook")
	}
	digest := sha256.Sum256(payload)
	return s.store.ActivateConfirmed(ctx, models.OmniChatConfirmedBillingEvent{
		Provider: event.Provider, EventID: event.EventID,
		ProviderSessionID: event.ProviderSessionID,
		AmountCents:       event.AmountCents, Currency: strings.ToUpper(event.Currency),
		PayloadSHA256: fmt.Sprintf("%x", digest),
	})
}

const OmniChatBillingUnitPerSession = "per_session"

func (s *OmniChatBillingService) Catalog() []OmniChatBillingOffer {
	return append([]OmniChatBillingOffer(nil), s.offers...)
}

func (s *OmniChatBillingService) UsageCosts() map[string]int64 {
	return map[string]int64{
		models.OmniCreditsUsageChat:  s.costs[models.OmniCreditsUsageChat],
		models.OmniCreditsUsageVoice: s.costs[models.OmniCreditsUsageVoice],
		models.OmniCreditsUsageImage: s.costs[models.OmniCreditsUsageImage],
		models.OmniCreditsUsageVideo: s.costs[models.OmniCreditsUsageVideo],
	}
}

func (s *OmniChatBillingService) UsageHistoryOwned(ctx context.Context, userID, limit int) ([]models.OmniCreditsUsageEntry, error) {
	if s == nil || s.credits == nil {
		return nil, errors.New("omnichat billing: usage unavailable")
	}
	return s.credits.ListUsageOwned(ctx, userID, limit)
}

func (s *OmniChatBillingService) FindOffer(id string) (OmniChatBillingOffer, bool) {
	for _, offer := range s.Catalog() {
		if offer.ID == id {
			return offer, true
		}
	}
	return OmniChatBillingOffer{}, false
}

func (s *OmniChatBillingService) WalletOwned(ctx context.Context, userID int) (*models.OmniCreditsWallet, error) {
	if s == nil || s.credits == nil || userID <= 0 {
		return nil, errors.New("omnichat billing: wallet unavailable")
	}
	return s.credits.GetWallet(ctx, userID)
}

func (s *OmniChatBillingService) CanReserveVideoOwned(ctx context.Context, userID int) (bool, int64, error) {
	wallet, err := s.WalletOwned(ctx, userID)
	if err != nil {
		return false, 0, err
	}
	cost := s.costs[models.OmniCreditsUsageVideo]
	return wallet.PurchasedBalance+wallet.SubscriptionBalance >= cost, cost, nil
}

// Purchase and subscription providers verify money externally; only a
// confirmed, provider-signed event may invoke these server-side grants.
type OmniChatCreditPurchaseGranter interface {
	CreditPurchased(context.Context, int, uuid.UUID, int64) (*models.OmniCreditsWallet, error)
}
type OmniChatSubscriptionGranter interface {
	GrantSubscription(context.Context, int, uuid.UUID, int64, time.Time) (*models.OmniCreditsWallet, error)
}

type OmniChatConfirmedSubscription struct {
	ProviderEventID uuid.UUID
	UserID          int
	Plan            string
	Months          int
	Credits         int64
}

// OmniChatSubscriptionActivationStore is the checkout adapter's atomic,
// idempotent boundary. Its implementation must update the plan and append the
// subscription credit grant in one transaction keyed by ProviderEventID.
type OmniChatSubscriptionActivationStore interface {
	ActivateConfirmedSubscription(context.Context, OmniChatConfirmedSubscription) error
}

type OmniChatSubscriptionActivationService struct {
	store OmniChatSubscriptionActivationStore
}

func NewOmniChatSubscriptionActivationService(store OmniChatSubscriptionActivationStore) *OmniChatSubscriptionActivationService {
	return &OmniChatSubscriptionActivationService{store: store}
}
func (s *OmniChatSubscriptionActivationService) Activate(ctx context.Context, event OmniChatConfirmedSubscription) error {
	if s == nil || s.store == nil {
		return errors.New("omnichat billing: subscription activation adapter unavailable")
	}
	if event.ProviderEventID == uuid.Nil || event.UserID <= 0 || (event.Plan != models.PlanPlus && event.Plan != "premium") || event.Months < 1 || event.Months > 24 || event.Credits <= 0 {
		return errors.New("omnichat billing: invalid confirmed subscription")
	}
	return s.store.ActivateConfirmedSubscription(ctx, event)
}

type OmniChatBillingService struct {
	credits OmniChatBillingCredits
	plans   OmniChatPlanReader
	costs   map[string]int64
	offers  []OmniChatBillingOffer
}

func NewOmniChatBillingService(credits OmniChatBillingCredits, plans OmniChatPlanReader) *OmniChatBillingService {
	return &OmniChatBillingService{credits: credits, plans: plans, costs: map[string]int64{
		models.OmniCreditsUsageChat: 1, models.OmniCreditsUsageVoice: 2, models.OmniCreditsUsageImage: 10, models.OmniCreditsUsageVideo: 40,
	}}
}

func (s *OmniChatBillingService) ConfigureOffers(offers []OmniChatBillingOffer) error {
	seen := map[string]bool{}
	for _, offer := range offers {
		valid := offer.ID != "" && !seen[offer.ID] && offer.PriceCents > 0 && offer.Currency == "USD"
		switch offer.Kind {
		case "credits":
			valid = valid && offer.Credits > 0 && offer.Plan == "" && offer.PeriodDays == 0
		case "subscription":
			valid = valid && (offer.Plan == models.PlanPlus || offer.Plan == "premium") && offer.Credits > 0 && offer.PeriodDays > 0
		default:
			valid = false
		}
		if !valid {
			return errors.New("omnichat billing: invalid configured offer")
		}
		seen[offer.ID] = true
	}
	s.offers = append([]OmniChatBillingOffer(nil), offers...)
	return nil
}

// Included reports server-owned entitlements. Guests can chat through the
// rolling allowance; active subscriptions include chat and voice. Image and
// video always require a durable credit reservation.
func (s *OmniChatBillingService) Included(ctx context.Context, userID *int, usageKind string) (bool, error) {
	if userID == nil {
		if usageKind == models.OmniCreditsUsageChat {
			return true, nil
		}
		return false, ErrOmniChatGuestFeatureDenied
	}
	if *userID <= 0 || s.plans == nil {
		return false, errors.New("omnichat billing: plan lookup unavailable")
	}
	if usageKind == models.OmniCreditsUsageImage || usageKind == models.OmniCreditsUsageVideo {
		return false, nil
	}
	plan, expiresAt, err := s.plans.GetPlan(ctx, *userID)
	if err != nil {
		return false, err
	}
	active := (plan == models.PlanPlus || plan == "premium") && (expiresAt == nil || expiresAt.After(time.Now()))
	return usageKind == models.OmniCreditsUsageChat || (usageKind == models.OmniCreditsUsageVoice && active), nil
}

func (s *OmniChatBillingService) ReserveOwned(ctx context.Context, userID int, operationID uuid.UUID, usageKind string) (*models.OmniCreditsUsageReservation, error) {
	cost, ok := s.costs[usageKind]
	if !ok || s.credits == nil {
		return nil, fmt.Errorf("omnichat billing: unsupported usage kind")
	}
	return s.credits.ReserveUsage(ctx, userID, operationID, usageKind, cost)
}

// ReserveChatMultiplierOwned prices a server-resolved premium profile from
// the configured base chat cost. Only positive bounded catalog multipliers are
// accepted so callers cannot accidentally create a free or overflowing hold.
func (s *OmniChatBillingService) ReserveChatMultiplierOwned(ctx context.Context, userID int, operationID uuid.UUID, multiplier int64) (*models.OmniCreditsUsageReservation, error) {
	baseCost, ok := s.costs[models.OmniCreditsUsageChat]
	if !ok || s.credits == nil || multiplier < 1 || multiplier > 100 || baseCost > (1<<63-1)/multiplier {
		return nil, fmt.Errorf("omnichat billing: invalid chat multiplier")
	}
	return s.credits.ReserveUsage(ctx, userID, operationID, models.OmniCreditsUsageChat, baseCost*multiplier)
}

func (s *OmniChatBillingService) CaptureOwned(ctx context.Context, userID int, operationID uuid.UUID) error {
	_, err := s.credits.CaptureUsage(ctx, userID, operationID)
	return err
}
func (s *OmniChatBillingService) RefundOwned(ctx context.Context, userID int, operationID uuid.UUID) error {
	_, err := s.credits.RefundUsage(ctx, userID, operationID)
	return err
}
