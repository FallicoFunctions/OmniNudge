package middleware

import (
	"archive/zip"
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSecurityHeaders_ProductionCSPDisallowsUnsafeScriptExecution(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(SecurityHeaders())
	router.GET("/", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	router.ServeHTTP(w, req)

	csp := w.Header().Get("Content-Security-Policy")
	var scriptDirective string
	for _, directive := range strings.Split(csp, ";") {
		directive = strings.TrimSpace(directive)
		if strings.HasPrefix(directive, "script-src ") {
			scriptDirective = directive
			break
		}
	}
	if scriptDirective != "script-src 'self'" {
		t.Fatalf("production scripts must be restricted to same-origin bundles, got %q", scriptDirective)
	}
	if got := w.Header().Get("X-XSS-Protection"); got != "0" {
		t.Fatalf("deprecated browser XSS auditor must be disabled, got %q", got)
	}
}

func TestSecurityHeaders_DevelopmentCSPAllowsUnsafeEvalForTooling(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(SecurityHeaders())
	router.GET("/", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	router.ServeHTTP(w, req)

	csp := w.Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "'unsafe-eval'") {
		t.Fatalf("development CSP should allow unsafe-eval for tooling, got %q", csp)
	}
}

func TestSecurityHeaders_AllowsOnlyTrustedLiveAvatarFrames(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(SecurityHeaders())
	router.GET("/", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/", nil))
	csp := w.Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "frame-src 'self' https://daily.co https://*.daily.co") {
		t.Fatalf("CSP must allow private Daily live-avatar rooms, got %q", csp)
	}
	permissions := w.Header().Get("Permissions-Policy")
	if !strings.Contains(permissions, `camera=(self "https://daily.co" "https://*.daily.co")`) {
		t.Fatalf("Permissions-Policy must allow Daily rooms to use the camera, got %q", permissions)
	}
	if !strings.Contains(permissions, `microphone=(self "https://daily.co" "https://*.daily.co")`) {
		t.Fatalf("Permissions-Policy must allow Daily rooms to use the microphone, got %q", permissions)
	}
}

func TestFileValidation_AllowsNewDocumentAndArchiveTypes(t *testing.T) {
	t.Parallel()

	cases := []struct {
		filename string
		mimeType string
	}{
		{filename: "document.pdf", mimeType: "application/pdf"},
		{filename: "document.doc", mimeType: "application/msword"},
		{filename: "document.docx", mimeType: "application/zip"},
		{
			filename: "document.docx",
			mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		},
		{filename: "notes.txt", mimeType: "text/plain"},
		{filename: "notes.txt", mimeType: "text/plain; charset=utf-8"},
		{filename: "archive.zip", mimeType: "application/zip"},
		{filename: "archive.zip", mimeType: "application/x-zip-compressed"},
		{filename: "audio.mp3", mimeType: "audio/mpeg"},
		{filename: "audio.wav", mimeType: "audio/wav"},
		{filename: "audio.ogg", mimeType: "audio/ogg"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.filename+"_"+tc.mimeType, func(t *testing.T) {
			t.Parallel()
			if !ValidateFileExtension(tc.filename) {
				t.Fatalf("expected extension for %q to be allowed", tc.filename)
			}
			if !ValidateMIMEType(tc.mimeType, AllowedMediaTypes) {
				t.Fatalf("expected mime %q to be allowed", tc.mimeType)
			}
			if !ValidateExtensionMatchesMIME(tc.filename, tc.mimeType) {
				t.Fatalf("expected extension/mime combination (%q, %q) to be valid", tc.filename, tc.mimeType)
			}
		})
	}
}

func TestGetMaxSizeForMIME_NewDocumentAndArchiveTypesUse25MBLimit(t *testing.T) {
	t.Parallel()

	const twentyFiveMB = int64(25 * 1024 * 1024)
	for _, mimeType := range []string{
		"application/pdf",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"text/plain",
		"application/zip",
		"application/x-zip-compressed",
	} {
		mimeType := mimeType
		t.Run(mimeType, func(t *testing.T) {
			t.Parallel()
			if got := GetMaxSizeForMIME(mimeType); got != twentyFiveMB {
				t.Fatalf("expected %s max size to be %d, got %d", mimeType, twentyFiveMB, got)
			}
		})
	}
}

func TestNormalizeDetectedMIME_ExtensionAwareMappings(t *testing.T) {
	t.Parallel()

	cases := []struct {
		filename string
		detected string
		want     string
	}{
		{filename: "legacy.doc", detected: "application/octet-stream", want: "application/msword"},
		{
			filename: "modern.docx",
			detected: "application/zip",
			want:     "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		},
		{filename: "archive.zip", detected: "application/octet-stream", want: "application/zip"},
		{filename: "notes.txt", detected: "text/plain; charset=utf-8", want: "text/plain"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.filename, func(t *testing.T) {
			t.Parallel()
			if got := NormalizeDetectedMIME(tc.filename, tc.detected); got != tc.want {
				t.Fatalf("NormalizeDetectedMIME(%q, %q) = %q, want %q", tc.filename, tc.detected, got, tc.want)
			}
		})
	}
}

func TestValidateStrictDocumentStructure(t *testing.T) {
	t.Parallel()

	t.Run("valid doc signature", func(t *testing.T) {
		t.Parallel()
		head := []byte{0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1}
		err := ValidateStrictDocumentStructure("", "test.doc", "application/msword", head)
		if err != nil {
			t.Fatalf("expected valid doc signature, got error: %v", err)
		}
	})

	t.Run("invalid doc signature", func(t *testing.T) {
		t.Parallel()
		err := ValidateStrictDocumentStructure("", "test.doc", "application/msword", []byte("not-doc"))
		if err == nil {
			t.Fatal("expected invalid doc signature error")
		}
	})

	t.Run("valid docx structure", func(t *testing.T) {
		t.Parallel()
		path, head := writeDocxFixture(t, true)
		err := ValidateStrictDocumentStructure(path, "test.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", head)
		if err != nil {
			t.Fatalf("expected valid docx structure, got error: %v", err)
		}
	})

	t.Run("invalid docx structure", func(t *testing.T) {
		t.Parallel()
		path, head := writeDocxFixture(t, false)
		err := ValidateStrictDocumentStructure(path, "test.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", head)
		if err == nil {
			t.Fatal("expected invalid docx structure error")
		}
	})
}

func writeDocxFixture(t *testing.T, includeWordDoc bool) (string, []byte) {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "fixture.docx")
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create fixture: %v", err)
	}

	zw := zip.NewWriter(f)
	writeZipFile := func(name, body string) {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatalf("create zip entry %s: %v", name, err)
		}
		if _, err := w.Write([]byte(body)); err != nil {
			t.Fatalf("write zip entry %s: %v", name, err)
		}
	}

	writeZipFile("[Content_Types].xml", "<Types></Types>")
	writeZipFile("_rels/.rels", "<Relationships></Relationships>")
	if includeWordDoc {
		writeZipFile("word/document.xml", "<w:document></w:document>")
	}

	if err := zw.Close(); err != nil {
		t.Fatalf("close zip writer: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close fixture: %v", err)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	if len(raw) == 0 {
		t.Fatal("empty fixture")
	}
	head := raw
	if len(head) > 512 {
		head = head[:512]
	}
	return path, bytes.Clone(head)
}
