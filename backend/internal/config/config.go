package config

import (
	"fmt"
	"log"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds all configuration for the application
type Config struct {
	Server                    ServerConfig
	Database                  DatabaseConfig
	Reddit                    RedditConfig
	JWT                       JWTConfig
	Redis                     RedisConfig
	Media                     MediaConfig
	VirusScan                 VirusScanConfig
	Encryption                EncryptionConfig
	Turnstile                 TurnstileConfig
	Firebase                  FirebaseConfig
	SMTP                      SMTPConfig
	Retention                 RetentionConfig
	Storage                   StorageConfig
	FrontendURL               string
	AppEnv                    string
	MetricsToken              string // Bearer token for /metrics endpoint; empty = unrestricted (dev only)
	AsynqmonToken             string // Bearer token for /admin/queues dashboard; empty = unrestricted (dev only)
	TURN                      TURNConfig
	Gemini                    GeminiConfig
	OpenRouter                OpenRouterConfig
	OmniChatMedia             OmniChatMediaConfig
	OmniChatVoice             OmniChatVoiceConfig
	LiveKit                   LiveKitConfig
	OmniChatBillingOffersJSON string
	Crypto                    CryptoConfig
	OAuth                     OAuthConfig
}

// OAuthConfig holds client credentials for social login providers.
type OAuthConfig struct {
	GoogleClientID      string // GOOGLE_CLIENT_ID
	GoogleClientSecret  string // GOOGLE_CLIENT_SECRET
	DiscordClientID     string // DISCORD_CLIENT_ID
	DiscordClientSecret string // DISCORD_CLIENT_SECRET
	GitHubClientID      string // GITHUB_CLIENT_ID
	GitHubClientSecret  string // GITHUB_CLIENT_SECRET
	SteamAPIKey         string // STEAM_API_KEY — Steam uses OpenID 2.0, not OAuth2; no client secret
	// BackendURL is the public base URL of the backend API (e.g. https://api.omninudge.com).
	// OAuth providers redirect here; the backend then redirects the browser to FrontendURL.
	BackendURL string // BACKEND_URL
}

// CryptoConfig holds wallet addresses for accepting crypto donations and payments.
type CryptoConfig struct {
	BTCWallet   string // Our BTC receiving address
	ETHWallet   string // Our ETH receiving address
	CAHContract string // CAH ERC-20 token contract address on Ethereum
}

// GeminiConfig holds Google Gemini API configuration for the Hub AI Designer.
// When APIKey is empty the generate endpoint returns a 503.
type GeminiConfig struct {
	APIKey string // GEMINI_API_KEY
	Model  string // GEMINI_MODEL — defaults to gemini-2.5-flash
}

// OpenRouterConfig holds OpenRouter API configuration for OmniChat bot personas.
// When APIKey is empty the generate endpoint returns a 503.
type OpenRouterConfig struct {
	APIKey        string // OPENROUTER_API_KEY
	Model         string // OPENROUTER_MODEL — fixed low-cost model for moderation and legacy callers
	StandardModel string // OMNICHAT_MODEL_STANDARD_PRIMARY

	// ExtractionModel is what reads transcripts in the background: memory
	// episodes, commitments and their resolutions, and character baselines.
	//
	// Separate from StandardModel, which it used to share, because they are
	// different jobs judged on different things. StandardModel is what a free
	// member talks to and is chosen for feel and latency; this one never speaks
	// to anybody and is chosen for whether it holds a distinction under
	// instruction. Sharing the knob meant fixing extraction would have silently
	// changed what free members chat with.
	//
	// It still has its own setting even while it points at the same model as
	// chat, because the reason they are separate has not gone away: they are
	// judged on different things, and the next model that is better at one will
	// not automatically be better at the other.
	//
	// Measured, not guessed: gemini-3.1-flash-lite reads a promise that has only
	// been *scheduled* as one that was kept, which quietly loses the obligation.
	// gemini-3.7-flash fails it too, despite costing more. 3.5-flash-lite holds
	// all seven scenarios repeatedly. See TestLiveCommitmentResolution.
	ExtractionModel string // OMNICHAT_MODEL_EXTRACTION

	StandardFallback  string // OMNICHAT_MODEL_STANDARD_FALLBACK
	PlusModel         string // OMNICHAT_MODEL_PLUS_PRIMARY
	PremiumQuickModel string // OMNICHAT_MODEL_PREMIUM_QUICK_PRIMARY
	PremiumDeepModel  string // OMNICHAT_MODEL_PREMIUM_DEEP_PRIMARY
}

// OmniChatMediaConfig keeps generative-media credentials server-side and
// makes worker endpoint choices deploy-time configuration rather than UI
// concerns. RunPod endpoints are owned by the deployment and expose the
// stable OmniChat media-worker contract consumed by the queue.
type OmniChatMediaConfig struct {
	Provider              string
	RunPodAPIKey          string
	RunPodBaseURL         string
	RunPodImageEndpointID string
	// RunPodNSFWImageEndpointID serves accounts entitled to explicit content.
	// Every explicit pixel is produced by the image phase -- a video is only an
	// animation of a still that already exists -- so this one split covers both
	// media kinds and no separate NSFW video endpoint is needed. Empty falls
	// back to the standard image endpoint.
	RunPodNSFWImageEndpointID string

	// ExplicitContentEnabled is the switch for adult content across OmniChat.
	//
	// Off for launch by decision, and off by default so a deployment that has
	// not thought about it cannot produce any. Administrators are unaffected --
	// they still need the entitlement and their own preference set -- so the
	// feature stays exercisable while nobody else can reach it.
	//
	// Nothing is removed when this is off. It is one boolean between the
	// product and everything already built.
	ExplicitContentEnabled      bool
	RunPodVideoEndpointID       string
	RunPodInputHosts            []string
	RunPodOutputHosts           []string
	RunPodPodAPIURL             string
	RunPodNetworkVolumeID       string
	RunPodAvatarImage           string
	RunPodAvatarGPUTypeID       string
	RunPodAvatarGPUCount        int
	RunPodAvatarDiskGB          int
	RunPodAvatarVolumeGB        int
	RunPodAvatarVCPU            int
	RunPodAvatarMemoryGB        int
	RunPodAvatarVolumeMountPath string
	RunPodAvatarPorts           []string
	RunPodWorkerBackendURL      string
	RunPodRequestTimeoutSeconds int
	MaxImageBytes               int64
	MaxVideoBytes               int64
	PollIntervalSeconds         int
}

type OmniChatVoiceConfig struct {
	ElevenLabsAPIKey        string
	ElevenLabsBaseURL       string
	ElevenLabsEnableLogging bool
	DefaultModel            string
	VoiceboxEnabled         bool
	VoiceboxBaseURL         string
	VoiceboxTimeoutSeconds  int
	VoiceCloningEnabled     bool
}

// LiveKitConfig contains only server-side room-signing credentials. The API
// returns short-lived participant tokens; the secret never reaches a browser
// or a GPU worker.
type LiveKitConfig struct {
	URL            string
	APIKey         string
	APISecret      string
	RoomPrefix     string
	TokenTTLSecond int
}

// TURNConfig holds coturn TURN server configuration for WebRTC relay
type TURNConfig struct {
	Host    string // e.g. "77.42.47.79" or "turn.omninudge.com"
	Port    string // default "3478"
	TLSPort string // default "5349" (TURNS/TLS)
	Secret  string // HMAC secret shared with coturn static-auth-secret
}

// StorageConfig holds file storage and CDN configuration.
// StorageBackend selects between "local" (default) and "s3".
type StorageConfig struct {
	// StorageBackend selects the storage provider: "local" or "s3"
	StorageBackend string

	// S3 credentials and bucket settings
	S3Bucket string
	// S3StagingBucket is a separate private bucket for unscanned browser uploads.
	// Direct presigned uploads remain disabled when it is not configured.
	S3StagingBucket string
	S3Region        string
	S3AccessKey     string
	S3SecretKey     string
	// S3Endpoint is optional; set for S3-compatible providers (e.g. MinIO)
	S3Endpoint string
	// S3PathStyle enables path-style S3 addressing (required for MinIO/Ceph; set false for Cloudflare R2)
	S3PathStyle bool

	// CloudFrontURL is the CDN base URL, e.g. https://d1234.cloudfront.net.
	// When set, all public asset URLs are rewritten to use this origin.
	CloudFrontURL string
}

// RetentionConfig holds data retention settings
type RetentionConfig struct {
	MessageRetentionYears int
	LogRetentionYears     int
	ArchiveRetentionYears int
	DryRun                bool
}

// RedditConfig holds Reddit API client configuration.
type RedditConfig struct {
	UserAgent string
}

// JWTConfig holds JWT configuration
type JWTConfig struct {
	Secret string
}

// ServerConfig holds server-related configuration
type ServerConfig struct {
	Port           string
	Host           string
	TrustedProxies []string
}

// DatabaseConfig holds database connection configuration
type DatabaseConfig struct {
	Host        string
	Port        int
	User        string
	Password    string
	DBName      string
	SSLMode     string
	AutoMigrate bool
}

// RedisConfig holds redis caching configuration
type RedisConfig struct {
	Addr string
	// Optional password; leave empty if none
	Password string
	// TTL in seconds for cached Reddit responses
	TTLSeconds int
}

type MediaConfig struct {
	FreeTierQuotaBytes int64
	ProTierQuotaBytes  int64
}

// VirusScanConfig holds antivirus scanning settings.
type VirusScanConfig struct {
	Enabled        bool
	FailClosed     bool
	ClamAVNetwork  string
	ClamAVAddress  string
	TimeoutSeconds int
}

// EncryptionConfig holds encryption configuration for sensitive data
type EncryptionConfig struct {
	// Key is the AES-256 encryption key (32 bytes, base64-encoded or raw string)
	Key string
}

// TurnstileConfig holds Cloudflare Turnstile configuration
type TurnstileConfig struct {
	Secret string
}

// FirebaseConfig holds Firebase Cloud Messaging configuration
type FirebaseConfig struct {
	CredentialsPath string
}

// SMTPConfig holds email delivery configuration.
//
// Provider selection order: SendGrid > Mailgun > SMTP.
// When SendGridAPIKey is set the application uses the SendGrid REST API.
// When MailgunAPIKey is set the application uses the Mailgun HTTP API.
// Otherwise it falls back to direct SMTP using Host/Port/User/Password.
type SMTPConfig struct {
	// SendGrid REST API key (highest priority when set)
	SendGridAPIKey string

	// Mailgun HTTP API credentials (second priority when set)
	MailgunAPIKey string
	MailgunDomain string

	// SMTP fallback credentials
	Host     string
	Port     string
	User     string
	Password string

	// Shared sender identity
	FromAddress string
	FromName    string
}

// Load reads configuration from environment variables with sensible defaults
func Load() (*Config, error) {
	// Load .env file if it exists (ignore error if file doesn't exist)
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	cfg := &Config{
		Server: ServerConfig{
			Port:           getEnv("SERVER_PORT", "8080"),
			Host:           getEnv("SERVER_HOST", "localhost"),
			TrustedProxies: getEnvAsStringList("TRUSTED_PROXIES"),
		},
		Database: DatabaseConfig{
			Host:        getEnv("DB_HOST", "localhost"),
			Port:        getEnvAsInt("DB_PORT", 5432),
			User:        requireEnv("DB_USER"),
			Password:    getEnv("DB_PASSWORD", ""),
			DBName:      getEnv("DB_NAME", "omninudge_dev"),
			SSLMode:     getEnv("DB_SSLMODE", "disable"),
			AutoMigrate: getEnvAsBool("DB_AUTO_MIGRATE", true),
		},
		Reddit: RedditConfig{
			UserAgent: getEnv("REDDIT_USER_AGENT", "OmniNudge/1.0 (+https://omninudge.com; contact support@omninudge.com)"),
		},
		JWT: JWTConfig{
			Secret: requireEnv("JWT_SECRET"),
		},
		Redis: RedisConfig{
			Addr:       getEnv("REDIS_ADDR", ""),
			Password:   getEnv("REDIS_PASSWORD", ""),
			TTLSeconds: getEnvAsInt("REDIS_TTL_SECONDS", 300),
		},
		Media: MediaConfig{
			FreeTierQuotaBytes: getEnvAsInt64("MEDIA_FREE_TIER_QUOTA_BYTES", 1*1024*1024*1024),
			ProTierQuotaBytes:  getEnvAsInt64("MEDIA_PRO_TIER_QUOTA_BYTES", 50*1024*1024*1024),
		},
		VirusScan: VirusScanConfig{
			Enabled:        getEnvAsBool("VIRUS_SCAN_ENABLED", true),
			FailClosed:     getEnvAsBool("VIRUS_SCAN_FAIL_CLOSED", true),
			ClamAVNetwork:  getEnv("CLAMAV_NETWORK", "tcp"),
			ClamAVAddress:  getEnv("CLAMAV_ADDRESS", "127.0.0.1:3310"),
			TimeoutSeconds: getEnvAsInt("CLAMAV_TIMEOUT_SECONDS", 15),
		},
		Encryption: EncryptionConfig{
			Key: requireEnv("ENCRYPTION_KEY"),
		},
		Turnstile: TurnstileConfig{
			Secret: getEnv("TURNSTILE_SECRET_KEY", ""),
		},
		Firebase: FirebaseConfig{
			CredentialsPath: getEnv("FIREBASE_CREDENTIALS_PATH", ""),
		},
		SMTP: SMTPConfig{
			SendGridAPIKey: getEnv("SENDGRID_API_KEY", ""),
			MailgunAPIKey:  getEnv("MAILGUN_API_KEY", ""),
			MailgunDomain:  getEnv("MAILGUN_DOMAIN", ""),
			Host:           getEnv("SMTP_HOST", ""),
			Port:           getEnv("SMTP_PORT", "587"),
			User:           getEnv("SMTP_USER", ""),
			Password:       getEnv("SMTP_PASSWORD", ""),
			FromAddress:    getEnv("SMTP_FROM_ADDRESS", "noreply@omninudge.com"),
			FromName:       getEnv("SMTP_FROM_NAME", "OmniNudge"),
		},
		Retention: RetentionConfig{
			MessageRetentionYears: getEnvAsInt("RETENTION_MESSAGE_YEARS", 3),
			LogRetentionYears:     getEnvAsInt("RETENTION_LOG_YEARS", 1),
			ArchiveRetentionYears: getEnvAsInt("RETENTION_ARCHIVE_YEARS", 1),
			DryRun:                getEnvAsBool("RETENTION_DRY_RUN", false),
		},
		Storage: StorageConfig{
			StorageBackend:  getEnv("STORAGE_BACKEND", "local"),
			S3Bucket:        getEnv("S3_BUCKET", ""),
			S3StagingBucket: getEnv("S3_STAGING_BUCKET", ""),
			S3Region:        getEnv("S3_REGION", "us-east-1"),
			S3AccessKey:     getEnv("S3_ACCESS_KEY", ""),
			S3SecretKey:     getEnv("S3_SECRET_KEY", ""),
			S3Endpoint:      getEnv("S3_ENDPOINT", ""),
			S3PathStyle:     getEnvAsBool("S3_PATH_STYLE", true), // true for MinIO/Ceph, false for R2
			CloudFrontURL:   getEnv("CLOUDFRONT_URL", ""),
		},
		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:5176"),
		AppEnv:      getEnv("APP_ENV", "development"),
		Crypto: CryptoConfig{
			BTCWallet:   getEnv("CRYPTO_BTC_WALLET", "31yyvq2asepMEJLqtuka7oSoVCRrnoeG2K"),
			ETHWallet:   getEnv("CRYPTO_ETH_WALLET", "0xc308f275a03bad6c3ba3b75e2d024d258cba586f"),
			CAHContract: getEnv("CRYPTO_CAH_CONTRACT", "0x8e0E57DCb1ce8d9091dF38ec1BfC3b224529754A"),
		},
		MetricsToken:  getEnv("METRICS_TOKEN", ""),
		AsynqmonToken: getEnv("ASYNQMON_TOKEN", ""),
		TURN: TURNConfig{
			Host:    getEnv("TURN_HOST", ""),
			Port:    getEnv("TURN_PORT", "3478"),
			TLSPort: getEnv("TURN_TLS_PORT", "5349"),
			Secret:  getEnv("TURN_SECRET", ""),
		},
		Gemini: GeminiConfig{
			APIKey: getEnv("GEMINI_API_KEY", ""),
			Model:  getEnv("GEMINI_MODEL", "gemini-2.5-flash"),
		},
		OpenRouter: OpenRouterConfig{
			APIKey: getEnv("OPENROUTER_API_KEY", ""),
			Model:  getEnv("OPENROUTER_MODEL", "google/gemma-4-26b-a4b-it:free"),
			// One model everywhere by default. A tier buys volume, features, and
			// how hard she thinks -- not a different character. Somebody who
			// upgrades because they liked talking to her should get more of
			// her, not a stranger with her name.
			//
			// Measured rather than assumed: on the response corpus
			// gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-3-flash-preview
			// and claude-sonnet-5 all pass 9 of 9, and mistral-large -- which
			// used to be the paid upgrade -- passes 8. There was never a quality
			// argument for the ladder. 3.5-flash-lite is the one that also holds
			// the extraction distinctions, at a third of Sonnet's input price.
			StandardModel:     getEnv("OMNICHAT_MODEL_STANDARD_PRIMARY", "google/gemini-3.5-flash-lite"),
			ExtractionModel:   getEnv("OMNICHAT_MODEL_EXTRACTION", "google/gemini-3.5-flash-lite"),
			StandardFallback:  getEnv("OMNICHAT_MODEL_STANDARD_FALLBACK", "google/gemini-3-flash-preview"),
			PlusModel:         getEnv("OMNICHAT_MODEL_PLUS_PRIMARY", "google/gemini-3.5-flash-lite"),
			PremiumQuickModel: getEnv("OMNICHAT_MODEL_PREMIUM_QUICK_PRIMARY", "google/gemini-3.5-flash-lite"),
			PremiumDeepModel:  getEnv("OMNICHAT_MODEL_PREMIUM_DEEP_PRIMARY", "google/gemini-3.5-flash-lite"),
		},
		OmniChatMedia: OmniChatMediaConfig{
			Provider:                    getEnv("OMNICHAT_MEDIA_PROVIDER", "runpod"),
			RunPodAPIKey:                getEnv("RUNPOD_API_KEY", ""),
			ExplicitContentEnabled:      getEnvAsBool("OMNICHAT_EXPLICIT_CONTENT_ENABLED", false),
			RunPodBaseURL:               getEnv("RUNPOD_BASE_URL", "https://api.runpod.ai/v2"),
			RunPodImageEndpointID:       getEnv("RUNPOD_IMAGE_ENDPOINT_ID", ""),
			RunPodNSFWImageEndpointID:   getEnv("RUNPOD_IMAGE_ENDPOINT_ID_NSFW", ""),
			RunPodVideoEndpointID:       getEnv("RUNPOD_VIDEO_ENDPOINT_ID", ""),
			RunPodInputHosts:            getEnvAsStringList("RUNPOD_INPUT_HOSTS"),
			RunPodOutputHosts:           getEnvAsStringList("RUNPOD_OUTPUT_HOSTS"),
			RunPodPodAPIURL:             getEnv("RUNPOD_POD_API_URL", "https://api.runpod.io/graphql"),
			RunPodNetworkVolumeID:       getEnv("RUNPOD_NETWORK_VOLUME_ID", ""),
			RunPodAvatarImage:           getEnv("RUNPOD_AVATAR_IMAGE", ""),
			RunPodAvatarGPUTypeID:       getEnv("RUNPOD_AVATAR_GPU_TYPE_ID", ""),
			RunPodAvatarGPUCount:        getEnvAsPositiveInt("RUNPOD_AVATAR_GPU_COUNT", 1),
			RunPodAvatarDiskGB:          getEnvAsPositiveInt("RUNPOD_AVATAR_CONTAINER_DISK_GB", 40),
			RunPodAvatarVolumeGB:        getEnvAsPositiveInt("RUNPOD_AVATAR_VOLUME_GB", 0),
			RunPodAvatarVCPU:            getEnvAsPositiveInt("RUNPOD_AVATAR_VCPU", 4),
			RunPodAvatarMemoryGB:        getEnvAsPositiveInt("RUNPOD_AVATAR_MEMORY_GB", 16),
			RunPodAvatarVolumeMountPath: getEnv("RUNPOD_AVATAR_VOLUME_MOUNT_PATH", "/models"),
			RunPodAvatarPorts:           getEnvAsStringList("RUNPOD_AVATAR_PORTS"),
			RunPodWorkerBackendURL:      getEnv("RUNPOD_WORKER_BACKEND_URL", ""),
			// Bounds the whole job, and a video job is now two provider renders
			// back to back: an SDXL still, then 121 Wan frames. 900s covered a
			// single image and would time out the second phase mid-render.
			RunPodRequestTimeoutSeconds: getEnvAsPositiveInt("RUNPOD_REQUEST_TIMEOUT_SECONDS", 1800),
			MaxImageBytes:               getEnvAsPositiveInt64("OMNICHAT_MAX_IMAGE_BYTES", 25*1024*1024),
			MaxVideoBytes:               getEnvAsPositiveInt64("OMNICHAT_MAX_VIDEO_BYTES", 200*1024*1024),
			PollIntervalSeconds:         getEnvAsPositiveInt("RUNPOD_MEDIA_POLL_SECONDS", 2),
		},
		OmniChatVoice: OmniChatVoiceConfig{
			ElevenLabsAPIKey:        getEnv("ELEVENLABS_API_KEY", ""),
			ElevenLabsBaseURL:       getEnv("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io"),
			ElevenLabsEnableLogging: getEnvAsBool("ELEVENLABS_ENABLE_LOGGING", false),
			DefaultModel:            getEnv("ELEVENLABS_TTS_MODEL", "eleven_multilingual_v2"),
			VoiceboxEnabled:         getEnvAsBool("VOICEBOX_ENABLED", true),
			VoiceboxBaseURL:         getEnv("VOICEBOX_BASE_URL", "http://127.0.0.1:17493"),
			VoiceboxTimeoutSeconds:  getEnvAsPositiveInt("VOICEBOX_TIMEOUT_SECONDS", 120),
			VoiceCloningEnabled:     getEnvAsBool("OMNICHAT_VOICE_CLONING_ENABLED", false),
		},
		LiveKit: LiveKitConfig{
			URL:            getEnv("LIVEKIT_URL", ""),
			APIKey:         getEnv("LIVEKIT_API_KEY", ""),
			APISecret:      getEnv("LIVEKIT_API_SECRET", ""),
			RoomPrefix:     getEnv("LIVEKIT_ROOM_PREFIX", "omnichat"),
			TokenTTLSecond: getEnvAsPositiveInt("LIVEKIT_TOKEN_TTL_SECONDS", 600),
		},
		OmniChatBillingOffersJSON: getEnv("OMNICHAT_BILLING_OFFERS_JSON", ""),
		OAuth: OAuthConfig{
			GoogleClientID:      getEnv("GOOGLE_CLIENT_ID", ""),
			GoogleClientSecret:  getEnv("GOOGLE_CLIENT_SECRET", ""),
			DiscordClientID:     getEnv("DISCORD_CLIENT_ID", ""),
			DiscordClientSecret: getEnv("DISCORD_CLIENT_SECRET", ""),
			GitHubClientID:      getEnv("GITHUB_CLIENT_ID", ""),
			GitHubClientSecret:  getEnv("GITHUB_CLIENT_SECRET", ""),
			SteamAPIKey:         getEnv("STEAM_API_KEY", ""),
			BackendURL:          getEnv("BACKEND_URL", "http://localhost:8080"),
		},
	}
	// RunPod workers return signed URLs from the same private object store that
	// the API uses for application-owned media. Trust that deployment-owned
	// HTTPS origin automatically so a Cloudflare R2/MinIO endpoint cannot be
	// accidentally omitted from RUNPOD_OUTPUT_HOSTS. Explicit environment
	// entries remain supported for a separate worker output origin or CDN.
	cfg.OmniChatMedia.RunPodOutputHosts = appendHTTPSOriginHost(
		cfg.OmniChatMedia.RunPodOutputHosts,
		cfg.Storage.S3Endpoint,
	)
	cfg.OmniChatMedia.RunPodOutputHosts = appendHTTPSOriginHost(
		cfg.OmniChatMedia.RunPodOutputHosts,
		cfg.Storage.CloudFrontURL,
	)
	// Image-to-video workers fetch signed source images from the same storage
	// endpoint. The worker has its own explicit allow-list, while this list is
	// used by the API-side URL validator and must cover the same deployment
	// origins.
	cfg.OmniChatMedia.RunPodInputHosts = appendHTTPSOriginHost(
		cfg.OmniChatMedia.RunPodInputHosts,
		cfg.Storage.S3Endpoint,
	)
	cfg.OmniChatMedia.RunPodInputHosts = appendHTTPSOriginHost(
		cfg.OmniChatMedia.RunPodInputHosts,
		cfg.Storage.CloudFrontURL,
	)
	cfg.OmniChatMedia.RunPodInputHosts = appendHTTPSOriginHost(
		cfg.OmniChatMedia.RunPodInputHosts,
		cfg.OmniChatMedia.RunPodWorkerBackendURL,
	)

	return cfg, nil
}

func appendHTTPSOriginHost(hosts []string, rawOrigin string) []string {
	parsed, err := url.Parse(strings.TrimSpace(rawOrigin))
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" ||
		parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return hosts
	}
	host := strings.ToLower(strings.TrimSuffix(parsed.Hostname(), "."))
	for _, candidate := range hosts {
		if strings.EqualFold(strings.TrimSuffix(strings.TrimSpace(candidate), "."), host) {
			return hosts
		}
	}
	return append(hosts, host)
}

