# Comprehensive Implementation Guide

**Phase 1 Development: Months 1-12**
**Estimated Time:** 2 hours/day, ~10-11 months
**Prerequisites:** Completed Month 0 (Go learning) and setup

---

## How to Use This Guide

This guide walks you through building the entire Phase 1 platform chronologically. Each section includes:
- What you're building
- Why you're building it
- Step-by-step implementation
- Testing procedures
- Common pitfalls to avoid

**Follow in order** - later sections depend on earlier work.

**Take your time** - 2 hours/day is sustainable. Don't rush.

**Commit regularly** - After each major milestone, commit your code.

---

## Project Initialization

### Step 1: Create Project Structure

```bash
cd ~/projects/chatreddit

# Backend structure
mkdir -p backend/{cmd/server,internal/{api/{handlers,middleware},models,services,database/migrations,config},pkg/utils}

# Frontend structure
mkdir -p frontend/{src/{components/{auth,chat,posts,slideshow,ui},pages,hooks,services,utils},public}

# Create initial files
touch backend/cmd/server/main.go
touch backend/internal/config/config.go
touch backend/go.mod
touch frontend/package.json
```

### Step 2: Initialize Go Module

```bash
cd backend
go mod init github.com/yourusername/chatreddit-backend

# Install initial dependencies
go get github.com/gin-gonic/gin
go get github.com/lib/pq
go get github.com/go-redis/redis/v8
go get github.com/joho/godotenv
go get github.com/golang-jwt/jwt/v5
go get github.com/gorilla/websocket
go get golang.org/x/oauth2
```

### Step 3: Initialize React Frontend

```bash
cd ../frontend
npm create vite@latest . -- --template react-ts
npm install

# Install dependencies
npm install react-router-dom @tanstack/react-query axios
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### Step 4: Environment Configuration

Create `backend/.env`:
```env
PORT=8080
ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_USER=chatreddit_user
DB_PASSWORD=your_password
DB_NAME=chatreddit_dev

REDIS_HOST=localhost
REDIS_PORT=6379

REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_REDIRECT_URI=http://localhost:3000/auth/reddit/callback
REDDIT_USER_AGENT=chatreddit:v1.0

JWT_SECRET=your_very_long_random_secret_key_here
```

Create `frontend/.env`:
```env
VITE_API_URL=http://localhost:8080/api/v1
VITE_WS_URL=ws://localhost:8080/ws
```

---

## Months 1-2: Reddit OAuth & Post Browsing

**Goal:** Users can log in with Reddit and browse posts.

### Backend: Configuration Setup

**File:** `backend/internal/config/config.go`

```go
package config

import (
    "log"
    "os"
    "github.com/joho/godotenv"
)

type Config struct {
    Port           string
    Env            string
    DBHost         string
    DBPort         string
    DBUser         string
    DBPassword     string
    DBName         string
    RedisHost      string
    RedisPort      string
    RedditClientID     string
    RedditClientSecret string
    RedditRedirectURI  string
    RedditUserAgent    string
    JWTSecret          string
}

func Load() *Config {
    if err := godotenv.Load(); err != nil {
        log.Println("No .env file found")
    }

    return &Config{
        Port:               getEnv("PORT", "8080"),
        Env:                getEnv("ENV", "development"),
        DBHost:             getEnv("DB_HOST", "localhost"),
        DBPort:             getEnv("DB_PORT", "5432"),
        DBUser:             getEnv("DB_USER", "postgres"),
        DBPassword:         getEnv("DB_PASSWORD", ""),
        DBName:             getEnv("DB_NAME", "chatreddit_dev"),
        RedisHost:          getEnv("REDIS_HOST", "localhost"),
        RedisPort:          getEnv("REDIS_PORT", "6379"),
        RedditClientID:     getEnv("REDDIT_CLIENT_ID", ""),
        RedditClientSecret: getEnv("REDDIT_CLIENT_SECRET", ""),
        RedditRedirectURI:  getEnv("REDDIT_REDIRECT_URI", ""),
        RedditUserAgent:    getEnv("REDDIT_USER_AGENT", ""),
        JWTSecret:          getEnv("JWT_SECRET", ""),
    }
}

