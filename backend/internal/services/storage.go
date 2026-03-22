package services

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	awscredentials "github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/omninudge/backend/internal/config"
)

// StorageService defines the interface for file storage
type StorageService interface {
	Upload(ctx context.Context, key string, body io.Reader, contentType string) (string, error)
	Download(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	GetSignedURL(ctx context.Context, key string, expires time.Duration) (string, error)
	List(ctx context.Context, prefix string) ([]string, error)
	GeneratePresignedPutURL(ctx context.Context, key, contentType string, expiresIn time.Duration) (string, error)
	PublicURL(key string) string
	// GetObjectSize returns the size in bytes of the object at key.
	// BUG-6: Used by ConfirmUpload to get the actual S3 object size instead of trusting client-supplied values.
	GetObjectSize(ctx context.Context, key string) (int64, error)
}

// LocalStorageService implements StorageService using local filesystem
type LocalStorageService struct {
	baseDir string
	baseURL string
}

func NewLocalStorageService(baseDir string, baseURL string) (*LocalStorageService, error) {
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("local storage: create base directory: %w", err)
	}
	return &LocalStorageService{
		baseDir: baseDir,
		baseURL: baseURL,
	}, nil
}

func (s *LocalStorageService) Upload(ctx context.Context, key string, body io.Reader, contentType string) (string, error) {
	path := filepath.Join(s.baseDir, key)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return "", fmt.Errorf("local storage: mkdir for %q: %w", key, err)
	}

	f, err := os.Create(path)
	if err != nil {
		return "", fmt.Errorf("local storage: create %q: %w", key, err)
	}
	defer f.Close()

	if _, err := io.Copy(f, body); err != nil {
		return "", fmt.Errorf("local storage: write %q: %w", key, err)
	}

	return fmt.Sprintf("%s/%s", s.baseURL, key), nil
}

func (s *LocalStorageService) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	f, err := os.Open(filepath.Join(s.baseDir, key))
	if err != nil {
		return nil, fmt.Errorf("local storage: open %q: %w", key, err)
	}
	return f, nil
}

func (s *LocalStorageService) Delete(ctx context.Context, key string) error {
	if err := os.Remove(filepath.Join(s.baseDir, key)); err != nil {
		return fmt.Errorf("local storage: delete %q: %w", key, err)
	}
	return nil
}

// GetSignedURL returns a URL with an expiry timestamp appended as a query param.
// WARNING: local storage does not enforce expiry — the timestamp is cosmetic only.
// This method exists so local-dev code paths satisfy the StorageService interface;
// it must never be relied upon for access control in any environment.
// Use S3StorageService for real pre-signed URL enforcement.
func (s *LocalStorageService) GetSignedURL(ctx context.Context, key string, expires time.Duration) (string, error) {
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

func (s *LocalStorageService) GeneratePresignedPutURL(ctx context.Context, key, contentType string, expiresIn time.Duration) (string, error) {
	return "", fmt.Errorf("local storage does not support presigned URLs")
}

func (s *LocalStorageService) PublicURL(key string) string {
	return fmt.Sprintf("%s/%s", s.baseURL, key)
}

// GetObjectSize returns the size of the file at key on the local filesystem.
func (s *LocalStorageService) GetObjectSize(ctx context.Context, key string) (int64, error) {
	info, err := os.Stat(filepath.Join(s.baseDir, key))
	if err != nil {
		return 0, fmt.Errorf("local storage: stat %q: %w", key, err)
	}
	return info.Size(), nil
}

// S3StorageService implements StorageService using AWS S3 (or any S3-compatible provider).
type S3StorageService struct {
	client        *s3.Client
	presignClient *s3.PresignClient
	bucket        string
	region        string
	cloudfrontURL string
	// cb protects outbound S3 calls; opens after 3 consecutive failures,
	// half-opens after 30 seconds to probe service recovery.
	cb *CircuitBreaker
}

// NewS3StorageService constructs an S3StorageService from application config.
// If AccessKey/SecretKey are set they are used as static credentials; otherwise
// the default credential chain (IAM role, env vars, ~/.aws/credentials) is used.
// If cfg.Storage.S3Endpoint is non-empty it overrides the AWS endpoint (e.g. for MinIO).
func NewS3StorageService(cfg *config.Config) (*S3StorageService, error) {
	if cfg.Storage.S3Bucket == "" {
		return nil, fmt.Errorf("s3: S3_BUCKET must be configured")
	}
	if cfg.Storage.S3Region == "" {
		return nil, fmt.Errorf("s3: S3_REGION must be configured")
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(cfg.Storage.S3Region),
	)
	if err != nil {
		return nil, fmt.Errorf("s3: load aws config: %w", err)
	}

	// Override credentials if explicit keys are provided.
	if cfg.Storage.S3AccessKey != "" && cfg.Storage.S3SecretKey != "" {
		awsCfg.Credentials = awscredentials.NewStaticCredentialsProvider(
			cfg.Storage.S3AccessKey,
			cfg.Storage.S3SecretKey,
			"",
		)
	}

	opts := []func(*s3.Options){}
	// Support custom S3-compatible endpoints (MinIO, Ceph, Cloudflare R2, …).
	if cfg.Storage.S3Endpoint != "" {
		endpointURL := cfg.Storage.S3Endpoint
		usePathStyle := cfg.Storage.S3PathStyle
		opts = append(opts, func(o *s3.Options) {
			o.BaseEndpoint = &endpointURL
			// Path-style addressing is required for most custom S3 providers (MinIO/Ceph).
			// Set S3_PATH_STYLE=false for providers like Cloudflare R2 that use virtual-hosted style.
			o.UsePathStyle = usePathStyle
		})
	}

	client := s3.NewFromConfig(awsCfg, opts...)
	presignClient := s3.NewPresignClient(client)

	return &S3StorageService{
		client:        client,
		presignClient: presignClient,
		bucket:        cfg.Storage.S3Bucket,
		region:        cfg.Storage.S3Region,
		cloudfrontURL: strings.TrimRight(cfg.Storage.CloudFrontURL, "/"),
		cb:            NewCircuitBreaker("s3", 3, 30*time.Second),
	}, nil
}

// PublicURL returns the CDN URL when CloudFront is configured, otherwise falls
// back to the canonical S3 virtual-hosted URL.
func (s *S3StorageService) PublicURL(key string) string {
	if s.cloudfrontURL != "" {
		return s.cloudfrontURL + "/" + key
	}
	return "https://" + s.bucket + ".s3." + s.region + ".amazonaws.com/" + key
}

func (s *S3StorageService) Upload(ctx context.Context, key string, body io.Reader, contentType string) (string, error) {
	var publicURL string
	err := s.cb.Do(func() error {
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
			Bucket:      &s.bucket,
			Key:         &key,
			Body:        body,
			ContentType: &contentType,
		})
		if err != nil {
			return fmt.Errorf("s3: upload %q: %w", key, err)
		}
		publicURL = s.PublicURL(key)
		return nil
	})
	return publicURL, err
}

