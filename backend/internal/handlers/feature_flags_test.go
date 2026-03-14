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
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var featureFlagTestCounter int64

func uniqueFlagKey(base string) string {
	id := atomic.AddInt64(&featureFlagTestCounter, 1)
	return fmt.Sprintf("%s_%d_%d", base, time.Now().UnixNano(), id)
}

func setupFeatureFlagHandlerTest(t *testing.T) (*FeatureFlagHandler, *database.Database, func()) {
	t.Helper()

	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	err = database.ResetTestData(ctx, db)
	require.NoError(t, err)

	repo := repository.NewFeatureFlagRepository(db.Pool)
	// nil Redis and nil hub — service degrades gracefully (no caching, no broadcast)
	svc := services.NewFeatureFlagService(repo, nil, nil, "test")
	handler := NewFeatureFlagHandler(svc)

	cleanup := func() {
		db.Close()
	}
	return handler, db, cleanup
}

func TestListFeatureFlags(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, _, cleanup := setupFeatureFlagHandlerTest(t)
	defer cleanup()

	// Seed a couple of flags so the list is non-trivially testable
	createRouter := gin.New()
	createRouter.POST("/admin/feature-flags", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.CreateFlag(c)
	})

	seedKeys := []string{uniqueFlagKey("list_a"), uniqueFlagKey("list_b")}
	for _, k := range seedKeys {
		body := map[string]interface{}{"key": k, "enabled": true, "description": "seed"}
		bj, _ := json.Marshal(body)
		r := httptest.NewRequest(http.MethodPost, "/admin/feature-flags", bytes.NewBuffer(bj))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		createRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusCreated, w.Code)
	}

	router := gin.New()
	router.GET("/admin/feature-flags", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.ListFlags(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/admin/feature-flags", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Contains(t, resp, "flags")

	// "flags" must be a list (array), not null
	flags, ok := resp["flags"].([]interface{})
	require.True(t, ok, "flags should be an array")
	assert.GreaterOrEqual(t, len(flags), 2, "should contain at least the 2 seeded flags")
}

func TestCreateFeatureFlag(t *testing.T) {
	gin.SetMode(gin.TestMode)

	testCases := []struct {
		name           string
		body           map[string]interface{}
		expectedStatus int
	}{
		{
			name: "create flag success",
			body: map[string]interface{}{
				"key":         uniqueFlagKey("test_flag"),
				"enabled":     true,
				"description": "A test feature flag",
			},
			expectedStatus: http.StatusCreated,
		},
		{
			name:           "invalid payload missing required fields",
			body:           map[string]interface{}{},
			expectedStatus: http.StatusBadRequest,
		},
		{
			name: "invalid percentage out of range",
			body: map[string]interface{}{
				"key":         uniqueFlagKey("pct_flag"),
				"enabled":     true,
				"description": "Percentage flag",
				"percentage":  150,
			},
			expectedStatus: http.StatusBadRequest,
		},
		{
			name: "negative percentage rejected",
			body: map[string]interface{}{
				"key":         uniqueFlagKey("neg_pct"),
				"enabled":     true,
				"description": "Negative pct",
				"percentage":  -1,
			},
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			handler, _, cleanup := setupFeatureFlagHandlerTest(t)
			defer cleanup()

			router := gin.New()
			router.POST("/admin/feature-flags", func(c *gin.Context) {
				c.Set("user_id", 1)
				handler.CreateFlag(c)
			})

			bodyJSON, _ := json.Marshal(tc.body)
			req := httptest.NewRequest(http.MethodPost, "/admin/feature-flags", bytes.NewBuffer(bodyJSON))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, tc.expectedStatus, w.Code)

			if tc.expectedStatus == http.StatusCreated {
				// Handler returns the flag object directly (not wrapped in {"flag": ...})
				var resp map[string]interface{}
				err := json.Unmarshal(w.Body.Bytes(), &resp)
				require.NoError(t, err)
				assert.Contains(t, resp, "key", "created response should include the flag key field")
				assert.Contains(t, resp, "enabled", "created response should include enabled field")
			}
		})
	}
}

