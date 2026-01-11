package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"
)

type timeCursor struct {
	ID        int       `json:"id"`
	Timestamp time.Time `json:"timestamp"`
}

func encodeTimeCursor(cursor timeCursor) string {
	raw, err := json.Marshal(cursor)
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

func decodeTimeCursor(encoded string) (*timeCursor, error) {
	if encoded == "" {
		return nil, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	var cursor timeCursor
	if err := json.Unmarshal(raw, &cursor); err != nil {
		return nil, err
	}
	if cursor.ID == 0 {
		return nil, fmt.Errorf("invalid cursor")
	}
	return &cursor, nil
}

func buildTimeCursorClause(field string, cursor *timeCursor, startIndex int, direction string) (string, []interface{}) {
	if cursor == nil {
		return "", nil
	}
	operator := "<"
	if direction == "asc" {
		operator = ">"
	}
	return fmt.Sprintf(" AND (%s, id) %s ($%d, $%d)", field, operator, startIndex, startIndex+1),
		[]interface{}{cursor.Timestamp, cursor.ID}
}
