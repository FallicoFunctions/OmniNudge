package pipeline

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type memoryImmutableStore struct {
	mu      sync.Mutex
	objects map[string][]byte
}

func newMemoryImmutableStore() *memoryImmutableStore {
	return &memoryImmutableStore{objects: make(map[string][]byte)}
}

func (s *memoryImmutableStore) PutIfAbsent(ctx context.Context, key string, body io.Reader, _ string) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	contents, err := io.ReadAll(body)
	if err != nil {
		return false, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.objects[key]; exists {
		return false, nil
	}
	s.objects[key] = bytes.Clone(contents)
	return true, nil
}

func (s *memoryImmutableStore) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	contents, exists := s.objects[key]
	if !exists {
		return nil, errors.New("object not found")
	}
	return io.NopCloser(bytes.NewReader(bytes.Clone(contents))), nil
}

func evidencePayloads(jobID string) (ArtifactPayload, ArtifactPayload) {
	prefix := "omniavatar/jobs/" + jobID + "/testing/"
	return ArtifactPayload{
			Key:         prefix + "avatar.glb",
			ContentType: "model/gltf-binary",
			Body:        minimalGLB(`{"asset":{"version":"2.0"}}`),
		}, ArtifactPayload{
			Key:         prefix + "validation.json",
			ContentType: "application/json",
			Body:        []byte(`{"valid":true}`),
		}
}

func minimalGLB(document string) []byte {
	jsonChunk := []byte(document)
	for len(jsonChunk)%4 != 0 {
		jsonChunk = append(jsonChunk, ' ')
	}
	body := make([]byte, 20+len(jsonChunk))
	copy(body[:4], "glTF")
	binary.LittleEndian.PutUint32(body[4:8], 2)
	binary.LittleEndian.PutUint32(body[8:12], uint32(len(body)))
	binary.LittleEndian.PutUint32(body[12:16], uint32(len(jsonChunk)))
	binary.LittleEndian.PutUint32(body[16:20], 0x4E4F534A)
	copy(body[20:], jsonChunk)
	return body
}

func TestEvidenceRecorderWritesHashedImmutablePair(t *testing.T) {
	store := newMemoryImmutableStore()
	recorder, err := NewEvidenceRecorder(store)
	require.NoError(t, err)
	jobID := uuid.NewString()
	artifact, report := evidencePayloads(jobID)

	evidence, err := recorder.Record(context.Background(), jobID, "runtime-glb", artifact, report, testTime)
	require.NoError(t, err)
	require.Equal(t, artifact.Key, evidence.ArtifactKey)
	require.Equal(t, sha256Hex(artifact.Body), evidence.ArtifactSHA256)
	require.Equal(t, artifact.ContentType, evidence.ArtifactMediaType)
	require.Equal(t, int64(len(artifact.Body)), evidence.ArtifactBytes)
	require.Equal(t, sha256Hex(report.Body), evidence.ReportSHA256)
	require.Equal(t, report.ContentType, evidence.ReportMediaType)
	require.Equal(t, int64(len(report.Body)), evidence.ReportBytes)
	require.Equal(t, testTime.UTC(), evidence.CreatedAt)
	require.Equal(t, artifact.Body, store.objects[artifact.Key])
	require.Equal(t, report.Body, store.objects[report.Key])

	replayed, err := recorder.Record(context.Background(), jobID, "runtime-glb", artifact, report, testTime.Add(time.Second))
	require.NoError(t, err)
	require.Equal(t, evidence.ArtifactSHA256, replayed.ArtifactSHA256)
}

func TestEvidenceSnapshotRejectsMissingOrImpossibleMediaMetadata(t *testing.T) {
	evidence := validEvidence(uuid.NewString(), "runtime-glb")
	evidence.ArtifactMediaType = ""
	require.ErrorContains(t, evidence.Validate(), "media type")
	evidence = validEvidence(uuid.NewString(), "runtime-glb")
	evidence.ArtifactBytes = int64(maxArtifactBytes) + 1
	require.ErrorContains(t, evidence.Validate(), "byte length")
	evidence = validEvidence(uuid.NewString(), "runtime-glb")
	evidence.ReportMediaType = "text/plain"
	require.ErrorContains(t, evidence.Validate(), "application/json")
	evidence = validEvidence(uuid.NewString(), "runtime-glb")
	evidence.ArtifactMediaType = "image/png"
	require.ErrorContains(t, evidence.Validate(), "does not match media type")
	evidence = validEvidence(uuid.NewString(), "runtime-glb")
	evidence.ReportKey = strings.TrimSuffix(evidence.ReportKey, ".json") + ".bin"
	require.ErrorContains(t, evidence.Validate(), "does not match media type")
}