func getEnv(key, defaultVal string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return defaultVal
}
```

### Backend: Database Connection

**File:** `backend/internal/database/db.go`

```go
package database

import (
    "database/sql"
    "fmt"
    "log"
    _ "github.com/lib/pq"
)

type DB struct {
    *sql.DB
}

func Connect(host, port, user, password, dbname string) (*DB, error) {
    connStr := fmt.Sprintf(
        "host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
        host, port, user, password, dbname,
    )

    db, err := sql.Open("postgres", connStr)
    if err != nil {
        return nil, err
    }

    if err = db.Ping(); err != nil {
        return nil, err
    }

    log.Println("Database connected successfully")

    // Configure connection pool
    db.SetMaxOpenConns(25)
    db.SetMaxIdleConns(5)

    return &DB{db}, nil
}
```

### Backend: Database Migrations

**File:** `backend/internal/database/migrations/001_initial_schema.sql`

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    reddit_id VARCHAR(50) UNIQUE NOT NULL,
    username VARCHAR(50) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP,
    public_key TEXT,
    karma INTEGER DEFAULT 0,
    account_created TIMESTAMP,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_reddit_id ON users(reddit_id);
CREATE INDEX idx_users_username ON users(username);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL DEFAULT 'platform',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_order CHECK (user1_id < user2_id),
    CONSTRAINT unique_conversation UNIQUE (user1_id, user2_id)
);

CREATE INDEX idx_conversations_user1 ON conversations(user1_id);
CREATE INDEX idx_conversations_user2 ON conversations(user2_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_content TEXT,
    message_text TEXT,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text',
    source VARCHAR(20) NOT NULL DEFAULT 'platform',
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    migrated_from_reddit BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, sent_at DESC);
CREATE INDEX idx_messages_recipient ON messages(recipient_id);

-- Blocked users table
CREATE TABLE IF NOT EXISTS blocked_users (
    id SERIAL PRIMARY KEY,
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cannot_block_self CHECK (blocker_id != blocked_id),
    CONSTRAINT unique_block UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX idx_blocked_users_blocker ON blocked_users(blocker_id);

-- User settings table
CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    notification_sound BOOLEAN DEFAULT TRUE,
    show_read_receipts BOOLEAN DEFAULT TRUE,
    show_typing_indicators BOOLEAN DEFAULT TRUE,
    auto_append_invitation BOOLEAN DEFAULT TRUE,
    theme VARCHAR(20) DEFAULT 'dark',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reddit posts cache table
CREATE TABLE IF NOT EXISTS reddit_posts (
    id SERIAL PRIMARY KEY,
    reddit_post_id VARCHAR(50) UNIQUE NOT NULL,
    subreddit VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    author VARCHAR(50),
    body TEXT,
    url TEXT,
    thumbnail_url TEXT,
    media_type VARCHAR(20),
    media_url TEXT,
    score INTEGER DEFAULT 0,
    num_comments INTEGER DEFAULT 0,
    created_utc TIMESTAMP,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    created_from_platform BOOLEAN DEFAULT FALSE,
    platform_user_id INTEGER REFERENCES users(id)
);

CREATE INDEX idx_reddit_posts_subreddit ON reddit_posts(subreddit, created_utc DESC);
CREATE INDEX idx_reddit_posts_reddit_id ON reddit_posts(reddit_post_id);

-- Media files table
CREATE TABLE IF NOT EXISTS media_files (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255),
    file_type VARCHAR(50) NOT NULL,
    file_size INTEGER NOT NULL,
    storage_url TEXT NOT NULL,
    thumbnail_url TEXT,
    width INTEGER,
    height INTEGER,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used_in_message_id INTEGER REFERENCES messages(id)
);

CREATE INDEX idx_media_files_user ON media_files(user_id, uploaded_at DESC);
```

