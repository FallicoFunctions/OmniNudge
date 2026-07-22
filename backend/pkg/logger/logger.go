// Package logger provides a zerolog-based structured logger with PII scrubbing,
// context propagation, and slog bridge so all slog calls also go through zerolog.
package logger

import (
	"context"
	"io"
	"log/slog"
	"os"
	"regexp"
	"strings"
	"unicode"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// Initialize sets up the global zerolog logger and bridges it to slog.
// env should be "development", "staging", or "production".
func Initialize(env, version, service string) {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnixMs

	var writer io.Writer
	if env == "development" {
		writer = zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: "15:04:05"}
	} else {
		writer = os.Stdout
	}

	logger := zerolog.New(writer).
		With().
		Timestamp().
		Str("service", service).
		Str("version", version).
		Str("env", env).
		Logger()

	// Set as global zerolog logger.
	log.Logger = logger

	// Bridge zerolog into slog so existing slog calls also emit JSON.
	slog.SetDefault(slog.New(newZerologHandler(logger)))
}

// ---- PII / injection protection -----------------------------------------------

var (
	// Match email addresses for masking.
	emailRe = regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`)
	// Match common password field patterns in query strings / JSON.
	passwordRe = regexp.MustCompile(`(?i)(password|passwd|secret|token|auth)[=:]["']?[^\s&"',}]+`)
)

// SanitizeLogMessage removes or masks PII and prevents log injection:
//   - Replaces email addresses with [email-redacted]
//   - Replaces password/token field values with [redacted]
//   - Strips ASCII control characters and newlines to prevent log injection
func SanitizeLogMessage(msg string) string {
	// Strip control characters (tab allowed) to prevent log injection.
	msg = strings.Map(func(r rune) rune {
		if r == '\t' {
			return r
		}
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, msg)

	msg = emailRe.ReplaceAllString(msg, "[email-redacted]")
	msg = passwordRe.ReplaceAllStringFunc(msg, func(s string) string {
		eq := strings.IndexAny(s, "=:")
		if eq == -1 {
			return s
		}
		return s[:eq+1] + "[redacted]"
	})
	return msg
}

// ---- slog → zerolog bridge ----------------------------------------------------

type zerologHandler struct {
	l zerolog.Logger
}

func newZerologHandler(l zerolog.Logger) *zerologHandler {
	return &zerologHandler{l: l}
}

func (h *zerologHandler) Enabled(_ context.Context, level slog.Level) bool {
	var zlvl zerolog.Level
	switch {
	case level >= slog.LevelError:
		zlvl = zerolog.ErrorLevel
	case level >= slog.LevelWarn:
		zlvl = zerolog.WarnLevel
	default:
		zlvl = zerolog.InfoLevel
	}
	return h.l.GetLevel() <= zlvl
}

func (h *zerologHandler) Handle(_ context.Context, r slog.Record) error {
	var ev *zerolog.Event
	switch {
	case r.Level >= slog.LevelError:
		ev = h.l.Error()
	case r.Level >= slog.LevelWarn:
		ev = h.l.Warn()
	default:
		ev = h.l.Info()
	}
	r.Attrs(func(a slog.Attr) bool {
		switch a.Value.Kind() {
		case slog.KindString:
			ev = ev.Str(a.Key, a.Value.String())
		case slog.KindInt64:
			ev = ev.Int64(a.Key, a.Value.Int64())
		case slog.KindFloat64:
			ev = ev.Float64(a.Key, a.Value.Float64())
		case slog.KindBool:
			ev = ev.Bool(a.Key, a.Value.Bool())
		default:
			ev = ev.Any(a.Key, a.Value.Any())
		}
		return true
	})
	ev.Msg(r.Message)
	return nil
}

func (h *zerologHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	ctx := h.l.With()
	for _, a := range attrs {
		ctx = ctx.Str(a.Key, a.Value.String())
	}
	return newZerologHandler(ctx.Logger())
}

func (h *zerologHandler) WithGroup(name string) slog.Handler {
	return newZerologHandler(h.l.With().Str("group", name).Logger())
}
