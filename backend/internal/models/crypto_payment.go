package models

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Plan constants
const (
	PlanFree = "free"
	PlanPlus = "plus"
)

// Coin constants
const (
	CoinBTC = "BTC"
	CoinETH = "ETH"
	CoinCAH = "CAH"
)

// Payment status constants
const (
	StatusPending      = "pending"
	StatusConfirmed    = "confirmed"
	StatusFailed       = "failed"
	StatusInsufficient = "insufficient"
)

// CryptoPayment records a user's submitted crypto transaction and its
// verification state. A payment starts as pending and transitions to
// confirmed (plan upgraded), insufficient (amount too low), or failed
// (invalid tx / wrong recipient).
type CryptoPayment struct {
	ID                   int64
	UserID               int
	TXID                 string
	Coin                 string
	USDPriceAtSubmit     float64
	AmountReceived       float64
	USDValue             float64
	PlanMonths           int
	Status               string
	Confirmations        int
	CreatedAt            time.Time
	ConfirmedAt          *time.Time
	EntitlementAppliedAt *time.Time
}

// ConfirmAndApplyPlan atomically claims a confirmed payment and extends the
// user's plan exactly once. It is safe across handler/worker races and multiple
// application replicas.
func (r *CryptoPaymentRepository) ConfirmAndApplyPlan(ctx context.Context, id int64, confirmations int, confirmedAt time.Time) (bool, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var userID, months int
	var status string
	var appliedAt *time.Time
	err = tx.QueryRow(ctx, `
		SELECT user_id,plan_months,status,entitlement_applied_at
		FROM crypto_payments
		WHERE id=$1
		FOR UPDATE
	`, id).Scan(&userID, &months, &status, &appliedAt)
	if err != nil {
		return false, fmt.Errorf("claim crypto payment: %w", err)
	}
	if appliedAt != nil {
		return false, tx.Commit(ctx)
	}
	if status != StatusPending && status != StatusConfirmed {
		return false, fmt.Errorf("crypto payment cannot be confirmed from status %q", status)
	}
	if months < 1 || months > 24 {
		return false, errors.New("crypto payment has invalid plan duration")
	}
	tag, err := tx.Exec(ctx, `
		UPDATE users
		SET plan=$2,
		    plan_expires_at=GREATEST(COALESCE(plan_expires_at, NOW()), NOW())
		        + make_interval(days => $3 * 30)
		WHERE id=$1
	`, userID, PlanPlus, months)
	if err != nil {
		return false, fmt.Errorf("apply crypto payment entitlement: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return false, fmt.Errorf("crypto payment user not found: %d", userID)
	}
	_, err = tx.Exec(ctx, `
		UPDATE crypto_payments
		SET status=$2,confirmations=$3,confirmed_at=$4,entitlement_applied_at=$4
		WHERE id=$1
	`, id, StatusConfirmed, confirmations, confirmedAt)
	if err != nil {
		return false, fmt.Errorf("record crypto payment entitlement: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

// CryptoPaymentRepository handles all database operations for crypto payments.
type CryptoPaymentRepository struct {
	pool *pgxpool.Pool
}

// NewCryptoPaymentRepository creates a new CryptoPaymentRepository.
func NewCryptoPaymentRepository(pool *pgxpool.Pool) *CryptoPaymentRepository {
	return &CryptoPaymentRepository{pool: pool}
}

// Create inserts a new pending payment and returns its generated ID.
// Returns an error if the txid+coin combination already exists.
func (r *CryptoPaymentRepository) Create(ctx context.Context, p *CryptoPayment) (int64, error) {
	query := `
		INSERT INTO crypto_payments
		  (user_id, txid, coin, usd_price_at_submit, amount_received, usd_value, plan_months, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
		RETURNING id, created_at
	`
	err := r.pool.QueryRow(ctx, query,
		p.UserID, p.TXID, p.Coin,
		p.USDPriceAtSubmit, p.AmountReceived, p.USDValue,
		p.PlanMonths,
	).Scan(&p.ID, &p.CreatedAt)
	if err != nil {
		return 0, fmt.Errorf("create crypto payment: %w", err)
	}
	return p.ID, nil
}

// GetByTXID returns the payment with the given txid and coin.
// Returns an error if not found.
func (r *CryptoPaymentRepository) GetByTXID(ctx context.Context, txid, coin string) (*CryptoPayment, error) {
	query := `
		SELECT id, user_id, txid, coin, usd_price_at_submit, amount_received, usd_value,
		       plan_months, status, confirmations, created_at, confirmed_at
		FROM crypto_payments
		WHERE txid = $1 AND coin = $2
	`
	p := &CryptoPayment{}
	err := r.pool.QueryRow(ctx, query, txid, coin).Scan(
		&p.ID, &p.UserID, &p.TXID, &p.Coin,
		&p.USDPriceAtSubmit, &p.AmountReceived, &p.USDValue,
		&p.PlanMonths, &p.Status, &p.Confirmations,
		&p.CreatedAt, &p.ConfirmedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("payment not found: txid=%s coin=%s", txid, coin)
		}
		return nil, fmt.Errorf("get crypto payment by txid: %w", err)
	}
	return p, nil
}

// ListPending returns all payments with status='pending', oldest first.
// The worker polls this to check for new confirmations.
func (r *CryptoPaymentRepository) ListPending(ctx context.Context) ([]*CryptoPayment, error) {
	query := `
		SELECT id, user_id, txid, coin, usd_price_at_submit, amount_received, usd_value,
		       plan_months, status, confirmations, created_at, confirmed_at
		FROM crypto_payments
		WHERE status = 'pending'
		ORDER BY created_at ASC
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list pending payments: %w", err)
	}
	defer rows.Close()

	var payments []*CryptoPayment
	for rows.Next() {
		p := &CryptoPayment{}
		if err := rows.Scan(
			&p.ID, &p.UserID, &p.TXID, &p.Coin,
			&p.USDPriceAtSubmit, &p.AmountReceived, &p.USDValue,
			&p.PlanMonths, &p.Status, &p.Confirmations,
			&p.CreatedAt, &p.ConfirmedAt,
		); err != nil {
			return nil, fmt.Errorf("scan pending payment: %w", err)
		}
		payments = append(payments, p)
	}
	return payments, rows.Err()
}

// UpdateStatus sets the status, confirmation count, and optionally the
// confirmed_at timestamp for a payment.
func (r *CryptoPaymentRepository) UpdateStatus(ctx context.Context, id int64, status string, confirmations int, confirmedAt *time.Time) error {
	query := `
		UPDATE crypto_payments
		SET status = $2, confirmations = $3, confirmed_at = $4
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query, id, status, confirmations, confirmedAt)
	if err != nil {
		return fmt.Errorf("update crypto payment status: %w", err)
	}
	return nil
}