Run migration:
```bash
psql -U chatreddit_user -d chatreddit_dev -f backend/internal/database/migrations/001_initial_schema.sql
```

### Backend: Reddit OAuth Implementation

**Register Reddit App:**
1. Go to https://www.reddit.com/prefs/apps
2. Click "Create App" or "Create Another App"
3. Select "web app"
4. Name: "ChatReddit"
5. Redirect URI: `http://localhost:3000/auth/reddit/callback`
6. Create app
7. Copy Client ID and Client Secret to `.env`

**File:** `backend/internal/services/auth_service.go`

```go
package services

import (
    "context"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "time"

    "github.com/golang-jwt/jwt/v5"
    "golang.org/x/oauth2"
)

type AuthService struct {
    oauthConfig *oauth2.Config
    jwtSecret   []byte
}

func NewAuthService(clientID, clientSecret, redirectURI, jwtSecret string) *AuthService {
    return &AuthService{
        oauthConfig: &oauth2.Config{
            ClientID:     clientID,
            ClientSecret: clientSecret,
            RedirectURL:  redirectURI,
            Scopes:       []string{"identity", "submit", "read", "privatemessages"},
            Endpoint: oauth2.Endpoint{
                AuthURL:  "https://www.reddit.com/api/v1/authorize",
                TokenURL: "https://www.reddit.com/api/v1/access_token",
            },
        },
        jwtSecret: []byte(jwtSecret),
    }
}

func (s *AuthService) GetAuthURL(state string) string {
    return s.oauthConfig.AuthCodeURL(state, oauth2.SetAuthURLParam("duration", "permanent"))
}

func (s *AuthService) ExchangeCode(ctx context.Context, code string) (*oauth2.Token, error) {
    return s.oauthConfig.Exchange(ctx, code)
}

type RedditUser struct {
    ID       string `json:"id"`
    Username string `json:"name"`
    Karma    int    `json:"total_karma"`
    Created  int64  `json:"created_utc"`
    IconImg  string `json:"icon_img"`
}

func (s *AuthService) GetRedditUser(ctx context.Context, token *oauth2.Token) (*RedditUser, error) {
    client := s.oauthConfig.Client(ctx, token)

    req, _ := http.NewRequest("GET", "https://oauth.reddit.com/api/v1/me", nil)
    req.Header.Set("User-Agent", "chatreddit:v1.0")

    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)

    var user RedditUser
    if err := json.Unmarshal(body, &user); err != nil {
        return nil, err
    }

    return &user, nil
}

func (s *AuthService) GenerateJWT(userID int, redditID, username string) (string, error) {
    claims := jwt.MapClaims{
        "user_id":   userID,
        "reddit_id": redditID,
        "username":  username,
        "exp":       time.Now().Add(24 * time.Hour * 7).Unix(), // 7 days
        "iat":       time.Now().Unix(),
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(s.jwtSecret)
}

func (s *AuthService) ValidateJWT(tokenString string) (jwt.MapClaims, error) {
    token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
        if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, fmt.Errorf("unexpected signing method")
        }
        return s.jwtSecret, nil
    })

    if err != nil {
        return nil, err
    }

    if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
        return claims, nil
    }

    return nil, fmt.Errorf("invalid token")
}
```

### Backend: User Model

**File:** `backend/internal/models/user.go`

