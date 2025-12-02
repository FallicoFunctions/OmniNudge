package ranking

import (
	"math"
	"sort"
	"strings"
	"time"
)

// Comment represents a Reddit-style comment with vote and timestamp metadata.
type Comment struct {
	ID        int64
	Ups       int
	Downs     int
	Body      string
	CreatedAt time.Time
}

func score(ups, downs int) int {
	return ups - downs
}

func wilsonScore(ups, downs int) float64 {
	n := ups + downs
	if n == 0 {
		return 0
	}

	z := 1.96 // 95% confidence
	p := float64(ups) / float64(n)

	numerator := p + z*z/(2*float64(n)) - z*math.Sqrt((p*(1-p)+z*z/(4*float64(n)))/float64(n))
	denominator := 1 + z*z/float64(n)

	return numerator / denominator
}

func controversialScore(ups, downs int) float64 {
	n := ups + downs
	if n == 0 {
		return 0
	}

	p := float64(ups) / float64(n)
	balance := 1 - math.Abs(p-0.5)*2
	volume := math.Log10(float64(n) + 1)

	return balance * volume
}

func qaScore(c Comment) float64 {
	base := wilsonScore(c.Ups, c.Downs)
	lengthBonus := math.Min(float64(len(c.Body))/1000.0, 0.3)
	return base + lengthBonus
}

// SortComments returns a new slice of comments sorted according to the supplied strategy.
// Supported strategies (case-insensitive): new, old, top, best, controversial, qa.
// Defaults to "best" when sort is empty or unknown.
func SortComments(comments []Comment, sortBy string) []Comment {
	sorted := make([]Comment, len(comments))
	copy(sorted, comments)

	order := strings.ToLower(sortBy)
	if order == "" {
		order = "best"
	}

	bestLess := func(i, j int) bool {
		iScore := wilsonScore(sorted[i].Ups, sorted[i].Downs)
		jScore := wilsonScore(sorted[j].Ups, sorted[j].Downs)
		if iScore == jScore {
			return sorted[i].CreatedAt.After(sorted[j].CreatedAt)
		}
		return iScore > jScore
	}

	var less func(i, j int) bool

	switch order {
	case "new":
		less = func(i, j int) bool {
			return sorted[i].CreatedAt.After(sorted[j].CreatedAt)
		}
	case "old":
		less = func(i, j int) bool {
			return sorted[i].CreatedAt.Before(sorted[j].CreatedAt)
		}
	case "top":
		less = func(i, j int) bool {
			iScore := score(sorted[i].Ups, sorted[i].Downs)
			jScore := score(sorted[j].Ups, sorted[j].Downs)
			if iScore == jScore {
				return sorted[i].CreatedAt.After(sorted[j].CreatedAt)
			}
			return iScore > jScore
		}
	case "best":
		less = bestLess
	case "controversial":
		less = func(i, j int) bool {
			iScore := controversialScore(sorted[i].Ups, sorted[i].Downs)
			jScore := controversialScore(sorted[j].Ups, sorted[j].Downs)
			if iScore == jScore {
				return sorted[i].CreatedAt.After(sorted[j].CreatedAt)
			}
			return iScore > jScore
		}
	case "qa":
		less = func(i, j int) bool {
			iScore := qaScore(sorted[i])
			jScore := qaScore(sorted[j])
			if iScore == jScore {
				return sorted[i].CreatedAt.After(sorted[j].CreatedAt)
			}
			return iScore > jScore
		}
	default:
		less = bestLess
	}

	sort.SliceStable(sorted, less)
	return sorted
}