func TestCreateFeatureFlagDuplicate(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, _, cleanup := setupFeatureFlagHandlerTest(t)
	defer cleanup()

	router := gin.New()
	router.POST("/admin/feature-flags", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.CreateFlag(c)
	})

	flagKey := uniqueFlagKey("dup_flag")
	body := map[string]interface{}{
		"key":         flagKey,
		"enabled":     true,
		"description": "First creation",
	}
	bodyJSON, _ := json.Marshal(body)

	// First creation
	req1 := httptest.NewRequest(http.MethodPost, "/admin/feature-flags", bytes.NewBuffer(bodyJSON))
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	assert.Equal(t, http.StatusCreated, w1.Code)

	// Duplicate creation — expect error
	bodyJSON2, _ := json.Marshal(body)
	req2 := httptest.NewRequest(http.MethodPost, "/admin/feature-flags", bytes.NewBuffer(bodyJSON2))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusBadRequest, w2.Code)

	// Error response must not contain a flag object
	var resp map[string]interface{}
	err := json.Unmarshal(w2.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.NotContains(t, resp, "flag")
}

func TestGetFeatureFlag(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, _, cleanup := setupFeatureFlagHandlerTest(t)
	defer cleanup()

	// Create a flag first
	createRouter := gin.New()
	createRouter.POST("/admin/feature-flags", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.CreateFlag(c)
	})

	flagKey := uniqueFlagKey("get_flag")
	createBody := map[string]interface{}{
		"key":         flagKey,
		"enabled":     true,
		"description": "Get test flag",
	}
	createJSON, _ := json.Marshal(createBody)
	createReq := httptest.NewRequest(http.MethodPost, "/admin/feature-flags", bytes.NewBuffer(createJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	createRouter.ServeHTTP(createW, createReq)
	require.Equal(t, http.StatusCreated, createW.Code)

	testCases := []struct {
		name           string
		key            string
		expectedStatus int
		// For found case, verify the key in the returned flag matches
		checkKey bool
	}{
		{
			name:           "found — returns flag with correct key",
			key:            flagKey,
			expectedStatus: http.StatusOK,
			checkKey:       true,
		},
		{
			name: "not found — handler returns 200 with null flag " +
				"(repo returns nil,nil; body must contain flag=null, not a flag object)",
			key:            "nonexistent_flag_key",
			expectedStatus: http.StatusOK,
			checkKey:       false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			router := gin.New()
			router.GET("/admin/feature-flags/:key", func(c *gin.Context) {
				c.Set("user_id", 1)
				handler.GetFeatureFlag(c)
			})

			req := httptest.NewRequest(http.MethodGet, "/admin/feature-flags/"+tc.key, nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, tc.expectedStatus, w.Code)

			var resp map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &resp)
			require.NoError(t, err)

			if tc.checkKey {
				// Found — handler returns the flag object directly (no wrapper)
				assert.Equal(t, tc.key, resp["key"], "returned flag key should match requested key")
			} else {
				// Not found — handler returns nil which JSON-encodes as null at top level
				// resp will be empty map since nil marshals to null (not a JSON object)
				assert.Nil(t, resp["key"], "flag key field should be absent for unknown keys")
			}
		})
	}
}

