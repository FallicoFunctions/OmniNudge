package pipeline

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"path"
	"strings"
	"time"

	_ "golang.org/x/image/webp"
)

const (
	maxArtifactBytes = 512 << 20
	maxReportBytes   = 16 << 20
	maxImagePixels   = 25_000_000
	maxImageSide     = 16_384
)

var ErrArtifactConflict = errors.New("immutable avatar artifact conflicts with existing content")

var allowedArtifactMediaTypes = map[string]struct{}{
	"application/json":         {},
	"application/octet-stream": {},
	"image/jpeg":               {},
	"image/png":                {},
	"image/webp":               {},
	"model/gltf-binary":        {},
}

// ImmutableObjectStore must create a key atomically without replacing existing
// content. A false created result means the key already existed and can be read
// back to verify an idempotent replay.
type ImmutableObjectStore interface {
	PutIfAbsent(ctx context.Context, key string, body io.Reader, contentType string) (created bool, err error)
	Download(ctx context.Context, key string) (io.ReadCloser, error)
}

type ArtifactPayload struct {
	Key         string
	ContentType string
	Body        []byte
}

type EvidenceRecorder struct {
	store ImmutableObjectStore
}

func NewEvidenceRecorder(store ImmutableObjectStore) (*EvidenceRecorder, error) {
	if store == nil {
		return nil, errors.New("immutable avatar object store is required")
	}
	return &EvidenceRecorder{store: store}, nil
}

// Record writes the stage artifact and its machine-readable validation report.
// Deterministic keys make retries idempotent; different bytes at an existing key
// are treated as corruption rather than silently overwritten.
func (r *EvidenceRecorder) Record(
	ctx context.Context,
	jobID string,
	artifactKind string,
	artifact ArtifactPayload,
	report ArtifactPayload,
	createdAt time.Time,
) (*Evidence, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := validateCanonicalUUID("job", jobID); err != nil {
		return nil, err
	}
	if !providerIdentifierPattern.MatchString(artifactKind) {
		return nil, errors.New("artifact kind must contain 1 to 128 safe characters")
	}
	if createdAt.IsZero() {
		return nil, errors.New("evidence creation time is required")
	}
	if artifact.Key == report.Key {
		return nil, errors.New("artifact and report storage keys must be distinct")
	}
	if err := validatePayload("artifact", artifact, jobID, maxArtifactBytes, false); err != nil {
		return nil, err
	}
	if err := validatePayload("report", report, jobID, maxReportBytes, true); err != nil {
		return nil, err
	}

	artifactDigest := sha256Hex(artifact.Body)
	reportDigest := sha256Hex(report.Body)
	if err := r.putImmutable(ctx, artifact, artifactDigest); err != nil {
		return nil, fmt.Errorf("store avatar artifact: %w", err)
	}
	if err := r.putImmutable(ctx, report, reportDigest); err != nil {
		return nil, fmt.Errorf("store avatar validation report: %w", err)
	}

	evidence := &Evidence{
		ArtifactKind:      artifactKind,
		ArtifactKey:       artifact.Key,
		ArtifactSHA256:    artifactDigest,
		ArtifactMediaType: artifact.ContentType,
		ArtifactBytes:     int64(len(artifact.Body)),
		ReportKey:         report.Key,
		ReportSHA256:      reportDigest,
		ReportMediaType:   report.ContentType,
		ReportBytes:       int64(len(report.Body)),
		CreatedAt:         createdAt.UTC(),
	}
	if err := evidence.Validate(); err != nil {
		return nil, fmt.Errorf("construct avatar evidence: %w", err)
	}
	return evidence, nil
}

func validatePayload(label string, payload ArtifactPayload, jobID string, maxBytes int, report bool) error {
	if err := validateJobStorageKey(label, payload.Key, jobID); err != nil {
		return err
	}
	if len(payload.Body) == 0 {
		return fmt.Errorf("%s body is required", label)
	}
	if len(payload.Body) > maxBytes {
		return fmt.Errorf("%s exceeds the %d byte limit", label, maxBytes)
	}
	if payload.ContentType != strings.TrimSpace(payload.ContentType) {
		return fmt.Errorf("%s content type must be canonical", label)
	}
	mediaType, parameters, err := mime.ParseMediaType(payload.ContentType)
	if err != nil || mediaType == "" || len(parameters) != 0 || mediaType != payload.ContentType {
		return fmt.Errorf("%s content type is invalid", label)
	}
	if report {
		if mediaType != "application/json" || !isJSONObject(payload.Body) {
			return errors.New("report must be a valid JSON object with application/json content type")
		}
		if err := validateMediaExtension(payload.Key, mediaType); err != nil {
			return fmt.Errorf("report %w", err)
		}
		return nil
	}
	if _, allowed := allowedArtifactMediaTypes[mediaType]; !allowed {
		return fmt.Errorf("artifact content type %q is not allowed", mediaType)
	}
	if err := validateMediaExtension(payload.Key, mediaType); err != nil {
		return fmt.Errorf("artifact %w", err)
	}
	if err := validatePayloadSignature(mediaType, payload.Body); err != nil {
		return fmt.Errorf("artifact content does not match %q: %w", mediaType, err)
	}
	return nil
}

