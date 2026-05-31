package externalproviders

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestClassifier_UsesGeneratedCatalog(t *testing.T) {
	result, ok := Classify("https://youtu.be/dQw4w9WgXcQ")

	require.True(t, ok)
	require.Equal(t, "youtube", result.ID)
	require.Equal(t, StatusSupportedEmbed, result.Status)
	require.Equal(t, FallbackNone, result.FallbackBehavior)
}
