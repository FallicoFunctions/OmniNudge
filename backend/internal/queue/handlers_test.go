package queue

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/require"
)

func TestNewUnsupportedHandler_SkipRetry(t *testing.T) {
	t.Parallel()

	handler := NewUnsupportedHandler(JobTypeTranscription, "not implemented")
	task := asynq.NewTask(string(JobTypeTranscription), []byte(`{"voice_message_id":1,"audio_url":"/uploads/voice/test.webm","user_id":7}`))

	err := handler(context.Background(), task)
	require.Error(t, err)
	require.True(t, errors.Is(err, asynq.SkipRetry))
}

func TestNewVirusScanHandler_CleanFile(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	filePath := filepath.Join(dir, "clean.bin")
	require.NoError(t, os.WriteFile(filePath, []byte("hello world"), 0o644))

	handler := NewVirusScanHandler()
	task := asynq.NewTask(
		string(JobTypeVirusScan),
		[]byte(`{"file_id":12,"file_path":"`+filePath+`","uploaded_by":1}`),
	)

	err := handler(context.Background(), task)
	require.NoError(t, err)
}

func TestNewVirusScanHandler_MissingFile(t *testing.T) {
	t.Parallel()

	handler := NewVirusScanHandler()
	task := asynq.NewTask(
		string(JobTypeVirusScan),
		[]byte(`{"file_id":13,"file_path":"/does/not/exist","uploaded_by":1}`),
	)

	err := handler(context.Background(), task)
	require.Error(t, err)
	require.False(t, errors.Is(err, asynq.SkipRetry))
}

func TestNewNotificationHandler_NoDeps_NoError(t *testing.T) {
	t.Parallel()

	handler := NewNotificationHandler(nil, nil)
	task := asynq.NewTask(
		string(JobTypeNotification),
		[]byte(`{"user_ids":[1,2],"title":"Hello","body":"World"}`),
	)

	err := handler(context.Background(), task)
	require.NoError(t, err)
}