func TestEvidenceRecorderRejectsConflictingReplay(t *testing.T) {
	store := newMemoryImmutableStore()
	recorder, err := NewEvidenceRecorder(store)
	require.NoError(t, err)
	jobID := uuid.NewString()
	artifact, report := evidencePayloads(jobID)
	_, err = recorder.Record(context.Background(), jobID, "runtime-glb", artifact, report, testTime)
	require.NoError(t, err)

	artifact.Body = minimalGLB(`{"asset":{"version":"2.0","generator":"conflict"}}`)
	_, err = recorder.Record(context.Background(), jobID, "runtime-glb", artifact, report, testTime.Add(time.Second))
	require.ErrorIs(t, err, ErrArtifactConflict)
	require.Equal(t, minimalGLB(`{"asset":{"version":"2.0"}}`), store.objects[artifact.Key])
}

func TestEvidenceRecorderValidatesBeforeWriting(t *testing.T) {
	store := newMemoryImmutableStore()
	recorder, err := NewEvidenceRecorder(store)
	require.NoError(t, err)
	jobID := uuid.NewString()
	artifact, report := evidencePayloads(jobID)
	artifact.Key = "omniavatar/jobs/" + uuid.NewString() + "/testing/avatar.glb"

	_, err = recorder.Record(context.Background(), jobID, "runtime-glb", artifact, report, testTime)
	require.ErrorContains(t, err, "job namespace")
	require.Empty(t, store.objects)
}

func TestEvidenceRecorderRequiresCanonicalJobID(t *testing.T) {
	store := newMemoryImmutableStore()
	recorder, err := NewEvidenceRecorder(store)
	require.NoError(t, err)
	artifact, report := evidencePayloads("not-a-uuid")

	_, err = recorder.Record(context.Background(), "not-a-uuid", "runtime-glb", artifact, report, testTime)
	require.ErrorContains(t, err, "canonical UUID")
	require.Empty(t, store.objects)
}

func TestEvidenceRecorderRejectsSharedArtifactAndReportKey(t *testing.T) {
	store := newMemoryImmutableStore()
	recorder, err := NewEvidenceRecorder(store)
	require.NoError(t, err)
	jobID := uuid.NewString()
	artifact, report := evidencePayloads(jobID)
	report.Key = artifact.Key

	_, err = recorder.Record(context.Background(), jobID, "runtime-glb", artifact, report, testTime)
	require.ErrorContains(t, err, "distinct")
	require.Empty(t, store.objects)
}

func TestEvidenceRecorderHonorsCancelledContext(t *testing.T) {
	store := newMemoryImmutableStore()
	recorder, err := NewEvidenceRecorder(store)
	require.NoError(t, err)
	jobID := uuid.NewString()
	artifact, report := evidencePayloads(jobID)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err = recorder.Record(ctx, jobID, "runtime-glb", artifact, report, testTime)
	require.ErrorIs(t, err, context.Canceled)
	require.Empty(t, store.objects)
}

func TestEvidenceRecorderRejectsMIMEConfusionAndInvalidReport(t *testing.T) {
	store := newMemoryImmutableStore()
	recorder, err := NewEvidenceRecorder(store)
	require.NoError(t, err)
	jobID := uuid.NewString()
	artifact, report := evidencePayloads(jobID)
	artifact.ContentType = "text/html"
	artifact.Body = []byte("<script>alert(1)</script>")
	_, err = recorder.Record(context.Background(), jobID, "runtime-glb", artifact, report, testTime)
	require.ErrorContains(t, err, "not allowed")
	require.Empty(t, store.objects)

	artifact, report = evidencePayloads(jobID)
	report.Body = []byte("not json")
	_, err = recorder.Record(context.Background(), jobID, "runtime-glb", artifact, report, testTime)
	require.ErrorContains(t, err, "valid JSON object")
	require.Empty(t, store.objects)
}

