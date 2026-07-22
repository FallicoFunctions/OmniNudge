package charactercard

import (
	"bytes"
	"compress/zlib"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
)

var (
	ErrUnsupportedFormat = errors.New("character card: unsupported format")
	ErrMissingMetadata   = errors.New("character card: missing character metadata")
)

type Card struct {
	Spec                    string          `json:"spec"`
	SpecVersion             string          `json:"spec_version"`
	Name                    string          `json:"name"`
	Description             string          `json:"description"`
	Personality             string          `json:"personality"`
	Scenario                string          `json:"scenario"`
	FirstMessage            string          `json:"first_message"`
	ExampleDialogue         string          `json:"example_dialogue"`
	SystemPrompt            string          `json:"system_prompt"`
	PostHistoryInstructions string          `json:"post_history_instructions"`
	AlternateGreetings      []string        `json:"alternate_greetings"`
	CreatorNotes            string          `json:"creator_notes"`
	Tags                    []string        `json:"tags"`
	Creator                 string          `json:"creator"`
	CharacterVersion        string          `json:"character_version"`
	Extensions              json.RawMessage `json:"extensions"`
	CharacterBook           json.RawMessage `json:"character_book"`
	Raw                     json.RawMessage `json:"raw"`
}

type v1Card struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Personality string `json:"personality"`
	Scenario    string `json:"scenario"`
	FirstMes    string `json:"first_mes"`
	MesExample  string `json:"mes_example"`
}

type v2Card struct {
	Spec        string `json:"spec"`
	SpecVersion string `json:"spec_version"`
	Data        struct {
		Name                    string          `json:"name"`
		Description             string          `json:"description"`
		Personality             string          `json:"personality"`
		Scenario                string          `json:"scenario"`
		FirstMes                string          `json:"first_mes"`
		MesExample              string          `json:"mes_example"`
		CreatorNotes            string          `json:"creator_notes"`
		SystemPrompt            string          `json:"system_prompt"`
		PostHistoryInstructions string          `json:"post_history_instructions"`
		AlternateGreetings      []string        `json:"alternate_greetings"`
		CharacterBook           json.RawMessage `json:"character_book"`
		Tags                    []string        `json:"tags"`
		Creator                 string          `json:"creator"`
		CharacterVersion        string          `json:"character_version"`
		Extensions              json.RawMessage `json:"extensions"`
	} `json:"data"`
}

type v3Card struct {
	Spec        string `json:"spec"`
	SpecVersion string `json:"spec_version"`
	Data        struct {
		Name                    string          `json:"name"`
		Description             string          `json:"description"`
		Personality             string          `json:"personality"`
		Scenario                string          `json:"scenario"`
		FirstMes                string          `json:"first_mes"`
		MesExample              string          `json:"mes_example"`
		CreatorNotes            string          `json:"creator_notes"`
		SystemPrompt            string          `json:"system_prompt"`
		PostHistoryInstructions string          `json:"post_history_instructions"`
		AlternateGreetings      []string        `json:"alternate_greetings"`
		CharacterBook           json.RawMessage `json:"character_book"`
		Tags                    []string        `json:"tags"`
		Creator                 string          `json:"creator"`
		CharacterVersion        string          `json:"character_version"`
		Extensions              json.RawMessage `json:"extensions"`
	} `json:"data"`
}

func Parse(filename, contentType string, raw []byte) (*Card, error) {
	lowerName := strings.ToLower(filename)
	switch {
	case strings.HasSuffix(lowerName, ".json") || strings.Contains(contentType, "json"):
		return parseJSONCard(raw)
	case strings.HasSuffix(lowerName, ".png") || contentType == "image/png":
		payload, err := extractPNGMetadata(raw)
		if err != nil {
			return nil, err
		}
		return parseJSONCard(payload)
	default:
		return nil, ErrUnsupportedFormat
	}
}

