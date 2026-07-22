package utils

import (
	"bytes"
	"os/exec"
	"sync"
)

type cappedCommandOutput struct {
	mu        sync.Mutex
	buffer    bytes.Buffer
	remaining int
}

func (w *cappedCommandOutput) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.remaining > 0 {
		toWrite := len(p)
		if toWrite > w.remaining {
			toWrite = w.remaining
		}
		_, _ = w.buffer.Write(p[:toWrite])
		w.remaining -= toWrite
	}
	// Report the full write so a noisy child process cannot turn a diagnostic
	// output cap into a broken pipe or an artificial command failure.
	return len(p), nil
}

// RunCommandWithOutputLimit captures a bounded amount of combined stdout and
// stderr while allowing the command to drain the rest. This prevents external
// media tools from exhausting application memory with diagnostic output.
func RunCommandWithOutputLimit(cmd *exec.Cmd, maxBytes int) ([]byte, error) {
	if maxBytes < 0 {
		maxBytes = 0
	}
	output := &cappedCommandOutput{remaining: maxBytes}
	cmd.Stdout = output
	cmd.Stderr = output
	err := cmd.Run()
	return output.buffer.Bytes(), err
}
