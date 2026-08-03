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
	ErrOmniCreditsInsufficient        = errors.New("omnicredits: insufficient balance")
	ErrOmniCreditsConflict            = errors.New("omnicredits: idempotency key conflicts with prior operation")
	ErrOmniCreditsReservationNotFound = errors.New("omnicredits: reservation not found")
	ErrOmniCreditsReservationRefunded = errors.New("omnicredits: reservation was refunded")
)

const (
	OmniCreditsEntryPurchase           = "purchase"
	OmniCreditsEntrySubscriptionGrant  = "subscription_grant"
	OmniCreditsEntrySubscriptionExpiry = "subscription_expiry"
	OmniCreditsEntryUsageDebit         = "usage_debit"
	OmniCreditsEntryUsageRefund        = "usage_refund"
)

const (
	OmniCreditsUsageChat  = "chat"
	OmniCreditsUsageVoice = "voice"
	OmniCreditsUsageImage = "image"
	OmniCreditsUsageVideo = "video"

	OmniCreditsReservationReserved = "reserved"
	OmniCreditsReservationCaptured = "captured"
	OmniCreditsReservationRefunded = "refunded"
)

// OmniCreditsWallet contains only server-calculated balances. It must never
// be populated from a client request.
type OmniCreditsWallet struct {
	UserID                int        `json:"user_id"`
	PurchasedBalance      int64      `json:"purchased_balance"`
	SubscriptionBalance   int64      `json:"subscription_balance"`
	TotalBalance          int64      `json:"total_balance"`
	SubscriptionExpiresAt *time.Time `json:"subscription_expires_at,omitempty"`
	UpdatedAt             time.Time  `json:"updated_at"`
	subscriptionEpoch     *uuid.UUID
}

// OmniCreditsAuthorization is the result of one idempotent metered-use debit.
type OmniCreditsAuthorization struct {
	OperationID         uuid.UUID
	UsageKind           string
	Cost                int64
	PurchasedDebited    int64
	SubscriptionDebited int64
	Wallet              *OmniCreditsWallet
	AlreadyAuthorized   bool
}

