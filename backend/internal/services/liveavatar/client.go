package liveavatar

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	pathpkg "path"
	"regexp"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/services/runpod"
)

const ProviderName = "runpod_livekit"

var roomPartPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,96}$`)

type Config struct {
	LiveKitURL       string
	LiveKitAPIKey    string
	LiveKitAPISecret string
	RoomPrefix       string
	TokenTTL         time.Duration
	RunPodPodAPIKey  string
	RunPodPodAPIURL  string
	AvatarImage      string
	AvatarGPUTypeID  string
	AvatarGPUCount   int
	AvatarDiskGB     int
	AvatarVolumeGB   int
	AvatarVCPU       int
	AvatarMemoryGB   int
	NetworkVolumeID  string
	VolumeMountPath  string
	AvatarPorts      []string
	InputHosts       []string
	WorkerBackendURL string
}

type StartRequest struct {
	CallID      uuid.UUID
	UserID      int
	PersonaID   int
	PersonaName string
	AvatarURL   string
	Context     string
}

type Session struct {
	ProviderSessionID string
	RoomName          string
	LiveKitURL        string
	ParticipantToken  string
	TokenTTLSeconds   int
}

type podLifecycle interface {
	Deploy(context.Context, runpod.PodSpec) (*runpod.Pod, error)
	Terminate(context.Context, string) error
}

type Client struct {
	cfg  Config
	pods podLifecycle
	now  func() time.Time
}

func NewClient(cfg Config) *Client {
	return newClient(cfg, runpod.NewPodClient(cfg.RunPodPodAPIKey, cfg.RunPodPodAPIURL))
}

func newClient(cfg Config, pods podLifecycle) *Client {
	if cfg.RoomPrefix == "" {
		cfg.RoomPrefix = "omnichat"
	}
	if cfg.TokenTTL <= 0 {
		cfg.TokenTTL = 10 * time.Minute
	}
	if cfg.AvatarGPUCount <= 0 {
		cfg.AvatarGPUCount = 1
	}
	if cfg.AvatarDiskGB <= 0 {
		cfg.AvatarDiskGB = 40
	}
	if cfg.AvatarVCPU <= 0 {
		cfg.AvatarVCPU = 4
	}
	if cfg.AvatarMemoryGB <= 0 {
		cfg.AvatarMemoryGB = 16
	}
	if cfg.VolumeMountPath == "" {
		cfg.VolumeMountPath = "/models"
	}
	return &Client{cfg: cfg, pods: pods, now: time.Now}
}

func (c *Client) Configured() bool {
	return c != nil && c.pods != nil && strings.TrimSpace(c.cfg.LiveKitURL) != "" &&
		strings.TrimSpace(c.cfg.LiveKitAPIKey) != "" && strings.TrimSpace(c.cfg.LiveKitAPISecret) != "" &&
		strings.TrimSpace(c.cfg.RunPodPodAPIKey) != "" && strings.TrimSpace(c.cfg.AvatarImage) != "" &&
		strings.TrimSpace(c.cfg.AvatarGPUTypeID) != ""
}

func (c *Client) Start(ctx context.Context, request StartRequest) (*Session, error) {
	if !c.Configured() {
		return nil, errors.New("self-hosted live avatar is not configured")
	}
	if request.CallID == uuid.Nil || request.UserID <= 0 || request.PersonaID <= 0 {
		return nil, errors.New("invalid live avatar call")
	}
	if len([]rune(request.PersonaName)) > 200 || len([]rune(request.AvatarURL)) > 2_048 || len([]rune(request.Context)) > 20_000 || strings.ContainsAny(request.PersonaName, "\x00\r\n") || strings.ContainsAny(request.AvatarURL, "\x00\r\n") {
		return nil, errors.New("live avatar context is too long")
	}
	roomName, err := c.roomName(request.CallID)
	if err != nil {
		return nil, err
	}
	serverURL, err := validatedLiveKitURL(c.cfg.LiveKitURL)
	if err != nil {
		return nil, err
	}
	userToken, err := c.token(fmt.Sprintf("omnichat-user-%d", request.UserID), roomName, true, true)
	if err != nil {
		return nil, err
	}
	workerToken, err := c.token("omnichat-avatar-"+request.CallID.String(), roomName, true, true)
	if err != nil {
		return nil, err
	}
	avatarURL := c.resolveAvatarURL(request.AvatarURL)
	environment := map[string]string{
		"LIVEKIT_URL":               serverURL,
		"LIVEKIT_TOKEN":             workerToken,
		"OMNICHAT_CALL_ID":          request.CallID.String(),
		"OMNICHAT_PERSONA_ID":       fmt.Sprintf("%d", request.PersonaID),
		"OMNICHAT_PERSONA_NAME":     request.PersonaName,
		"OMNICHAT_AVATAR_IMAGE_URL": avatarURL,
		"OMNICHAT_BACKEND_URL":      c.cfg.WorkerBackendURL,
		"OMNICHAT_WORKER_PROVIDER":  ProviderName,
	}
	if len(c.cfg.InputHosts) > 0 {
		environment["OMNICHAT_INPUT_HOSTS"] = strings.Join(c.cfg.InputHosts, ",")
	}
	pod, err := c.pods.Deploy(ctx, runpod.PodSpec{
		Name:            "omnichat-avatar-" + strings.ReplaceAll(request.CallID.String(), "-", "")[:12],
		ImageName:       c.cfg.AvatarImage,
		GPUTypeID:       c.cfg.AvatarGPUTypeID,
		GPUCount:        c.cfg.AvatarGPUCount,
		ContainerDiskGB: c.cfg.AvatarDiskGB,
		VolumeGB:        c.cfg.AvatarVolumeGB,
		NetworkVolumeID: c.cfg.NetworkVolumeID,
		VolumeMountPath: c.cfg.VolumeMountPath,
		MinVCPU:         c.cfg.AvatarVCPU,
		MinMemoryGB:     c.cfg.AvatarMemoryGB,
		Ports:           c.cfg.AvatarPorts,
		Environment:     environment,
		CloudType:       "COMMUNITY",
	})
	if err != nil {
		return nil, errors.New("live avatar worker could not be started")
	}
	if pod == nil || pod.ID == "" {
		return nil, errors.New("live avatar worker returned no pod")
	}
	return &Session{
		ProviderSessionID: pod.ID,
		RoomName:          roomName,
		LiveKitURL:        serverURL,
		ParticipantToken:  userToken,
		TokenTTLSeconds:   int(c.cfg.TokenTTL / time.Second),
	}, nil
}

// RefreshToken issues a new browser participant token for an active room.
// LiveKit tokens are intentionally short-lived; the API can refresh them
// without restarting the GPU Pod or exposing the signing secret.
func (c *Client) RefreshToken(_ context.Context, callID uuid.UUID, userID int) (string, error) {
	if !c.Configured() {
		return "", errors.New("self-hosted live avatar is not configured")
	}
	if callID == uuid.Nil || userID <= 0 {
		return "", errors.New("invalid live avatar call")
	}
	roomName, err := c.roomName(callID)
	if err != nil {
		return "", err
	}
	if _, err := validatedLiveKitURL(c.cfg.LiveKitURL); err != nil {
		return "", err
	}
	return c.token(fmt.Sprintf("omnichat-user-%d", userID), roomName, true, true)
}

// resolveAvatarURL converts the application's private upload paths into a
// public HTTPS URL the short-lived RunPod worker can fetch. Persona media is
// intentionally stored as /uploads/... paths, so the worker backend origin is
// deployment configuration rather than client input.
func (c *Client) resolveAvatarURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || !strings.HasPrefix(trimmed, "/") {
		return trimmed
	}
	if pathpkg.Clean(trimmed) != trimmed || !strings.HasPrefix(trimmed, "/uploads/") {
		return ""
	}
	base, err := validatedWorkerBackendURL(c.cfg.WorkerBackendURL)
	if err != nil {
		return ""
	}
	resolved := base.ResolveReference(&url.URL{Path: trimmed})
	return resolved.String()
}

// EndConversation is intentionally named after the old retention interface;
// it is provider-neutral and now terminates the self-hosted avatar Pod.
func (c *Client) EndConversation(ctx context.Context, providerSessionID string) error {
	if c == nil || c.pods == nil {
		return errors.New("self-hosted live avatar is not configured")
	}
	if !runpodPodID(providerSessionID) {
		return errors.New("invalid live avatar worker id")
	}
	if err := c.pods.Terminate(ctx, providerSessionID); err != nil {
		return errors.New("live avatar worker could not be stopped")
	}
	return nil
}

func (c *Client) roomName(callID uuid.UUID) (string, error) {
	if callID == uuid.Nil {
		return "", errors.New("invalid live avatar call")
	}
	roomName := fmt.Sprintf("%s-%s", c.cfg.RoomPrefix, strings.ReplaceAll(callID.String(), "-", ""))
	if !roomPartPattern.MatchString(roomName) {
		return "", errors.New("live avatar room name is invalid")
	}
	return roomName, nil
}

func (c *Client) token(identity, room string, publish, subscribe bool) (string, error) {
	now := c.now().UTC()
	claims := jwt.MapClaims{
		"iss": c.cfg.LiveKitAPIKey,
		"sub": identity,
		"nbf": now.Add(-5 * time.Second).Unix(),
		"exp": now.Add(c.cfg.TokenTTL).Unix(),
		"video": map[string]any{
			"roomJoin":             true,
			"room":                 room,
			"canPublish":           publish,
			"canSubscribe":         subscribe,
			"canPublishData":       true,
			"canUpdateOwnMetadata": true,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	value, err := token.SignedString([]byte(c.cfg.LiveKitAPISecret))
	if err != nil {
		return "", errors.New("live avatar access token could not be created")
	}
	return value, nil
}

func validatedLiveKitURL(raw string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "wss" || parsed.Hostname() == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("LiveKit URL must use a secure WebSocket (wss)")
	}
	return strings.TrimRight(parsed.String(), "/"), nil
}

func validatedWorkerBackendURL(raw string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("worker backend URL must use HTTPS")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	return parsed, nil
}

func runpodPodID(value string) bool {
	return value != "" && len(value) <= 128 && roomPartPattern.MatchString(value)
}
