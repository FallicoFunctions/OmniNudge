package main

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestOmniChatPersonaRoutesShareOneWildcardName(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := func(c *gin.Context) { c.Status(http.StatusNoContent) }

	// Gin panics during registration when sibling routes use different names
	// for the same wildcard node. Building these paths from one constant makes
	// the startup invariant executable.
	router.GET(omniChatPersonaPath, handler)
	router.GET(omniChatPersonaPath+"/export", handler)
	router.GET(omniChatPersonaPath+"/voice", handler)
}
