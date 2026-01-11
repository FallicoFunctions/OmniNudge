package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"
)

type searchCursor struct {
	ID        int       `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	Rank      float64   `json:"rank"`
}

func encodeSearchCursor(cursor searchCursor) string {
	raw, err := json.Marshal(cursor)
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

func decodeSearchCursor(encoded string) (*searchCursor, error) {
	if encoded == "" {
		return nil, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	var cursor searchCursor
	if err := json.Unmarshal(raw, &cursor); err != nil {
		return nil, err
	}
	if cursor.ID == 0 {
		return nil, fmt.Errorf("invalid cursor")
	}
	return &cursor, nil
}

func buildSearchCursorClause(sort string, cursor *searchCursor, rankExpr string, startIndex int) (string, []interface{}) {
	if cursor == nil {
		return "", nil
	}
	switch sort {
	case "new":
		return fmt.Sprintf(
				" AND ((created_at < $%d) OR (created_at = $%d AND %s < $%d) OR (created_at = $%d AND %s = $%d AND id < $%d))",
				startIndex,
				startIndex,
				rankExpr,
				startIndex+1,
				startIndex,
				rankExpr,
				startIndex+1,
				startIndex+2,
			),
			[]interface{}{cursor.CreatedAt, cursor.Rank, cursor.ID}
	case "old":
		return fmt.Sprintf(
				" AND ((created_at > $%d) OR (created_at = $%d AND %s < $%d) OR (created_at = $%d AND %s = $%d AND id < $%d))",
				startIndex,
				startIndex,
				rankExpr,
				startIndex+1,
				startIndex,
				rankExpr,
				startIndex+1,
				startIndex+2,
			),
			[]interface{}{cursor.CreatedAt, cursor.Rank, cursor.ID}
	default:
		return fmt.Sprintf(
				" AND ((%s < $%d) OR (%s = $%d AND created_at < $%d) OR (%s = $%d AND created_at = $%d AND id < $%d))",
				rankExpr,
				startIndex,
				rankExpr,
				startIndex,
				startIndex+1,
				rankExpr,
				startIndex,
				startIndex+1,
				startIndex+2,
			),
			[]interface{}{cursor.Rank, cursor.CreatedAt, cursor.ID}
	}
}