func TestUpdateFeatureFlag(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, _, cleanup := setupFeatureFlagHandlerTest(t)
	defer cleanup()

	// Create a flag first
	createRouter := gin.New()
	createRouter.POST("/admin/feature-flags", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.CreateFlag(c)
	})

	flagKey := uniqueFlagKey("update_flag")
	createBody := map[string]interface{}{
		"key":         flagKey,
		"enabled":     true,
		"description": "Update test flag",
	}
	createJSON, _ := json.Marshal(createBody)
	createReq := httptest.NewRequest(http.MethodPost, "/admin/feature-flags", bytes.NewBuffer(createJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	createRouter.ServeHTTP(createW, createReq)
	require.Equal(t, http.StatusCreated, createW.Code)

	testCases := []struct {
		name           string
		key            string
		body           map[string]interface{}
		expectedStatus int
	}{
		{
			name: "update existing flag",
			key:  flagKey,
			body: map[string]interface{}{
				"enabled":     false,
				"description": "Updated description",
			},
			expectedStatus: http.StatusOK,
		},
		{
			name: "update nonexistent key",
			key:  "no_such_flag",
			body: map[string]interface{}{
				"enabled": false,
			},
			expectedStatus: http.StatusNotFound,
		},
		{
			name: "invalid percentage out of range",
			key:  flagKey,
			body: map[string]interface{}{
				"percentage": 200,
			},
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			router := gin.New()
			router.PUT("/admin/feature-flags/:key", func(c *gin.Context) {
				c.Set("user_id", 1)
				handler.UpdateFlag(c)
			})

			bodyJSON, _ := json.Marshal(tc.body)
			req := httptest.NewRequest(http.MethodPut, "/admin/feature-flags/"+tc.key, bytes.NewBuffer(bodyJSON))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, tc.expectedStatus, w.Code)
		})
	}
}

// TestUpdateFeatureFlag_PersistsChanges verifies that after a successful update
// the new values are readable back via GetFeatureFlag.
func TestUpdateFeatureFlag_PersistsChanges(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, _, cleanup := setupFeatureFlagHandlerTest(t)
	defer cleanup()

	flagKey := uniqueFlagKey("persist_flag")

	createRouter := gin.New()
	createRouter.POST("/admin/feature-flags", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.CreateFlag(c)
	})
	body, _ := json.Marshal(map[string]interface{}{"key": flagKey, "enabled": true, "description": "original"})
	r := httptest.NewRequest(http.MethodPost, "/admin/feature-flags", bytes.NewBuffer(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	createRouter.ServeHTTP(w, r)
	require.Equal(t, http.StatusCreated, w.Code)

	// Update
	updateRouter := gin.New()
	updateRouter.PUT("/admin/feature-flags/:key", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.UpdateFlag(c)
	})
	upBody, _ := json.Marshal(map[string]interface{}{"enabled": false, "description": "updated"})
	upReq := httptest.NewRequest(http.MethodPut, "/admin/feature-flags/"+flagKey, bytes.NewBuffer(upBody))
	upReq.Header.Set("Content-Type", "application/json")
	upW := httptest.NewRecorder()
	updateRouter.ServeHTTP(upW, upReq)
	require.Equal(t, http.StatusOK, upW.Code)

	// Read back and confirm change persisted
	getRouter := gin.New()
	getRouter.GET("/admin/feature-flags/:key", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.GetFeatureFlag(c)
	})
	getReq := httptest.NewRequest(http.MethodGet, "/admin/feature-flags/"+flagKey, nil)
	getW := httptest.NewRecorder()
	getRouter.ServeHTTP(getW, getReq)
	require.Equal(t, http.StatusOK, getW.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(getW.Body.Bytes(), &resp)
	require.NoError(t, err)
	// GetFeatureFlag handler returns the flag object directly (not wrapped)
	assert.Equal(t, false, resp["enabled"], "enabled should be false after update")
	assert.Equal(t, "updated", resp["description"])
}

