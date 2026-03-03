package repository

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Querier is the minimal interface satisfied by both *pgxpool.Pool and pgx.Tx.
// Repositories that embed TxRepository use Q() instead of r.pool directly so
// that they can participate in a caller-managed transaction without any other
// changes to their method bodies.
type Querier interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// TxRepository is a base struct that concrete adapters can embed to gain
// transparent transaction support via the Q() helper.
type TxRepository struct {
	Pool *pgxpool.Pool
	Tx   pgx.Tx
}

// Q returns the active transaction if one has been set; otherwise it returns
// the underlying connection pool.
func (r *TxRepository) Q() Querier {
	if r.Tx != nil {
		return r.Tx
	}
	return r.Pool
}
