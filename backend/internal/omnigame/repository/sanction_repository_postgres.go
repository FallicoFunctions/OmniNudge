package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresSanctionRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresSanctionRepository(pool *pgxpool.Pool) *PostgresSanctionRepository {
	return &PostgresSanctionRepository{pool: pool}
}

func (r *PostgresSanctionRepository) IsBootstrapBlocked(ctx context.Context, token, networkHash string) (bool, error) {
	networkHash = normalizeNetworkHash(networkHash)
	var blocked bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM omnirave_guest_sanctions
			WHERE (bootstrap_id = $1 OR ($2 <> '' AND ip_hash = $2))
			  AND (expires_at IS NULL OR expires_at > now())
		)
	`, token, networkHash).Scan(&blocked)
	return blocked, err
}

func (r *PostgresSanctionRepository) BlockBootstrap(ctx context.Context, token, ipHash, action string, expiresAt time.Time) error {
	ipHash = normalizeNetworkHash(ipHash)
	_, err := r.pool.Exec(ctx, `
		INSERT INTO omnirave_guest_sanctions (bootstrap_id, ip_hash, action, expires_at)
		VALUES ($1, NULLIF($2, ''), $3, $4)
	`, token, ipHash, action, expiresAt)
	return err
}
