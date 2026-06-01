package handlers

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

type stubMediaJobEnqueuer struct {
	virusCalls     int
	thumbnailCalls int
}

func (s *stubMediaJobEnqueuer) EnqueueVirusScan(ctx context.Context, fileID int, filePath, s3Key string, uploadedBy int) error {
	s.virusCalls++
	return nil
}

func (s *stubMediaJobEnqueuer) EnqueueThumbnailGeneration(ctx context.Context, fileID int, sourceURL, sourceS3Key, fileType string) error {
	s.thumbnailCalls++
	return nil
}

func TestSchedulePostUploadJobs_EnqueuesVirusScanOnly(t *testing.T) {
	enqueuer := &stubMediaJobEnqueuer{}
	handler := &MediaHandler{
		queueClient: enqueuer,
	}

	media := &models.MediaFile{
		ID:         42,
		UserID:     7,
		FileType:   "image/jpeg",
		StorageURL: "https://cdn.omninudge.local/image.jpg",
		Filename:   "image.jpg",
	}

	err := handler.schedulePostUploadJobs(context.Background(), media)
	require.NoError(t, err)
	require.Equal(t, 1, enqueuer.virusCalls)
	require.Equal(t, 0, enqueuer.thumbnailCalls)
}
