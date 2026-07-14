package handlers

import (
	"path"
	"strings"
)

const maxOmniChatPersonaGalleryURLs = 50

var personaImageExtensions = map[string]struct{}{
	".gif":  {},
	".jpeg": {},
	".jpg":  {},
	".png":  {},
	".webp": {},
}

var personaVideoExtensions = map[string]struct{}{
	".m4v":  {},
	".mov":  {},
	".mp4":  {},
	".webm": {},
}

func normalizePersonaImageURL(raw *string) (*string, bool) {
	return normalizePersonaUploadURL(raw, personaImageExtensions)
}

func normalizePersonaVideoURL(raw *string) (*string, bool) {
	return normalizePersonaUploadURL(raw, personaVideoExtensions)
}

func normalizePersonaUploadURL(raw *string, allowedExtensions map[string]struct{}) (*string, bool) {
	if raw == nil {
		return nil, true
	}

	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return nil, true
	}
	if !strings.HasPrefix(trimmed, "/uploads/") {
		return nil, false
	}
	if strings.ContainsAny(trimmed, "\\\x00\r\n\t") {
		return nil, false
	}
	if path.Clean(trimmed) != trimmed {
		return nil, false
	}
	extension := strings.ToLower(path.Ext(trimmed))
	if extension == "" {
		return nil, false
	}
	if _, ok := allowedExtensions[extension]; !ok {
		return nil, false
	}

	return &trimmed, true
}
