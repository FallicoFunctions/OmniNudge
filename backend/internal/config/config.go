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
	Server      ServerConfig
	Database    DatabaseConfig
	Reddit      RedditConfig
	JWT         JWTConfig
	Redis       RedisConfig
	Media       MediaConfig
	VirusScan   VirusScanConfig
	Encryption  EncryptionConfig
	Turnstile   TurnstileConfig
	Firebase    FirebaseConfig
	SMTP        SMTPConfig
	Retention   RetentionConfig
	FrontendURL string
	AppEnv      string
}

// RetentionConfig holds data retention settings
type RetentionConfig struct {
	MessageRetentionYears int
	LogRetentionYears     int
	ArchiveRetentionYears int
	DeletionGraceDays     int
	DryRun                bool
}

// RedditConfig holds Reddit OAuth configuration
type RedditConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
	UserAgent    string
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

// SMTPConfig holds email (SMTP) configuration
type SMTPConfig struct {
	Host        string
	Port        string
	User        string
	Password    string
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
			User:        getEnv("DB_USER", "derrf"),
			Password:    getEnv("DB_PASSWORD", "drummer"),
			DBName:      getEnv("DB_NAME", "omninudge_dev"),
			SSLMode:     getEnv("DB_SSLMODE", "disable"),
			AutoMigrate: getEnvAsBool("DB_AUTO_MIGRATE", true),
		},
		Reddit: RedditConfig{
			ClientID:     getEnv("REDDIT_CLIENT_ID", ""),
			ClientSecret: getEnv("REDDIT_CLIENT_SECRET", ""),
			RedirectURI:  getEnv("REDDIT_REDIRECT_URI", "http://localhost:8080/api/v1/auth/reddit/callback"),
			UserAgent:    getEnv("REDDIT_USER_AGENT", "OmniNudge:v1.0"),
		},
		JWT: JWTConfig{
			Secret: getEnv("JWT_SECRET", "dev-secret-change-in-production"),
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
			Key: getEnv("ENCRYPTION_KEY", "dev-encryption-key-change-me!!"),
		},
		Turnstile: TurnstileConfig{
			Secret: getEnv("TURNSTILE_SECRET_KEY", ""),
		},
		Firebase: FirebaseConfig{
			CredentialsPath: getEnv("FIREBASE_CREDENTIALS_PATH", ""),
		},
		SMTP: SMTPConfig{
			// Mailgun HTTP API (preferred)
			Host: getEnv("MAILGUN_API_KEY", getEnv("SMTP_HOST", "")),
			User: getEnv("MAILGUN_DOMAIN", getEnv("SMTP_USER", "")),
			// SMTP fallback
			Port:        getEnv("SMTP_PORT", "587"),
			Password:    getEnv("SMTP_PASSWORD", ""),
			FromAddress: getEnv("SMTP_FROM_ADDRESS", "noreply@omninudge.com"),
			FromName:    getEnv("SMTP_FROM_NAME", "OmniNudge"),
		},
		Retention: RetentionConfig{
			MessageRetentionYears: getEnvAsInt("RETENTION_MESSAGE_YEARS", 3),
			LogRetentionYears:     getEnvAsInt("RETENTION_LOG_YEARS", 1),
			ArchiveRetentionYears: getEnvAsInt("RETENTION_ARCHIVE_YEARS", 1),
			DeletionGraceDays:     getEnvAsInt("RETENTION_GRACE_DAYS", 30),
			DryRun:                getEnvAsBool("RETENTION_DRY_RUN", false),
		},
		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:5176"),
		AppEnv:      getEnv("APP_ENV", "development"),
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
