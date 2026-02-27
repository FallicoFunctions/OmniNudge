package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
)

// RespondWithError maps a service error (or any error) to the correct HTTP
// status code and writes a JSON error body.
func RespondWithError(c *gin.Context, err error) {
	var svcErr *services.ServiceError
	if errors.As(err, &svcErr) {
		c.JSON(svcErr.Code, gin.H{"error": svcErr.Message})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
}

// RespondError writes a JSON error response with the given status code and message.
// This is the direct replacement for c.JSON(code, gin.H{"error": msg}).
func RespondError(c *gin.Context, code int, msg string) {
	c.JSON(code, gin.H{"error": msg})
}

// RespondOK writes a 200 JSON response.
func RespondOK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, data)
}

// RespondCreated writes a 201 JSON response.
func RespondCreated(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, data)
}

// RespondNoContent writes a 204 response with no body.
func RespondNoContent(c *gin.Context) {
	c.Status(http.StatusNoContent)
}
