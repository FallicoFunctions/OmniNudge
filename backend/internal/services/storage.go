package services

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// StorageService defines the interface for file storage
type StorageService interface {
	Upload(ctx context.Context, key string, body io.Reader) (string, error)
	Download(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	GetSignedURL(ctx context.Context, key string, expires time.Duration) (string, error)
	List(ctx context.Context, prefix string) ([]string, error)
}

// LocalStorageService implements StorageService using local filesystem
type LocalStorageService struct {
	baseDir string
	baseURL string
}

func NewLocalStorageService(baseDir string, baseURL string) (*LocalStorageService, error) {
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create base directory: %w", err)
	}
	return &LocalStorageService{
		baseDir: baseDir,
		baseURL: baseURL,
	}, nil
}

func (s *LocalStorageService) Upload(ctx context.Context, key string, body io.Reader) (string, error) {
	path := filepath.Join(s.baseDir, key)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return "", err
	}

	f, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	if _, err := io.Copy(f, body); err != nil {
		return "", err
	}

	return fmt.Sprintf("%s/%s", s.baseURL, key), nil
}

func (s *LocalStorageService) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	return os.Open(filepath.Join(s.baseDir, key))
}

func (s *LocalStorageService) Delete(ctx context.Context, key string) error {
	return os.Remove(filepath.Join(s.baseDir, key))
}

func (s *LocalStorageService) GetSignedURL(ctx context.Context, key string, expires time.Duration) (string, error) {
	// For local storage, we just return the URL (could implement a temporary symlink strategy if needed)
	return fmt.Sprintf("%s/%s?expires=%d", s.baseURL, key, time.Now().Add(expires).Unix()), nil
}

func (s *LocalStorageService) List(ctx context.Context, prefix string) ([]string, error) {
	var keys []string
	searchDir := filepath.Join(s.baseDir, prefix)

	err := filepath.Walk(searchDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			rel, err := filepath.Rel(s.baseDir, path)
			if err == nil {
				keys = append(keys, rel)
			}
		}
		return nil
	})

	return keys, err
}

// S3StorageService (Placeholder for future AWS integration)
type S3StorageService struct {
	bucket string
	region string
}

func NewS3StorageService(bucket, region string) *S3StorageService {
	return &S3StorageService{bucket: bucket, region: region}
}

func (s *S3StorageService) Upload(ctx context.Context, key string, body io.Reader) (string, error) {
	return "", fmt.Errorf("S3 upload not implemented")
}

func (s *S3StorageService) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	return nil, fmt.Errorf("S3 download not implemented")
}

func (s *S3StorageService) Delete(ctx context.Context, key string) error {
	return fmt.Errorf("S3 delete not implemented")
}

func (s *S3StorageService) GetSignedURL(ctx context.Context, key string, expires time.Duration) (string, error) {
	return "", fmt.Errorf("S3 signed URL not implemented")
}

func (s *S3StorageService) List(ctx context.Context, prefix string) ([]string, error) {
	return nil, fmt.Errorf("S3 list not implemented")
}
