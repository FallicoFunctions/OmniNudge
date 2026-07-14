package charactercard

import (
	"bytes"
	"compress/zlib"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"hash/crc32"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseV2JSONCard(t *testing.T) {
	raw := []byte(`{
		"spec": "chara_card_v2",
		"spec_version": "2.0",
		"data": {
			"name": "Archivist",
			"description": "Knows the hidden stacks.",
			"personality": "Methodical and dry-witted.",
			"scenario": "Late at night in a sealed library.",
			"first_mes": "*She adjusts the lamp.* Welcome back.",
			"mes_example": "<START>\nArchivist: The index is wrong again.",
			"system_prompt": "Stay in the role of Archivist.",
			"post_history_instructions": "Keep tension high.",
			"alternate_greetings": ["Hello again."],
			"creator_notes": "Built for mystery RP.",
			"tags": ["mystery", "library"],
			"creator": "Nick",
			"character_version": "1.2.0",
			"extensions": {"omninudge": {"theme": "gothic"}},
			"character_book": {"entries": [{"content": "The library is sentient.", "constant": true}]}
		}
	}`)

	card, err := Parse("archivist.json", "application/json", raw)
	require.NoError(t, err)
	require.Equal(t, "Archivist", card.Name)
	require.Equal(t, "Methodical and dry-witted.", card.Personality)
	require.Equal(t, "*She adjusts the lamp.* Welcome back.", card.FirstMessage)
	require.Equal(t, []string{"Hello again."}, card.AlternateGreetings)
	require.JSONEq(t, `{"omninudge":{"theme":"gothic"}}`, string(card.Extensions))
}

func TestParsePNGCard(t *testing.T) {
	cardJSON := []byte(`{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":"Navigator","description":"Stars and charts.","personality":"Calm.","scenario":"At sea.","first_mes":"The horizon is clear.","mes_example":"","creator_notes":"","system_prompt":"","post_history_instructions":"","alternate_greetings":[],"tags":[],"creator":"","character_version":"","extensions":{}}}`)
	png := buildPNGWithTextChunk("chara", []byte(base64.StdEncoding.EncodeToString(cardJSON)))

	card, err := Parse("navigator.png", "image/png", png)
	require.NoError(t, err)
	require.Equal(t, "Navigator", card.Name)
	require.Equal(t, "The horizon is clear.", card.FirstMessage)
}

func TestParsePNGCardITXtChunk(t *testing.T) {
	cardJSON := []byte(`{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":"Waypoint","description":"Maps every corridor.","personality":"Focused.","scenario":"Inside a maze.","first_mes":"Keep close.","mes_example":"","creator_notes":"","system_prompt":"","post_history_instructions":"","alternate_greetings":[],"tags":[],"creator":"","character_version":"","extensions":{}}}`)
	png := buildPNGWithITXtChunk("chara", []byte(base64.StdEncoding.EncodeToString(cardJSON)), false)

	card, err := Parse("waypoint.png", "image/png", png)
	require.NoError(t, err)
	require.Equal(t, "Waypoint", card.Name)
	require.Equal(t, "Keep close.", card.FirstMessage)
}

func TestParsePNGCardCompressedITXtChunk(t *testing.T) {
	cardJSON := []byte(`{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":"Surveyor","description":"Finds the hidden route.","personality":"Exacting.","scenario":"Beneath the city.","first_mes":"This way.","mes_example":"","creator_notes":"","system_prompt":"","post_history_instructions":"","alternate_greetings":[],"tags":[],"creator":"","character_version":"","extensions":{}}}`)
	png := buildPNGWithITXtChunk("chara", []byte(base64.StdEncoding.EncodeToString(cardJSON)), true)

	card, err := Parse("surveyor.png", "image/png", png)
	require.NoError(t, err)
	require.Equal(t, "Surveyor", card.Name)
	require.Equal(t, "This way.", card.FirstMessage)
}

func buildPNGWithTextChunk(keyword string, payload []byte) []byte {
	var buf bytes.Buffer
	buf.Write([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	writePNGChunk(&buf, "IHDR", []byte{
		0, 0, 0, 1,
		0, 0, 0, 1,
		8, 2, 0, 0, 0,
	})
	writePNGChunk(&buf, "tEXt", append(append([]byte{}, []byte(keyword)...), append([]byte{0}, payload...)...))
	writePNGChunk(&buf, "IDAT", []byte{0x78, 0x9c, 0x63, 0x60, 0x60, 0x60, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01})
	writePNGChunk(&buf, "IEND", nil)
	return buf.Bytes()
}

func buildPNGWithITXtChunk(keyword string, payload []byte, compressed bool) []byte {
	var textData []byte
	compressionFlag := byte(0)
	if compressed {
		compressionFlag = 1
		var compressedBuf bytes.Buffer
		writer := zlib.NewWriter(&compressedBuf)
		_, _ = writer.Write(payload)
		_ = writer.Close()
		textData = compressedBuf.Bytes()
	} else {
		textData = payload
	}

	chunkData := append([]byte{}, []byte(keyword)...)
	chunkData = append(chunkData, 0)
	chunkData = append(chunkData, compressionFlag, 0)
	chunkData = append(chunkData, 0)
	chunkData = append(chunkData, 0)
	chunkData = append(chunkData, textData...)

	var buf bytes.Buffer
	buf.Write([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	writePNGChunk(&buf, "IHDR", []byte{
		0, 0, 0, 1,
		0, 0, 0, 1,
		8, 2, 0, 0, 0,
	})
	writePNGChunk(&buf, "iTXt", chunkData)
	writePNGChunk(&buf, "IDAT", []byte{0x78, 0x9c, 0x63, 0x60, 0x60, 0x60, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01})
	writePNGChunk(&buf, "IEND", nil)
	return buf.Bytes()
}

func writePNGChunk(buf *bytes.Buffer, chunkType string, data []byte) {
	length := make([]byte, 4)
	binary.BigEndian.PutUint32(length, uint32(len(data)))
	buf.Write(length)
	buf.WriteString(chunkType)
	buf.Write(data)
	crc := crc32.ChecksumIEEE(append([]byte(chunkType), data...))
	crcBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(crcBytes, crc)
	buf.Write(crcBytes)
}

func TestBuildV2ExportRoundTrip(t *testing.T) {
	card := &Card{
		Name:               "Scribe",
		Description:        "Records every promise.",
		Personality:        "Quiet.",
		Scenario:           "In a ruined court.",
		FirstMessage:       "The ink is still wet.",
		ExampleDialogue:    "<START>\nScribe: History notices.",
		Extensions:         json.RawMessage(`{"omninudge":{"origin":"test"}}`),
		AlternateGreetings: []string{"We meet again."},
	}

	raw, err := BuildV2Export(card)
	require.NoError(t, err)

	parsed, err := Parse("scribe.json", "application/json", raw)
	require.NoError(t, err)
	require.Equal(t, "Scribe", parsed.Name)
	require.Equal(t, "We meet again.", parsed.AlternateGreetings[0])
}
