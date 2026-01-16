package repository

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
)

type HubWikiRepository struct {
	pool *pgxpool.Pool
}

func NewHubWikiRepository(pool *pgxpool.Pool) *HubWikiRepository {
	return &HubWikiRepository{pool: pool}
}

func (r *HubWikiRepository) GetByHubIDAndSlug(ctx context.Context, hubID int, slug string) (*models.HubWikiPage, error) {
	query := `
		SELECT id, hub_id, slug, content, created_at, updated_at, updated_by
		FROM hub_wiki_pages
		WHERE hub_id = $1 AND slug = $2
	`
	var page models.HubWikiPage
	err := r.pool.QueryRow(ctx, query, hubID, slug).Scan(
		&page.ID,
		&page.HubID,
		&page.Slug,
		&page.Content,
		&page.CreatedAt,
		&page.UpdatedAt,
		&page.UpdatedBy,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, pgx.ErrNoRows
		}
		return nil, err
	}
	page.Exists = true
	return &page, nil
}

func (r *HubWikiRepository) Upsert(ctx context.Context, hubID int, slug string, content string, updatedBy *int) (*models.HubWikiPage, error) {
	query := `
		INSERT INTO hub_wiki_pages (hub_id, slug, content, updated_by)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (hub_id, slug)
		DO UPDATE SET content = EXCLUDED.content,
		              updated_by = EXCLUDED.updated_by,
		              updated_at = CURRENT_TIMESTAMP
		RETURNING id, hub_id, slug, content, created_at, updated_at, updated_by
	`
	var page models.HubWikiPage
	err := r.pool.QueryRow(ctx, query, hubID, slug, content, updatedBy).Scan(
		&page.ID,
		&page.HubID,
		&page.Slug,
		&page.Content,
		&page.CreatedAt,
		&page.UpdatedAt,
		&page.UpdatedBy,
	)
	if err != nil {
		return nil, err
	}
	page.Exists = true
	return &page, nil
}