type OmniCreditsUsageReservation struct {
	UserID              int
	OperationID         uuid.UUID
	UsageKind           string
	Cost                int64
	PurchasedDebited    int64
	SubscriptionDebited int64
	SubscriptionEpoch   *uuid.UUID
	Status              string
	AlreadyApplied      bool
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

type OmniCreditsUsageEntry struct {
	ID                int64     `json:"id"`
	EntryType         string    `json:"entry_type"`
	UsageKind         *string   `json:"usage_kind,omitempty"`
	PurchasedDelta    int64     `json:"purchased_delta"`
	SubscriptionDelta int64     `json:"subscription_delta"`
	CreatedAt         time.Time `json:"created_at"`
}

// OmniCreditsRepository owns balance mutations. All methods lock the wallet
// row and append a matching ledger entry in the same database transaction.
type OmniCreditsRepository struct{ pool *pgxpool.Pool }

func NewOmniCreditsRepository(pool *pgxpool.Pool) *OmniCreditsRepository {
	return &OmniCreditsRepository{pool: pool}
}

func (r *OmniCreditsRepository) GetWallet(ctx context.Context, userID int) (*OmniCreditsWallet, error) {
	if userID <= 0 {
		return nil, fmt.Errorf("omnicredits: invalid user id")
	}
	wallet := &OmniCreditsWallet{}
	err := r.pool.QueryRow(ctx, `
		SELECT user_id, purchased_balance, subscription_balance, subscription_expires_at, updated_at, subscription_epoch
		FROM omnicredits_wallets WHERE user_id=$1`, userID).Scan(
		&wallet.UserID, &wallet.PurchasedBalance, &wallet.SubscriptionBalance, &wallet.SubscriptionExpiresAt, &wallet.UpdatedAt, &wallet.subscriptionEpoch)
	if errors.Is(err, pgx.ErrNoRows) {
		return &OmniCreditsWallet{UserID: userID}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("omnicredits: get wallet: %w", err)
	}
	if wallet.SubscriptionExpiresAt != nil && !wallet.SubscriptionExpiresAt.After(time.Now()) {
		// Do not make an expired grant look spendable to a caller that merely
		// renders a balance. AuthorizeUsage records the matching expiry ledger
		// entry before it allows any future debit.
		wallet.SubscriptionBalance = 0
	}
	wallet.TotalBalance = wallet.PurchasedBalance + wallet.SubscriptionBalance
	return wallet, nil
}

func (r *OmniCreditsRepository) ListUsageOwned(ctx context.Context, userID, limit int) ([]OmniCreditsUsageEntry, error) {
	if r == nil || r.pool == nil || userID <= 0 {
		return nil, errors.New("omnicredits: invalid usage owner")
	}
	if limit < 1 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	rows, err := r.pool.Query(ctx, `SELECT id,entry_type,usage_kind,purchased_delta,subscription_delta,created_at FROM omnicredits_ledger WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]OmniCreditsUsageEntry, 0, limit)
	for rows.Next() {
		var item OmniCreditsUsageEntry
		if err := rows.Scan(&item.ID, &item.EntryType, &item.UsageKind, &item.PurchasedDelta, &item.SubscriptionDelta, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// CreditPurchased records a non-expiring credit purchase. Checkout/webhook
// code can call this later with its own durable server-generated operation ID.
func (r *OmniCreditsRepository) CreditPurchased(ctx context.Context, userID int, operationID uuid.UUID, amount int64) (*OmniCreditsWallet, error) {
	if amount <= 0 {
		return nil, fmt.Errorf("omnicredits: purchase amount must be positive")
	}
	return r.credit(ctx, userID, operationID, amount, 0, nil, OmniCreditsEntryPurchase)
}

// GrantSubscription records an expiring grant. A later expiry extends the
// active bucket; an earlier out-of-order grant never shortens it. Credits from
// an already expired bucket are journaled as expired before a new grant lands.
func (r *OmniCreditsRepository) GrantSubscription(ctx context.Context, userID int, operationID uuid.UUID, amount int64, expiresAt time.Time) (*OmniCreditsWallet, error) {
	if amount <= 0 || expiresAt.IsZero() {
		return nil, fmt.Errorf("omnicredits: invalid subscription grant")
	}
	return r.credit(ctx, userID, operationID, 0, amount, &expiresAt, OmniCreditsEntrySubscriptionGrant)
}

func (r *OmniCreditsRepository) credit(ctx context.Context, userID int, operationID uuid.UUID, purchased, subscription int64, expiresAt *time.Time, entryType string) (_ *OmniCreditsWallet, err error) {
	if userID <= 0 || operationID == uuid.Nil {
		return nil, fmt.Errorf("omnicredits: invalid credit operation")
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("omnicredits: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	wallet, err := lockWallet(ctx, tx, userID)
	if err != nil {
		return nil, err
	}
	var existingType string
	var existingPurchased, existingSubscription int64
	var existingRequestedExpiry *time.Time
	err = tx.QueryRow(ctx, `SELECT entry_type, purchased_delta, subscription_delta, subscription_requested_expires_at FROM omnicredits_ledger WHERE user_id=$1 AND operation_id=$2`, userID, operationID).Scan(&existingType, &existingPurchased, &existingSubscription, &existingRequestedExpiry)
	if err == nil {
		if existingType != entryType || existingPurchased != purchased || existingSubscription != subscription || !sameOptionalTime(existingRequestedExpiry, expiresAt) {
			return nil, ErrOmniCreditsConflict
		}
		if err = tx.Commit(ctx); err != nil {
			return nil, err
		}
		return walletForRead(wallet, time.Now()), nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("omnicredits: find operation: %w", err)
	}
	if entryType == OmniCreditsEntrySubscriptionGrant {
		if _, err = expireSubscriptionBalance(ctx, tx, wallet, time.Now()); err != nil {
			return nil, err
		}
		if wallet.subscriptionEpoch == nil {
			epoch := operationID
			wallet.subscriptionEpoch = &epoch
		}
	}
	effectiveExpiry := expiresAt
	if entryType == OmniCreditsEntrySubscriptionGrant && wallet.SubscriptionExpiresAt != nil && wallet.SubscriptionExpiresAt.After(*expiresAt) {
		effectiveExpiry = wallet.SubscriptionExpiresAt
	}
	if _, err = tx.Exec(ctx, `INSERT INTO omnicredits_ledger(user_id,operation_id,entry_type,purchased_delta,subscription_delta,subscription_requested_expires_at,subscription_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)`, userID, operationID, entryType, purchased, subscription, expiresAt, effectiveExpiry); err != nil {
		return nil, fmt.Errorf("omnicredits: append credit ledger: %w", err)
	}
	if effectiveExpiry != nil {
		wallet.SubscriptionExpiresAt = effectiveExpiry
	}
	wallet.PurchasedBalance += purchased
	wallet.SubscriptionBalance += subscription
	if err = saveWallet(ctx, tx, wallet); err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("omnicredits: commit credit: %w", err)
	}
	return walletForRead(wallet, time.Now()), nil
}

// AuthorizeUsage atomically checks and debits the owner wallet. Subscription
// grants are spent first and purchased credits second. Retrying the same
// server-generated operation ID returns the original authorization without a
// second debit.
func (r *OmniCreditsRepository) AuthorizeUsage(ctx context.Context, userID int, operationID uuid.UUID, usageKind string, cost int64) (_ *OmniCreditsAuthorization, err error) {
	usageKind = strings.TrimSpace(usageKind)
	if userID <= 0 || operationID == uuid.Nil || cost <= 0 || usageKind == "" || len(usageKind) > 64 {
		return nil, fmt.Errorf("omnicredits: invalid usage authorization")
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("omnicredits: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	wallet, err := lockWallet(ctx, tx, userID)
	if err != nil {
		return nil, err
	}
	var previousKind *string
	var purchasedDelta, subscriptionDelta int64
	err = tx.QueryRow(ctx, `SELECT usage_kind,purchased_delta,subscription_delta FROM omnicredits_ledger WHERE user_id=$1 AND operation_id=$2`, userID, operationID).Scan(&previousKind, &purchasedDelta, &subscriptionDelta)
	if err == nil {
		if previousKind == nil || *previousKind != usageKind || -purchasedDelta-subscriptionDelta != cost {
			return nil, ErrOmniCreditsConflict
		}
		if err = tx.Commit(ctx); err != nil {
			return nil, err
		}
		return &OmniCreditsAuthorization{OperationID: operationID, UsageKind: usageKind, Cost: cost, PurchasedDebited: -purchasedDelta, SubscriptionDebited: -subscriptionDelta, Wallet: walletForRead(wallet, time.Now()), AlreadyAuthorized: true}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("omnicredits: find usage operation: %w", err)
	}
	expiredGrant, err := expireSubscriptionBalance(ctx, tx, wallet, time.Now())
	if err != nil {
		return nil, err
	}
	if wallet.PurchasedBalance+wallet.SubscriptionBalance < cost {
		// Expiration is itself an immutable balance event. Commit it even when
		// the requested usage cannot be authorized, otherwise every failed
		// request would repeatedly observe credits that have already expired.
		if expiredGrant {
			if err = saveWallet(ctx, tx, wallet); err != nil {
				return nil, err
			}
			if err = tx.Commit(ctx); err != nil {
				return nil, fmt.Errorf("omnicredits: commit expiry: %w", err)
			}
		}
		return nil, ErrOmniCreditsInsufficient
	}
	subscriptionDebit := minInt64(cost, wallet.SubscriptionBalance)
	purchasedDebit := cost - subscriptionDebit
	if _, err = tx.Exec(ctx, `INSERT INTO omnicredits_ledger(user_id,operation_id,entry_type,usage_kind,purchased_delta,subscription_delta) VALUES($1,$2,$3,$4,$5,$6)`, userID, operationID, OmniCreditsEntryUsageDebit, usageKind, -purchasedDebit, -subscriptionDebit); err != nil {
		return nil, fmt.Errorf("omnicredits: append debit ledger: %w", err)
	}
	wallet.PurchasedBalance -= purchasedDebit
	wallet.SubscriptionBalance -= subscriptionDebit
	if err = saveWallet(ctx, tx, wallet); err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("omnicredits: commit usage: %w", err)
	}
	return &OmniCreditsAuthorization{OperationID: operationID, UsageKind: usageKind, Cost: cost, PurchasedDebited: purchasedDebit, SubscriptionDebited: subscriptionDebit, Wallet: wallet}, nil
}

// ReserveUsage atomically holds credits before a provider-side operation.
// Retrying the same owner/operation/kind/cost returns the original hold.
func (r *OmniCreditsRepository) ReserveUsage(ctx context.Context, userID int, operationID uuid.UUID, usageKind string, cost int64) (_ *OmniCreditsUsageReservation, err error) {
	usageKind = strings.TrimSpace(usageKind)
	if r == nil || r.pool == nil || userID <= 0 || operationID == uuid.Nil || cost <= 0 || usageKind == "" || len(usageKind) > 64 {
		return nil, fmt.Errorf("omnicredits: invalid usage reservation")
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("omnicredits: begin reservation: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	wallet, err := lockWallet(ctx, tx, userID)
	if err != nil {
		return nil, err
	}
	existing, err := getUsageReservation(ctx, tx, userID, operationID, true)
	if err == nil {
		if existing.UsageKind != usageKind || existing.Cost != cost {
			return nil, ErrOmniCreditsConflict
		}
		if existing.Status == OmniCreditsReservationRefunded {
			return nil, fmt.Errorf("%w: %w", ErrOmniCreditsConflict, ErrOmniCreditsReservationRefunded)
		}
		existing.AlreadyApplied = true
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	var ledgerExists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM omnicredits_ledger WHERE user_id=$1 AND operation_id=$2)`, userID, operationID).Scan(&ledgerExists); err != nil {
		return nil, err
	}
	if ledgerExists {
		return nil, ErrOmniCreditsConflict
	}
	expiredGrant, err := expireSubscriptionBalance(ctx, tx, wallet, time.Now())
	if err != nil {
		return nil, err
	}
	if wallet.PurchasedBalance+wallet.SubscriptionBalance < cost {
		// An expired grant is an immutable ledger event even when the new
		// reservation cannot be funded. Committing it here keeps the stored
		// wallet in sync with GetWallet's read-time view and prevents every
		// denied provider request from revisiting the same stale grant.
		if expiredGrant {
			if err = saveWallet(ctx, tx, wallet); err != nil {
				return nil, err
			}
			if err = tx.Commit(ctx); err != nil {
				return nil, fmt.Errorf("omnicredits: commit reservation expiry: %w", err)
			}
		}
		return nil, ErrOmniCreditsInsufficient
	}
	subscriptionDebit := minInt64(cost, wallet.SubscriptionBalance)
	purchasedDebit := cost - subscriptionDebit
	if _, err = tx.Exec(ctx, `INSERT INTO omnicredits_ledger(user_id,operation_id,entry_type,usage_kind,purchased_delta,subscription_delta) VALUES($1,$2,$3,$4,$5,$6)`, userID, operationID, OmniCreditsEntryUsageDebit, usageKind, -purchasedDebit, -subscriptionDebit); err != nil {
		return nil, fmt.Errorf("omnicredits: append reservation debit: %w", err)
	}
	reservation := &OmniCreditsUsageReservation{
		UserID: userID, OperationID: operationID, UsageKind: usageKind, Cost: cost,
		PurchasedDebited: purchasedDebit, SubscriptionDebited: subscriptionDebit,
		Status: OmniCreditsReservationReserved,
	}
	if subscriptionDebit > 0 {
		reservation.SubscriptionEpoch = wallet.subscriptionEpoch
	}
	if err = tx.QueryRow(ctx, `INSERT INTO omnicredits_usage_reservations(user_id,operation_id,usage_kind,cost,purchased_debited,subscription_debited,subscription_epoch,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING created_at,updated_at`, userID, operationID, usageKind, cost, purchasedDebit, subscriptionDebit, reservation.SubscriptionEpoch, reservation.Status).Scan(&reservation.CreatedAt, &reservation.UpdatedAt); err != nil {
		return nil, fmt.Errorf("omnicredits: persist reservation: %w", err)
	}
	wallet.PurchasedBalance -= purchasedDebit
	wallet.SubscriptionBalance -= subscriptionDebit
	if err = saveWallet(ctx, tx, wallet); err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return reservation, nil
}

func (r *OmniCreditsRepository) CaptureUsage(ctx context.Context, userID int, operationID uuid.UUID) (*OmniCreditsUsageReservation, error) {
	return r.transitionUsage(ctx, userID, operationID, true)
}

func (r *OmniCreditsRepository) RefundUsage(ctx context.Context, userID int, operationID uuid.UUID) (*OmniCreditsUsageReservation, error) {
	return r.transitionUsage(ctx, userID, operationID, false)
}

func (r *OmniCreditsRepository) transitionUsage(ctx context.Context, userID int, operationID uuid.UUID, capture bool) (_ *OmniCreditsUsageReservation, err error) {
	if r == nil || r.pool == nil || userID <= 0 || operationID == uuid.Nil {
		return nil, ErrOmniCreditsReservationNotFound
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	reservation, err := getUsageReservation(ctx, tx, userID, operationID, true)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrOmniCreditsReservationNotFound
	}
	if err != nil {
		return nil, err
	}
	target := OmniCreditsReservationRefunded
	if capture {
		target = OmniCreditsReservationCaptured
	}
	if reservation.Status == target {
		reservation.AlreadyApplied = true
		_ = tx.Commit(ctx)
		return reservation, nil
	}
	if reservation.Status == OmniCreditsReservationRefunded || (capture && reservation.Status != OmniCreditsReservationReserved) {
		return nil, ErrOmniCreditsConflict
	}
	if capture {
		if err = tx.QueryRow(ctx, `UPDATE omnicredits_usage_reservations SET status='captured',updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND operation_id=$2 RETURNING updated_at`, userID, operationID).Scan(&reservation.UpdatedAt); err != nil {
			return nil, err
		}
		reservation.Status = target
	} else {
		wallet, err := lockWallet(ctx, tx, userID)
		if err != nil {
			return nil, err
		}
		_, err = expireSubscriptionBalance(ctx, tx, wallet, time.Now())
		if err != nil {
			return nil, err
		}
		subscriptionRefund := reservation.SubscriptionDebited
		if wallet.SubscriptionExpiresAt == nil || !wallet.SubscriptionExpiresAt.After(time.Now()) ||
			wallet.subscriptionEpoch == nil || reservation.SubscriptionEpoch == nil ||
			*wallet.subscriptionEpoch != *reservation.SubscriptionEpoch {
			subscriptionRefund = 0
		}
		refundID := uuid.New()
		if reservation.PurchasedDebited+subscriptionRefund > 0 {
			if _, err = tx.Exec(ctx, `INSERT INTO omnicredits_ledger(user_id,operation_id,entry_type,usage_kind,purchased_delta,subscription_delta) VALUES($1,$2,$3,$4,$5,$6)`, userID, refundID, OmniCreditsEntryUsageRefund, reservation.UsageKind, reservation.PurchasedDebited, subscriptionRefund); err != nil {
				return nil, err
			}
		}
		wallet.PurchasedBalance += reservation.PurchasedDebited
		wallet.SubscriptionBalance += subscriptionRefund
		if err = saveWallet(ctx, tx, wallet); err != nil {
			return nil, err
		}
		if err = tx.QueryRow(ctx, `UPDATE omnicredits_usage_reservations SET status='refunded',refund_operation_id=$3,updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND operation_id=$2 RETURNING updated_at`, userID, operationID, refundID).Scan(&reservation.UpdatedAt); err != nil {
			return nil, err
		}
		reservation.Status = target
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return reservation, nil
}

func getUsageReservation(ctx context.Context, tx pgx.Tx, userID int, operationID uuid.UUID, lock bool) (*OmniCreditsUsageReservation, error) {
	query := `SELECT user_id,operation_id,usage_kind,cost,purchased_debited,subscription_debited,subscription_epoch,status,created_at,updated_at FROM omnicredits_usage_reservations WHERE user_id=$1 AND operation_id=$2`
	if lock {
		query += ` FOR UPDATE`
	}
	item := &OmniCreditsUsageReservation{}
	err := tx.QueryRow(ctx, query, userID, operationID).Scan(&item.UserID, &item.OperationID, &item.UsageKind, &item.Cost, &item.PurchasedDebited, &item.SubscriptionDebited, &item.SubscriptionEpoch, &item.Status, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}

func lockWallet(ctx context.Context, tx pgx.Tx, userID int) (*OmniCreditsWallet, error) {
	if _, err := tx.Exec(ctx, `INSERT INTO omnicredits_wallets(user_id) VALUES($1) ON CONFLICT (user_id) DO NOTHING`, userID); err != nil {
		return nil, fmt.Errorf("omnicredits: ensure wallet: %w", err)
	}
	w := &OmniCreditsWallet{}
	err := tx.QueryRow(ctx, `SELECT user_id,purchased_balance,subscription_balance,subscription_expires_at,updated_at,subscription_epoch FROM omnicredits_wallets WHERE user_id=$1 FOR UPDATE`, userID).Scan(&w.UserID, &w.PurchasedBalance, &w.SubscriptionBalance, &w.SubscriptionExpiresAt, &w.UpdatedAt, &w.subscriptionEpoch)
	if err != nil {
		return nil, fmt.Errorf("omnicredits: lock wallet: %w", err)
	}
	return w, nil
}
func saveWallet(ctx context.Context, tx pgx.Tx, w *OmniCreditsWallet) error {
	err := tx.QueryRow(ctx, `UPDATE omnicredits_wallets SET purchased_balance=$2,subscription_balance=$3,subscription_expires_at=$4,subscription_epoch=$5,updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 RETURNING updated_at`, w.UserID, w.PurchasedBalance, w.SubscriptionBalance, w.SubscriptionExpiresAt, w.subscriptionEpoch).Scan(&w.UpdatedAt)
	w.TotalBalance = w.PurchasedBalance + w.SubscriptionBalance
	return err
}
func minInt64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

func sameOptionalTime(a, b *time.Time) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return a.Equal(*b)
}

func expireSubscriptionBalance(ctx context.Context, tx pgx.Tx, wallet *OmniCreditsWallet, now time.Time) (bool, error) {
	if wallet.SubscriptionExpiresAt == nil || wallet.SubscriptionExpiresAt.After(now) {
		return false, nil
	}
	expired := wallet.SubscriptionBalance
	if expired > 0 {
		if _, err := tx.Exec(ctx, `INSERT INTO omnicredits_ledger(user_id,operation_id,entry_type,subscription_delta) VALUES($1,$2,$3,$4)`, wallet.UserID, uuid.New(), OmniCreditsEntrySubscriptionExpiry, -expired); err != nil {
			return false, fmt.Errorf("omnicredits: append expiry ledger: %w", err)
		}
	}
	wallet.SubscriptionBalance = 0
	wallet.SubscriptionExpiresAt = nil
	wallet.subscriptionEpoch = nil
	return true, nil
}

func walletForRead(wallet *OmniCreditsWallet, now time.Time) *OmniCreditsWallet {
	if wallet == nil {
		return nil
	}
	visible := *wallet
	if visible.SubscriptionExpiresAt != nil && !visible.SubscriptionExpiresAt.After(now) {
		visible.SubscriptionBalance = 0
	}
	visible.TotalBalance = visible.PurchasedBalance + visible.SubscriptionBalance
	return &visible
}
