package services

import (
	"context"
	"fmt"
	"image"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/disintegration/imaging"
)

const (
	// ThumbnailWidth is the target width for thumbnails
	ThumbnailWidth = 300
	// ThumbnailHeight is the target height for thumbnails
	ThumbnailHeight   = 300
	thumbnailMaxBytes = 50 * 1024
)

// ThumbnailService handles thumbnail generation
type ThumbnailService struct {
	commandRunner func(ctx context.Context, name string, args ...string) ([]byte, error)
}

type ImageThumbnailSet struct {
	PrimaryPath string
	SmallPath   string
}

// NewThumbnailService creates a new thumbnail service
func NewThumbnailService() *ThumbnailService {
	return &ThumbnailService{
		commandRunner: defaultCommandRunner,
	}
}

// GenerateThumbnail creates a thumbnail for an image file
// Returns the thumbnail path and any error
func (s *ThumbnailService) GenerateThumbnail(sourcePath string) (string, error) {
	// Check if source file exists
	if _, err := os.Stat(sourcePath); os.IsNotExist(err) {
		return "", fmt.Errorf("source file does not exist: %w", err)
	}

	// Open the image
	src, err := imaging.Open(sourcePath)
	if err != nil {
		return "", fmt.Errorf("failed to open image: %w", err)
	}

	// Get original dimensions
	bounds := src.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()

	// Calculate thumbnail dimensions while maintaining aspect ratio
	thumbWidth, thumbHeight := calculateThumbnailDimensions(width, height, ThumbnailWidth, ThumbnailHeight)

	// Resize the image to thumbnail size
	thumbnail := imaging.Resize(src, thumbWidth, thumbHeight, imaging.Lanczos)

	// Generate thumbnail filename
	ext := filepath.Ext(sourcePath)
	nameWithoutExt := strings.TrimSuffix(filepath.Base(sourcePath), ext)
	thumbnailName := fmt.Sprintf("%s_thumb%s", nameWithoutExt, ext)
	thumbnailPath := filepath.Join(filepath.Dir(sourcePath), thumbnailName)

	// Save the thumbnail
	err = imaging.Save(thumbnail, thumbnailPath)
	if err != nil {
		return "", fmt.Errorf("failed to save thumbnail: %w", err)
	}

	return thumbnailPath, nil
}

// GenerateImageThumbnails creates two image thumbnails:
// - primary thumbnail (~800x600 max bounds) persisted in media.thumbnail_url
// - small thumbnail (~200x200 max bounds) for compact preview surfaces
func (s *ThumbnailService) GenerateImageThumbnails(sourcePath string) (*ImageThumbnailSet, error) {
	if _, err := os.Stat(sourcePath); os.IsNotExist(err) {
		return nil, fmt.Errorf("source file does not exist: %w", err)
	}

	src, err := imaging.Open(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open image: %w", err)
	}
	bounds := src.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()

	ext := filepath.Ext(sourcePath)
	nameWithoutExt := strings.TrimSuffix(filepath.Base(sourcePath), ext)
	baseDir := filepath.Dir(sourcePath)

	primaryW, primaryH := calculateThumbnailDimensions(width, height, 800, 600)
	primaryThumb := imaging.Resize(src, primaryW, primaryH, imaging.Lanczos)
	primaryPath := filepath.Join(baseDir, fmt.Sprintf("%s_thumb.jpg", nameWithoutExt))
	if err := saveOptimizedJPEG(primaryThumb, primaryPath, thumbnailMaxBytes); err != nil {
		return nil, fmt.Errorf("failed to save primary thumbnail: %w", err)
	}

	smallW, smallH := calculateThumbnailDimensions(width, height, 200, 200)
	smallThumb := imaging.Resize(src, smallW, smallH, imaging.Lanczos)
	smallPath := filepath.Join(baseDir, fmt.Sprintf("%s_thumb_sm.jpg", nameWithoutExt))
	if err := saveOptimizedJPEG(smallThumb, smallPath, thumbnailMaxBytes); err != nil {
		return nil, fmt.Errorf("failed to save small thumbnail: %w", err)
	}

	return &ImageThumbnailSet{
		PrimaryPath: primaryPath,
		SmallPath:   smallPath,
	}, nil
}

