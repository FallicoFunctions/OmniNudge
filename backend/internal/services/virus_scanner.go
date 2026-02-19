package services

import (
	"bufio"
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
	"time"
)

const (
	defaultClamChunkSize = 32 * 1024
)

type VirusScanResult struct {
	Infected  bool
	Signature string
	Raw       string
}

type VirusScanner interface {
	Ping(ctx context.Context) error
	ScanFile(ctx context.Context, filePath string) (VirusScanResult, error)
}

type ClamAVScanner struct {
	network string
	address string
	timeout time.Duration
}

func NewClamAVScanner(network, address string, timeout time.Duration) *ClamAVScanner {
	if network == "" {
		network = "tcp"
	}
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	return &ClamAVScanner{
		network: network,
		address: address,
		timeout: timeout,
	}
}

func (s *ClamAVScanner) Ping(ctx context.Context) error {
	conn, err := s.dial(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	if err := writeNullTerminated(conn, "zPING"); err != nil {
		return fmt.Errorf("clamav ping write failed: %w", err)
	}
	resp, err := readNullTerminated(conn)
	if err != nil {
		return fmt.Errorf("clamav ping read failed: %w", err)
	}
	if strings.TrimSpace(resp) != "PONG" {
		return fmt.Errorf("clamav ping unexpected response: %q", resp)
	}
	return nil
}

func (s *ClamAVScanner) ScanFile(ctx context.Context, filePath string) (VirusScanResult, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return VirusScanResult{}, fmt.Errorf("open file for scan: %w", err)
	}
	defer f.Close()

	conn, err := s.dial(ctx)
	if err != nil {
		return VirusScanResult{}, err
	}
	defer conn.Close()

	if err := writeNullTerminated(conn, "zINSTREAM"); err != nil {
		return VirusScanResult{}, fmt.Errorf("clamav instream command failed: %w", err)
	}

	chunk := make([]byte, defaultClamChunkSize)
	for {
		n, readErr := f.Read(chunk)
		if n > 0 {
			if err := writeChunk(conn, chunk[:n]); err != nil {
				return VirusScanResult{}, fmt.Errorf("clamav stream chunk failed: %w", err)
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return VirusScanResult{}, fmt.Errorf("read file for scan: %w", readErr)
		}
	}

	// End of stream marker.
	if err := writeChunk(conn, nil); err != nil {
		return VirusScanResult{}, fmt.Errorf("clamav stream terminator failed: %w", err)
	}

	resp, err := readNullTerminated(conn)
	if err != nil {
		return VirusScanResult{}, fmt.Errorf("clamav scan response failed: %w", err)
	}

	return parseClamResponse(resp), nil
}

func parseClamResponse(resp string) VirusScanResult {
	trimmed := strings.TrimSpace(resp)
	result := VirusScanResult{Raw: trimmed}

	if strings.Contains(trimmed, "FOUND") {
		result.Infected = true
		if idx := strings.Index(trimmed, ":"); idx >= 0 {
			sigPart := strings.TrimSpace(trimmed[idx+1:])
			sigPart = strings.TrimSuffix(sigPart, "FOUND")
			result.Signature = strings.TrimSpace(sigPart)
		}
	}

	return result
}

func (s *ClamAVScanner) dial(ctx context.Context) (net.Conn, error) {
	dialer := &net.Dialer{Timeout: s.timeout}
	conn, err := dialer.DialContext(ctx, s.network, s.address)
	if err != nil {
		return nil, fmt.Errorf("dial clamav (%s %s): %w", s.network, s.address, err)
	}
	_ = conn.SetDeadline(time.Now().Add(s.timeout))
	return conn, nil
}

func writeNullTerminated(w io.Writer, cmd string) error {
	_, err := w.Write(append([]byte(cmd), 0))
	return err
}

func writeChunk(w io.Writer, payload []byte) error {
	header := make([]byte, 4)
	binary.BigEndian.PutUint32(header, uint32(len(payload)))
	if _, err := w.Write(header); err != nil {
		return err
	}
	if len(payload) == 0 {
		return nil
	}
	_, err := w.Write(payload)
	return err
}

func readNullTerminated(r io.Reader) (string, error) {
	br := bufio.NewReader(r)
	resp, err := br.ReadString(0)
	if err != nil {
		return "", err
	}
	return strings.TrimSuffix(resp, string([]byte{0})), nil
}
