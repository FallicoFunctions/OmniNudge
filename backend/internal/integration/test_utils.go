package integration

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/chatreddit/backend/internal/api/middleware"
	"github.com/chatreddit/backend/internal/config"
	"github.com/chatreddit/backend/internal/database"
	"github.com/chatreddit/backend/internal/handlers"
	"github.com/chatreddit/backend/internal/models"
	"github.com/chatreddit/backend/internal/services"
	"github.com/chatreddit/backend/internal/utils"
	"github.com/chatreddit/backend/internal/websocket"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// TestDeps bundles common test dependencies
type TestDeps struct {
	DB               *database.DB
	UserRepo         *models.UserRepository
	PostRepo         *models.PlatformPostRepository
	CommentRepo      *models.PostCommentRepository
	ConversationRepo *models.ConversationRepository
	MessageRepo      *models.MessageRepository
	SubredditRepo    *models.SubredditRepository
	ReportRepo       *models.ReportRepository
	ModRepo          *models.SubredditModeratorRepository
	AuthService      *services.AuthService
	Hub              *websocket.Hub
	Router           *gin.Engine
}

// getTestDB creates a DB connection using TEST_DATABASE_URL or skips tests
func getTestDB(t *testing.T) *database.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration tests")
	}
	db, err := database.New(dsn)
	require.NoError(t, err)
	require.NoError(t, db.Migrate(context.Background()))
	return db
}

// resetTables truncates data and seeds default subreddit
func resetTables(t *testing.T, db *database.DB) {
	t.Helper()
	_, err := db.Pool.Exec(context.Background(), `
		TRUNCATE TABLE reports, subreddit_moderators, post_votes, comment_votes, messages, conversations, post_comments, platform_posts, subreddits, users RESTART IDENTITY CASCADE;
		INSERT INTO subreddits (name, description) VALUES ('general', 'Default community for all posts');
	`)
	require.NoError(t, err)
}

// createUser creates a user with a hashed password and optional role
func createUser(t *testing.T, repo *models.UserRepository, username string, role string) *models.User {
	t.Helper()
	hash, err := utils.HashPassword("password123")
	require.NoError(t, err)
	user := &models.User{
		Username:     username,
		PasswordHash: hash,
		Role:         role,
	}
	require.NoError(t, repo.Create(context.Background(), user))
	if role != "" && role != "user" {
		require.NoError(t, repo.UpdateRole(context.Background(), user.ID, role))
		user.Role = role
	}
	return user
}