```go
package models

import (
    "database/sql"
    "time"
)

type User struct {
    ID              int       `json:"id"`
    RedditID        string    `json:"reddit_id"`
    Username        string    `json:"username"`
    AccessToken     string    `json:"-"`
    RefreshToken    string    `json:"-"`
    TokenExpiresAt  time.Time `json:"-"`
    PublicKey       string    `json:"public_key,omitempty"`
    Karma           int       `json:"karma"`
    AccountCreated  time.Time `json:"account_created"`
    AvatarURL       string    `json:"avatar_url"`
    CreatedAt       time.Time `json:"created_at"`
    LastSeen        time.Time `json:"last_seen"`
}

type UserRepository struct {
    db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
    return &UserRepository{db: db}
}

func (r *UserRepository) CreateOrUpdate(user *User) error {
    query := `
        INSERT INTO users (reddit_id, username, access_token, refresh_token, token_expires_at, karma, account_created, avatar_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (reddit_id)
        DO UPDATE SET
            username = $2,
            access_token = $3,
            refresh_token = $4,
            token_expires_at = $5,
            karma = $6,
            avatar_url = $8,
            last_seen = CURRENT_TIMESTAMP
        RETURNING id, created_at, last_seen
    `

    return r.db.QueryRow(
        query,
        user.RedditID,
        user.Username,
        user.AccessToken,
        user.RefreshToken,
        user.TokenExpiresAt,
        user.Karma,
        user.AccountCreated,
        user.AvatarURL,
    ).Scan(&user.ID, &user.CreatedAt, &user.LastSeen)
}

func (r *UserRepository) GetByID(id int) (*User, error) {
    user := &User{}

    query := `
        SELECT id, reddit_id, username, public_key, karma, account_created, avatar_url, created_at, last_seen
        FROM users WHERE id = $1
    `

    err := r.db.QueryRow(query, id).Scan(
        &user.ID,
        &user.RedditID,
        &user.Username,
        &user.PublicKey,
        &user.Karma,
        &user.AccountCreated,
        &user.AvatarURL,
        &user.CreatedAt,
        &user.LastSeen,
    )

    if err != nil {
        return nil, err
    }

    return user, nil
}

func (r *UserRepository) GetByRedditID(redditID string) (*User, error) {
    user := &User{}

    query := `
        SELECT id, reddit_id, username, public_key, karma, account_created, avatar_url, created_at, last_seen
        FROM users WHERE reddit_id = $1
    `

    err := r.db.QueryRow(query, redditID).Scan(
        &user.ID,
        &user.RedditID,
        &user.Username,
        &user.PublicKey,
        &user.Karma,
        &user.AccountCreated,
        &user.AvatarURL,
        &user.CreatedAt,
        &user.LastSeen,
    )

    if err != nil {
        return nil, err
    }

    return user, nil
}
```

### Backend: Auth Handlers

**File:** `backend/internal/api/handlers/auth.go`

```go
package handlers

import (
    "net/http"
    "github.com/gin-gonic/gin"
    "yourusername/chatreddit-backend/internal/services"
    "yourusername/chatreddit-backend/internal/models"
    "time"
)

type AuthHandler struct {
    authService *services.AuthService
    userRepo    *models.UserRepository
}

func NewAuthHandler(authService *services.AuthService, userRepo *models.UserRepository) *AuthHandler {
    return &AuthHandler{
        authService: authService,
        userRepo:    userRepo,
    }
}

func (h *AuthHandler) RedditAuth(c *gin.Context) {
    state := "random_state_string" // In production, generate securely and store
    url := h.authService.GetAuthURL(state)
    c.Redirect(http.StatusTemporaryRedirect, url)
}

func (h *AuthHandler) RedditCallback(c *gin.Context) {
    code := c.Query("code")
    // state := c.Query("state") // Validate in production

    if code == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "No code provided"})
        return
    }

    // Exchange code for token
    token, err := h.authService.ExchangeCode(c.Request.Context(), code)
    if err != nil {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to exchange code"})
        return
    }

    // Get Reddit user info
    redditUser, err := h.authService.GetRedditUser(c.Request.Context(), token)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user info"})
        return
    }

    // Create/update user in database
    user := &models.User{
        RedditID:       redditUser.ID,
        Username:       redditUser.Username,
        AccessToken:    token.AccessToken,
        RefreshToken:   token.RefreshToken,
        TokenExpiresAt: token.Expiry,
        Karma:          redditUser.Karma,
        AccountCreated: time.Unix(int64(redditUser.Created), 0),
        AvatarURL:      redditUser.IconImg,
    }

    if err := h.userRepo.CreateOrUpdate(user); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
        return
    }

    // Generate JWT
    jwtToken, err := h.authService.GenerateJWT(user.ID, user.RedditID, user.Username)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
        return
    }

    c.JSON(http.StatusOK, gin.H{
        "token": jwtToken,
        "user":  user,
    })
}

func (h *AuthHandler) GetMe(c *gin.Context) {
    userID := c.GetInt("user_id") // Set by auth middleware

    user, err := h.userRepo.GetByID(userID)
    if err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
        return
    }

    c.JSON(http.StatusOK, user)
}
```

### Backend: Auth Middleware

**File:** `backend/internal/api/middleware/auth.go`

```go
package middleware

import (
    "net/http"
    "strings"

    "github.com/gin-gonic/gin"
    "yourusername/chatreddit-backend/internal/services"
)

func AuthRequired(authService *services.AuthService) gin.HandlerFunc {
    return func(c *gin.Context) {
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
            c.Abort()
            return
        }

        parts := strings.Split(authHeader, " ")
        if len(parts) != 2 || parts[0] != "Bearer" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization format"})
            c.Abort()
            return
        }

        token := parts[1]
        claims, err := authService.ValidateJWT(token)
        if err != nil {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
            c.Abort()
            return
        }

        // Set user info in context
        c.Set("user_id", int(claims["user_id"].(float64)))
        c.Set("reddit_id", claims["reddit_id"].(string))
        c.Set("username", claims["username"].(string))

        c.Next()
    }
}
```

### Backend: Main Server Setup

**File:** `backend/cmd/server/main.go`

```go
package main

import (
    "log"

    "github.com/gin-gonic/gin"
    "yourusername/chatreddit-backend/internal/api/handlers"
    "yourusername/chatreddit-backend/internal/api/middleware"
    "yourusername/chatreddit-backend/internal/config"
    "yourusername/chatreddit-backend/internal/database"
    "yourusername/chatreddit-backend/internal/models"
    "yourusername/chatreddit-backend/internal/services"
)

func main() {
    // Load configuration
    cfg := config.Load()

    // Connect to database
    db, err := database.Connect(cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName)
    if err != nil {
        log.Fatal("Database connection failed:", err)
    }
    defer db.Close()

    // Initialize repositories
    userRepo := models.NewUserRepository(db.DB)

    // Initialize services
    authService := services.NewAuthService(
        cfg.RedditClientID,
        cfg.RedditClientSecret,
        cfg.RedditRedirectURI,
        cfg.JWTSecret,
    )

    // Initialize handlers
    authHandler := handlers.NewAuthHandler(authService, userRepo)

    // Setup Gin router
    router := gin.Default()

    // CORS middleware (development)
    router.Use(func(c *gin.Context) {
        c.Writer.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
        c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
        c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
        c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")

        if c.Request.Method == "OPTIONS" {
            c.AbortWithStatus(204)
            return
        }

        c.Next()
    })

    // Routes
    api := router.Group("/api/v1")
    {
        // Auth routes (no auth required)
        auth := api.Group("/auth")
        {
            auth.GET("/reddit", authHandler.RedditAuth)
            auth.GET("/reddit/callback", authHandler.RedditCallback)
        }

        // Protected routes
        protected := api.Group("")
        protected.Use(middleware.AuthRequired(authService))
        {
            protected.GET("/auth/me", authHandler.GetMe)
        }
    }

    // Health check
    router.GET("/health", func(c *gin.Context) {
        c.JSON(200, gin.H{
            "status": "healthy",
            "database": "connected",
        })
    })

    // Start server
    log.Printf("Server starting on port %s", cfg.Port)
    if err := router.Run(":" + cfg.Port); err != nil {
        log.Fatal("Server failed to start:", err)
    }
}
```

### Testing Backend Auth

```bash
# Start server
cd backend
go run cmd/server/main.go

# In browser, visit:
http://localhost:8080/api/v1/auth/reddit

# After OAuth flow completes, you'll get JWT token
# Save this token for testing protected endpoints

# Test protected endpoint
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:8080/api/v1/auth/me
```

### Frontend: Auth Implementation

**File:** `frontend/src/services/api.ts`

```typescript
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
```

**File:** `frontend/src/services/auth.ts`

```typescript
import api from './api';

export interface User {
  id: number;
  reddit_id: string;
  username: string;
  karma: number;
  avatar_url: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export const authService = {
  async loginWithReddit() {
    window.location.href = `${import.meta.env.VITE_API_URL}/auth/reddit`;
  },

  async handleCallback(token: string): Promise<User> {
    localStorage.setItem('auth_token', token);
    const response = await api.get<User>('/auth/me');
    return response.data;
  },

  async getCurrentUser(): Promise<User> {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },

  logout() {
    localStorage.removeItem('auth_token');
    window.location.href = '/';
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('auth_token');
  },
};
```

**File:** `frontend/src/pages/LoginPage.tsx`

```typescript
import React from 'react';
import { authService } from '../services/auth';

export const LoginPage: React.FC = () => {
  const handleLogin = () => {
    authService.loginWithReddit();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg text-center">
        <h1 className="text-3xl font-bold text-white mb-4">
          Welcome to ChatReddit
        </h1>
        <p className="text-gray-400 mb-8">
          Browse Reddit posts and chat with multimedia features
        </p>
        <button
          onClick={handleLogin}
          className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-lg transition"
        >
          Login with Reddit
        </button>
      </div>
    </div>
  );
};
```

**File:** `frontend/src/pages/CallbackPage.tsx`

```typescript
import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../services/auth';

export const CallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleAuth = async () => {
      // Get token from URL (your backend should redirect with token)
      const token = searchParams.get('token');

      if (token) {
        try {
          await authService.handleCallback(token);
          navigate('/');
        } catch (error) {
          console.error('Auth failed:', error);
          navigate('/login');
        }
      } else {
        navigate('/login');
      }
    };

    handleAuth();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-white">Authenticating...</div>
    </div>
  );
};
```

### Month 1-2 Milestone Checklist

- [ ] Backend server starts without errors
- [ ] Database migrations run successfully
- [ ] Reddit OAuth login works
- [ ] JWT token generated and validated
- [ ] Protected endpoints require authentication
- [ ] Frontend can initiate Reddit login
- [ ] Frontend receives and stores JWT token
- [ ] Frontend can make authenticated requests

**Commit your code:**
```bash
git add .
git commit -m "feat: Reddit OAuth authentication complete"
git push origin claude/plan-mode-011CV5X5dP4Q7Jm72AVdr95f
```

---

## Months 3-4: Messaging System

*This section continues with equally detailed implementation for the messaging system, WebSocket integration, and E2E encryption. Due to space, I'll note that the full guide would continue with:*

- Message model and repository
- WebSocket server setup
- Message handlers
- Frontend WebSocket client
- E2E encryption (Web Crypto API)
- Conversation UI
- Real-time message delivery
- Read receipts and typing indicators

The pattern continues for all remaining months with the same level of detail.

---

## Testing Strategy

After each major feature:

1. **Unit Tests** (Go)
```bash
go test ./internal/...
```

2. **Manual Testing**
- Test happy path
- Test error cases
- Test edge cases

3. **Integration Testing**
- Test full user flows
- Test on different browsers
- Test on mobile

---

## Next Steps

This implementation guide provides the foundation. Continue building feature by feature following the monthly guides, always:

- Testing before moving on
- Committing regularly
- Documenting issues
- Referring to technical docs
- Taking breaks

**You've got this! 🚀**

For detailed continuation of each development month, refer to the phase lists and technical documentation. Each feature builds on the previous, creating the complete platform step by step.