func TestDeleteFeatureFlag(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, _, cleanup := setupFeatureFlagHandlerTest(t)
	defer cleanup()

	// Create a flag to delete
	createRouter := gin.New()
	createRouter.POST("/admin/feature-flags", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.CreateFlag(c)
	})

	flagKey := uniqueFlagKey("delete_flag")
	createBody := map[string]interface{}{
		"key":         flagKey,
		"enabled":     true,
		"description": "Delete test flag",
	}
	createJSON, _ := json.Marshal(createBody)
	createReq := httptest.NewRequest(http.MethodPost, "/admin/feature-flags", bytes.NewBuffer(createJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	createRouter.ServeHTTP(createW, createReq)
	require.Equal(t, http.StatusCreated, createW.Code)

	testCases := []struct {
		name           string
		key            string
		expectedStatus int
	}{
		{
			name:           "delete existing flag",
			key:            flagKey,
			expectedStatus: http.StatusOK,
		},
		{
			name:           "delete nonexistent flag",
			key:            "no_such_flag_xyz",
			expectedStatus: http.StatusNotFound,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			router := gin.New()
			router.DELETE("/admin/feature-flags/:key", func(c *gin.Context) {
				c.Set("user_id", 1)
				handler.DeleteFlag(c)
			})

			req := httptest.NewRequest(http.MethodDelete, "/admin/feature-flags/"+tc.key, nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, tc.expectedStatus, w.Code)
		})
	}
}

// TestDeleteFeatureFlag_IsIdempotent verifies that deleting the same flag twice
// returns 404 on the second attempt (it's gone).
func TestDeleteFeatureFlag_IsIdempotent(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, _, cleanup := setupFeatureFlagHandlerTest(t)
	defer cleanup()

	flagKey := uniqueFlagKey("idempotent_delete")

	createRouter := gin.New()
	createRouter.POST("/admin/feature-flags", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.CreateFlag(c)
	})
	body, _ := json.Marshal(map[string]interface{}{"key": flagKey, "enabled": true, "description": "to delete"})
	r := httptest.NewRequest(http.MethodPost, "/admin/feature-flags", bytes.NewBuffer(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	createRouter.ServeHTTP(w, r)
	require.Equal(t, http.StatusCreated, w.Code)

	deleteRouter := gin.New()
	deleteRouter.DELETE("/admin/feature-flags/:key", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.DeleteFlag(c)
	})

	// First delete — should succeed
	req1 := httptest.NewRequest(http.MethodDelete, "/admin/feature-flags/"+flagKey, nil)
	w1 := httptest.NewRecorder()
	deleteRouter.ServeHTTP(w1, req1)
	assert.Equal(t, http.StatusOK, w1.Code)

	// Second delete — flag is gone, should be 404
	req2 := httptest.NewRequest(http.MethodDelete, "/admin/feature-flags/"+flagKey, nil)
	w2 := httptest.NewRecorder()
	deleteRouter.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusNotFound, w2.Code)
}

func TestGetUserFlags(t *testing.T) {
	gin.SetMode(gin.TestMode)

	testCases := []struct {
		name           string
		queryString    string
		userID         int
		expectedStatus int
	}{
		{
			name:           "get all flags for user",
			queryString:    "",
			userID:         1,
			expectedStatus: http.StatusOK,
		},
		{
			name:           "get flags with keys filter",
			queryString:    "?keys=some_key",
			userID:         1,
			expectedStatus: http.StatusOK,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			handler, _, cleanup := setupFeatureFlagHandlerTest(t)
			defer cleanup()

			router := gin.New()
			router.GET("/feature-flags", func(c *gin.Context) {
				c.Set("user_id", tc.userID)
				handler.GetUserFlags(c)
			})

			req := httptest.NewRequest(http.MethodGet, "/feature-flags"+tc.queryString, nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, tc.expectedStatus, w.Code)

			var resp map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &resp)
			require.NoError(t, err)
			assert.Contains(t, resp, "flags")
		})
	}
}

