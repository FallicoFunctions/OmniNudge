package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

type mockRedditCommentRepo struct {
	comments []*models.RedditPostComment
}

func (m *mockRedditCommentRepo) Create(ctx context.Context, comment *models.RedditPostComment) error {
	return nil
}

func (m *mockRedditCommentRepo) GetByID(ctx context.Context, id int) (*models.RedditPostComment, error) {
	return nil, nil
}

func (m *mockRedditCommentRepo) GetByRedditPostWithUserVotes(ctx context.Context, subreddit, postID string, userID int) ([]*models.RedditPostComment, error) {
	return m.comments, nil
}

func (m *mockRedditCommentRepo) GetByRedditPost(ctx context.Context, subreddit, postID string) ([]*models.RedditPostComment, error) {
	return m.comments, nil
}

func (m *mockRedditCommentRepo) Update(ctx context.Context, id int, content string) error {
	return nil
}

func (m *mockRedditCommentRepo) Delete(ctx context.Context, id int) error {
	return nil
}

func (m *mockRedditCommentRepo) SetInboxRepliesDisabled(ctx context.Context, id int, userID int, disabled bool) error {
	return nil
}

func (m *mockRedditCommentRepo) GetUserVote(ctx context.Context, commentID, userID int) (int, error) {
	return 0, nil
}

func (m *mockRedditCommentRepo) SetVote(ctx context.Context, commentID, userID, voteType int) error {
	return nil
}

func TestGetRedditPostComments_SortsResults(t *testing.T) {
	gin.SetMode(gin.TestMode)
	now := time.Now()

	repo := &mockRedditCommentRepo{
		comments: []*models.RedditPostComment{
			{ID: 1, Ups: 20, Downs: 5, Content: "short answer", CreatedAt: now.Add(-time.Hour)},
			{ID: 2, Ups: 20, Downs: 5, Content: strings.Repeat("a", 1200), CreatedAt: now.Add(-2 * time.Hour)},
			{ID: 3, Ups: 1, Downs: 0, Content: "low votes but newest", CreatedAt: now},
		},
	}

	handler := NewRedditCommentsHandler(repo)
	router := gin.Default()
	router.GET("/api/v1/reddit/posts/:subreddit/:postId/comments", handler.GetRedditPostComments)

	// QA sort should favor longer answer on equal Wilson score
	req := httptest.NewRequest("GET", "/api/v1/reddit/posts/golang/abc/comments?sort=qa", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())

	var resp struct {
		Comments []models.RedditPostComment `json:"comments"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	require.Len(t, resp.Comments, 3)
	require.Equal(t, 2, resp.Comments[0].ID, "QA sort should pick longer answer with same votes")
	require.Equal(t, 1, resp.Comments[1].ID, "QA sort should next pick newer among remaining")

	// New sort should strictly use CreatedAt regardless of QA bonuses
	req = httptest.NewRequest("GET", "/api/v1/reddit/posts/golang/abc/comments?sort=new", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, "body=%s", w.Body.String())
	resp = struct {
		Comments []models.RedditPostComment `json:"comments"`
	}{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	require.Len(t, resp.Comments, 3)
	require.Equal(t, 3, resp.Comments[0].ID, "Newest comment should appear first")
	require.Equal(t, 1, resp.Comments[1].ID)
	require.Equal(t, 2, resp.Comments[2].ID)
}
