package liveavatar

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/services/runpod"
	"github.com/stretchr/testify/require"
)

type fakePods struct {
	lastSpec runpod.PodSpec
	stopped  string
}

func (f *fakePods) Deploy(_ context.Context, spec runpod.PodSpec) (*runpod.Pod, error) {
	f.lastSpec = spec
	return &runpod.Pod{ID: "pod-avatar-1", DesiredStatus: "RUNNING"}, nil
}

func (f *fakePods) Terminate(_ context.Context, id string) error {
	f.stopped = id
	return nil
}

func testClient(fake *fakePods) *Client {
	client := newClient(Config{
		LiveKitURL: "wss://livekit.example.test", LiveKitAPIKey: "lk-key", LiveKitAPISecret: "lk-secret",
		RunPodPodAPIKey: "runpod-key", AvatarImage: "ghcr.io/omninudge/avatar:2026.08.0", AvatarGPUTypeID: "NVIDIA RTX A5000",
		WorkerBackendURL: "https://app.example.test",
		RoomPrefix:       "omnichat", TokenTTL: 10 * time.Minute,
	}, fake)
	client.now = func() time.Time { return time.Now().UTC() }
	return client
}

func TestClientStartsPodAndReturnsShortLivedLiveKitToken(t *testing.T) {
	fake := &fakePods{}
	client := testClient(fake)
	callID := uuid.New()
	session, err := client.Start(context.Background(), StartRequest{CallID: callID, UserID: 42, PersonaID: 7, PersonaName: "Sadie", AvatarURL: "https://storage.example.test/sadie.png", Context: "At the park."})
	require.NoError(t, err)
	require.Equal(t, "pod-avatar-1", session.ProviderSessionID)
	require.Equal(t, "wss://livekit.example.test", session.LiveKitURL)
	require.Equal(t, 600, session.TokenTTLSeconds)
	require.NotEmpty(t, session.ParticipantToken)
	require.Equal(t, callID.String(), fake.lastSpec.Environment["OMNICHAT_CALL_ID"])
	require.Equal(t, "https://storage.example.test/sadie.png", fake.lastSpec.Environment["OMNICHAT_AVATAR_IMAGE_URL"])
	require.NotEmpty(t, fake.lastSpec.Environment["LIVEKIT_TOKEN"]) // worker token is intentionally opaque

	parsed, err := jwt.Parse(session.ParticipantToken, func(token *jwt.Token) (any, error) {
		require.Equal(t, jwt.SigningMethodHS256.Alg(), token.Method.Alg())
		return []byte("lk-secret"), nil
	})
	require.NoError(t, err)
	claims, ok := parsed.Claims.(jwt.MapClaims)
	require.True(t, ok)
	require.Equal(t, "lk-key", claims["iss"])
	require.Equal(t, "omnichat-user-42", claims["sub"])
	video, ok := claims["video"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "omnichat-"+strings.ReplaceAll(callID.String(), "-", ""), video["room"])
}

func TestClientStopsOnlyValidatedPodIDs(t *testing.T) {
	fake := &fakePods{}
	client := testClient(fake)
	require.NoError(t, client.EndConversation(context.Background(), "pod-avatar-1"))
	require.Equal(t, "pod-avatar-1", fake.stopped)
	require.Error(t, client.EndConversation(context.Background(), "../metadata"))
}

func TestClientRefreshesUserTokenForTheExistingRoom(t *testing.T) {
	client := testClient(&fakePods{})
	callID := uuid.New()
	token, err := client.RefreshToken(context.Background(), callID, 42)
	require.NoError(t, err)
	require.NotEmpty(t, token)
	parsed, err := jwt.Parse(token, func(token *jwt.Token) (any, error) {
		require.Equal(t, jwt.SigningMethodHS256.Alg(), token.Method.Alg())
		return []byte("lk-secret"), nil
	})
	require.NoError(t, err)
	claims := parsed.Claims.(jwt.MapClaims)
	require.Equal(t, "omnichat-user-42", claims["sub"])
	video := claims["video"].(map[string]any)
	require.Equal(t, "omnichat-"+strings.ReplaceAll(callID.String(), "-", ""), video["room"])
}

func TestClientRequiresCompleteConfiguration(t *testing.T) {
	client := newClient(Config{LiveKitURL: "wss://livekit.example.test"}, &fakePods{})
	require.False(t, client.Configured())
	_, err := client.Start(context.Background(), StartRequest{CallID: uuid.New(), UserID: 1, PersonaID: 1})
	require.Error(t, err)
}

func TestClientResolvesPrivateUploadAvatarURLForWorker(t *testing.T) {
	fake := &fakePods{}
	client := testClient(fake)
	_, err := client.Start(context.Background(), StartRequest{
		CallID: uuid.New(), UserID: 42, PersonaID: 7, PersonaName: "Sadie", AvatarURL: "/uploads/personas/sadie.png",
	})
	require.NoError(t, err)
	require.Equal(t, "https://app.example.test/uploads/personas/sadie.png", fake.lastSpec.Environment["OMNICHAT_AVATAR_IMAGE_URL"])
}

func TestClientRejectsControlCharactersInPersonaMetadata(t *testing.T) {
	client := testClient(&fakePods{})
	_, err := client.Start(context.Background(), StartRequest{
		CallID: uuid.New(), UserID: 1, PersonaID: 1, PersonaName: "Sadie\nInjected",
	})
	require.Error(t, err)
}

func TestClientRejectsNonWebSocketLiveKitURL(t *testing.T) {
	client := testClient(&fakePods{})
	client.cfg.LiveKitURL = "https://livekit.example.test"
	_, err := client.Start(context.Background(), StartRequest{CallID: uuid.New(), UserID: 1, PersonaID: 1, PersonaName: "Sadie"})
	require.EqualError(t, err, "LiveKit URL must use a secure WebSocket (wss)")
}
