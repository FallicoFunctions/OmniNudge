package services

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TxFunc is a function executed inside a database transaction.
type TxFunc func(ctx context.Context, tx pgx.Tx) error

// WithTransaction runs fn inside a single database transaction.
// If fn returns a non-nil error the transaction is rolled back automatically;
// otherwise it is committed.
//
// Example:
//
//	err := services.WithTransaction(ctx, pool, func(ctx context.Context, tx pgx.Tx) error {
//	    if err := postRepo.WithTx(tx).Create(ctx, post); err != nil {
//	        return err
//	    }
//	    return userRepo.WithTx(tx).IncrementPostCount(ctx, authorID)
//	})
func WithTransaction(ctx context.Context, pool *pgxpool.Pool, fn TxFunc) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx) // safe to call after a successful Commit

	if err := fn(ctx, tx); err != nil {
		return err // Rollback runs in defer
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}

	return nil
}
