package runpod

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPodClientDeploySendsGraphQLSpecAndBearerAuth(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer pod-secret", r.Header.Get("Authorization"))
		var request graphQLRequest
		require.NoError(t, json.NewDecoder(r.Body).Decode(&request))
		require.Contains(t, request.Query, "podFindAndDeployOnDemand")
		input, ok := request.Variables["input"].(map[string]any)
		require.True(t, ok)
		require.Equal(t, "NVIDIA RTX A5000", input["gpuTypeId"])
		require.Equal(t, "COMMUNITY", input["cloudType"])
		require.Equal(t, "7880/http,22/tcp", input["ports"])
		require.Equal(t, "call-1", input["env"].([]any)[0].(map[string]any)["value"])
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"podFindAndDeployOnDemand":{"id":"pod-1","name":"omnichat-call","desiredStatus":"RUNNING"}}}`))
	}))
	defer server.Close()

	client := NewPodClientWithHTTPClient("pod-secret", "https://api.runpod.io/graphql", server.Client())
	client.endpoint = server.URL // test transport endpoint is HTTP; validation is covered separately.
	// The test endpoint is intentionally accepted only by replacing the client
	// request method below; deploy validation remains production-strict.
	client.endpoint = "https://api.runpod.io/graphql"
	client.httpClient.Transport = rewriteURLTransport{base: server.URL, next: http.DefaultTransport}

	pod, err := client.Deploy(context.Background(), PodSpec{
		Name: "omnichat-call", ImageName: "ghcr.io/example/avatar:1.0.0", GPUTypeID: "NVIDIA RTX A5000", GPUCount: 1,
		ContainerDiskGB: 40, VolumeGB: 20, VolumeMountPath: "/models", MinVCPU: 4, MinMemoryGB: 16,
		Environment: map[string]string{"CALL_ID": "call-1"}, CloudType: "COMMUNITY", Ports: []string{"7880/http", "22/tcp"},
	})
	require.NoError(t, err)
	require.Equal(t, "pod-1", pod.ID)
}

func TestPodClientRejectsUnsafeConfigurationAndSecretsAreNotInErrors(t *testing.T) {
	client := NewPodClient("pod-secret", "http://internal.example/graphql")
	_, err := client.Get(context.Background(), "pod-1")
	require.ErrorIs(t, err, ErrInvalidConfiguration)
	require.NotContains(t, err.Error(), "pod-secret")

	client = NewPodClient("pod-secret", "https://api.runpod.io/graphql")
	_, err = client.Get(context.Background(), "../metadata")
	require.EqualError(t, err, "runpod pod id is invalid")
	_, err = client.Deploy(context.Background(), PodSpec{Name: "call", ImageName: "x", GPUTypeID: "gpu", GPUCount: 1, ContainerDiskGB: 1, MinVCPU: 1, MinMemoryGB: 1, VolumeMountPath: "/models", Environment: map[string]string{"BAD-KEY": "x"}})
	require.EqualError(t, err, "runpod pod environment is invalid")
	validSpec := PodSpec{
		Name: "call", ImageName: "x", GPUTypeID: "gpu", GPUCount: 1,
		ContainerDiskGB: 1, MinVCPU: 1, MinMemoryGB: 1, VolumeMountPath: "/models",
		CloudType: "ALL",
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"podFindAndDeployOnDemand":{"id":"pod-1"}}}`))
	}))
	defer server.Close()
	client = NewPodClientWithHTTPClient("pod-secret", "https://api.runpod.io/graphql", server.Client())
	client.httpClient.Transport = rewriteURLTransport{base: server.URL, next: http.DefaultTransport}
	_, err = client.Deploy(context.Background(), validSpec)
	require.NoError(t, err)
}

func TestPodClientGetAndTerminate(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var request graphQLRequest
		require.NoError(t, json.NewDecoder(r.Body).Decode(&request))
		w.Header().Set("Content-Type", "application/json")
		if calls == 1 {
			_, _ = w.Write([]byte(`{"data":{"pod":{"id":"pod-1","name":"call","desiredStatus":"RUNNING"}}}`))
			return
		}
		_, _ = w.Write([]byte(`{"data":{"podTerminate":{"id":"pod-1","desiredStatus":"EXITED"}}}`))
	}))
	defer server.Close()
	client := NewPodClientWithHTTPClient("pod-secret", "https://api.runpod.io/graphql", server.Client())
	client.httpClient.Transport = rewriteURLTransport{base: server.URL, next: http.DefaultTransport}
	pod, err := client.Get(context.Background(), "pod-1")
	require.NoError(t, err)
	require.Equal(t, "RUNNING", pod.DesiredStatus)
	require.NoError(t, client.Terminate(context.Background(), "pod-1"))
	require.Equal(t, 2, calls)
}

type rewriteURLTransport struct {
	base string
	next http.RoundTripper
}

func (t rewriteURLTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	copy := request.Clone(request.Context())
	base, err := request.URL.Parse(t.base)
	if err != nil {
		return nil, err
	}
	base.Path = request.URL.Path
	base.RawQuery = request.URL.RawQuery
	copy.URL = base
	return t.next.RoundTrip(copy)
}