// DatabaseURL returns the PostgreSQL connection string
func (c *DatabaseConfig) DatabaseURL() string {
	return fmt.Sprintf(
		"postgresql://%s:%s@%s:%d/%s?sslmode=%s",
		c.User,
		c.Password,
		c.Host,
		c.Port,
		c.DBName,
		c.SSLMode,
	)
}

// requireEnv returns the value of the environment variable named by key.
// It calls log.Fatalf if the variable is not set or empty.
func requireEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("required environment variable %s is not set", key)
	}
	return v
}

// getEnv reads an environment variable or returns a default value
func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getEnvAsBool(key string, defaultValue bool) bool {
	valueStr := getEnv(key, "")
	if valueStr == "" {
		return defaultValue
	}
	switch strings.ToLower(valueStr) {
	case "1", "true", "yes", "y":
		return true
	case "0", "false", "no", "n":
		return false
	default:
		return defaultValue
	}
}

// getEnvAsInt reads an environment variable as an integer or returns a default value
func getEnvAsInt(key string, defaultValue int) int {
	valueStr := getEnv(key, "")
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.Atoi(valueStr)
	if err != nil {
		return defaultValue
	}
	return value
}

func getEnvAsInt64(key string, defaultValue int64) int64 {
	valueStr := getEnv(key, "")
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.ParseInt(valueStr, 10, 64)
	if err != nil {
		return defaultValue
	}
	return value
}

func getEnvAsPositiveInt(key string, defaultValue int) int {
	value := getEnvAsInt(key, defaultValue)
	if value <= 0 {
		return defaultValue
	}
	return value
}

func getEnvAsPositiveInt64(key string, defaultValue int64) int64 {
	value := getEnvAsInt64(key, defaultValue)
	if value <= 0 {
		return defaultValue
	}
	return value
}

func getEnvAsStringList(key string) []string {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return nil
	}
	values := make([]string, 0)
	seen := make(map[string]struct{})
	for _, item := range strings.Split(raw, ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, exists := seen[item]; exists {
			continue
		}
		seen[item] = struct{}{}
		values = append(values, item)
	}
	return values
}