func (s *S3StorageService) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	var rc io.ReadCloser
	err := s.cb.Do(func() error {
		out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
			Bucket: &s.bucket,
			Key:    &key,
		})
		if err != nil {
			return fmt.Errorf("s3: download %q: %w", key, err)
		}
		rc = out.Body
		return nil
	})
	return rc, err
}

func (s *S3StorageService) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: &s.bucket,
		Key:    &key,
	})
	if err != nil {
		return fmt.Errorf("s3: delete %q: %w", key, err)
	}
	return nil
}

// GetSignedURL generates a presigned GET URL that expires after the given duration.
func (s *S3StorageService) GetSignedURL(ctx context.Context, key string, expires time.Duration) (string, error) {
	req, err := s.presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: &s.bucket,
		Key:    &key,
	}, s3.WithPresignExpires(expires))
	if err != nil {
		return "", fmt.Errorf("s3: presign GET %q: %w", key, err)
	}
	return req.URL, nil
}

// GeneratePresignedPutURL generates a presigned PUT URL for direct client uploads.
func (s *S3StorageService) GeneratePresignedPutURL(ctx context.Context, key, contentType string, expires time.Duration) (string, error) {
	req, err := s.presignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      &s.bucket,
		Key:         &key,
		ContentType: &contentType,
	}, s3.WithPresignExpires(expires))
	if err != nil {
		return "", fmt.Errorf("s3: presign PUT %q: %w", key, err)
	}
	return req.URL, nil
}

func (s *S3StorageService) List(ctx context.Context, prefix string) ([]string, error) {
	var keys []string
	paginator := s3.NewListObjectsV2Paginator(s.client, &s3.ListObjectsV2Input{
		Bucket: &s.bucket,
		Prefix: &prefix,
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("s3: list prefix %q: %w", prefix, err)
		}
		for _, obj := range page.Contents {
			if obj.Key != nil {
				keys = append(keys, *obj.Key)
			}
		}
	}
	return keys, nil
}

// GetObjectSize returns the actual size of the S3 object by calling HeadObject.
func (s *S3StorageService) GetObjectSize(ctx context.Context, key string) (int64, error) {
	out, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: &s.bucket,
		Key:    &key,
	})
	if err != nil {
		return 0, fmt.Errorf("s3: head object %q: %w", key, err)
	}
	if out.ContentLength == nil {
		return 0, fmt.Errorf("s3: head object %q returned nil ContentLength", key)
	}
	return *out.ContentLength, nil
}

// Compile-time interface satisfaction checks.
var _ StorageService = (*LocalStorageService)(nil)
var _ StorageService = (*S3StorageService)(nil)