func validatePayloadSignature(mediaType string, body []byte) error {
	switch mediaType {
	case "model/gltf-binary":
		if err := validateGLBEnvelope(body); err != nil {
			return err
		}
	case "image/png":
		if len(body) < 8 || !bytes.Equal(body[:8], []byte("\x89PNG\r\n\x1a\n")) {
			return errors.New("missing PNG signature")
		}
	case "image/jpeg":
		if len(body) < 3 || !bytes.Equal(body[:3], []byte{0xff, 0xd8, 0xff}) {
			return errors.New("missing JPEG signature")
		}
	case "image/webp":
		if len(body) < 12 || !bytes.Equal(body[:4], []byte("RIFF")) || !bytes.Equal(body[8:12], []byte("WEBP")) {
			return errors.New("missing WebP signature")
		}
	case "application/json":
		if !json.Valid(body) {
			return errors.New("invalid JSON")
		}
	}
	if strings.HasPrefix(mediaType, "image/") {
		if err := validateImageEnvelope(mediaType, body); err != nil {
			return err
		}
		config, format, err := image.DecodeConfig(bytes.NewReader(body))
		if err != nil {
			return fmt.Errorf("decode image: %w", err)
		}
		expectedFormat := strings.TrimPrefix(mediaType, "image/")
		if format != expectedFormat {
			return fmt.Errorf("decoded format %q does not match media type", format)
		}
		if config.Width <= 0 || config.Height <= 0 || config.Width > maxImageSide || config.Height > maxImageSide || uint64(config.Width)*uint64(config.Height) > maxImagePixels {
			return errors.New("image dimensions exceed the safe decoding budget")
		}
		if _, decodedFormat, err := image.Decode(bytes.NewReader(body)); err != nil {
			return fmt.Errorf("decode complete image: %w", err)
		} else if decodedFormat != expectedFormat {
			return fmt.Errorf("fully decoded format %q does not match media type", decodedFormat)
		}
	}
	return nil
}

func validateMediaExtension(key, mediaType string) error {
	extension := path.Ext(key)
	valid := false
	switch mediaType {
	case "application/json":
		valid = extension == ".json"
	case "application/octet-stream":
		valid = extension == ".bin" || extension == ".blend" || extension == ".fbx"
	case "image/jpeg":
		valid = extension == ".jpg" || extension == ".jpeg"
	case "image/png":
		valid = extension == ".png"
	case "image/webp":
		valid = extension == ".webp"
	case "model/gltf-binary":
		valid = extension == ".glb"
	}
	if !valid {
		return fmt.Errorf("storage extension %q does not match media type %q", extension, mediaType)
	}
	return nil
}

func validateImageEnvelope(mediaType string, body []byte) error {
	switch mediaType {
	case "image/jpeg":
		return validateJPEGEnvelope(body)
	case "image/png":
		offset := 8
		for offset < len(body) {
			if offset+12 > len(body) {
				return errors.New("PNG has a truncated chunk")
			}
			chunkLength := uint64(binary.BigEndian.Uint32(body[offset : offset+4]))
			if chunkLength > uint64(len(body)-offset-12) {
				return errors.New("PNG has a truncated chunk payload")
			}
			chunkType := string(body[offset+4 : offset+8])
			offset += 12 + int(chunkLength)
			if chunkType == "IEND" {
				if chunkLength != 0 || offset != len(body) {
					return errors.New("PNG contains an invalid IEND chunk or trailing data")
				}
				return nil
			}
		}
		return errors.New("PNG is missing its IEND chunk")
	case "image/webp":
		if len(body) < 12 || uint64(binary.LittleEndian.Uint32(body[4:8]))+8 != uint64(len(body)) {
			return errors.New("WebP RIFF declared length does not match body")
		}
	}
	return nil
}

