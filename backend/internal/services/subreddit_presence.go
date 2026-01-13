package services

import (
	"strings"
	"sync"
	"time"
)

type SubredditPresence struct {
	ttl       time.Duration
	mu        sync.RWMutex
	lastSeen  map[string]map[string]time.Time
}

func NewSubredditPresence(ttl time.Duration) *SubredditPresence {
	return &SubredditPresence{
		ttl:      ttl,
		lastSeen: make(map[string]map[string]time.Time),
	}
}

func (p *SubredditPresence) TTL() time.Duration {
	return p.ttl
}

func (p *SubredditPresence) Touch(subreddit string, key string) int {
	if subreddit == "" || key == "" {
		return 0
	}

	normalized := strings.ToLower(subreddit)
	now := time.Now()

	p.mu.Lock()
	defer p.mu.Unlock()

	if _, ok := p.lastSeen[normalized]; !ok {
		p.lastSeen[normalized] = make(map[string]time.Time)
	}

	p.lastSeen[normalized][key] = now
	p.pruneLocked(normalized, now)

	return len(p.lastSeen[normalized])
}

func (p *SubredditPresence) CountActive(subreddit string) int {
	if subreddit == "" {
		return 0
	}

	normalized := strings.ToLower(subreddit)
	now := time.Now()

	p.mu.Lock()
	defer p.mu.Unlock()

	p.pruneLocked(normalized, now)
	return len(p.lastSeen[normalized])
}

func (p *SubredditPresence) pruneLocked(subreddit string, now time.Time) {
	users, ok := p.lastSeen[subreddit]
	if !ok {
		return
	}

	expiry := now.Add(-p.ttl)
	for userID, seenAt := range users {
		if seenAt.Before(expiry) {
			delete(users, userID)
		}
	}

	if len(users) == 0 {
		delete(p.lastSeen, subreddit)
	}
}
