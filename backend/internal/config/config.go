package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds all configuration for the application
type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Reddit   RedditConfig
	JWT      JWTConfig
	Redis    RedisConfig
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
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
	SSLMode  string
}

// RedisConfig holds redis caching configuration
type RedisConfig struct {
	Addr string
	// Optional password; leave empty if none
	Password string
	// TTL in seconds for cached Reddit responses
	TTLSeconds int
}

// Load reads configuration from environment variables with sensible defaults
func Load() (*Config, error) {
	cfg := &Config{
		Server: ServerConfig{
			Port: getEnv("SERVER_PORT", "8080"),
			Host: getEnv("SERVER_HOST", "localhost"),
		},
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnvAsInt("DB_PORT", 5432),
			User:     getEnv("DB_USER", "derrf"),
			Password: getEnv("DB_PASSWORD", "drummer"),
			DBName:   getEnv("DB_NAME", "omninudge_dev"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
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