func TestEvidenceRecorderDecodesImageArtifacts(t *testing.T) {
	store := newMemoryImmutableStore()
	recorder, err := NewEvidenceRecorder(store)
	require.NoError(t, err)
	jobID := uuid.NewString()
	picture := image.NewNRGBA(image.Rect(0, 0, 2, 2))
	picture.Set(0, 0, color.NRGBA{R: 255, A: 255})
	var encoded bytes.Buffer
	require.NoError(t, png.Encode(&encoded, picture))
	artifact, report := evidencePayloads(jobID)
	artifact.Key = "omniavatar/jobs/" + jobID + "/testing/frame.png"
	artifact.ContentType = "image/png"
	artifact.Body = encoded.Bytes()

	_, err = recorder.Record(context.Background(), jobID, "review-frame", artifact, report, testTime)
	require.NoError(t, err)

	polyglotJobID := uuid.NewString()
	artifact, report = evidencePayloads(polyglotJobID)
	artifact.Key = "omniavatar/jobs/" + polyglotJobID + "/testing/frame.png"
	artifact.ContentType = "image/png"
	artifact.Body = append(bytes.Clone(encoded.Bytes()), []byte("<script>alert(1)</script>")...)
	_, err = recorder.Record(context.Background(), polyglotJobID, "review-frame", artifact, report, testTime)
	require.ErrorContains(t, err, "trailing data")

	wrongExtensionJobID := uuid.NewString()
	artifact, report = evidencePayloads(wrongExtensionJobID)
	artifact.Key = "omniavatar/jobs/" + wrongExtensionJobID + "/testing/frame.jpg"
	artifact.ContentType = "image/png"
	artifact.Body = encoded.Bytes()
	_, err = recorder.Record(context.Background(), wrongExtensionJobID, "review-frame", artifact, report, testTime)
	require.ErrorContains(t, err, "does not match media type")

	badJobID := uuid.NewString()
	artifact, report = evidencePayloads(badJobID)
	artifact.Key = "omniavatar/jobs/" + badJobID + "/testing/frame.png"
	artifact.ContentType = "image/png"
	artifact.Body = []byte("\x89PNG\r\n\x1a\ntruncated")
	_, err = recorder.Record(context.Background(), badJobID, "review-frame", artifact, report, testTime)
	require.ErrorContains(t, err, "truncated chunk")
}

func TestImageEnvelopeRejectsTrailingOrMismatchedLengths(t *testing.T) {
	var encodedJPEG bytes.Buffer
	require.NoError(t, jpeg.Encode(&encodedJPEG, image.NewRGBA(image.Rect(0, 0, 2, 2)), nil))
	require.NoError(t, validateImageEnvelope("image/jpeg", encodedJPEG.Bytes()))
	require.ErrorContains(t, validateImageEnvelope("image/jpeg", append(bytes.Clone(encodedJPEG.Bytes()), 0x00, 0xff, 0xd9)), "trailing data")

	minimalWebP := []byte{'R', 'I', 'F', 'F', 4, 0, 0, 0, 'W', 'E', 'B', 'P'}
	require.NoError(t, validateImageEnvelope("image/webp", minimalWebP))
	minimalWebP[4] = 5
	require.ErrorContains(t, validateImageEnvelope("image/webp", minimalWebP), "declared length")
}

func TestEvidenceRecorderRejectsMalformedGLBHeader(t *testing.T) {
	store := newMemoryImmutableStore()
	recorder, err := NewEvidenceRecorder(store)
	require.NoError(t, err)
	jobID := uuid.NewString()
	artifact, report := evidencePayloads(jobID)
	artifact.Body[4] = 1
	_, err = recorder.Record(context.Background(), jobID, "runtime-glb", artifact, report, testTime)
	require.ErrorContains(t, err, "version")

	artifact, report = evidencePayloads(jobID)
	artifact.Body[8]++
	_, err = recorder.Record(context.Background(), jobID, "runtime-glb", artifact, report, testTime)
	require.ErrorContains(t, err, "declared length")

	artifact, report = evidencePayloads(jobID)
	binary.LittleEndian.PutUint32(artifact.Body[16:20], 0x004E4942)
	_, err = recorder.Record(context.Background(), jobID, "runtime-glb", artifact, report, testTime)
	require.ErrorContains(t, err, "JSON object")

	artifact, report = evidencePayloads(jobID)
	artifact.Body = minimalGLB(`{}`)
	_, err = recorder.Record(context.Background(), jobID, "runtime-glb", artifact, report, testTime)
	require.ErrorContains(t, err, "asset version 2.0")
	require.Empty(t, store.objects)
}

type corruptingImmutableStore struct {
	*memoryImmutableStore
}

func (s *corruptingImmutableStore) PutIfAbsent(ctx context.Context, key string, body io.Reader, contentType string) (bool, error) {
	created, err := s.memoryImmutableStore.PutIfAbsent(ctx, key, body, contentType)
	if err == nil && created {
		s.memoryImmutableStore.mu.Lock()
		s.memoryImmutableStore.objects[key] = []byte("corrupted")
		s.memoryImmutableStore.mu.Unlock()
	}
	return created, err
}

func TestEvidenceRecorderVerifiesNewlyStoredBytes(t *testing.T) {
	store := &corruptingImmutableStore{memoryImmutableStore: newMemoryImmutableStore()}
	recorder, err := NewEvidenceRecorder(store)
	require.NoError(t, err)
	jobID := uuid.NewString()
	artifact, report := evidencePayloads(jobID)
	_, err = recorder.Record(context.Background(), jobID, "runtime-glb", artifact, report, testTime)
	require.ErrorContains(t, err, "verification failed")
}
