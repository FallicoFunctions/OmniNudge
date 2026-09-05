package openrouter

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func videoClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	client := newClient("test-key", "", apiURL, server.Client())
	client.videoURL = server.URL + "/api/v1/videos"
	return client
}

// The request the provider actually receives, read rather than assumed. Every
// defect worth having on this repository's provider paths came from printing
// the payload that crosses the boundary instead of the code that builds it.
func TestSubmitVideoSendsTheDocumentedShape(t *testing.T) {
	var body map[string]any
	var auth, contentType string

	client := videoClient(t, func(w http.ResponseWriter, r *http.Request) {
		auth = r.Header.Get("Authorization")
		contentType = r.Header.Get("Content-Type")
		raw, _ := io.ReadAll(r.Body)
		require.NoError(t, json.Unmarshal(raw, &body))
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"id":"job-1","polling_url":"u","status":"pending"}`))
	})

	seed := int64(4242)
	job, err := client.SubmitVideo(context.Background(), VideoRequest{
		Model:      "bytedance/seedance-2.0-mini",
		Prompt:     "she talks and smiles",
		Duration:   5,
		Resolution: "720p",
		Seed:       &seed,
		FrameImages: []FrameImage{
			{URL: "https://signed.example.test/anchor.png", FrameType: FrameTypeFirst},
		},
	})

	require.NoError(t, err)
	require.Equal(t, "job-1", job.ID)
	require.Equal(t, "Bearer test-key", auth)
	require.Equal(t, "application/json", contentType)

	require.Equal(t, "bytedance/seedance-2.0-mini", body["model"])
	require.Equal(t, "she talks and smiles", body["prompt"])
	require.EqualValues(t, 5, body["duration"])
	require.Equal(t, "720p", body["resolution"])
	require.EqualValues(t, 4242, body["seed"])

	frames, ok := body["frame_images"].([]any)
	require.True(t, ok, "frame_images must be an array: %v", body)
	require.Len(t, frames, 1)
	frame := frames[0].(map[string]any)
	require.Equal(t, "image_url", frame["type"])
	require.Equal(t, "first_frame", frame["frame_type"])
	require.Equal(t, "https://signed.example.test/anchor.png",
		frame["image_url"].(map[string]any)["url"])
}

// A seed of zero is a seed. Sending it as an omitted field would hand the
// provider a fresh random one, and every comparison drawn against it would be
// noise -- which is exactly how a day was lost on the self-hosted path.
func TestSubmitVideoSendsAZeroSeed(t *testing.T) {
	var body map[string]any
	client := videoClient(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		require.NoError(t, json.Unmarshal(raw, &body))
		_, _ = w.Write([]byte(`{"id":"job-1","status":"pending"}`))
	})

	seed := int64(0)
	_, err := client.SubmitVideo(context.Background(), VideoRequest{
		Model: "alibaba/wan-3.0", Prompt: "p", Seed: &seed,
	})

	require.NoError(t, err)
	value, present := body["seed"]
	require.True(t, present, "a zero seed must be sent, not omitted: %v", body)
	require.EqualValues(t, 0, value)
}

// generate_audio false is a real request and must reach the provider. These
// models speak by default, in a voice the provider picks, and every character
// here already has a stored ElevenLabs voice -- so a clip that speaks in a
// different one contradicts her own audio messages. A false dropped by
// omitempty would silently mean "provider default", which is the opposite.
func TestSubmitVideoSendsGenerateAudioFalse(t *testing.T) {
	var body map[string]any
	client := videoClient(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		require.NoError(t, json.Unmarshal(raw, &body))
		_, _ = w.Write([]byte(`{"id":"job-1","status":"pending"}`))
	})

	off := false
	_, err := client.SubmitVideo(context.Background(), VideoRequest{
		Model: "google/veo-3.1-lite", Prompt: "p", GenerateAudio: &off, AspectRatio: "9:16",
	})

	require.NoError(t, err)
	value, present := body["generate_audio"]
	require.True(t, present, "generate_audio=false must be sent, not omitted: %v", body)
	require.Equal(t, false, value)
	require.Equal(t, "9:16", body["aspect_ratio"])
}

// Unset must stay unset. It means "provider default", which is not the same
// request as "no audio", and inventing one would change every caller that has
// not thought about it.
func TestSubmitVideoOmitsGenerateAudioWhenUnset(t *testing.T) {
	var body map[string]any
	client := videoClient(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		require.NoError(t, json.Unmarshal(raw, &body))
		_, _ = w.Write([]byte(`{"id":"job-1","status":"pending"}`))
	})

	_, err := client.SubmitVideo(context.Background(), VideoRequest{Model: "a/b", Prompt: "p"})

	require.NoError(t, err)
	_, present := body["generate_audio"]
	require.False(t, present, "unset must not become false: %v", body)
	_, present = body["aspect_ratio"]
	require.False(t, present, "unset aspect ratio must not become empty string: %v", body)
}

func TestSubmitVideoRefusesWhatCannotSucceed(t *testing.T) {
	client := videoClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("no request should reach the provider")
	})

	_, err := client.SubmitVideo(context.Background(), VideoRequest{Prompt: "p"})
	require.ErrorContains(t, err, "model is required")

	_, err = client.SubmitVideo(context.Background(), VideoRequest{Model: "a/b", Prompt: "  "})
	require.ErrorContains(t, err, "prompt is required")

	_, err = client.SubmitVideo(context.Background(), VideoRequest{Model: "a b/../c", Prompt: "p"})
	require.ErrorContains(t, err, "invalid video model route")

	unconfigured := newClient("", "", apiURL, nil)
	_, err = unconfigured.SubmitVideo(context.Background(), VideoRequest{Model: "a/b", Prompt: "p"})
	require.ErrorIs(t, err, ErrNotConfigured)
}

// The silent-zero shape: the provider says completed and hands back nothing.
// Treated as success, it stores an asset with no bytes and reports a render
// that never happened.
func TestPollVideoRefusesACompletedJobWithNoURL(t *testing.T) {
	client := videoClient(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"id":"job-1","status":"completed","unsigned_urls":[]}`))
	})

	_, err := client.PollVideo(context.Background(), "job-1")

	require.ErrorIs(t, err, ErrVideoJobFailed)
	require.ErrorContains(t, err, "no video url")
}

