package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/tracing"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// Tracing extracts incoming W3C TraceContext headers, starts a server span for
// each request, and stores the trace/span IDs in the Gin context so that the
// structured logger can include them in every log line.
func Tracing(serviceName string) gin.HandlerFunc {
	t := tracing.Tracer(serviceName)
	return func(c *gin.Context) {
		// Extract parent trace context from incoming headers (W3C traceparent / tracestate).
		ctx := otel.GetTextMapPropagator().Extract(
			c.Request.Context(),
			propagation.HeaderCarrier(c.Request.Header),
		)

		// Build span name: "METHOD /route/pattern".
		// c.FullPath() returns the registered Gin pattern (e.g. "/posts/:id"), which
		// gives us stable, low-cardinality span names. Fall back to the raw URL path
		// only if the request didn't match any registered route (e.g. 404 paths).
		fullPath := c.FullPath()
		if fullPath == "" {
			fullPath = c.Request.URL.Path
		}
		spanName := c.Request.Method + " " + fullPath

		ctx, span := t.Start(ctx, spanName)
		defer func() {
			status := c.Writer.Status()
			span.SetAttributes(
				semconv.HTTPRequestMethodKey.String(c.Request.Method),
				attribute.String("http.route", c.FullPath()),
				attribute.Int("http.status_code", status),
				attribute.String("http.client_ip", c.ClientIP()),
			)
			if status >= http.StatusInternalServerError {
				span.SetStatus(codes.Error, http.StatusText(status))
			} else {
				span.SetStatus(codes.Ok, "")
			}
			span.End()
		}()

		// Store IDs for the structured logger before calling Next so they are
		// available to downstream middleware and handlers.
		sc := span.SpanContext()
		if sc.HasTraceID() {
			c.Set("trace_id", sc.TraceID().String())
		}
		if sc.HasSpanID() {
			c.Set("span_id", sc.SpanID().String())
		}

		// Propagate the updated context to the handler.
		c.Request = c.Request.WithContext(ctx)

		c.Next()
	}
}
