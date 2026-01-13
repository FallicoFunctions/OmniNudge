package utils

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

// PaginationParams holds common pagination parameters
type PaginationParams struct {
	Limit  int
	Offset int
	Cursor string
}

// ParsePaginationParams extracts and validates pagination parameters from the request.
// Default limit is 50, max is 100. Returns validated pagination parameters.
func ParsePaginationParams(c *gin.Context) PaginationParams {
	return ParsePaginationParamsWithDefaults(c, 50, 100)
}

// ParsePaginationParamsWithDefaults extracts pagination parameters with custom defaults.
func ParsePaginationParamsWithDefaults(c *gin.Context, defaultLimit, maxLimit int) PaginationParams {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", strconv.Itoa(defaultLimit)))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	cursor := c.Query("cursor")

	// Validate and clamp limit
	if limit < 1 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	// Ensure offset is non-negative
	if offset < 0 {
		offset = 0
	}

	return PaginationParams{
		Limit:  limit,
		Offset: offset,
		Cursor: cursor,
	}
}

// UseCursorPagination determines whether to use cursor-based or offset-based pagination
func UseCursorPagination(params PaginationParams) bool {
	return params.Cursor != "" || params.Offset == 0
}

// AdjustLimitForCursor adjusts the limit to fetch one extra item for cursor pagination
func AdjustLimitForCursor(limit int, useCursor bool) int {
	if useCursor {
		return limit + 1
	}
	return limit
}