func TestPollVideoSurfacesTheProviderReason(t *testing.T) {
	client := videoClient(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"id":"job-1","status":"failed","error":"content policy"}`))
	})

	_, err := client.PollVideo(context.Background(), "job-1")

	require.ErrorIs(t, err, ErrVideoJobFailed)
	require.ErrorContains(t, err, "content policy")
}

func TestPollVideoFailsWithoutAReasonRatherThanSilently(t *testing.T) {
	client := videoClient(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"id":"job-1","status":"failed"}`))
	})

	_, err := client.PollVideo(context.Background(), "job-1")

	require.ErrorIs(t, err, ErrVideoJobFailed)
	require.ErrorContains(t, err, "no reason given")
}

func TestPollVideoMapsTransportFailures(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status int
		expect error
	}{
		{"rate limited", http.StatusTooManyRequests, ErrRateLimited},
		{"unauthorized", http.StatusUnauthorized, ErrAccessDenied},
		{"forbidden", http.StatusForbidden, ErrAccessDenied},
		{"server error", http.StatusInternalServerError, ErrTransportOrProvider},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := videoClient(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(`{"error":"nope"}`))
			})

			_, err := client.PollVideo(context.Background(), "job-1")

			require.ErrorIs(t, err, tc.expect)
		})
	}
}

// An unrecognised status must not end the poll. A clip already paid for should
// not be abandoned because this build has not seen the word before.
func TestVideoStatusDoneOnlyOnTerminalStates(t *testing.T) {
	for _, status := range []string{"pending", "running", "queued", "in_progress", "", "COMPLETED_SOON"} {
		require.False(t, VideoStatus{Status: status}.Done(), status)
	}
	for _, status := range []string{"completed", "COMPLETED", " failed ", "Failed"} {
		require.True(t, VideoStatus{Status: status}.Done(), status)
	}
}

func TestWaitForVideoPollsUntilTerminal(t *testing.T) {
	calls := 0
	client := videoClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls < 3 {
			_, _ = w.Write([]byte(`{"id":"job-1","status":"running"}`))
			return
		}
		_, _ = w.Write([]byte(`{"id":"job-1","status":"completed","unsigned_urls":["https://x/1.mp4"]}`))
	})

	status, err := client.WaitForVideo(context.Background(), "job-1", time.Millisecond)

	require.NoError(t, err)
	require.Equal(t, 3, calls)
	require.Equal(t, []string{"https://x/1.mp4"}, status.UnsignedURLs)
}

// Reflection rather than a list of expected fields, for the reason the RunPod
// Result carries the same check: a list is one more thing to remember to
// update, which is the failure being prevented. ModelID was declared on that
// struct, decoded by nothing and stored nowhere, for a month.
func TestEveryFieldOnVideoStatusIsDecoded(t *testing.T) {
	const everyKey = `{"id":"job-1","status":"completed",
	  "unsigned_urls":["https://x/1.mp4"],"error":"something"}`

	var status VideoStatus
	require.NoError(t, json.Unmarshal([]byte(everyKey), &status))

	value := reflect.ValueOf(status)
	for i := 0; i < value.NumField(); i++ {
		field := value.Type().Field(i)
		if !field.IsExported() {
			continue
		}
		require.Falsef(t, value.Field(i).IsZero(),
			"VideoStatus.%s stayed at its zero value after decoding a payload that sets every key: "+
				"the field is declared but nothing reads it", field.Name)
	}
}

func TestEveryFieldOnVideoJobIsDecoded(t *testing.T) {
	const everyKey = `{"id":"job-1","polling_url":"https://x/poll","status":"pending"}`

	var job VideoJob
	require.NoError(t, json.Unmarshal([]byte(everyKey), &job))

	value := reflect.ValueOf(job)
	for i := 0; i < value.NumField(); i++ {
		field := value.Type().Field(i)
		if !field.IsExported() {
			continue
		}
		require.Falsef(t, value.Field(i).IsZero(),
			"VideoJob.%s stayed at its zero value after decoding a payload that sets every key", field.Name)
	}
}

func TestSubmitVideoRejectsAResponseWithNoJobID(t *testing.T) {
	client := videoClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"status":"pending"}`))
	})

	_, err := client.SubmitVideo(context.Background(), VideoRequest{Model: "a/b", Prompt: "p"})

	require.True(t, errors.Is(err, ErrTransportOrProvider))
	require.ErrorContains(t, err, "no job id")
}
