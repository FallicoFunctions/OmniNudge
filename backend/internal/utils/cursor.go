package utils

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
)

// EncodeCursor encodes any struct as a base64 cursor string
func EncodeCursor(cursor interface{}) string {
	raw, err := json.Marshal(cursor)
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

// DecodeCursor decodes a base64 cursor string into the provided struct pointer
func DecodeCursor(encoded string, cursor interface{}) error {
	if encoded == "" {
		return fmt.Errorf("empty cursor")
	}

	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return fmt.Errorf("invalid cursor encoding: %w", err)
	}

	if err := json.Unmarshal(raw, cursor); err != nil {
		return fmt.Errorf("invalid cursor format: %w", err)
	}

	return nil
}