func parseJSONCard(raw []byte) (*Card, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, ErrUnsupportedFormat
	}

	var v2 v2Card
	if err := json.Unmarshal(trimmed, &v2); err == nil && v2.Spec == "chara_card_v2" {
		card := &Card{
			Spec:                    v2.Spec,
			SpecVersion:             nonEmpty(v2.SpecVersion, "2.0"),
			Name:                    strings.TrimSpace(v2.Data.Name),
			Description:             strings.TrimSpace(v2.Data.Description),
			Personality:             strings.TrimSpace(v2.Data.Personality),
			Scenario:                strings.TrimSpace(v2.Data.Scenario),
			FirstMessage:            strings.TrimSpace(v2.Data.FirstMes),
			ExampleDialogue:         strings.TrimSpace(v2.Data.MesExample),
			SystemPrompt:            strings.TrimSpace(v2.Data.SystemPrompt),
			PostHistoryInstructions: strings.TrimSpace(v2.Data.PostHistoryInstructions),
			AlternateGreetings:      cloneStrings(v2.Data.AlternateGreetings),
			CreatorNotes:            strings.TrimSpace(v2.Data.CreatorNotes),
			Tags:                    cloneStrings(v2.Data.Tags),
			Creator:                 strings.TrimSpace(v2.Data.Creator),
			CharacterVersion:        strings.TrimSpace(v2.Data.CharacterVersion),
			Extensions:              normalizeRawJSON(v2.Data.Extensions, []byte(`{}`)),
			CharacterBook:           normalizeRawJSON(v2.Data.CharacterBook, nil),
			Raw:                     append(json.RawMessage(nil), trimmed...),
		}
		if card.Name == "" {
			return nil, ErrUnsupportedFormat
		}
		return card, nil
	}

	var v3 v3Card
	if err := json.Unmarshal(trimmed, &v3); err == nil && v3.Spec == "chara_card_v3" {
		card := &Card{
			Spec:                    v3.Spec,
			SpecVersion:             nonEmpty(v3.SpecVersion, "3.0"),
			Name:                    strings.TrimSpace(v3.Data.Name),
			Description:             strings.TrimSpace(v3.Data.Description),
			Personality:             strings.TrimSpace(v3.Data.Personality),
			Scenario:                strings.TrimSpace(v3.Data.Scenario),
			FirstMessage:            strings.TrimSpace(v3.Data.FirstMes),
			ExampleDialogue:         strings.TrimSpace(v3.Data.MesExample),
			SystemPrompt:            strings.TrimSpace(v3.Data.SystemPrompt),
			PostHistoryInstructions: strings.TrimSpace(v3.Data.PostHistoryInstructions),
			AlternateGreetings:      cloneStrings(v3.Data.AlternateGreetings),
			CreatorNotes:            strings.TrimSpace(v3.Data.CreatorNotes),
			Tags:                    cloneStrings(v3.Data.Tags),
			Creator:                 strings.TrimSpace(v3.Data.Creator),
			CharacterVersion:        strings.TrimSpace(v3.Data.CharacterVersion),
			Extensions:              normalizeRawJSON(v3.Data.Extensions, []byte(`{}`)),
			CharacterBook:           normalizeRawJSON(v3.Data.CharacterBook, nil),
			Raw:                     append(json.RawMessage(nil), trimmed...),
		}
		if card.Name == "" {
			return nil, ErrUnsupportedFormat
		}
		return card, nil
	}

	var v1 v1Card
	if err := json.Unmarshal(trimmed, &v1); err == nil && strings.TrimSpace(v1.Name) != "" {
		return &Card{
			Spec:               "chara_card_v1",
			SpecVersion:        "1.0",
			Name:               strings.TrimSpace(v1.Name),
			Description:        strings.TrimSpace(v1.Description),
			Personality:        strings.TrimSpace(v1.Personality),
			Scenario:           strings.TrimSpace(v1.Scenario),
			FirstMessage:       strings.TrimSpace(v1.FirstMes),
			ExampleDialogue:    strings.TrimSpace(v1.MesExample),
			AlternateGreetings: []string{},
			Tags:               []string{},
			Extensions:         []byte(`{}`),
			Raw:                append(json.RawMessage(nil), trimmed...),
		}, nil
	}

	return nil, ErrUnsupportedFormat
}

func extractPNGMetadata(raw []byte) ([]byte, error) {
	const pngSignature = "\x89PNG\r\n\x1a\n"
	if len(raw) < len(pngSignature) || string(raw[:len(pngSignature)]) != pngSignature {
		return nil, ErrUnsupportedFormat
	}

	cursor := len(pngSignature)
	for cursor+8 <= len(raw) {
		length := int(binary.BigEndian.Uint32(raw[cursor : cursor+4]))
		chunkType := string(raw[cursor+4 : cursor+8])
		cursor += 8
		if length < 0 || cursor+length+4 > len(raw) {
			return nil, ErrUnsupportedFormat
		}
		chunkData := raw[cursor : cursor+length]
		cursor += length + 4

		payload, ok, err := decodePNGTextChunk(chunkType, chunkData)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		return payload, nil
	}

	return nil, ErrMissingMetadata
}

