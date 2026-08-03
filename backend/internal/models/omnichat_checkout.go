package models

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrOmniChatCheckoutNotFound = errors.New("omnichat checkout not found")
	ErrOmniChatCheckoutConflict = errors.New("omnichat checkout conflict")
)

type OmniChatCheckoutSession struct {
	ID                  uuid.UUID
	UserID              int
	ClientIdempotencyID uuid.UUID
	OfferID             string
	OfferKind           string
	ExpectedPriceCents  int64
	Currency            string
	Credits             int64
	Plan                *string
	PeriodDays          *int
	Provider            *string
	ProviderSessionID   *string
	Status              string
}

type OmniChatConfirmedBillingEvent struct {
	Provider          string
	EventID           string
	ProviderSessionID string
	AmountCents       int64
	Currency          string
	PayloadSHA256     string
}

type OmniChatCheckoutRepository struct{ pool *pgxpool.Pool }

func NewOmniChatCheckoutRepository(pool *pgxpool.Pool) *OmniChatCheckoutRepository {
	return &OmniChatCheckoutRepository{pool: pool}
}

func (r *OmniChatCheckoutRepository) CreateOrGet(ctx context.Context, requested OmniChatCheckoutSession) (*OmniChatCheckoutSession, error) {
	if r == nil || r.pool == nil || requested.UserID <= 0 || requested.ClientIdempotencyID == uuid.Nil ||
		requested.OfferID == "" || requested.ExpectedPriceCents <= 0 || requested.Credits <= 0 {
		return nil, ErrOmniChatCheckoutConflict
	}
	id := uuid.New()
	_, err := r.pool.Exec(ctx, `
		INSERT INTO omnichat_checkout_sessions(
			id,user_id,client_idempotency_id,offer_id,offer_kind,
			expected_price_cents,currency,credits,plan,period_days
		) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		ON CONFLICT(user_id,client_idempotency_id) DO NOTHING
	`, id, requested.UserID, requested.ClientIdempotencyID, requested.OfferID,
		requested.OfferKind, requested.ExpectedPriceCents, requested.Currency,
		requested.Credits, requested.Plan, requested.PeriodDays)
	if err != nil {
		return nil, fmt.Errorf("create checkout session: %w", err)
	}
	session, err := r.getByClientKey(ctx, requested.UserID, requested.ClientIdempotencyID)
	if err != nil {
		return nil, err
	}
	if session.OfferID != requested.OfferID || session.OfferKind != requested.OfferKind ||
		session.ExpectedPriceCents != requested.ExpectedPriceCents || session.Currency != requested.Currency ||
		session.Credits != requested.Credits || !sameOptionalString(session.Plan, requested.Plan) ||
		!sameOptionalInt(session.PeriodDays, requested.PeriodDays) {
		return nil, ErrOmniChatCheckoutConflict
	}
	return session, nil
}

