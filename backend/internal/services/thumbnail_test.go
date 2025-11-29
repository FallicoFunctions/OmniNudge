package services

import (
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func createTestImage(t *testing.T, width, height int) string {
	t.Helper()

	// Create a test image
	img := image.NewRGBA(image.Rect(0, 0, width, height))

	// Fill with a gradient pattern
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{
				R: uint8((x * 255) / width),
				G: uint8((y * 255) / height),
				B: 128,
				A: 255,
			})
		}
	}

	// Save to temp file
	tmpDir := t.TempDir()
	imagePath := filepath.Join(tmpDir, "test_image.png")

	file, err := os.Create(imagePath)
	require.NoError(t, err)
	defer file.Close()

	err = png.Encode(file, img)
	require.NoError(t, err)

	return imagePath
}

func TestGenerateThumbnail(t *testing.T) {
	service := NewThumbnailService()

	// Create a 800x600 test image
	imagePath := createTestImage(t, 800, 600)

	// Generate thumbnail
	thumbnailPath, err := service.GenerateThumbnail(imagePath)
	require.NoError(t, err)

	// Verify thumbnail file exists
	_, err = os.Stat(thumbnailPath)
	require.NoError(t, err, "Thumbnail file should exist")

	// Verify thumbnail dimensions
	width, height, err := service.GetImageDimensions(thumbnailPath)
	require.NoError(t, err)

	// Thumbnail should be scaled down to fit within 300x300 while maintaining aspect ratio
	// 800x600 aspect ratio is 4:3, so thumbnail should be 300x225
	assert.Equal(t, 300, width, "Thumbnail width should be 300")
	assert.Equal(t, 225, height, "Thumbnail height should be 225")

	// Cleanup
	os.Remove(thumbnailPath)
}

func TestGenerateThumbnail_Portrait(t *testing.T) {
	service := NewThumbnailService()

	// Create a 600x800 portrait test image
	imagePath := createTestImage(t, 600, 800)

	// Generate thumbnail
	thumbnailPath, err := service.GenerateThumbnail(imagePath)
	require.NoError(t, err)

	// Verify thumbnail dimensions
	width, height, err := service.GetImageDimensions(thumbnailPath)
	require.NoError(t, err)

	// 600x800 aspect ratio is 3:4, so thumbnail should be 225x300
	assert.Equal(t, 225, width, "Thumbnail width should be 225")
	assert.Equal(t, 300, height, "Thumbnail height should be 300")

	// Cleanup
	os.Remove(thumbnailPath)
}

func TestGenerateThumbnail_Square(t *testing.T) {
	service := NewThumbnailService()

	// Create a 800x800 square test image
	imagePath := createTestImage(t, 800, 800)

	// Generate thumbnail
	thumbnailPath, err := service.GenerateThumbnail(imagePath)
	require.NoError(t, err)

	// Verify thumbnail dimensions
	width, height, err := service.GetImageDimensions(thumbnailPath)
	require.NoError(t, err)

	// Square image should maintain 1:1 ratio
	assert.Equal(t, 300, width, "Thumbnail width should be 300")
	assert.Equal(t, 300, height, "Thumbnail height should be 300")

	// Cleanup
	os.Remove(thumbnailPath)
}

func TestGenerateThumbnail_SmallImage(t *testing.T) {
	service := NewThumbnailService()

	// Create a small 100x100 test image
	imagePath := createTestImage(t, 100, 100)

	// Generate thumbnail
	thumbnailPath, err := service.GenerateThumbnail(imagePath)
	require.NoError(t, err)

	// Verify thumbnail exists
	_, err = os.Stat(thumbnailPath)
	require.NoError(t, err)

	// Small images should still be resized to 300x300
	width, height, err := service.GetImageDimensions(thumbnailPath)
	require.NoError(t, err)

	assert.Equal(t, 300, width, "Thumbnail width should be upscaled to 300")
	assert.Equal(t, 300, height, "Thumbnail height should be upscaled to 300")

	// Cleanup
	os.Remove(thumbnailPath)
}

func TestGenerateThumbnail_NonExistentFile(t *testing.T) {
	service := NewThumbnailService()

	// Try to generate thumbnail for non-existent file
	_, err := service.GenerateThumbnail("/tmp/nonexistent_image.png")
	assert.Error(t, err, "Should return error for non-existent file")
	assert.Contains(t, err.Error(), "source file does not exist")
}

func TestGetImageDimensions(t *testing.T) {
	service := NewThumbnailService()

	// Create a test image
	imagePath := createTestImage(t, 1920, 1080)

	// Get dimensions
	width, height, err := service.GetImageDimensions(imagePath)
	require.NoError(t, err)

	assert.Equal(t, 1920, width)
	assert.Equal(t, 1080, height)
}

func TestGetImageDimensions_NonExistentFile(t *testing.T) {
	service := NewThumbnailService()

	// Try to get dimensions of non-existent file
	_, _, err := service.GetImageDimensions("/tmp/nonexistent_image.png")
	assert.Error(t, err)
}

func TestIsImageType(t *testing.T) {
	testCases := []struct {
		contentType string
		expected    bool
	}{
		{"image/jpeg", true},
		{"image/png", true},
		{"image/webp", true},
		{"image/gif", true},
		{"video/mp4", false},
		{"video/webm", false},
		{"application/pdf", false},
		{"text/plain", false},
	}

	for _, tc := range testCases {
		t.Run(tc.contentType, func(t *testing.T) {
			result := IsImageType(tc.contentType)
			assert.Equal(t, tc.expected, result)
		})
	}
}

func TestCalculateThumbnailDimensions(t *testing.T) {
	testCases := []struct {
		name         string
		origWidth    int
		origHeight   int
		expectedW    int
		expectedH    int
	}{
		{"Landscape 16:9", 1920, 1080, 300, 168},
		{"Portrait 9:16", 1080, 1920, 168, 300},
		{"Square", 800, 800, 300, 300},
		{"Wide 21:9", 2560, 1080, 300, 126},
		{"Tall 9:21", 1080, 2560, 126, 300},
		{"Very wide", 3000, 500, 300, 50},
		{"Very tall", 500, 3000, 50, 300},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			width, height := calculateThumbnailDimensions(
				tc.origWidth,
				tc.origHeight,
				ThumbnailWidth,
				ThumbnailHeight,
			)

			assert.Equal(t, tc.expectedW, width, "Width mismatch")
			assert.Equal(t, tc.expectedH, height, "Height mismatch")
		})
	}
}