func decodePNGTextChunk(chunkType string, chunkData []byte) ([]byte, bool, error) {
	switch chunkType {
	case "tEXt":
		parts := bytes.SplitN(chunkData, []byte{0}, 2)
		if len(parts) != 2 {
			return nil, false, nil
		}
		if !isCharacterKeyword(parts[0]) {
			return nil, false, nil
		}
		return decodeEmbeddedCardPayload(parts[1])
	case "zTXt":
		parts := bytes.SplitN(chunkData, []byte{0}, 2)
		if len(parts) != 2 || len(parts[1]) < 2 {
			return nil, false, nil
		}
		if !isCharacterKeyword(parts[0]) {
			return nil, false, nil
		}
		if parts[1][0] != 0 {
			return nil, false, ErrUnsupportedFormat
		}
		reader, err := zlib.NewReader(bytes.NewReader(parts[1][1:]))
		if err != nil {
			return nil, false, err
		}
		defer reader.Close()
		decompressed, err := io.ReadAll(io.LimitReader(reader, 16<<20))
		if err != nil {
			return nil, false, err
		}
		return decodeEmbeddedCardPayload(decompressed)
	case "iTXt":
		keywordEnd := bytes.IndexByte(chunkData, 0)
		if keywordEnd < 0 {
			return nil, false, nil
		}
		if !isCharacterKeyword(chunkData[:keywordEnd]) {
			return nil, false, nil
		}

		rest := chunkData[keywordEnd+1:]
		if len(rest) < 2 {
			return nil, false, nil
		}
		compressionFlag := rest[0]
		compressionMethod := rest[1]
		rest = rest[2:]

		languageTagEnd := bytes.IndexByte(rest, 0)
		if languageTagEnd < 0 {
			return nil, false, nil
		}
		rest = rest[languageTagEnd+1:]

		translatedKeywordEnd := bytes.IndexByte(rest, 0)
		if translatedKeywordEnd < 0 {
			return nil, false, nil
		}
		textData := rest[translatedKeywordEnd+1:]

		if compressionFlag == 1 {
			if compressionMethod != 0 {
				return nil, false, ErrUnsupportedFormat
			}
			reader, err := zlib.NewReader(bytes.NewReader(textData))
			if err != nil {
				return nil, false, err
			}
			defer reader.Close()
			decompressed, err := io.ReadAll(io.LimitReader(reader, 16<<20))
			if err != nil {
				return nil, false, err
			}
			return decodeEmbeddedCardPayload(decompressed)
		}
		if compressionFlag != 0 {
			return nil, false, ErrUnsupportedFormat
		}
		return decodeEmbeddedCardPayload(textData)
	default:
		return nil, false, nil
	}
}

func decodeEmbeddedCardPayload(raw []byte) ([]byte, bool, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, false, nil
	}

	decoded := make([]byte, base64.StdEncoding.DecodedLen(len(trimmed)))
	n, err := base64.StdEncoding.Decode(decoded, trimmed)
	if err == nil {
		return bytes.TrimSpace(decoded[:n]), true, nil
	}

	// Some exporters persist raw JSON instead of base64 text. Accept it.
	if len(trimmed) > 0 && (trimmed[0] == '{' || trimmed[0] == '[') {
		return trimmed, true, nil
	}

	return nil, false, ErrUnsupportedFormat
}

func isCharacterKeyword(keyword []byte) bool {
	key := strings.ToLower(strings.TrimSpace(string(keyword)))
	return key == "chara" || key == "ccv3"
}

func normalizeRawJSON(raw json.RawMessage, fallback []byte) json.RawMessage {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		if fallback == nil {
			return nil
		}
		return append(json.RawMessage(nil), fallback...)
	}
	return append(json.RawMessage(nil), trimmed...)
}

func cloneStrings(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		out = append(out, trimmed)
	}
	return out
}

func nonEmpty(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func BuildV2Export(card *Card) ([]byte, error) {
	if card == nil {
		return nil, fmt.Errorf("character card: nil card")
	}

	payload := map[string]any{
		"spec":         "chara_card_v2",
		"spec_version": "2.0",
		"data": map[string]any{
			"name":                      card.Name,
			"description":               card.Description,
			"personality":               card.Personality,
			"scenario":                  card.Scenario,
			"first_mes":                 card.FirstMessage,
			"mes_example":               card.ExampleDialogue,
			"creator_notes":             card.CreatorNotes,
			"system_prompt":             card.SystemPrompt,
			"post_history_instructions": card.PostHistoryInstructions,
			"alternate_greetings":       cloneStrings(card.AlternateGreetings),
			"tags":                      cloneStrings(card.Tags),
			"creator":                   card.Creator,
			"character_version":         card.CharacterVersion,
			"extensions":                normalizeExportJSON(card.Extensions, map[string]any{}),
		},
	}

	if len(bytes.TrimSpace(card.CharacterBook)) > 0 {
		payload["data"].(map[string]any)["character_book"] = normalizeExportJSON(card.CharacterBook, nil)
	}

	return json.Marshal(payload)
}

func normalizeExportJSON(raw json.RawMessage, fallback any) any {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return fallback
	}
	var decoded any
	if err := json.Unmarshal(trimmed, &decoded); err != nil {
		return fallback
	}
	return decoded
}
