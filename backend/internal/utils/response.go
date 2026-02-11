package utils

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// errorTranslations maps message keys to localized strings
var errorTranslations = map[string]map[string]string{
	"es": {
		"User not authenticated":                       "Usuario no autenticado",
		"Invalid request body":                         "Cuerpo de solicitud no válido",
		"Unauthorized":                                 "No autorizado",
		"Forbidden":                                    "Prohibido",
		"Not Found":                                    "No encontrado",
		"Internal Server Error":                        "Error interno del servidor",
		"flag key must be 3-50 characters":             "la clave de la bandera debe tener entre 3 y 50 caracteres",
		"flag key must be lowercase with underscores":  "la clave de la bandera debe estar en minúsculas con guiones bajos",
		"username must be between 3 and 50 characters": "el nombre de usuario debe tener entre 3 y 50 caracteres",
		"password must be at least 8 characters":       "la contraseña debe tener al menos 8 caracteres",
		"invalid email format":                         "formato de correo electrónico no válido",
		"username already taken":                       "el nombre de usuario ya está en uso",
		"invalid username or password":                 "nombre de usuario o contraseña no válidos",
	},
	"ar": {
		"User not authenticated":                       "المستخدم غير مصرح له",
		"Invalid request body":                         "محتوى الطلب غير صالح",
		"Unauthorized":                                 "غير مصرح",
		"Forbidden":                                    "ممنوع",
		"Not Found":                                    "غير موجود",
		"Internal Server Error":                        "خطأ داخلي في الخادم",
		"flag key must be 3-50 characters":             "يجب أن يكون مفتاح العلامة بين 3 و 50 حرفًا",
		"flag key must be lowercase with underscores":  "يجب أن يكون مفتاح العلامة بأحرف صغيرة مع شرطات سفلية",
		"username must be between 3 and 50 characters": "يجب أن يكون اسم المستخدم بين 3 و 50 حرفًا",
		"password must be at least 8 characters":       "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل",
		"invalid email format":                         "تنسيق البريد الإلكتروني غير صالح",
		"username already taken":                       "اسم المستخدم مأخوذ بالفعل",
		"invalid username or password":                 "اسم المستخدم أو كلمة المرور غير صالحة",
	},
}

// RespondError writes a standardized error response
func RespondError(c *gin.Context, statusCode int, message string, err error) {
	lang, exists := c.Get("language")
	if exists {
		l := lang.(string)
		if translations, ok := errorTranslations[l]; ok {
			if translated, ok := translations[message]; ok {
				message = translated
			}
		}
	}

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
