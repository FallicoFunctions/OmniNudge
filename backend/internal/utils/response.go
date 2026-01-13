package utils

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// RespondError writes a standardized error response
func RespondError(c *gin.Context, statusCode int, message string, err error) {
	response := gin.H{"error": message}
	if err != nil {
		response["details"] = err.Error()
	}
	c.JSON(statusCode, response)
}

// RespondBadRequest writes a 400 Bad Request error
func RespondBadRequest(c *gin.Context, message string, err error) {
	RespondError(c, http.StatusBadRequest, message, err)
}

// RespondUnauthorized writes a 401 Unauthorized error
func RespondUnauthorized(c *gin.Context, message string) {
	RespondError(c, http.StatusUnauthorized, message, nil)
}

// RespondForbidden writes a 403 Forbidden error
func RespondForbidden(c *gin.Context, message string) {
	RespondError(c, http.StatusForbidden, message, nil)
}

// RespondNotFound writes a 404 Not Found error
func RespondNotFound(c *gin.Context, message string) {
	RespondError(c, http.StatusNotFound, message, nil)
}

// RespondInternalError writes a 500 Internal Server Error
func RespondInternalError(c *gin.Context, message string, err error) {
	RespondError(c, http.StatusInternalServerError, message, err)
}

// RespondSuccess writes a successful response with optional data
func RespondSuccess(c *gin.Context, data interface{}) {
	if data == nil {
		c.JSON(http.StatusOK, gin.H{"success": true})
		return
	}
	c.JSON(http.StatusOK, data)
}

// RespondCreated writes a 201 Created response
func RespondCreated(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, data)
}
