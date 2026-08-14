package utils

import (
	"os/exec"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRunCommandWithOutputLimitCapsCombinedOutput(t *testing.T) {
	cmd := exec.Command("sh", "-c", "printf 123456; printf abcdef >&2")
	output, err := RunCommandWithOutputLimit(cmd, 8)
	require.NoError(t, err)
	require.Len(t, output, 8)
}

func TestRunCommandWithOutputLimitPreservesExitFailure(t *testing.T) {
	cmd := exec.Command("sh", "-c", "printf failure >&2; exit 7")
	output, err := RunCommandWithOutputLimit(cmd, 64)
	require.Error(t, err)
	require.Contains(t, string(output), "failure")
}
