package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
)

// PersonaAdmissionContextKey holds the persona a validated admission
// credential is good for.
const PersonaAdmissionContextKey = "persona_admission_persona_id"

// RequirePersonaAdmission authenticates the agent runtime, and nothing else.
//
// It reads the Authorization header and never looks at cookies. That is not an
// oversight to be tidied up later: a browser sends its cookies automatically,
// so any path that consults them is a path a logged-in user's browser can be
// made to walk by a page they did not write. Admission has to be unreachable
// that way, because a user who can admit a persona can act as that character.
//
// Nor does it fall back to anonymous. AuthOptional deliberately serves a
// request whose credentials fail, because some routes are public writes; this
// one has no such reading. A caller that cannot prove it is the agent runtime
// is refused.
func RequirePersonaAdmission(admission *services.PersonaAdmissionAuth) gin.HandlerFunc {
	return func(c *gin.Context) {
		if admission == nil {
			// The service was started without an admission secret. Refusing is
			// the honest answer: pretending the route does not exist would be
			// a lie, and admitting without a credential is the thing this
			// middleware exists to prevent.
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
				"error":   "persona admission is not configured",
				"code":    "admission_unavailable",
				"message": "persona admission is not configured",
			})
			return
		}

		header := c.GetHeader("Authorization")
		parts := strings.Split(header, " ")
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") || parts[1] == "" {
			abortPersonaAdmission(c)
			return
		}

		claims, err := admission.Validate(parts[1])
		if err != nil {
			abortPersonaAdmission(c)
			return
		}

		c.Set(PersonaAdmissionContextKey, claims.PersonaID)
		c.Next()
	}
}

// abortPersonaAdmission answers every failure the same way. The caller is
// either the agent runtime or it is not, and telling an unauthenticated caller
// which part of its credential was wrong only helps it guess.
func abortPersonaAdmission(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
		"error":   "Unauthorized",
		"code":    "unauthorized",
		"message": "Unauthorized",
	})
}
