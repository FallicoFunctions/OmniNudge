package queue

import (
	"context"
	"os/exec"
	"strconv"
	"strings"
)

// Measure the clip, rather than believe the provider.
//
// The self-hosted worker reports width, height and duration with its result,
// and the ingest path reads them straight through. The hosted provider reports
// none of the three, so every clip it returned was stored with a null width and
// a null height -- for a whole session, while a comment in the adapter claimed
// the ingest path measured the file instead of trusting a claim about it. It
// did not. This is that comment, made true.
//
// Nothing here fails a render. A clip whose dimensions cannot be read is still
// a clip the user paid for; it loses a layout hint, not its content.

// clipMetrics is what ffprobe can tell us about a finished clip. A zero field
// means "not known", never "zero pixels".
type clipMetrics struct {
	Width    int
	Height   int
	Duration float64
}

// probeClip reads a clip's real dimensions and length.
func probeClip(ctx context.Context, videoPath string) clipMetrics {
	// #nosec G204 -- ffprobe is fixed and the path is one this process wrote.
	out, err := exec.CommandContext(ctx, "ffprobe",
		"-v", "error",
		"-select_streams", "v:0",
		"-show_entries", "stream=width,height:format=duration",
		"-of", "default=noprint_wrappers=1",
		videoPath).Output()
	if err != nil {
		return clipMetrics{}
	}
	var metrics clipMetrics
	for _, line := range strings.Split(string(out), "\n") {
		key, value, found := strings.Cut(strings.TrimSpace(line), "=")
		if !found {
			continue
		}
		switch key {
		case "width":
			if n, err := strconv.Atoi(value); err == nil && n > 0 {
				metrics.Width = n
			}
		case "height":
			if n, err := strconv.Atoi(value); err == nil && n > 0 {
				metrics.Height = n
			}
		case "duration":
			if seconds, err := strconv.ParseFloat(value, 64); err == nil && seconds > 0 {
				metrics.Duration = seconds
			}
		}
	}
	return metrics
}