// GenerateSquareThumbnail creates a square center-cropped thumbnail of the requested size.
func (s *ThumbnailService) GenerateSquareThumbnail(sourcePath string, size int) (string, error) {
	if size <= 0 {
		return "", fmt.Errorf("invalid thumbnail size: %d", size)
	}
	if _, err := os.Stat(sourcePath); os.IsNotExist(err) {
		return "", fmt.Errorf("source file does not exist: %w", err)
	}

	src, err := imaging.Open(sourcePath)
	if err != nil {
		return "", fmt.Errorf("failed to open image: %w", err)
	}

	thumb := imaging.Fill(src, size, size, imaging.Center, imaging.Lanczos)

	ext := filepath.Ext(sourcePath)
	nameWithoutExt := strings.TrimSuffix(filepath.Base(sourcePath), ext)
	thumbnailName := fmt.Sprintf("%s_sq%d%s", nameWithoutExt, size, ext)
	thumbnailPath := filepath.Join(filepath.Dir(sourcePath), thumbnailName)

	if err := imaging.Save(thumb, thumbnailPath); err != nil {
		return "", fmt.Errorf("failed to save square thumbnail: %w", err)
	}
	return thumbnailPath, nil
}

// GeneratePDFThumbnailSecure creates a thumbnail for the first page of a PDF using a command-line renderer
// with a strict timeout and no shell execution.
func (s *ThumbnailService) GeneratePDFThumbnailSecure(sourcePath string, timeout time.Duration) (string, error) {
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	if _, err := os.Stat(sourcePath); os.IsNotExist(err) {
		return "", fmt.Errorf("source file does not exist: %w", err)
	}

	ext := strings.ToLower(filepath.Ext(sourcePath))
	if ext != ".pdf" {
		return "", fmt.Errorf("source is not a PDF: %s", sourcePath)
	}

	nameWithoutExt := strings.TrimSuffix(filepath.Base(sourcePath), ext)
	outputPrefix := filepath.Join(filepath.Dir(sourcePath), fmt.Sprintf("%s_pdfthumb", nameWithoutExt))
	outputPath := outputPrefix + ".jpg"

	// Try pdftoppm first (preferred), then mutool fallback.
	candidates := []struct {
		name string
		args []string
	}{
		{
			name: "pdftoppm",
			args: []string{"-f", "1", "-singlefile", "-jpeg", sourcePath, outputPrefix},
		},
		{
			name: "mutool",
			args: []string{"draw", "-F", "jpg", "-o", outputPath, sourcePath, "1"},
		},
	}

	var errs []string
	for _, candidate := range candidates {
		_ = os.Remove(outputPath)
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		_, err := s.commandRunner(ctx, candidate.name, candidate.args...)
		cancel()
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", candidate.name, err))
			continue
		}
		if _, err := os.Stat(outputPath); err != nil {
			errs = append(errs, fmt.Sprintf("%s: output not created", candidate.name))
			continue
		}
		return outputPath, nil
	}

	return "", fmt.Errorf("failed to generate pdf thumbnail: %s", strings.Join(errs, " | "))
}

