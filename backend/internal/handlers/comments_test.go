package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var commentsTestCounter int64

func uniqueCommentsUsername(base string) string {
	id := atomic.AddInt64(&commentsTestCounter, 1)
	return fmt.Sprintf("%s_comments_%d_%d", base, time.Now().UnixNano(), id)
}

func setupCommentsHandlerTest(t *testing.T) (*CommentsHandler, *database.Database, int, int, func()) {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)
	err = database.ResetTestData(ctx, db)
	require.NoError(t, err)

	userRepo := models.NewUserRepository(db.Pool)

	user1 := &models.User{Username: uniqueCommentsUsername("user1"), PasswordHash: "test_hash"}
	require.NoError(t, userRepo.Create(ctx, user1))

	user2 := &models.User{Username: uniqueCommentsUsername("user2"), PasswordHash: "test_hash"}
	require.NoError(t, userRepo.Create(ctx, user2))

	commentRepo := models.NewPostCommentRepository(db.Pool)
	postRepo := models.NewPlatformPostRepository(db.Pool)
	hubRepo := models.NewHubRepository(db.Pool)
	modRepo := models.NewHubModeratorRepository(db.Pool)

	handler := NewCommentsHandler(db.Pool, commentRepo, postRepo, hubRepo, userRepo, modRepo)

	cleanup := func() { db.Close() }
	return handler, db, user1.ID, user2.ID, cleanup
}

func createTestPost(t *testing.T, db *database.Database, authorID int) *models.PlatformPost {
	t.Helper()
	postRepo := models.NewPlatformPostRepository(db.Pool)
	post := &models.PlatformPost{
		AuthorID: authorID,
		Title:    "Test Post for Comments",
	}
	require.NoError(t, postRepo.Create(context.Background(), post))
	return post
}

func TestGetComments(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, db, user1ID, _, cleanup := setupCommentsHandlerTest(t)
	defer cleanup()

	// Create a real post so we can use its ID
	post := createTestPost(t, db, user1ID)

	testCases := []struct {
		name           string
		postIDParam    string
		expectedStatus int
	}{
		{
			name:           "valid post ID returns 200",
			postIDParam:    fmt.Sprintf("%d", post.ID),
			expectedStatus: http.StatusOK,
		},
		{
			name:           "invalid post ID returns 400",
			postIDParam:    "not-a-number",
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			router := gin.New()
			router.GET("/posts/:id/comments", handler.GetComments)

			param := tc.postIDParam

			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/posts/"+param+"/comments", nil)
			router.ServeHTTP(w, req)
			assert.Equal(t, tc.expectedStatus, w.Code)

			if tc.expectedStatus == http.StatusOK {
				var resp map[string]interface{}
				require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
				assert.Contains(t, resp, "comments")
				// The handler may return null or [] for an empty list — both are valid.
				// What must NOT be present is a non-array type (e.g. a string or object).
				rawComments := resp["comments"]
				if rawComments != nil {
					_, ok := rawComments.([]interface{})
					assert.True(t, ok, "comments field must be an array when non-null, got %T", rawComments)
				}
			}
		})
	}
}

func TestCreateComment(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, db, user1ID, _, cleanup := setupCommentsHandlerTest(t)
	defer cleanup()

	post := createTestPost(t, db, user1ID)

	testCases := []struct {
		name           string
		userID         int
		setAuth        bool
		body           map[string]interface{}
		expectedStatus int
	}{
		{
			name:           "success - creates comment",
			userID:         user1ID,
			setAuth:        true,
			body:           map[string]interface{}{"body": "Hello world"},
			expectedStatus: http.StatusCreated,
		},
		{
			name:           "unauthenticated - returns 401",
			userID:         0,
			setAuth:        false,
			body:           map[string]interface{}{"body": "Hello world"},
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "missing body - returns 400",
			userID:         user1ID,
			setAuth:        true,
			body:           map[string]interface{}{},
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			router := gin.New()
			router.POST("/posts/:id/comments", func(c *gin.Context) {
				if tc.setAuth {
					c.Set("user_id", tc.userID)
					c.Set("authenticated", true)
				}
				handler.CreateComment(c)
			})

			bodyBytes, _ := json.Marshal(tc.body)
			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/posts/%d/comments", post.ID), bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(w, req)
			assert.Equal(t, tc.expectedStatus, w.Code)

			if tc.expectedStatus == http.StatusCreated {
				var resp models.PostComment
				require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
				assert.Greater(t, resp.ID, 0, "created comment must have a non-zero ID")
				assert.Equal(t, post.ID, resp.PostID, "comment must reference the correct post")
				assert.Equal(t, tc.userID, resp.UserID, "comment must reference the correct user")
				assert.Equal(t, "Hello world", resp.Body)
			}
		})
	}
}

