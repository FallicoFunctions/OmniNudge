package integration

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/handlers"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/utils"
	"github.com/omninudge/backend/internal/websocket"
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
	HubRepo          *models.HubRepository
	ReportRepo       *models.ReportRepository
	ModRepo          *models.HubModeratorRepository
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

// resetTables truncates data and seeds default hub
func resetTables(t *testing.T, db *database.DB) {
	t.Helper()
	_, err := db.Pool.Exec(context.Background(), `
		TRUNCATE TABLE reports, hub_moderators, post_votes, comment_votes, messages, conversations, post_comments, platform_posts, hubs, users RESTART IDENTITY CASCADE;
		INSERT INTO hubs (name, description) VALUES ('general', 'Default community for all posts');
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
	userProfileRepo := models.NewUserProfileRepository(db.Pool)
	userFriendshipRepo := models.NewUserFriendshipRepository(db.Pool)
	postRepo := models.NewPlatformPostRepository(db.Pool)
	commentRepo := models.NewPostCommentRepository(db.Pool)
	conversationRepo := models.NewConversationRepository(db.Pool)
	messageRepo := models.NewMessageRepository(db.Pool)
	hubRepo := models.NewHubRepository(db.Pool)
	reportRepo := models.NewReportRepository(db.Pool)
	modRepo := models.NewHubModeratorRepository(db.Pool)
	notifRepo := models.NewNotificationRepository(db.Pool)
	redditPostRepo := models.NewRedditPostRepository(db.Pool)
	feedRepo := models.NewFeedRepository(db.Pool)
	hubSettingsRepo := repository.NewHubSettingsRepository(db.Pool)
	userSettingsRepo := models.NewUserSettingsRepository(db.Pool)
	hub := websocket.NewHub()
	go hub.Run()

	authService := services.NewAuthService(
		cfg.Reddit.ClientID,
		cfg.Reddit.ClientSecret,
		cfg.Reddit.RedirectURI,
		cfg.JWT.Secret,
		cfg.Reddit.UserAgent,
		cfg.Turnstile.Secret,
	)

	// Handlers
	authHandler := handlers.NewAuthHandler(authService, userRepo, nil, nil, nil, "http://test-frontend")
	postsHandler := handlers.NewPostsHandler(db.Pool, postRepo, hubRepo, userRepo, modRepo, feedRepo, hubSettingsRepo)
	commentsHandler := handlers.NewCommentsHandler(db.Pool, commentRepo, postRepo, hubRepo, userRepo, modRepo)
	redditHandler := handlers.NewRedditHandler(
		services.NewRedditClient(cfg.Reddit.UserAgent, services.NoopCache{}, 0, cfg.Reddit.ClientID, cfg.Reddit.ClientSecret),
		redditPostRepo,
	)
	conversationsHandler := handlers.NewConversationsHandler(db.Pool, conversationRepo, messageRepo, userRepo)
	messagesHandler := handlers.NewMessagesHandler(db.Pool, messageRepo, conversationRepo, userSettingsRepo, hub, nil)
	settingsHandler := handlers.NewSettingsHandler(userSettingsRepo)
	thumbnailService := services.NewThumbnailService()
	usersHandler := handlers.NewUsersHandler(userRepo, userProfileRepo, userFriendshipRepo, userSettingsRepo, postRepo, commentRepo, nil, modRepo, services.NoopCache{}, thumbnailService)
	mediaHandler := handlers.NewMediaHandler(models.NewMediaFileRepository(db.Pool), thumbnailService, nil)
	hubSubRepo := models.NewHubSubscriptionRepository(db.Pool)
	hubsHandler := handlers.NewHubsHandler(hubRepo, postRepo, modRepo, hubSubRepo, hubSettingsRepo)
	moderationHandler := handlers.NewModerationHandler(reportRepo, modRepo, userRepo, notifRepo, hub, nil)
	adminHandler := handlers.NewAdminHandler(userRepo, modRepo, db.Pool)
	authorizer := websocket.NewAuthorizer(db.Pool)
	wsHandler := handlers.NewWebSocketHandler(hub, authorizer, userSettingsRepo)
	searchHandler := handlers.NewSearchHandler(db.Pool)

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

		hubs := api.Group("/hubs")
		{
			hubs.GET("", hubsHandler.List)
			hubs.GET("/:name", hubsHandler.Get)
			hubs.GET("/:name/posts", hubsHandler.GetPosts)
		}

		users := api.Group("/users")
		users.Use(middleware.AuthOptional(authService))
		{
			users.GET("/id/:id/profile", usersHandler.GetUserProfileByID)
			users.GET("/:username", usersHandler.GetUserProfile)
		}

		search := api.Group("/search")
		{
			search.GET("/posts", searchHandler.SearchPosts)
			search.GET("/comments", searchHandler.SearchComments)
			search.GET("/users", searchHandler.SearchUsers)
			search.GET("/hubs", searchHandler.SearchHubs)
		}

		protected := api.Group("")
		protected.Use(middleware.AuthRequired(authService))
		{
			protected.POST("/posts", postsHandler.CreatePost)
			protected.PUT("/posts/:id", postsHandler.UpdatePost)
			protected.DELETE("/posts/:id", postsHandler.DeletePost)
			protected.POST("/posts/:id/vote", postsHandler.VotePost)
			protected.POST("/posts/:id/comments", commentsHandler.CreateComment)
			protected.PUT("/comments/:id", commentsHandler.UpdateComment)
			protected.DELETE("/comments/:id", commentsHandler.DeleteComment)
			protected.POST("/comments/:id/vote", commentsHandler.VoteComment)

			protected.POST("/hubs", hubsHandler.Create)

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
				admin.POST("/hubs/:name/moderators", hubsHandler.AddModerator)
			}

			protected.POST("/messages", messagesHandler.SendMessage)
			protected.GET("/conversations", conversationsHandler.GetConversations)
			protected.GET("/conversations/archived", conversationsHandler.GetArchivedConversations)
			protected.POST("/conversations/archive-batch", conversationsHandler.ArchiveConversationBatch)
			protected.GET("/conversations/:id/messages", messagesHandler.GetMessages)
			protected.GET("/messages/:id/history", messagesHandler.GetMessageHistory)
			protected.GET("/conversations/:id/pinned-messages", messagesHandler.GetPinnedMessages)
			protected.POST("/conversations/:id/read", messagesHandler.MarkAsRead)
			protected.PATCH("/messages/:id", messagesHandler.EditMessage)
			protected.PUT("/conversations/:id/archive", conversationsHandler.ArchiveConversation)
			protected.PUT("/conversations/:id/unarchive", conversationsHandler.UnarchiveConversation)
			protected.POST("/messages/:id/pin", messagesHandler.PinMessage)
			protected.DELETE("/messages/:id/pin", messagesHandler.UnpinMessage)
			protected.POST("/conversations", conversationsHandler.CreateConversation)
			protected.GET("/search/messages", searchHandler.SearchMessages)
			protected.GET("/users/me/profile", usersHandler.GetMyProfile)
			protected.PUT("/users/me/profile", usersHandler.UpdateProfile)
			protected.POST("/users/me/avatar", usersHandler.UploadMyAvatar)
			protected.GET("/settings", settingsHandler.GetSettings)
			protected.PUT("/settings", settingsHandler.UpdateSettings)
		}

		api.GET("/ws", middleware.AuthRequired(authService), wsHandler.HandleWebSocket)
		api.POST("/media/upload", middleware.AuthRequired(authService), mediaHandler.UploadMedia)
		api.POST("/media/batch-upload", middleware.AuthRequired(authService), mediaHandler.BatchUploadMedia)
	}

	return &TestDeps{
		DB:               db,
		UserRepo:         userRepo,
		PostRepo:         postRepo,
		CommentRepo:      commentRepo,
		ConversationRepo: conversationRepo,
		MessageRepo:      messageRepo,
		HubRepo:          hubRepo,
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
