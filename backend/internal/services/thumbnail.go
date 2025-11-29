package services

import (
	"fmt"
	"image"
	"os"
	"path/filepath"
	"strings"

	"github.com/disintegration/imaging"
)

const (
	// ThumbnailWidth is the target width for thumbnails
	ThumbnailWidth = 300
	// ThumbnailHeight is the target height for thumbnails
	ThumbnailHeight = 300
)

// ThumbnailService handles thumbnail generation
type ThumbnailService struct{}

// NewThumbnailService creates a new thumbnail service
func NewThumbnailService() *ThumbnailService {
	return &ThumbnailService{}
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
