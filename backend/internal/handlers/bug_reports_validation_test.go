package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/domain"
)

type bugReportTestRepository struct {
	created *domain.BugReport
}

func (r *bugReportTestRepository) Create(_ context.Context, report *domain.BugReport) error {
	report.ID = 1
	report.CreatedAt = time.Now()
	r.created = report
	return nil
}

func (r *bugReportTestRepository) GetAll(context.Context, *string, *string, *string, int, int) ([]*domain.BugReport, error) {
	return nil, nil
}
func (r *bugReportTestRepository) GetAllWithCursor(context.Context, *string, *string, *string, int, *domain.TimeCursor) ([]*domain.BugReport, error) {
	return nil, nil
}
func (r *bugReportTestRepository) GetByID(context.Context, int) (*domain.BugReport, error) {
	return nil, nil
}
func (r *bugReportTestRepository) Update(context.Context, int, string, *string) error { return nil }

type bugReportTestMediaRepository struct {
	media *domain.MediaFile
}

func (r *bugReportTestMediaRepository) Create(context.Context, *domain.MediaFile) error { return nil }
func (r *bugReportTestMediaRepository) GetByStorageURL(_ context.Context, _ string) (*domain.MediaFile, error) {
	return r.media, nil
}
func (r *bugReportTestMediaRepository) GetByID(context.Context, int) (*domain.MediaFile, error) {
	return nil, nil
}
func (r *bugReportTestMediaRepository) GetTotalStorageByUserID(context.Context, int) (int64, error) {
	return 0, nil
}
func (r *bugReportTestMediaRepository) GetTrackedStorageByUserID(context.Context, int) (int64, error) {
	return 0, nil
}
func (r *bugReportTestMediaRepository) UpdateThumbnailURL(context.Context, int, string) error {
	return nil
}
func (r *bugReportTestMediaRepository) DeleteByID(context.Context, int) error { return nil }
func (r *bugReportTestMediaRepository) GetByPublicURL(context.Context, string) (*domain.MediaFile, error) {
	return nil, nil
}
func (r *bugReportTestMediaRepository) MarkScanClean(context.Context, int) error         { return nil }
func (r *bugReportTestMediaRepository) MarkScanError(context.Context, int, string) error { return nil }
func (r *bugReportTestMediaRepository) MarkScanInfected(context.Context, int, string) error {
	return nil
}
func (r *bugReportTestMediaRepository) FindByStoragePath(context.Context, string) (*domain.MediaFile, error) {
	return nil, nil
}

func serveBugReportRequest(t *testing.T, handler *BugReportsHandler, userID *int, payload map[string]interface{}) *httptest.ResponseRecorder {
	t.Helper()
	router := gin.New()
	router.POST("/bug-reports", func(c *gin.Context) {
		if userID != nil {
			c.Set("user_id", *userID)
		}
		handler.CreateBugReport(c)
	})
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/bug-reports", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

func TestIsValidFeedbackType(t *testing.T) {
	valid := []string{"report"}
	for _, value := range valid {
		if !isValidFeedbackType(value) {
			t.Fatalf("expected feedback type %q to be valid", value)
		}
	}

	invalid := []string{"", "bug", "other", "feedback", "survey", "nps", "NPS"}
	for _, value := range invalid {
		if isValidFeedbackType(value) {
			t.Fatalf("expected feedback type %q to be invalid", value)
		}
	}
}

func TestIsValidFeedbackCategory(t *testing.T) {
	valid := []string{"bug"}
	for _, value := range valid {
		if !isValidFeedbackCategory(value) {
			t.Fatalf("expected feedback category %q to be valid", value)
		}
	}

	invalid := []string{"", "feature_request", "other", "feature", "feedback", "BUG", "nps", "survey"}
	for _, value := range invalid {
		if isValidFeedbackCategory(value) {
			t.Fatalf("expected feedback category %q to be invalid", value)
		}
	}
}

func TestSanitizeFeedbackContext(t *testing.T) {
	longText := strings.Repeat("x", 2000)
	ctx := map[string]interface{}{
		"":          "ignore-empty-key",
		"long":      longText,
		"bool":      true,
		"number":    42,
		"slice":     []string{"a", "b"},
		"map_value": map[string]string{"k": "v"},
	}

	sanitized := sanitizeFeedbackContext(ctx)

	if _, exists := sanitized[""]; exists {
		t.Fatal("expected empty key to be removed")
	}
	longValue, ok := sanitized["long"].(string)
	if !ok {
		t.Fatal("expected long value to remain a string")
	}
	if len(longValue) != 1024 {
		t.Fatalf("expected long value to be truncated to 1024 chars, got %d", len(longValue))
	}
	if sanitized["bool"] != true {
		t.Fatal("expected bool value to remain unchanged")
	}
	if sanitized["number"] != 42 {
		t.Fatal("expected numeric value to remain unchanged")
	}
	if _, ok := sanitized["slice"].(string); !ok {
		t.Fatal("expected non-scalar values to be converted to string")
	}
	if _, ok := sanitized["map_value"].(string); !ok {
		t.Fatal("expected map values to be converted to string")
	}
}

func TestCreateBugReportRejectsForeignOrAnonymousScreenshot(t *testing.T) {
	mediaRepo := &bugReportTestMediaRepository{media: &domain.MediaFile{
		UserID:     7,
		FileType:   "image/png",
		StorageURL: "/uploads/private.png",
	}}
	reportRepo := &bugReportTestRepository{}
	handler := NewBugReportsHandler(reportRepo, nil, mediaRepo)
	payload := map[string]interface{}{
		"page_url":       "/settings",
		"description":    "The setting did not save.",
		"screenshot_url": "https://app.example.test/uploads/private.png",
	}

	foreignUserID := 8
	foreignResponse := serveBugReportRequest(t, handler, &foreignUserID, payload)
	if foreignResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected foreign attachment rejection, got %d: %s", foreignResponse.Code, foreignResponse.Body.String())
	}
	if reportRepo.created != nil {
		t.Fatal("foreign screenshot must not create a report")
	}

	anonymousResponse := serveBugReportRequest(t, handler, nil, payload)
	if anonymousResponse.Code != http.StatusUnauthorized {
		t.Fatalf("expected anonymous attachment rejection, got %d: %s", anonymousResponse.Code, anonymousResponse.Body.String())
	}
}

func TestCreateBugReportBoundsPageURLAndDescription(t *testing.T) {
	handler := NewBugReportsHandler(&bugReportTestRepository{}, nil, &bugReportTestMediaRepository{})
	tooLongPage := serveBugReportRequest(t, handler, nil, map[string]interface{}{
		"page_url":    strings.Repeat("a", maxBugReportPageURLLength+1),
		"description": "A valid description",
	})
	if tooLongPage.Code != http.StatusBadRequest {
		t.Fatalf("expected page URL bounds rejection, got %d: %s", tooLongPage.Code, tooLongPage.Body.String())
	}

	tooLongDescription := serveBugReportRequest(t, handler, nil, map[string]interface{}{
		"page_url":    "/feed",
		"description": strings.Repeat("a", maxBugReportDescriptionLength+1),
	})
	if tooLongDescription.Code != http.StatusBadRequest {
		t.Fatalf("expected description bounds rejection, got %d: %s", tooLongDescription.Code, tooLongDescription.Body.String())
	}
}
