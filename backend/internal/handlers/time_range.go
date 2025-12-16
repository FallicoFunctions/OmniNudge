package handlers

import (
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func parseTopTimeRange(c *gin.Context, sort string) (*time.Time, *time.Time, string, error) {
	if strings.ToLower(sort) != "top" {
		return nil, nil, "", nil
	}

	key := strings.ToLower(c.DefaultQuery("time_range", "day"))
	now := time.Now().UTC()

	switch key {
	case "hour":
		start := now.Add(-time.Hour)
		return &start, &now, key, nil
	case "day":
		start := now.Add(-24 * time.Hour)
		return &start, &now, key, nil
	case "week":
		start := now.Add(-7 * 24 * time.Hour)
		return &start, &now, key, nil
	case "year":
		start := now.Add(-365 * 24 * time.Hour)
		return &start, &now, key, nil
	case "all":
		return nil, nil, key, nil
	case "custom":
		startStr := c.Query("start")
		endStr := c.Query("end")
		if startStr == "" || endStr == "" {
			return nil, nil, "", fmt.Errorf("custom time range requires start and end parameters")
		}

		startTime, err := time.Parse(time.RFC3339, startStr)
		if err != nil {
			return nil, nil, "", fmt.Errorf("invalid start time format: %w", err)
		}
		endTime, err := time.Parse(time.RFC3339, endStr)
		if err != nil {
			return nil, nil, "", fmt.Errorf("invalid end time format: %w", err)
		}

		startTime = startTime.UTC()
		endTime = endTime.UTC()
		if endTime.Before(startTime) {
			return nil, nil, "", fmt.Errorf("end time must be after start time")
		}
		return &startTime, &endTime, key, nil
	default:
		return nil, nil, "", fmt.Errorf("invalid time_range value: %s", key)
	}
}
