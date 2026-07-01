package config

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds all configuration for the application
type Config struct {
	Server        ServerConfig
	Database      DatabaseConfig
	Reddit        RedditConfig
	JWT           JWTConfig
	Redis         RedisConfig
	Media         MediaConfig
	VirusScan     VirusScanConfig
	Encryption    EncryptionConfig
	Turnstile     TurnstileConfig
	Firebase      FirebaseConfig
	SMTP          SMTPConfig
	Retention     RetentionConfig
	Storage       StorageConfig
	FrontendURL   string
	AppEnv        string
	MetricsToken  string // Bearer token for /metrics endpoint; empty = unrestricted (dev only)
	AsynqmonToken string // Bearer token for /admin/queues dashboard; empty = unrestricted (dev only)
	TURN          TURNConfig
	Gemini        GeminiConfig
	OpenRouter    OpenRouterConfig
	Crypto        CryptoConfig
	OAuth         OAuthConfig
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
	APIKey string // OPENROUTER_API_KEY
	Model  string // OPENROUTER_MODEL — defaults to openrouter/free
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
	S3Bucket    string
	S3Region    string
	S3AccessKey string
	S3SecretKey string
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
	Port string
	Host string
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
			Port: getEnv("SERVER_PORT", "8080"),
			Host: getEnv("SERVER_HOST", "localhost"),
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
			StorageBackend: getEnv("STORAGE_BACKEND", "local"),
			S3Bucket:       getEnv("S3_BUCKET", ""),
			S3Region:       getEnv("S3_REGION", "us-east-1"),
			S3AccessKey:    getEnv("S3_ACCESS_KEY", ""),
			S3SecretKey:    getEnv("S3_SECRET_KEY", ""),
			S3Endpoint:     getEnv("S3_ENDPOINT", ""),
			S3PathStyle:    getEnvAsBool("S3_PATH_STYLE", true), // true for MinIO/Ceph, false for R2
			CloudFrontURL:  getEnv("CLOUDFRONT_URL", ""),
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
			Model:  getEnv("OPENROUTER_MODEL", "openrouter/free"),
		},
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

	return cfg, nil
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
