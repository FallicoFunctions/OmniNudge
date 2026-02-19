package services

import (
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writeNoisyJPEG(path string, width, height int) error {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{
				R: uint8((x*37 + y*17) % 256),
				G: uint8((x*13 + y*29) % 256),
				B: uint8((x*53 + y*7) % 256),
				A: 255,
			})
		}
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return jpeg.Encode(f, img, &jpeg.Options{Quality: 95})
}

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
		hasFilter := false
		for i := 0; i < len(args)-1; i++ {
			if args[i] == "-vf" {
				hasFilter = true
				if args[i+1] != "scale=min(800\\,iw):-2" {
					t.Fatalf("unexpected ffmpeg scale filter: %s", args[i+1])
				}
				break
			}
		}
		if !hasFilter {
			t.Fatal("expected ffmpeg -vf filter argument")
		}
		out := args[len(args)-1]
		if !strings.HasSuffix(out, "_thumb.jpg") {
			t.Fatalf("unexpected output path: %s", out)
		}
		if err := writeNoisyJPEG(out, 600, 400); err != nil {
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

func TestGenerateVideoThumbnailSecure_OptimizesOutputSize(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	videoPath := filepath.Join(dir, "clip.mp4")
	if err := os.WriteFile(videoPath, []byte("video-bytes"), 0o644); err != nil {
		t.Fatalf("write video fixture: %v", err)
	}

	svc := NewThumbnailService()
	svc.commandRunner = func(ctx context.Context, name string, args ...string) ([]byte, error) {
		out := args[len(args)-1]
		if err := writeNoisyJPEG(out, 1400, 1000); err != nil {
			return nil, err
		}
		return []byte("ok"), nil
	}

	thumbPath, err := svc.GenerateVideoThumbnailSecure(videoPath, 5*time.Second)
	if err != nil {
		t.Fatalf("GenerateVideoThumbnailSecure returned error: %v", err)
	}
	info, err := os.Stat(thumbPath)
	if err != nil {
		t.Fatalf("stat thumb: %v", err)
	}
	if info.Size() > thumbnailMaxBytes {
		t.Fatalf("expected optimized thumbnail <= %d, got %d", thumbnailMaxBytes, info.Size())
	}
}
