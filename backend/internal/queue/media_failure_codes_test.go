package queue

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Every failure code the server can emit has to be one the browser can explain.
//
// Ten of nineteen were not. They all fell to the default arm of the message
// map and came out as "Media generation could not be started. Please try
// again." -- about renders that had started, finished, cost money and then been
// refused on what they showed. One of them, explicit_content_refused, has an
// answer the reader can act on, and they were told to try again instead.
//
// This is a source-level check because the two halves are in different
// languages and nothing else connects them.
func TestEveryFailureCodeHasSomethingTheBrowserCanSay(t *testing.T) {
	root := filepath.Join("..", "..", "..")
	messages, err := os.ReadFile(filepath.Join(root, "frontend", "src", "utils", "omnichatMediaErrors.ts"))
	require.NoError(t, err, "the message map is where a user-facing failure gets its words")

	codes := serverFailureCodes(t, filepath.Join(root, "backend", "internal"))
	require.NotEmpty(t, codes, "found no failure codes at all, so this test is asserting nothing")

	var unexplained []string
	for _, code := range codes {
		if !strings.Contains(string(messages), "'"+code+"'") {
			unexplained = append(unexplained, code)
		}
	}
	require.Emptyf(t, unexplained,
		"these failure codes reach the browser as \"could not be started\": %s",
		strings.Join(unexplained, ", "))
}

// serverFailureCodes reads the codes out of the source rather than keeping a
// list, because a list is the thing that goes stale.
func serverFailureCodes(t *testing.T, dir string) []string {
	t.Helper()
	pattern := regexp.MustCompile(`permanentGenerationFailure\("([a-z_]+)"`)
	seen := map[string]struct{}{}
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return err
		}
		source, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		for _, match := range pattern.FindAllStringSubmatch(string(source), -1) {
			seen[match[1]] = struct{}{}
		}
		return nil
	})
	require.NoError(t, err)

	codes := make([]string, 0, len(seen))
	for code := range seen {
		codes = append(codes, code)
	}
	sort.Strings(codes)
	return codes
}
