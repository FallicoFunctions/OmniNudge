package ranking

import (
	"strings"
	"testing"
	"time"
)

func TestSortComments_NewAndOld(t *testing.T) {
	base := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	comments := []Comment{
		{ID: 1, CreatedAt: base.Add(2 * time.Hour)},
		{ID: 2, CreatedAt: base.Add(1 * time.Hour)},
		{ID: 3, CreatedAt: base.Add(3 * time.Hour)},
	}

	newSorted := SortComments(comments, "new")
	if newSorted[0].ID != 3 || newSorted[1].ID != 1 || newSorted[2].ID != 2 {
		t.Fatalf("new sort order incorrect: %+v", newSorted)
	}

	oldSorted := SortComments(comments, "old")
	if oldSorted[0].ID != 2 || oldSorted[1].ID != 1 || oldSorted[2].ID != 3 {
		t.Fatalf("old sort order incorrect: %+v", oldSorted)
	}

	// Ensure original slice not mutated
	if comments[0].ID != 1 || comments[1].ID != 2 || comments[2].ID != 3 {
		t.Fatalf("input slice mutated: %+v", comments)
	}
}

func TestSortComments_Top(t *testing.T) {
	now := time.Now()
	comments := []Comment{
		{ID: 1, Ups: 10, Downs: 2, CreatedAt: now},
		{ID: 2, Ups: 8, Downs: 0, CreatedAt: now.Add(-time.Minute)},
		{ID: 3, Ups: 10, Downs: 2, CreatedAt: now.Add(-time.Hour)}, // tie on score, oldest
	}

	sorted := SortComments(comments, "top")
	if sorted[0].ID != 1 {
		t.Fatalf("expected ID 1 first, got %d", sorted[0].ID)
	}
	if sorted[1].ID != 2 {
		t.Fatalf("expected ID 2 second on tie-breaker by CreatedAt, got %d", sorted[1].ID)
	}
}

func TestSortComments_BestDefault(t *testing.T) {
	now := time.Now()
	comments := []Comment{
		{ID: 1, Ups: 50, Downs: 10, CreatedAt: now},
		{ID: 2, Ups: 10, Downs: 0, CreatedAt: now.Add(time.Hour)}, // higher Wilson due to uncertainty
	}

	sorted := SortComments(comments, "")
	if sorted[0].ID != 2 {
		t.Fatalf("default best sort should put ID 2 first, got %d", sorted[0].ID)
	}
}

func TestSortComments_Controversial(t *testing.T) {
	now := time.Now()
	comments := []Comment{
		{ID: 1, Ups: 500, Downs: 500, CreatedAt: now},
		{ID: 2, Ups: 600, Downs: 100, CreatedAt: now.Add(-time.Hour)},
	}

	sorted := SortComments(comments, "controversial")
	if sorted[0].ID != 1 {
		t.Fatalf("expected balanced high-volume comment first, got %d", sorted[0].ID)
	}
}

func TestSortComments_QA(t *testing.T) {
	now := time.Now()
	comments := []Comment{
		{ID: 1, Ups: 20, Downs: 5, Body: "short", CreatedAt: now},
		{ID: 2, Ups: 20, Downs: 5, Body: strings.Repeat("a", 1500), CreatedAt: now.Add(-time.Minute)},
	}

	sorted := SortComments(comments, "qa")
	if sorted[0].ID != 2 {
		t.Fatalf("expected longer comment with same Wilson score first, got %d", sorted[0].ID)
	}
}
