# syntax=docker/dockerfile:1

# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

# Install build dependencies (gcc for CGO, git for module stamping)
RUN apk add --no-cache gcc musl-dev git ca-certificates tzdata

WORKDIR /build

# Cache module downloads separately from source so they survive source changes
COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY . .

# Build the server and worker binaries with version stamping
ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w -X main.appVersion=${VERSION}" \
    -o /out/server ./cmd/server/... && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" \
    -o /out/worker ./cmd/worker/... && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" \
    -o /out/migrate ./cmd/migrate/...

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM scratch AS runtime

# Pull in certs and timezone data from the builder stage
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

COPY --from=builder /out/server  /server
COPY --from=builder /out/worker  /worker
COPY --from=builder /out/migrate /migrate

# Uploads directory — override with a volume mount in production
VOLUME ["/uploads"]

EXPOSE 8080

ENV SERVER_PORT=8080 \
    APP_ENV=production \
    TZ=UTC

ENTRYPOINT ["/server"]