// GenerateVideoThumbnailSecure creates a thumbnail image from a video using ffmpeg with strict timeout.
// It extracts a frame around the 1-second mark and writes a JPEG thumbnail.
func (s *ThumbnailService) GenerateVideoThumbnailSecure(sourcePath string, timeout time.Duration) (string, error) {
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	if _, err := os.Stat(sourcePath); os.IsNotExist(err) {
		return "", fmt.Errorf("source file does not exist: %w", err)
	}
	if !IsVideoType(mimeTypeFromExtension(sourcePath)) {
		return "", fmt.Errorf("source is not a supported video file: %s", sourcePath)
	}

	ext := strings.ToLower(filepath.Ext(sourcePath))
	nameWithoutExt := strings.TrimSuffix(filepath.Base(sourcePath), ext)
	outputPath := filepath.Join(filepath.Dir(sourcePath), fmt.Sprintf("%s_thumb.jpg", nameWithoutExt))
	_ = os.Remove(outputPath)

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	_, err := s.commandRunner(
		ctx,
		"ffmpeg",
		"-y",
		"-ss", "00:00:01",
		"-i", sourcePath,
		"-frames:v", "1",
		"-vf", "scale=min(800\\,iw):-2",
		"-q:v", "5",
		outputPath,
	)
	if err != nil {
		return "", fmt.Errorf("failed to generate video thumbnail: %w", err)
	}
	if _, err := os.Stat(outputPath); err != nil {
		return "", fmt.Errorf("failed to generate video thumbnail: output not created")
	}
	return outputPath, nil
}

// GetImageDimensions returns the width and height of an image
func (s *ThumbnailService) GetImageDimensions(imagePath string) (width int, height int, err error) {
	file, err := os.Open(imagePath)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to open image: %w", err)
	}
	defer file.Close()

	config, _, err := image.DecodeConfig(file)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to decode image config: %w", err)
	}

	return config.Width, config.Height, nil
}

// IsImageType checks if the content type is an image
func IsImageType(contentType string) bool {
	imageTypes := map[string]bool{
		"image/jpeg": true,
		"image/png":  true,
		"image/webp": true,
		"image/gif":  true,
	}
	return imageTypes[contentType]
}

// IsPDFType checks if the content type is a PDF.
func IsPDFType(contentType string) bool {
	return strings.TrimSpace(strings.ToLower(contentType)) == "application/pdf"
}

// IsVideoType checks if the content type is a supported video.
func IsVideoType(contentType string) bool {
	videoTypes := map[string]bool{
		"video/mp4":        true,
		"video/webm":       true,
		"video/quicktime":  true,
		"video/x-matroska": true,
	}
	return videoTypes[strings.TrimSpace(strings.ToLower(contentType))]
}

func mimeTypeFromExtension(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".mov":
		return "video/quicktime"
	case ".mkv":
		return "video/x-matroska"
	default:
		return ""
	}
}

func saveOptimizedJPEG(img image.Image, path string, maxBytes int64) error {
	qualities := []int{80, 70, 60, 50, 40}
	var lastErr error
	for _, quality := range qualities {
		if err := imaging.Save(img, path, imaging.JPEGQuality(quality)); err != nil {
			lastErr = err
			continue
		}
		if maxBytes <= 0 {
			return nil
		}
		info, err := os.Stat(path)
		if err != nil {
			lastErr = err
			continue
		}
		if info.Size() <= maxBytes {
			return nil
		}
	}
	if lastErr != nil {
		return lastErr
	}
	return nil
}

func defaultCommandRunner(ctx context.Context, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	return cmd.CombinedOutput()
}

// calculateThumbnailDimensions calculates thumbnail dimensions while maintaining aspect ratio
func calculateThumbnailDimensions(origWidth, origHeight, maxWidth, maxHeight int) (int, int) {
	if origWidth == 0 || origHeight == 0 {
		return maxWidth, maxHeight
	}

	aspectRatio := float64(origWidth) / float64(origHeight)

	var thumbWidth, thumbHeight int

	if aspectRatio > 1 {
		// Landscape orientation
		thumbWidth = maxWidth
		thumbHeight = int(float64(maxWidth) / aspectRatio)
	} else {
		// Portrait or square orientation
		thumbHeight = maxHeight
		thumbWidth = int(float64(maxHeight) * aspectRatio)
	}

	// Ensure dimensions are at least 1
	if thumbWidth < 1 {
		thumbWidth = 1
	}
	if thumbHeight < 1 {
		thumbHeight = 1
	}

	return thumbWidth, thumbHeight
}
