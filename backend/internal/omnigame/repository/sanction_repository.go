package repository

import (
	"context"
	"strings"
)

type SanctionRepository interface {
	IsBootstrapBlocked(ctx context.Context, token, networkHash string) (bool, error)
}

type InMemorySanctionRepository struct {
	blockedBootstrapIDs map[string]struct{}
	blockedNetworkIDs   map[string]struct{}
}

func NewInMemorySanctionRepository() *InMemorySanctionRepository {
	return &InMemorySanctionRepository{
		blockedBootstrapIDs: make(map[string]struct{}),
		blockedNetworkIDs:   make(map[string]struct{}),
	}
}

func (r *InMemorySanctionRepository) IsBootstrapBlocked(_ context.Context, token, networkHash string) (bool, error) {
	if _, ok := r.blockedBootstrapIDs[token]; ok {
		return true, nil
	}
	if networkHash = normalizeNetworkHash(networkHash); networkHash != "" {
		if _, ok := r.blockedNetworkIDs[networkHash]; ok {
			return true, nil
		}
	}
	return false, nil
}

func (r *InMemorySanctionRepository) BlockBootstrap(token string, networkHashes ...string) {
	r.blockedBootstrapIDs[token] = struct{}{}
	for _, networkHash := range networkHashes {
		networkHash = normalizeNetworkHash(networkHash)
		if networkHash == "" {
			continue
		}
		r.blockedNetworkIDs[networkHash] = struct{}{}
	}
}

func normalizeNetworkHash(networkHash string) string {
	return strings.TrimSpace(networkHash)
}