func (r *OmniChatCheckoutRepository) BindProvider(ctx context.Context, checkoutID uuid.UUID, userID int, provider, providerSessionID string) error {
	provider = strings.TrimSpace(provider)
	providerSessionID = strings.TrimSpace(providerSessionID)
	if checkoutID == uuid.Nil || userID <= 0 || provider == "" || providerSessionID == "" ||
		len(provider) > 64 || len(providerSessionID) > 255 {
		return ErrOmniChatCheckoutConflict
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE omnichat_checkout_sessions
		SET provider=$3,provider_session_id=$4,status='provider_created',updated_at=NOW()
		WHERE id=$1 AND user_id=$2
		  AND status IN ('created','provider_created')
		  AND (provider IS NULL OR provider=$3)
		  AND (provider_session_id IS NULL OR provider_session_id=$4)
	`, checkoutID, userID, provider, providerSessionID)
	if err != nil {
		return fmt.Errorf("bind checkout provider: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return ErrOmniChatCheckoutConflict
	}
	return nil
}

func (r *OmniChatCheckoutRepository) ActivateConfirmed(ctx context.Context, event OmniChatConfirmedBillingEvent) error {
	if r == nil || r.pool == nil || event.Provider == "" || event.EventID == "" ||
		event.ProviderSessionID == "" || event.AmountCents <= 0 || len(event.PayloadSHA256) != 64 {
		return ErrOmniChatCheckoutConflict
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var existingCheckoutID uuid.UUID
	var existingHash string
	err = tx.QueryRow(ctx, `
		SELECT checkout_id,payload_sha256
		FROM omnichat_billing_events
		WHERE provider=$1 AND event_id=$2
	`, event.Provider, event.EventID).Scan(&existingCheckoutID, &existingHash)
	if err == nil {
		var checkoutID uuid.UUID
		err = tx.QueryRow(ctx, `
			SELECT id FROM omnichat_checkout_sessions
			WHERE provider=$1 AND provider_session_id=$2
		`, event.Provider, event.ProviderSessionID).Scan(&checkoutID)
		if err != nil || checkoutID != existingCheckoutID || existingHash != event.PayloadSHA256 {
			return ErrOmniChatCheckoutConflict
		}
		return tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	var session OmniChatCheckoutSession
	err = tx.QueryRow(ctx, `
		SELECT id,user_id,offer_kind,expected_price_cents,currency,credits,plan,period_days,status
		FROM omnichat_checkout_sessions
		WHERE provider=$1 AND provider_session_id=$2
		FOR UPDATE
	`, event.Provider, event.ProviderSessionID).Scan(
		&session.ID, &session.UserID, &session.OfferKind, &session.ExpectedPriceCents,
		&session.Currency, &session.Credits, &session.Plan, &session.PeriodDays, &session.Status,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrOmniChatCheckoutNotFound
	}
	if err != nil {
		return err
	}
	if session.ExpectedPriceCents != event.AmountCents || session.Currency != strings.ToUpper(event.Currency) {
		return ErrOmniChatCheckoutConflict
	}
	if _, err = tx.Exec(ctx, `
		INSERT INTO omnichat_billing_events(provider,event_id,checkout_id,payload_sha256)
		VALUES($1,$2,$3,$4)
	`, event.Provider, event.EventID, session.ID, event.PayloadSHA256); err != nil {
		return err
	}
	if session.Status == "fulfilled" {
		return tx.Commit(ctx)
	}
	if session.Status != "provider_created" {
		return ErrOmniChatCheckoutConflict
	}

	wallet, err := lockWallet(ctx, tx, session.UserID)
	if err != nil {
		return err
	}
	switch session.OfferKind {
	case "credits":
		if _, err = tx.Exec(ctx, `
			INSERT INTO omnicredits_ledger(
				user_id,operation_id,entry_type,purchased_delta
			) VALUES($1,$2,$3,$4)
		`, session.UserID, session.ID, OmniCreditsEntryPurchase, session.Credits); err != nil {
			return err
		}
		wallet.PurchasedBalance += session.Credits
	case "subscription":
		if session.Plan == nil || session.PeriodDays == nil || *session.PeriodDays <= 0 {
			return ErrOmniChatCheckoutConflict
		}
		now := time.Now()
		if _, err = expireSubscriptionBalance(ctx, tx, wallet, now); err != nil {
			return err
		}
		if wallet.subscriptionEpoch == nil {
			epoch := session.ID
			wallet.subscriptionEpoch = &epoch
		}
		var effectiveExpiry time.Time
		err = tx.QueryRow(ctx, `
			UPDATE users
			SET plan=$2,
			    plan_expires_at=GREATEST(COALESCE(plan_expires_at,NOW()),NOW())
			        + make_interval(days => $3)
			WHERE id=$1
			RETURNING plan_expires_at
		`, session.UserID, *session.Plan, *session.PeriodDays).Scan(&effectiveExpiry)
		if err != nil {
			return err
		}
		if wallet.SubscriptionExpiresAt != nil && wallet.SubscriptionExpiresAt.After(effectiveExpiry) {
			effectiveExpiry = *wallet.SubscriptionExpiresAt
		}
		if _, err = tx.Exec(ctx, `
			INSERT INTO omnicredits_ledger(
				user_id,operation_id,entry_type,subscription_delta,
				subscription_requested_expires_at,subscription_expires_at
			) VALUES($1,$2,$3,$4,$5,$5)
		`, session.UserID, session.ID, OmniCreditsEntrySubscriptionGrant,
			session.Credits, effectiveExpiry); err != nil {
			return err
		}
		wallet.SubscriptionBalance += session.Credits
		wallet.SubscriptionExpiresAt = &effectiveExpiry
	default:
		return ErrOmniChatCheckoutConflict
	}
	if err = saveWallet(ctx, tx, wallet); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `
		UPDATE omnichat_checkout_sessions
		SET status='fulfilled',fulfilled_at=NOW(),updated_at=NOW()
		WHERE id=$1 AND status='provider_created'
	`, session.ID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrOmniChatCheckoutConflict
	}
	return tx.Commit(ctx)
}

func (r *OmniChatCheckoutRepository) getByClientKey(ctx context.Context, userID int, idempotencyID uuid.UUID) (*OmniChatCheckoutSession, error) {
	var session OmniChatCheckoutSession
	err := r.pool.QueryRow(ctx, `
		SELECT id,user_id,client_idempotency_id,offer_id,offer_kind,
		       expected_price_cents,currency,credits,plan,period_days,
		       provider,provider_session_id,status
		FROM omnichat_checkout_sessions
		WHERE user_id=$1 AND client_idempotency_id=$2
	`, userID, idempotencyID).Scan(
		&session.ID, &session.UserID, &session.ClientIdempotencyID, &session.OfferID,
		&session.OfferKind, &session.ExpectedPriceCents, &session.Currency,
		&session.Credits, &session.Plan, &session.PeriodDays, &session.Provider,
		&session.ProviderSessionID, &session.Status,
	)
	if err != nil {
		return nil, err
	}
	return &session, nil
}

func sameOptionalString(a, b *string) bool {
	return (a == nil && b == nil) || (a != nil && b != nil && *a == *b)
}

func sameOptionalInt(a, b *int) bool {
	return (a == nil && b == nil) || (a != nil && b != nil && *a == *b)
}
