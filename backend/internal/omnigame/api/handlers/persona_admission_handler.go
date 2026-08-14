package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/api/middleware"
	apiresponse "github.com/omninudge/backend/internal/api/response"
	"github.com/omninudge/backend/internal/omnigame/service"
)

type PersonaAdmissionHandler struct {
	admissions *service.AdmissionService
}

func NewPersonaAdmissionHandler(admissions *service.AdmissionService) *PersonaAdmissionHandler {
	return &PersonaAdmissionHandler{admissions: admissions}
}

// AdmitOmniRave issues a world token for the character the admission
// credential names.
//
// The persona comes from the credential, never from the request body. A body
// field would let one valid credential admit any character, which is exactly
// what naming the persona inside the signed token prevents.
func (h *PersonaAdmissionHandler) AdmitOmniRave(c *gin.Context) {
	value, ok := c.Get(middleware.PersonaAdmissionContextKey)
	if !ok {
		apiresponse.WriteError(c, http.StatusUnauthorized, "Unauthorized")
		return
	}
	personaID, ok := value.(int64)
	if !ok || personaID <= 0 {
		apiresponse.WriteError(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	admission, err := h.admissions.AdmitPersona(c.Request.Context(), personaID)
	if err != nil {
		if errors.Is(err, service.ErrPersonaNotAdmissible) {
			// One message for "no such character", "not a platform character",
			// "private" and "retired" alike. Distinguishing them would turn
			// this endpoint into a way to enumerate the persona table.
			apiresponse.WriteError(c, http.StatusForbidden, "Persona may not be admitted")
			return
		}
		apiresponse.WriteError(c, http.StatusInternalServerError, "Internal Server Error")
		return
	}

	c.JSON(http.StatusOK, admission)
}
