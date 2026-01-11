package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"

	"github.com/omninudge/backend/internal/models"
)

func encodeThemePublicCursor(cursor models.ThemePublicCursor) string {
	raw, err := json.Marshal(cursor)
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

func decodeThemePublicCursor(encoded string) (*models.ThemePublicCursor, error) {
	if encoded == "" {
		return nil, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	var cursor models.ThemePublicCursor
	if err := json.Unmarshal(raw, &cursor); err != nil {
		return nil, err
	}
	if cursor.ID == 0 {
		return nil, fmt.Errorf("invalid cursor")
	}
	return &cursor, nil
}