// newTestDeps builds all repos, services, handlers, and router
func newTestDeps(t *testing.T) *TestDeps {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db := getTestDB(t)
	resetTables(t, db)

	cfg, _ := config.Load()

	userRepo := models.NewUserRepository(db.Pool)
	postRepo := models.NewPlatformPostRepository(db.Pool)
	commentRepo := models.NewPostCommentRepository(db.Pool)
	conversationRepo := models.NewConversationRepository(db.Pool)
	messageRepo := models.NewMessageRepository(db.Pool)
	subredditRepo := models.NewSubredditRepository(db.Pool)
	reportRepo := models.NewReportRepository(db.Pool)
	modRepo := models.NewSubredditModeratorRepository(db.Pool)
	hub := websocket.NewHub()
	go hub.Run()

	authService := services.NewAuthService(
		cfg.Reddit.ClientID,
		cfg.Reddit.ClientSecret,
		cfg.Reddit.RedirectURI,
		cfg.JWT.Secret,
		cfg.Reddit.UserAgent,
	)

	// Handlers
	authHandler := handlers.NewAuthHandler(authService, userRepo)
	postsHandler := handlers.NewPostsHandler(postRepo, subredditRepo, modRepo)
	commentsHandler := handlers.NewCommentsHandler(commentRepo, postRepo, modRepo)
	redditHandler := handlers.NewRedditHandler(services.NewRedditClient(cfg.Reddit.UserAgent, services.NoopCache{}, 0))
	conversationsHandler := handlers.NewConversationsHandler(conversationRepo, messageRepo, userRepo)
	messagesHandler := handlers.NewMessagesHandler(messageRepo, conversationRepo, hub)
	usersHandler := handlers.NewUsersHandler(userRepo, postRepo, commentRepo)
	mediaHandler := handlers.NewMediaHandler(models.NewMediaFileRepository(db.Pool))
	subredditsHandler := handlers.NewSubredditsHandler(subredditRepo, postRepo, modRepo)
	moderationHandler := handlers.NewModerationHandler(reportRepo, modRepo)
	adminHandler := handlers.NewAdminHandler(userRepo)
	wsHandler := handlers.NewWebSocketHandler(hub)

	router := gin.New()
	router.Use(gin.Recovery())

	api := router.Group("/api/v1")
	{
		auth := api.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
			auth.GET("/me", middleware.AuthRequired(authService), authHandler.GetMe)
		}

		api.GET("/reddit/frontpage", redditHandler.GetFrontPage)

		posts := api.Group("/posts")
		{
			posts.GET("/feed", postsHandler.GetFeed)
			posts.GET("/:id", postsHandler.GetPost)
			posts.GET("/:id/comments", commentsHandler.GetComments)
		}

		subreddits := api.Group("/subreddits")
		{
			subreddits.GET("", subredditsHandler.List)
			subreddits.GET("/:name", subredditsHandler.Get)
			subreddits.GET("/:name/posts", subredditsHandler.GetPosts)
		}

		api.GET("/users/:username", usersHandler.GetUserProfile)

		protected := api.Group("")
		protected.Use(middleware.AuthRequired(authService))
		{
			protected.POST("/posts", postsHandler.CreatePost)
			protected.PUT("/posts/:id", postsHandler.UpdatePost)
			protected.DELETE("/posts/:id", postsHandler.DeletePost)
			protected.POST("/posts/:id/comments", commentsHandler.CreateComment)
			protected.PUT("/comments/:id", commentsHandler.UpdateComment)
			protected.DELETE("/comments/:id", commentsHandler.DeleteComment)

			protected.POST("/subreddits", subredditsHandler.Create)

			protected.POST("/reports", moderationHandler.CreateReport)
			mod := protected.Group("/mod")
			mod.Use(middleware.RequireRole("moderator", "admin"))
			{
				mod.GET("/reports", moderationHandler.ListReports)
				mod.POST("/reports/:id/status", moderationHandler.UpdateReportStatus)
			}

			admin := protected.Group("/admin")
			admin.Use(middleware.RequireRole("admin"))
			{
				admin.POST("/users/:id/role", adminHandler.PromoteUser)
				admin.POST("/subreddits/:name/moderators", subredditsHandler.AddModerator)
			}

			protected.POST("/messages", messagesHandler.SendMessage)
			protected.GET("/conversations/:id/messages", messagesHandler.GetMessages)
			protected.POST("/conversations/:id/read", messagesHandler.MarkAsRead)
			protected.POST("/conversations", conversationsHandler.CreateConversation)
		}

		api.GET("/ws", middleware.AuthRequired(authService), wsHandler.HandleWebSocket)
		api.POST("/media/upload", middleware.AuthRequired(authService), mediaHandler.UploadMedia)
	}

	return &TestDeps{
		DB:               db,
		UserRepo:         userRepo,
		PostRepo:         postRepo,
		CommentRepo:      commentRepo,
		ConversationRepo: conversationRepo,
		MessageRepo:      messageRepo,
		SubredditRepo:    subredditRepo,
		ReportRepo:       reportRepo,
		ModRepo:          modRepo,
		AuthService:      authService,
		Hub:              hub,
		Router:           router,
	}
}

// doRequest is a helper to perform an HTTP request
func doRequest(t *testing.T, router http.Handler, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}
