package services

import (
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
)

// StorageService defines the interface for file storage operations
type StorageService interface {
	Upload(ctx context.Context, file multipart.File, header *multipart.FileHeader) (*UploadedFile, error)
	Delete(ctx context.Context, path string) error
	GetURL(path string) string
}

// UploadedFile represents a successfully uploaded file
type UploadedFile struct {
	Filename    string
	StoragePath string
	URL         string
	FileSize    int64
	FileType    string
}

// LocalStorageService implements file storage using the local filesystem
type LocalStorageService struct {
	basePath  string
	baseURL   string
	uploadsDir string
}

// NewLocalStorageService creates a new local filesystem storage service
func NewLocalStorageService(basePath, baseURL string) *LocalStorageService {
	// Default to ./uploads if not specified
	if basePath == "" {
		basePath = "./uploads"
	}
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}

	uploadsDir := filepath.Join(basePath, "media")

	return &LocalStorageService{
		basePath:   basePath,
		baseURL:    baseURL,
		uploadsDir: uploadsDir,
	}
}

// Upload saves a file to the local filesystem
func (s *LocalStorageService) Upload(ctx context.Context, file multipart.File, header *multipart.FileHeader) (*UploadedFile, error) {
	// Generate unique filename
	ext := filepath.Ext(header.Filename)
	filename := fmt.Sprintf("%s%s", uuid.New().String(), ext)

	// Organize by year/month
	now := time.Now()
	dateDir := filepath.Join(fmt.Sprintf("%d", now.Year()), fmt.Sprintf("%02d", now.Month()))
	fullDir := filepath.Join(s.uploadsDir, dateDir)

	// Create directory if it doesn't exist
	if err := os.MkdirAll(fullDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create upload directory: %w", err)
	}

	// Create the file
	destPath := filepath.Join(fullDir, filename)
	dst, err := os.Create(destPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create file: %w", err)
	}
	defer dst.Close()

	// Copy the uploaded file data
	written, err := io.Copy(dst, file)
	if err != nil {
		return nil, fmt.Errorf("failed to write file: %w", err)
	}

	// Generate storage path (relative to basePath)
	storagePath := filepath.Join("media", dateDir, filename)

	// Generate URL (using forward slashes for URLs)
	urlPath := filepath.ToSlash(storagePath)
	url := fmt.Sprintf("%s/uploads/%s", s.baseURL, urlPath)

	return &UploadedFile{
		Filename:    filename,
		StoragePath: storagePath,
		URL:         url,
		FileSize:    written,
		FileType:    header.Header.Get("Content-Type"),
	}, nil
}

// Delete removes a file from the local filesystem
func (s *LocalStorageService) Delete(ctx context.Context, path string) error {
	fullPath := filepath.Join(s.basePath, path)
	return os.Remove(fullPath)
}

// GetURL returns the URL for accessing a file
func (s *LocalStorageService) GetURL(path string) string {
	urlPath := filepath.ToSlash(path)
	return fmt.Sprintf("%s/uploads/%s", s.baseURL, urlPath)
}