func TestCreateReply(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, db, user1ID, user2ID, cleanup := setupCommentsHandlerTest(t)
	defer cleanup()

	post := createTestPost(t, db, user1ID)

	// First create a parent comment
	commentRepo := models.NewPostCommentRepository(db.Pool)
	parentComment := &models.PostComment{
		PostID: post.ID,
		UserID: user1ID,
		Body:   "Parent comment",
	}
	require.NoError(t, commentRepo.Create(context.Background(), parentComment))

	t.Run("nested reply creates correctly", func(t *testing.T) {
		router := gin.New()
		router.POST("/posts/:id/comments", func(c *gin.Context) {
			c.Set("user_id", user2ID)
			c.Set("authenticated", true)
			handler.CreateComment(c)
		})

		body := map[string]interface{}{
			"body":              "This is a reply",
			"parent_comment_id": parentComment.ID,
		}
		bodyBytes, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/posts/%d/comments", post.ID), bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)

		var resp models.PostComment
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		require.NotNil(t, resp.ParentCommentID)
		assert.Equal(t, parentComment.ID, *resp.ParentCommentID)
	})

	t.Run("reply with wrong post's parent comment returns 400", func(t *testing.T) {
		// Create another post
		post2 := createTestPost(t, db, user1ID)

		router := gin.New()
		router.POST("/posts/:id/comments", func(c *gin.Context) {
			c.Set("user_id", user2ID)
			c.Set("authenticated", true)
			handler.CreateComment(c)
		})

		body := map[string]interface{}{
			"body":              "Reply to wrong post",
			"parent_comment_id": parentComment.ID, // belongs to post1
		}
		bodyBytes, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		// Post to post2 but parent comment belongs to post1
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/posts/%d/comments", post2.ID), bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestDeleteComment(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, db, user1ID, user2ID, cleanup := setupCommentsHandlerTest(t)
	defer cleanup()

	post := createTestPost(t, db, user1ID)
	commentRepo := models.NewPostCommentRepository(db.Pool)

	testCases := []struct {
		name           string
		ownerID        int
		callerID       int
		callerRole     string
		expectedStatus int
	}{
		{
			name:           "owner can delete own comment",
			ownerID:        user1ID,
			callerID:       user1ID,
			callerRole:     "user",
			expectedStatus: http.StatusOK,
		},
		{
			name:           "other user gets 403",
			ownerID:        user1ID,
			callerID:       user2ID,
			callerRole:     "user",
			expectedStatus: http.StatusForbidden,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			comment := &models.PostComment{
				PostID: post.ID,
				UserID: tc.ownerID,
				Body:   "Comment to delete",
			}
			require.NoError(t, commentRepo.Create(context.Background(), comment))

			router := gin.New()
			router.DELETE("/comments/:id", func(c *gin.Context) {
				c.Set("user_id", tc.callerID)
				c.Set("authenticated", true)
				c.Set("role", tc.callerRole)
				handler.DeleteComment(c)
			})

			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/comments/%d", comment.ID), nil)
			router.ServeHTTP(w, req)
			assert.Equal(t, tc.expectedStatus, w.Code)
		})
	}

	t.Run("comment not found returns 404", func(t *testing.T) {
		router := gin.New()
		router.DELETE("/comments/:id", func(c *gin.Context) {
			c.Set("user_id", user1ID)
			c.Set("authenticated", true)
			c.Set("role", "user")
			handler.DeleteComment(c)
		})

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodDelete, "/comments/999999999", nil)
		router.ServeHTTP(w, req)
		// GetByID returns nil, nil when no rows found; handler maps nil comment -> 404.
		assert.Equal(t, http.StatusNotFound, w.Code)
	})
}

func TestVoteComment(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, db, user1ID, user2ID, cleanup := setupCommentsHandlerTest(t)
	defer cleanup()

	post := createTestPost(t, db, user1ID)
	commentRepo := models.NewPostCommentRepository(db.Pool)

	// Each vote sub-case gets its own fresh comment so cases are fully independent.
	makeComment := func(body string) *models.PostComment {
		c := &models.PostComment{PostID: post.ID, UserID: user1ID, Body: body}
		require.NoError(t, commentRepo.Create(context.Background(), c))
		return c
	}

	testCases := []struct {
		name           string
		body           map[string]interface{}
		expectedStatus int
	}{
		{
			name:           "upvote succeeds",
			body:           map[string]interface{}{"is_upvote": true},
			expectedStatus: http.StatusOK,
		},
		{
			name:           "downvote succeeds",
			body:           map[string]interface{}{"is_upvote": false},
			expectedStatus: http.StatusOK,
		},
		{
			name:           "remove vote (null) succeeds",
			body:           map[string]interface{}{"is_upvote": nil},
			expectedStatus: http.StatusOK,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			comment := makeComment("Voteable comment for: " + tc.name)

			router := gin.New()
			router.POST("/comments/:id/vote", func(c *gin.Context) {
				c.Set("user_id", user2ID)
				c.Set("authenticated", true)
				handler.VoteComment(c)
			})

			bodyBytes, _ := json.Marshal(tc.body)
			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/comments/%d/vote", comment.ID), bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(w, req)
			assert.Equal(t, tc.expectedStatus, w.Code)
		})
	}

	t.Run("unauthenticated vote returns 401", func(t *testing.T) {
		unauthComment := makeComment("Unauthenticated vote target")

		router := gin.New()
		router.POST("/comments/:id/vote", func(c *gin.Context) {
			handler.VoteComment(c)
		})

		bodyBytes, _ := json.Marshal(map[string]interface{}{"is_upvote": true})
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/comments/%d/vote", unauthComment.ID), bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)
		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}
