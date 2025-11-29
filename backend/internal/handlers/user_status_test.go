package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestGetUsersStatus(t *testing.T) {
	hub := &mockHub{
		onlineUsers: map[int]bool{
			1: true,
			2: true,
			3: false,
		},
	}

	handler := NewUserStatusHandler(hub)

	router := gin.Default()
	router.GET("/users/status", handler.GetUsersStatus)

	req := httptest.NewRequest("GET", "/users/status?user_ids=1,2,3", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	statuses := response["statuses"].(map[string]interface{})
	assert.True(t, statuses["1"].(bool))
	assert.True(t, statuses["2"].(bool))
	assert.False(t, statuses["3"].(bool))
}

func TestGetUsersStatus_NoUserIDs(t *testing.T) {
	hub := &mockHub{}
	handler := NewUserStatusHandler(hub)

	router := gin.Default()
	router.GET("/users/status", handler.GetUsersStatus)

	req := httptest.NewRequest("GET", "/users/status", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	assert.Contains(t, response["error"], "user_ids parameter is required")
}

func TestGetUsersStatus_InvalidFormat(t *testing.T) {
	hub := &mockHub{}
	handler := NewUserStatusHandler(hub)

	router := gin.Default()
	router.GET("/users/status", handler.GetUsersStatus)

	req := httptest.NewRequest("GET", "/users/status?user_ids=1,abc,3", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	assert.Contains(t, response["error"], "Invalid user ID format")
}

func TestGetUsersStatus_TooManyUsers(t *testing.T) {
	hub := &mockHub{}
	handler := NewUserStatusHandler(hub)

	router := gin.Default()
	router.GET("/users/status", handler.GetUsersStatus)

	// Generate 101 user IDs
	var userIDs string
	for i := 1; i <= 101; i++ {
		if i > 1 {
			userIDs += ","
		}
		userIDs += fmt.Sprintf("%d", i)
	}

	req := httptest.NewRequest("GET", fmt.Sprintf("/users/status?user_ids=%s", userIDs), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	assert.Contains(t, response["error"], "Maximum 100 user IDs allowed")
}

func TestGetUsersStatus_AllOffline(t *testing.T) {
	hub := &mockHub{
		onlineUsers: map[int]bool{},
	}

	handler := NewUserStatusHandler(hub)

	router := gin.Default()
	router.GET("/users/status", handler.GetUsersStatus)

	req := httptest.NewRequest("GET", "/users/status?user_ids=1,2,3", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	statuses := response["statuses"].(map[string]interface{})
	assert.False(t, statuses["1"].(bool))
	assert.False(t, statuses["2"].(bool))
	assert.False(t, statuses["3"].(bool))
}
