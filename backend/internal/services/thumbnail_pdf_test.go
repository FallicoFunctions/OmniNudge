package services

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestGeneratePDFThumbnailSecure_UsesPreferredRenderer(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	pdfPath := filepath.Join(dir, "sample.pdf")
	if err := os.WriteFile(pdfPath, []byte("%PDF-1.4"), 0o644); err != nil {
		t.Fatalf("write pdf fixture: %v", err)
	}

	svc := NewThumbnailService()
	svc.commandRunner = func(ctx context.Context, name string, args ...string) ([]byte, error) {
		if name != "pdftoppm" {
			t.Fatalf("expected pdftoppm first, got %s", name)
		}
		outputPrefix := args[len(args)-1]
		if err := os.WriteFile(outputPrefix+".jpg", []byte("jpeg-data"), 0o644); err != nil {
			return nil, err
		}
		return []byte("ok"), nil
	}

	thumbPath, err := svc.GeneratePDFThumbnailSecure(pdfPath, 5*time.Second)
	if err != nil {
		t.Fatalf("GeneratePDFThumbnailSecure returned error: %v", err)
	}
	if filepath.Ext(thumbPath) != ".jpg" {
		t.Fatalf("expected jpg thumbnail, got %s", thumbPath)
	}
}

func TestGeneratePDFThumbnailSecure_FallsBackToMutool(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	pdfPath := filepath.Join(dir, "sample.pdf")
	if err := os.WriteFile(pdfPath, []byte("%PDF-1.4"), 0o644); err != nil {
		t.Fatalf("write pdf fixture: %v", err)
	}

	svc := NewThumbnailService()
	callCount := 0
	svc.commandRunner = func(ctx context.Context, name string, args ...string) ([]byte, error) {
		callCount++
		if callCount == 1 {
			return nil, errors.New("pdftoppm unavailable")
		}
		if name != "mutool" {
			t.Fatalf("expected mutool fallback, got %s", name)
		}
		outIndex := -1
		for i, arg := range args {
			if arg == "-o" && i+1 < len(args) {
				outIndex = i + 1
				break
			}
		}
		if outIndex < 0 {
			t.Fatalf("mutool args missing -o output")
		}
		if err := os.WriteFile(args[outIndex], []byte("jpeg-data"), 0o644); err != nil {
			return nil, err
		}
		return []byte("ok"), nil
	}

	thumbPath, err := svc.GeneratePDFThumbnailSecure(pdfPath, 5*time.Second)
	if err != nil {
		t.Fatalf("GeneratePDFThumbnailSecure returned error: %v", err)
	}
	if filepath.Ext(thumbPath) != ".jpg" {
		t.Fatalf("expected jpg thumbnail, got %s", thumbPath)
	}
}

func TestGeneratePDFThumbnailSecure_RejectsNonPDF(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	txtPath := filepath.Join(dir, "sample.txt")
	if err := os.WriteFile(txtPath, []byte("hello"), 0o644); err != nil {
		t.Fatalf("write text fixture: %v", err)
	}

	svc := NewThumbnailService()
	if _, err := svc.GeneratePDFThumbnailSecure(txtPath, 5*time.Second); err == nil {
		t.Fatal("expected non-pdf rejection")
	}
}
