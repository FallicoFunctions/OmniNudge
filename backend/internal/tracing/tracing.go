package tracing

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"strconv"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"go.opentelemetry.io/otel/trace"
)

// Setup initializes the global OpenTelemetry tracer provider.
//
// If OTEL_EXPORTER_OTLP_ENDPOINT is set, spans are exported via OTLP gRPC.
// The sampling rate is read from OTEL_TRACE_SAMPLE_RATE (a float in [0.0, 1.0]);
// it defaults to 0.05 (5%) when exporting to prevent overwhelming the collector
// at high traffic volumes.
//
// If OTEL_EXPORTER_OTLP_ENDPOINT is not set, a no-op stdout exporter that discards
// all output is used so there is zero overhead in development environments.
//
// The returned shutdown function must be called before the process exits to flush
// any pending spans.
func Setup(ctx context.Context, serviceName, version string) (shutdown func(context.Context) error, err error) {
	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(serviceName),
			semconv.ServiceVersion(version),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create OTel resource: %w", err)
	}

	var exporter sdktrace.SpanExporter
	var sampler sdktrace.Sampler

	if endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"); endpoint != "" {
		log.Printf("OpenTelemetry: exporting traces to %s", endpoint)
		exporter, err = otlptracegrpc.New(ctx,
			otlptracegrpc.WithEndpoint(endpoint),
			otlptracegrpc.WithInsecure(),
		)
		if err != nil {
			return nil, fmt.Errorf("failed to create OTLP gRPC exporter: %w", err)
		}

		// Sampling rate: default 5% in production to avoid overwhelming the collector.
		// Set OTEL_TRACE_SAMPLE_RATE=1.0 to capture 100% of traces (e.g. staging).
		sampleRate := 0.05
		if rateStr := os.Getenv("OTEL_TRACE_SAMPLE_RATE"); rateStr != "" {
			if parsed, parseErr := strconv.ParseFloat(rateStr, 64); parseErr == nil && parsed >= 0 && parsed <= 1 {
				sampleRate = parsed
			} else {
				log.Printf("OpenTelemetry: invalid OTEL_TRACE_SAMPLE_RATE %q, using default %.2f", rateStr, sampleRate)
			}
		}
		log.Printf("OpenTelemetry: sampling rate %.1f%%", sampleRate*100)
		sampler = sdktrace.TraceIDRatioBased(sampleRate)
	} else {
		// Discard all spans in dev — zero overhead.
		exporter, err = stdouttrace.New(
			stdouttrace.WithWriter(io.Discard),
		)
		if err != nil {
			return nil, fmt.Errorf("failed to create no-op stdout exporter: %w", err)
		}
		sampler = sdktrace.NeverSample()
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sampler),
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return tp.Shutdown, nil
}

// Tracer returns a named tracer from the global provider.
func Tracer(name string) trace.Tracer {
	return otel.Tracer(name)
}
