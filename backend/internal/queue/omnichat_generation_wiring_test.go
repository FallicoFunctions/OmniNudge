package queue

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/services"
)

func wiringTestConfig() *config.Config {
	cfg := &config.Config{}
	cfg.OpenRouter.APIKey = "sk-test"
	cfg.OpenRouter.ImageReviewModel = "some/review-model"
	cfg.OmniChatMedia.VideoProvider = OmniChatVideoProviderOpenRouter
	cfg.OmniChatMedia.VideoModel = "minimax/hailuo-3"
	return cfg
}

// Everything a configured deployment is entitled to, in one call.
//
// A scene photo failed with image_review_unavailable because the API server
// wired none of these while the standalone worker wired all of them, and both
// consume the same queue -- so which process picked the job up decided whether
// it worked.
func TestConfiguringTheHandlerWiresEveryOptionalDependency(t *testing.T) {
	handler := ConfigureOmniChatGeneration(
		&OmniChatGenerationHandler{}, wiringTestConfig(), services.NewThumbnailService())

	require.NotNil(t, handler.imageReview, "a render would be refused with image_review_unavailable")
	require.NotNil(t, handler.thumbnails, "every asset would be stored with no tile image")
	require.NotNil(t, handler.videoProvider, "a hosted clip would be sent to the self-hosted endpoint")
	require.NotNil(t, handler.mediaBearer, "a hosted clip could not be fetched back")
}

// An unconfigured deployment degrades rather than panicking, and each absence
// has its own documented behaviour.
func TestConfiguringTheHandlerWithNothingSetLeavesItUsable(t *testing.T) {
	handler := ConfigureOmniChatGeneration(&OmniChatGenerationHandler{}, &config.Config{}, nil)

	require.NotNil(t, handler)
	require.Nil(t, handler.imageReview)
	require.Nil(t, handler.videoProvider)
	require.Nil(t, handler.mediaBearer)
	require.Nil(t, ConfigureOmniChatGeneration(nil, wiringTestConfig(), nil))
}

// The gate, not the function.
//
// Proving the shared function wires everything says nothing about whether both
// processes call it. They did not: the setters were copied into one main and
// not the other, which is how they drifted in the first place. A main that
// reaches for a setter directly is that mistake starting again.
func TestBothProcessesConfigureTheHandlerTheSameWay(t *testing.T) {
	setters := []string{
		"SetRenderedImageReview", "SetVideoProvider", "SetMediaBearer", "SetThumbnails",
	}
	for _, main := range []string{"../../cmd/server/main.go", "../../cmd/worker/main.go"} {
		source, err := os.ReadFile(main)
		require.NoError(t, err)
		require.Contains(t, string(source), "ConfigureOmniChatGeneration",
			"%s does not configure the generation handler through the shared function", main)

		file, err := parser.ParseFile(token.NewFileSet(), main, source, 0)
		require.NoError(t, err)
		ast.Inspect(file, func(n ast.Node) bool {
			selector, ok := n.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			for _, setter := range setters {
				require.NotEqualf(t, setter, selector.Sel.Name,
					"%s calls %s directly; add it to ConfigureOmniChatGeneration so both processes get it",
					main, setter)
			}
			return true
		})
	}
}