func TestFeatureFlagEnabledState(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, _, cleanup := setupFeatureFlagHandlerTest(t)
	defer cleanup()

	createRouter := gin.New()
	createRouter.POST("/admin/feature-flags", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.CreateFlag(c)
	})

	enabledKey := uniqueFlagKey("enabled_flag")
	disabledKey := uniqueFlagKey("disabled_flag")

	for _, kv := range []struct {
		key     string
		enabled bool
	}{
		{enabledKey, true},
		{disabledKey, false},
	} {
		body, _ := json.Marshal(map[string]interface{}{
			"key": kv.key, "enabled": kv.enabled, "description": "state test",
		})
		r := httptest.NewRequest(http.MethodPost, "/admin/feature-flags", bytes.NewBuffer(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		createRouter.ServeHTTP(w, r)
		require.Equal(t, http.StatusCreated, w.Code)
	}

	// Query both keys via GetUserFlags
	listRouter := gin.New()
	listRouter.GET("/feature-flags", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.GetUserFlags(c)
	})

	req := httptest.NewRequest(
		http.MethodGet,
		fmt.Sprintf("/feature-flags?keys=%s,%s", enabledKey, disabledKey),
		nil,
	)
	w := httptest.NewRecorder()
	listRouter.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	flags, ok := resp["flags"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, true, flags[enabledKey], "enabled flag should be true")
	assert.Equal(t, false, flags[disabledKey], "disabled flag should be false")
}

// TestFeatureFlagLifecycle exercises create → update → delete in sequence,
// confirming state at each step.
func TestFeatureFlagLifecycle(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler, _, cleanup := setupFeatureFlagHandlerTest(t)
	defer cleanup()

	flagKey := uniqueFlagKey("lifecycle")

	createRouter := gin.New()
	createRouter.POST("/admin/feature-flags", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.CreateFlag(c)
	})
	updateRouter := gin.New()
	updateRouter.PUT("/admin/feature-flags/:key", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.UpdateFlag(c)
	})
	deleteRouter := gin.New()
	deleteRouter.DELETE("/admin/feature-flags/:key", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.DeleteFlag(c)
	})
	getRouter := gin.New()
	getRouter.GET("/admin/feature-flags/:key", func(c *gin.Context) {
		c.Set("user_id", 1)
		handler.GetFeatureFlag(c)
	})

	// 1. Create
	body, _ := json.Marshal(map[string]interface{}{"key": flagKey, "enabled": true, "description": "v1"})
	r := httptest.NewRequest(http.MethodPost, "/admin/feature-flags", bytes.NewBuffer(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	createRouter.ServeHTTP(w, r)
	require.Equal(t, http.StatusCreated, w.Code, "create step")

	// 2. Update
	upBody, _ := json.Marshal(map[string]interface{}{"enabled": false, "description": "v2"})
	upReq := httptest.NewRequest(http.MethodPut, "/admin/feature-flags/"+flagKey, bytes.NewBuffer(upBody))
	upReq.Header.Set("Content-Type", "application/json")
	upW := httptest.NewRecorder()
	updateRouter.ServeHTTP(upW, upReq)
	require.Equal(t, http.StatusOK, upW.Code, "update step")

	// 3. Confirm updated value
	getReq := httptest.NewRequest(http.MethodGet, "/admin/feature-flags/"+flagKey, nil)
	getW := httptest.NewRecorder()
	getRouter.ServeHTTP(getW, getReq)
	require.Equal(t, http.StatusOK, getW.Code)
	var getResp map[string]interface{}
	_ = json.Unmarshal(getW.Body.Bytes(), &getResp)
	// GetFeatureFlag handler returns flag directly
	assert.Equal(t, false, getResp["enabled"])

	// 4. Delete
	delReq := httptest.NewRequest(http.MethodDelete, "/admin/feature-flags/"+flagKey, nil)
	delW := httptest.NewRecorder()
	deleteRouter.ServeHTTP(delW, delReq)
	require.Equal(t, http.StatusOK, delW.Code, "delete step")

	// 5. Confirm gone (404 on update, or null on get)
	delAgain := httptest.NewRequest(http.MethodDelete, "/admin/feature-flags/"+flagKey, nil)
	delAgainW := httptest.NewRecorder()
	deleteRouter.ServeHTTP(delAgainW, delAgain)
	assert.Equal(t, http.StatusNotFound, delAgainW.Code, "second delete should 404")

	// Context is consumed after cancel — declare fresh one
	_ = context.Background()
}
