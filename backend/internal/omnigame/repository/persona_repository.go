package repository

import (
	"context"
	"errors"
	"sync"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
)

// AdmissiblePersona is the whole of what admission needs to know about a
// character: which one it is, and what to call it in the world. Nothing about
// its prompt, its owner or its card belongs on the way into a world.
type AdmissiblePersona struct {
	ID   int64
	Name string
}

type PersonaRepository interface {
	// FindAdmissiblePersona returns nil, nil when the persona exists but may
	// not be admitted. The caller cannot tell that case from "no such persona",
	// and deliberately so: a caller holding an admission credential for one
	// character must not be able to probe the table for others.
	FindAdmissiblePersona(ctx context.Context, personaID int64) (*AdmissiblePersona, error)
}

type PostgresPersonaRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresPersonaRepository(pool *pgxpool.Pool) *PostgresPersonaRepository {
	return &PostgresPersonaRepository{pool: pool}
}

func (r *PostgresPersonaRepository) FindAdmissiblePersona(ctx context.Context, personaID int64) (*AdmissiblePersona, error) {
	if personaID <= 0 {
		return nil, nil
	}

	var persona AdmissiblePersona
	err := r.pool.QueryRow(ctx, `
		SELECT p.id, p.name
		FROM bot_personas p
		WHERE `+models.AdmissiblePersonaPredicate, personaID).Scan(&persona.ID, &persona.Name)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &persona, nil
}

// InMemoryPersonaRepository holds only personas that have already been judged
// admissible, so an empty one admits nothing. That is the useful default: a
// service started without a database refuses every admission rather than
// waving them through.
type InMemoryPersonaRepository struct {
	mu       sync.RWMutex
	personas map[int64]AdmissiblePersona
}

func NewInMemoryPersonaRepository() *InMemoryPersonaRepository {
	return &InMemoryPersonaRepository{personas: make(map[int64]AdmissiblePersona)}
}

func (r *InMemoryPersonaRepository) Add(persona AdmissiblePersona) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.personas[persona.ID] = persona
}

func (r *InMemoryPersonaRepository) FindAdmissiblePersona(_ context.Context, personaID int64) (*AdmissiblePersona, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	persona, ok := r.personas[personaID]
	if !ok {
		return nil, nil
	}
	found := persona
	return &found, nil
}
