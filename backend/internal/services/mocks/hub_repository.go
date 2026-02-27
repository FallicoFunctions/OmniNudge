package mocks

import (
	"context"
	"strings"
	"time"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/ports"
)

// Compile-time check.
var _ ports.HubRepository = (*HubRepository)(nil)

// HubRepository is an in-memory mock of ports.HubRepository.
type HubRepository struct {
	hubs   map[int]*domain.Hub
	nextID int

	// Optional overrides — set in test cases to inject specific behaviour.
	CreateFunc   func(ctx context.Context, h *domain.Hub) error
	GetByNameFunc func(ctx context.Context, name string) (*domain.Hub, error)
	GetByIDFunc  func(ctx context.Context, id int) (*domain.Hub, error)
}

// NewHubRepository returns an empty HubRepository mock.
func NewHubRepository() *HubRepository {
	return &HubRepository{
		hubs:   make(map[int]*domain.Hub),
		nextID: 1,
	}
}

func (m *HubRepository) Create(ctx context.Context, h *domain.Hub) error {
	if m.CreateFunc != nil {
		return m.CreateFunc(ctx, h)
	}
	h.ID = m.nextID
	m.nextID++
	h.CreatedAt = time.Now()
	if h.Type == "" {
		h.Type = "public"
	}
	if h.ContentOptions == "" {
		h.ContentOptions = "any"
	}
	copy := *h
	m.hubs[copy.ID] = &copy
	return nil
}

func (m *HubRepository) GetByName(ctx context.Context, name string) (*domain.Hub, error) {
	if m.GetByNameFunc != nil {
		return m.GetByNameFunc(ctx, name)
	}
	lower := strings.ToLower(name)
	for _, h := range m.hubs {
		if strings.ToLower(h.Name) == lower {
			copy := *h
			return &copy, nil
		}
	}
	return nil, nil
}

func (m *HubRepository) GetByID(ctx context.Context, id int) (*domain.Hub, error) {
	if m.GetByIDFunc != nil {
		return m.GetByIDFunc(ctx, id)
	}
	h := m.hubs[id]
	if h == nil {
		return nil, nil
	}
	copy := *h
	return &copy, nil
}

func (m *HubRepository) List(_ context.Context, limit, offset int, includeNsfw bool) ([]*domain.Hub, error) {
	var out []*domain.Hub
	for _, h := range m.hubs {
		if !includeNsfw && h.NSFW {
			continue
		}
		copy := *h
		out = append(out, &copy)
	}
	return out, nil
}

func (m *HubRepository) ListAgentTargets(_ context.Context) ([]*domain.HubTarget, error) {
	return nil, nil
}

func (m *HubRepository) ListByPrefix(_ context.Context, prefix string, limit, offset int, includeNsfw bool) ([]*domain.Hub, error) {
	lower := strings.ToLower(prefix)
	var out []*domain.Hub
	for _, h := range m.hubs {
		if !includeNsfw && h.NSFW {
			continue
		}
		if strings.HasPrefix(strings.ToLower(h.Name), lower) {
			copy := *h
			out = append(out, &copy)
		}
	}
	return out, nil
}

func (m *HubRepository) UpsertHubTopicFilters(_ context.Context, _ int, _ []string) error { return nil }

func (m *HubRepository) GetPopularHubs(_ context.Context, limit, offset int) ([]*domain.Hub, error) {
	return nil, nil
}

func (m *HubRepository) SearchHubs(_ context.Context, query string, limit int) ([]*domain.Hub, error) {
	lower := strings.ToLower(query)
	var out []*domain.Hub
	for _, h := range m.hubs {
		if strings.Contains(strings.ToLower(h.Name), lower) {
			copy := *h
			out = append(out, &copy)
		}
	}
	return out, nil
}

func (m *HubRepository) GetTrendingHubs(_ context.Context, limit int) ([]*domain.Hub, error) {
	return nil, nil
}

func (m *HubRepository) UpdateNSFW(_ context.Context, hubID int, nsfw bool) error {
	if h, ok := m.hubs[hubID]; ok {
		h.NSFW = nsfw
	}
	return nil
}