func validateJPEGEnvelope(body []byte) error {
	if len(body) < 4 || body[0] != 0xff || body[1] != 0xd8 {
		return errors.New("JPEG is missing its start-of-image marker")
	}
	offset := 2
	inScan := false
	for offset < len(body) {
		if inScan {
			for offset < len(body) && body[offset] != 0xff {
				offset++
			}
			if offset == len(body) {
				return errors.New("JPEG is missing its end-of-image marker")
			}
		} else if body[offset] != 0xff {
			return errors.New("JPEG contains data outside a scan")
		}
		for offset < len(body) && body[offset] == 0xff {
			offset++
		}
		if offset == len(body) {
			return errors.New("JPEG has a truncated marker")
		}

		marker := body[offset]
		offset++
		if inScan {
			switch {
			case marker == 0x00:
				continue
			case marker >= 0xd0 && marker <= 0xd7:
				continue
			}
			inScan = false
		}

		switch {
		case marker == 0xd9:
			if offset != len(body) {
				return errors.New("JPEG contains trailing data after its end-of-image marker")
			}
			return nil
		case marker == 0xd8 || marker == 0x00 || marker == 0x01 || marker >= 0xd0 && marker <= 0xd7:
			return fmt.Errorf("JPEG contains unexpected marker 0x%02x", marker)
		}
		if offset+2 > len(body) {
			return errors.New("JPEG has a truncated segment length")
		}
		segmentLength := int(binary.BigEndian.Uint16(body[offset : offset+2]))
		if segmentLength < 2 || segmentLength > len(body)-offset {
			return errors.New("JPEG has a truncated segment")
		}
		offset += segmentLength
		inScan = marker == 0xda
	}
	return errors.New("JPEG is missing its end-of-image marker")
}

func validateGLBEnvelope(body []byte) error {
	if len(body) < 20 || !bytes.Equal(body[:4], []byte("glTF")) {
		return errors.New("missing GLB header or first chunk")
	}
	if binary.LittleEndian.Uint32(body[4:8]) != 2 {
		return errors.New("GLB version must be 2")
	}
	if declared := binary.LittleEndian.Uint32(body[8:12]); uint64(declared) != uint64(len(body)) {
		return errors.New("GLB declared length does not match body")
	}
	offset := 12
	chunkIndex := 0
	for offset < len(body) {
		if offset+8 > len(body) {
			return errors.New("GLB has a truncated chunk header")
		}
		chunkLength := int(binary.LittleEndian.Uint32(body[offset : offset+4]))
		chunkType := binary.LittleEndian.Uint32(body[offset+4 : offset+8])
		offset += 8
		if chunkLength == 0 || chunkLength%4 != 0 || chunkLength > len(body)-offset {
			return errors.New("GLB has an invalid or truncated aligned chunk")
		}
		chunk := body[offset : offset+chunkLength]
		switch chunkIndex {
		case 0:
			document := bytes.TrimRight(chunk, " ")
			if chunkType != 0x4E4F534A || !isJSONObject(document) {
				return errors.New("GLB first chunk must contain a JSON object")
			}
			var metadata struct {
				Asset struct {
					Version string `json:"version"`
				} `json:"asset"`
			}
			if err := json.Unmarshal(document, &metadata); err != nil || metadata.Asset.Version != "2.0" {
				return errors.New("GLB JSON chunk must declare glTF asset version 2.0")
			}
		case 1:
			if chunkType != 0x004E4942 {
				return errors.New("GLB second chunk must be binary")
			}
		default:
			return errors.New("GLB contains unsupported extra chunks")
		}
		offset += chunkLength
		chunkIndex++
	}
	if chunkIndex == 0 {
		return errors.New("GLB is missing its JSON chunk")
	}
	return nil
}

func isJSONObject(body []byte) bool {
	var object map[string]json.RawMessage
	return json.Unmarshal(body, &object) == nil && object != nil
}

func (r *EvidenceRecorder) putImmutable(ctx context.Context, payload ArtifactPayload, expectedDigest string) error {
	created, err := r.store.PutIfAbsent(ctx, payload.Key, bytes.NewReader(payload.Body), payload.ContentType)
	if err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	existing, err := r.store.Download(ctx, payload.Key)
	if err != nil {
		return fmt.Errorf("verify existing immutable object: %w", err)
	}
	hasher := sha256.New()
	size, copyErr := io.Copy(hasher, io.LimitReader(contextReader{ctx: ctx, reader: existing}, int64(len(payload.Body))+1))
	closeErr := existing.Close()
	if copyErr != nil {
		return fmt.Errorf("hash existing immutable object: %w", copyErr)
	}
	if closeErr != nil {
		return fmt.Errorf("close existing immutable object: %w", closeErr)
	}
	actualDigest := hex.EncodeToString(hasher.Sum(nil))
	if size != int64(len(payload.Body)) || actualDigest != expectedDigest {
		if created {
			return fmt.Errorf("immutable object verification failed at %q", payload.Key)
		}
		return fmt.Errorf("%w at %q", ErrArtifactConflict, payload.Key)
	}
	return nil
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r contextReader) Read(buffer []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(buffer)
}

func sha256Hex(body []byte) string {
	digest := sha256.Sum256(body)
	return hex.EncodeToString(digest[:])
}
