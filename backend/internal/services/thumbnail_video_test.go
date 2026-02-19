package services

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestGenerateVideoThumbnailSecure_UsesFFmpeg(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	videoPath := filepath.Join(dir, "clip.mp4")
	if err := os.WriteFile(videoPath, []byte("video-bytes"), 0o644); err != nil {
		t.Fatalf("write video fixture: %v", err)
	}

	svc := NewThumbnailService()
	svc.commandRunner = func(ctx context.Context, name string, args ...string) ([]byte, error) {
		if name != "ffmpeg" {
			t.Fatalf("expected ffmpeg, got %s", name)
		}
		out := args[len(args)-1]
		if !strings.HasSuffix(out, "_thumb.jpg") {
			t.Fatalf("unexpected output path: %s", out)
		}
		if err := os.WriteFile(out, []byte("jpeg-data"), 0o644); err != nil {
			return nil, err
		}
		return []byte("ok"), nil
	}

	thumbPath, err := svc.GenerateVideoThumbnailSecure(videoPath, 5*time.Second)
	if err != nil {
		t.Fatalf("GenerateVideoThumbnailSecure returned error: %v", err)
	}
	if filepath.Ext(thumbPath) != ".jpg" {
		t.Fatalf("expected jpg thumbnail, got %s", thumbPath)
	}
}

func TestGenerateVideoThumbnailSecure_RejectsUnsupportedExtension(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	fakePath := filepath.Join(dir, "clip.bin")
	if err := os.WriteFile(fakePath, []byte("bytes"), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	svc := NewThumbnailService()
	if _, err := svc.GenerateVideoThumbnailSecure(fakePath, 5*time.Second); err == nil {
		t.Fatal("expected unsupported extension rejection")
	}
}
