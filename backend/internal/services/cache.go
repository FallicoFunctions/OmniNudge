package services

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"
)

// Cache defines minimal cache operations
type Cache interface {
	Get(ctx context.Context, key string) (string, bool, error)
	Set(ctx context.Context, key string, value string, ttl time.Duration) error
}

// NoopCache is a no-op cache implementation
type NoopCache struct{}

func (NoopCache) Get(ctx context.Context, key string) (string, bool, error) { return "", false, nil }
func (NoopCache) Set(ctx context.Context, key string, value string, ttl time.Duration) error {
	return nil
}

// RedisCache is a lightweight Redis client using RESP for simple GET/SETEX
type RedisCache struct {
	addr     string
	password string
	timeout  time.Duration
}

// NewRedisCache creates a Redis-backed cache
func NewRedisCache(addr, password string, timeout time.Duration) *RedisCache {
	return &RedisCache{
		addr:     addr,
		password: password,
		timeout:  timeout,
	}
}

func (r *RedisCache) dial(ctx context.Context) (net.Conn, error) {
	dialer := &net.Dialer{Timeout: r.timeout}
	conn, err := dialer.DialContext(ctx, "tcp", r.addr)
	if err != nil {
		return nil, err
	}
	_ = conn.SetDeadline(time.Now().Add(r.timeout))

	if r.password != "" {
		if err := writeCommand(conn, "AUTH", r.password); err != nil {
			conn.Close()
			return nil, err
		}
		if _, _, err := readReply(conn); err != nil {
			conn.Close()
			return nil, err
		}
	}

	return conn, nil
}

// Get returns value and hit bool
func (r *RedisCache) Get(ctx context.Context, key string) (string, bool, error) {
	conn, err := r.dial(ctx)
	if err != nil {
		return "", false, err
	}
	defer conn.Close()

	if err := writeCommand(conn, "GET", key); err != nil {
		return "", false, err
	}

	resp, ok, err := readReply(conn)
	if err != nil {
		return "", false, err
	}
	return resp, ok, nil
}

// Set sets value with TTL using SETEX
func (r *RedisCache) Set(ctx context.Context, key string, value string, ttl time.Duration) error {
	conn, err := r.dial(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	seconds := strconv.FormatInt(int64(ttl.Seconds()), 10)
	if err := writeCommand(conn, "SETEX", key, seconds, value); err != nil {
		return err
	}
	_, _, err = readReply(conn)
	return err
}

func writeCommand(conn net.Conn, args ...string) error {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("*%d\r\n", len(args)))
	for _, arg := range args {
		b.WriteString(fmt.Sprintf("$%d\r\n%s\r\n", len(arg), arg))
	}
	_, err := conn.Write([]byte(b.String()))
	return err
}

// readReply handles simple string and bulk string
func readReply(conn net.Conn) (string, bool, error) {
	reader := bufio.NewReader(conn)
	line, err := reader.ReadString('\n')
	if err != nil {
		return "", false, err
	}
	if len(line) == 0 {
		return "", false, fmt.Errorf("empty redis reply")
	}
	switch line[0] {
	case '+': // simple string
		return strings.TrimSuffix(line[1:], "\r\n"), true, nil
	case '$': // bulk string
		sizeStr := strings.TrimSpace(line[1:])
		size, err := strconv.Atoi(sizeStr)
		if err != nil {
			return "", false, err
		}
		if size == -1 {
			return "", false, nil // nil bulk
		}
		buf := make([]byte, size+2) // include CRLF
		if _, err := ioReadFull(reader, buf); err != nil {
			return "", false, err
		}
		return string(buf[:size]), true, nil
	case '-':
		return "", false, fmt.Errorf("redis error: %s", strings.TrimSpace(line[1:]))
	default:
		return "", false, fmt.Errorf("unexpected redis reply: %s", line)
	}
}

func ioReadFull(r *bufio.Reader, buf []byte) (int, error) {
	total := 0
	for total < len(buf) {
		n, err := r.Read(buf[total:])
		total += n
		if err != nil {
			return total, err
		}
	}
	return total, nil
}
