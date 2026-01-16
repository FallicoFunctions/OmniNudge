package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/omninudge/backend/internal/models"
)

func encodePlatformPostCursor(cursor models.PlatformPostCursor) string {
	raw, err := json.Marshal(cursor)
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

func decodePlatformPostCursor(encoded string) (*models.PlatformPostCursor, error) {
	if encoded == "" {
		return nil, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	var cursor models.PlatformPostCursor
	if err := json.Unmarshal(raw, &cursor); err != nil {
		return nil, err
	}
	if cursor.ID == 0 {
		return nil, fmt.Errorf("invalid cursor")
	}
	return &cursor, nil
}

func buildPlatformPostCursor(post *models.PlatformPost, sortBy string) models.PlatformPostCursor {
	cursor := models.PlatformPostCursor{
		ID:        post.ID,
		CreatedAt: post.CreatedAt,
		Score:     post.Score,
		HotScore:  post.HotScore,
	}
	if sortBy == "rising" {
		cursor.RisingScore = calculateRisingScore(post.Score, post.CreatedAt)
	}
	if sortBy == "controversial" {
		cursor.ControversialScore = calculateControversialScore(post.Upvotes, post.Downvotes)
	}
	return cursor
}

func calculateRisingScore(score int, createdAt time.Time) float64 {
	hours := time.Since(createdAt).Hours()
	if hours < 1 {
		hours = 1
	}
	return float64(score) / hours
}

func calculateControversialScore(ups, downs int) float64 {
	n := ups + downs
	if n == 0 {
		return 0
	}
	p := float64(ups) / float64(n)
	balance := 1 - math.Abs(p-0.5)*2
	volume := math.Log10(float64(n) + 1)
	return balance * volume
}
