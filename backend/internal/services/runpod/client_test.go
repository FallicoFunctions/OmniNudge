package runpod

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestClientSubmitUsesRunPodEnvelopeAndBearerAuth(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/endpoint-image/run", r.URL.Path)
		require.Equal(t, "Bearer secret-key", r.Header.Get("Authorization"))
		var payload struct {
			Input map[string]any `json:"input"`
		}
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		require.Equal(t, "portrait in a park", payload.Input["prompt"])
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"job-123","status":"IN_QUEUE"}`))
	}))
	defer server.Close()

	client := newClient("secret-key", server.URL, server.Client())
	jobID, err := client.Submit(context.Background(), " endpoint-image ", map[string]any{"prompt": "portrait in a park"})

	require.NoError(t, err)
	require.Equal(t, "job-123", jobID)
}

func TestClientSubmitIncludesBoundedExecutionPolicyWhenConfigured(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Policy requestPolicy `json:"policy"`
		}
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		require.Equal(t, 120000, payload.Policy.ExecutionTimeoutMS)
		require.Equal(t, 240000, payload.Policy.TTLMS)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"job-123","status":"IN_QUEUE"}`))
	}))
	defer server.Close()

	_, err := newClientWithTimeout("secret-key", server.URL, server.Client(), 120).Submit(
		context.Background(), "endpoint-image", map[string]any{"prompt": "portrait"},
	)
	require.NoError(t, err)
}

func TestClientClampsRunPodPolicyToProviderMinimums(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Policy requestPolicy `json:"policy"`
		}
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		require.Equal(t, 5000, payload.Policy.ExecutionTimeoutMS)
		require.Equal(t, 10000, payload.Policy.TTLMS)
		_, _ = w.Write([]byte(`{"id":"job-123","status":"IN_QUEUE"}`))
	}))
	defer server.Close()

	_, err := newClientWithTimeout("secret-key", server.URL, server.Client(), 1).Submit(
		context.Background(), "endpoint-image", map[string]any{"prompt": "portrait"},
	)
	require.NoError(t, err)
}

func TestClientRejectsUnsafeEndpointAndJobPath(t *testing.T) {
	client := newClient("secret-key", "https://api.runpod.ai/v2", http.DefaultClient)
	_, err := client.Submit(context.Background(), "../metadata", map[string]any{"prompt": "x"})
	require.EqualError(t, err, "runpod endpoint id is invalid")
	require.ErrorIs(t, err, ErrInvalidConfiguration)

	_, err = client.Status(context.Background(), "endpoint-image", "../metadata")
	require.EqualError(t, err, "runpod job id is invalid")
}

func TestClientRejectsUntrustedBaseURLBeforeSendingCredentials(t *testing.T) {
	client := newClient("secret-key", "https://internal.example.test/v2", http.DefaultClient)
	_, err := client.Submit(context.Background(), "endpoint-image", map[string]any{"prompt": "x"})
	require.EqualError(t, err, "runpod base URL must use api.runpod.ai")
	require.ErrorIs(t, err, ErrInvalidConfiguration)

	client = newClient("secret-key", "https://api.runpod.ai:8443/v2", http.DefaultClient)
	_, err = client.Submit(context.Background(), "endpoint-image", map[string]any{"prompt": "x"})
	require.EqualError(t, err, "runpod base URL must use HTTPS port 443")
	require.ErrorIs(t, err, ErrInvalidConfiguration)
}

func TestClientStatusAndResultUseRunPodRoutes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer secret-key", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/endpoint-image/status/job-123":
			_, _ = w.Write([]byte(`{"id":"job-123","status":"IN_PROGRESS"}`))
		case "/endpoint-image/status/job-complete":
			_, _ = w.Write([]byte(`{"id":"job-complete","status":"COMPLETED","output":{"images":[{"url":"https://storage.googleapis.com/bucket/a.png","width":1024,"height":1024}]}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := newClient("secret-key", server.URL, server.Client())
	status, err := client.Status(context.Background(), "endpoint-image", "job-123")
	require.NoError(t, err)
	require.Equal(t, StatusInProgress, status.Status)

	result, err := client.Result(context.Background(), "endpoint-image", "job-complete")
	require.NoError(t, err)
	require.Len(t, result.Images, 1)
	require.Equal(t, 1024, result.Images[0].Width)
}

func TestClientResultDecodesVideoContract(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"job-video","status":"COMPLETED","output":{"video":{"url":"https://storage.googleapis.com/bucket/a.mp4","content_type":"video/mp4","duration":7}}}`))
	}))
	defer server.Close()

	result, err := newClient("secret-key", server.URL, server.Client()).Result(context.Background(), "endpoint-video", "job-video")
	require.NoError(t, err)
	require.NotNil(t, result.Video)
	require.Equal(t, "video/mp4", result.Video.ContentType)
	require.Equal(t, float64(7), result.Video.Duration)
}

func TestClientNormalizesSingleOutputURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"COMPLETED","output":"https://storage.googleapis.com/bucket/a.png"}`))
	}))
	defer server.Close()

	result, err := newClient("secret-key", server.URL, server.Client()).Result(context.Background(), "endpoint-image", "job-123")
	require.NoError(t, err)
	require.Len(t, result.Images, 1)
	require.Equal(t, "https://storage.googleapis.com/bucket/a.png", result.Images[0].URL)
}

func TestClientNormalizesPublishedWorkerImageShapes(t *testing.T) {
	for _, test := range []struct {
		name   string
		output string
		want   []string
	}{
		{name: "image url field", output: `{"image":"https://storage.googleapis.com/bucket/a.png"}`, want: []string{"https://storage.googleapis.com/bucket/a.png"}},
		{name: "image list strings", output: `{"images":["https://storage.googleapis.com/bucket/a.png","https://storage.googleapis.com/bucket/b.png"]}`, want: []string{"https://storage.googleapis.com/bucket/a.png", "https://storage.googleapis.com/bucket/b.png"}},
		{name: "published array", output: `[{"image":"https://storage.googleapis.com/bucket/a.png"}]`, want: []string{"https://storage.googleapis.com/bucket/a.png"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"status":"COMPLETED","output":` + test.output + `}`))
			}))
			defer server.Close()

			result, err := newClient("secret-key", server.URL, server.Client()).Result(context.Background(), "endpoint-image", "job-123")
			require.NoError(t, err)
			require.Len(t, result.Images, len(test.want))
			if test.name == "image url field" {
				require.NotNil(t, result.Image)
			}
			for index, want := range test.want {
				require.Equal(t, want, result.Images[index].URL)
			}
		})
	}
}

func TestClientNormalizesPublishedWorkerVideoShape(t *testing.T) {
	for _, output := range []string{
		`[{"video":"https://storage.googleapis.com/bucket/a.mp4"}]`,
		`[{"url":"https://storage.googleapis.com/bucket/b.mp4"}]`,
	} {
		output := output
		t.Run(output, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"status":"COMPLETED","output":` + output + `}`))
			}))
			defer server.Close()

			result, err := newClient("secret-key", server.URL, server.Client()).Result(context.Background(), "endpoint-video", "job-video")
			require.NoError(t, err)
			require.NotNil(t, result.Video)
			require.Contains(t, result.Video.URL, ".mp4")
		})
	}
}

func TestClientMapsTerminalStatuses(t *testing.T) {
	for _, test := range []struct {
		name string
		body string
		err  error
	}{
		{name: "failed", body: `{"status":"FAILED"}`, err: ErrJobFailed},
		{name: "cancelled", body: `{"status":"CANCELLED"}`, err: ErrJobCancelled},
		{name: "timed out", body: `{"status":"TIMED_OUT"}`, err: ErrJobTimedOut},
	} {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(test.body))
			}))
			defer server.Close()
			_, err := newClient("secret-key", server.URL, server.Client()).Result(context.Background(), "endpoint-image", "job-123")
			require.ErrorIs(t, err, test.err)
		})
	}
}

func TestClientCancelUsesPostCancelRoute(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/endpoint-image/cancel/job-123", r.URL.Path)
		require.Equal(t, "Bearer secret-key", r.Header.Get("Authorization"))
		calls.Add(1)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	require.NoError(t, newClient("secret-key", server.URL, server.Client()).Cancel(context.Background(), "endpoint-image", "job-123"))
	require.Equal(t, int32(1), calls.Load())
}

func TestClientDoesNotLeakProviderErrorBodyOrFollowRedirect(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Empty(t, r.Header.Get("Authorization"))
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusTemporaryRedirect)
	}))
	defer origin.Close()

	_, err := newClient("secret-key", origin.URL, origin.Client()).Submit(context.Background(), "endpoint-image", map[string]any{"prompt": "x"})
	require.Error(t, err)

	errorServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"detail":"internal provider stack and secret"}`, http.StatusInternalServerError)
	}))
	defer errorServer.Close()
	_, err = newClient("secret-key", errorServer.URL, errorServer.Client()).Submit(context.Background(), "endpoint-image", map[string]any{"prompt": "x"})
	require.Error(t, err)
	require.NotContains(t, err.Error(), "internal provider stack")
}

func TestClientRejectsOversizedResponseAndRequest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"id":"job-123","status":"IN_QUEUE"}` + strings.Repeat(" ", maxJSONResponse)))
	}))
	defer server.Close()
	_, err := newClient("secret-key", server.URL, server.Client()).Submit(context.Background(), "endpoint-image", map[string]any{"prompt": "x"})
	require.EqualError(t, err, "runpod response exceeds size limit")

	client := newClient("secret-key", "https://api.runpod.ai/v2", http.DefaultClient)
	_, err = client.Submit(context.Background(), "endpoint-image", map[string]any{"prompt": strings.Repeat("x", maxJSONRequest)})
	require.EqualError(t, err, "runpod request exceeds size limit")
}
