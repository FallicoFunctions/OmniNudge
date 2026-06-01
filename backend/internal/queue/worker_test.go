package queue

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/hibiken/asynq"
	"github.com/rs/zerolog"
	zlog "github.com/rs/zerolog/log"
	"github.com/stretchr/testify/require"
)

func TestLogJobFailure_DoesNotPanicWithoutResultWriter(t *testing.T) {
	t.Parallel()

	task := asynq.NewTask(string(JobTypeVirusScan), []byte(`{"file_id":1}`))

	require.NotPanics(t, func() {
		logJobFailure(context.Background(), task, errors.New("boom"))
	})
}

func TestLogJobFailure_UsesWarningForRetryableErrors(t *testing.T) {
	var buf bytes.Buffer
	original := zlog.Logger
	zlog.Logger = zerolog.New(&buf)
	t.Cleanup(func() { zlog.Logger = original })

	task := asynq.NewTask(string(JobTypeVirusScan), []byte(`{"file_id":1}`))
	logJobFailure(context.Background(), task, errors.New("boom"))

	output := buf.String()
	require.Contains(t, output, `"level":"warn"`)
	require.Contains(t, output, "job execution failed")
	require.NotContains(t, output, "job failed permanently")
}

func TestLogJobFailure_UsesErrorForPermanentFailures(t *testing.T) {
	var buf bytes.Buffer
	original := zlog.Logger
	zlog.Logger = zerolog.New(&buf)
	t.Cleanup(func() { zlog.Logger = original })

	task := asynq.NewTask(string(JobTypeVirusScan), []byte(`{"file_id":1}`))
	logJobFailure(context.Background(), task, fmt.Errorf("skip: %w", asynq.SkipRetry))

	output := buf.String()
	require.Contains(t, output, `"level":"error"`)
	require.True(t, strings.Contains(output, "job failed permanently"))
}
