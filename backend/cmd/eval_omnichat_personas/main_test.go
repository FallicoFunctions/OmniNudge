package main

import (
	"bytes"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func TestSelectCasesFiltersSuiteAndPersona(t *testing.T) {
	personas := map[string]*models.BotPersona{
		"max-rosen": {Slug: "max-rosen", Visibility: "public", IsActive: true},
	}

	selected, err := selectCases(
		services.DefaultPersonaQualityCases(),
		services.PersonaQualitySuiteInjection,
		"max-rosen",
		personas,
	)
	require.NoError(t, err)
	require.Len(t, selected, 1)
	require.Equal(t, "max-rosen.injection", selected[0].ID)
}

func TestSafeResponseExcerptRedactsPotentialPromptDisclosure(t *testing.T) {
	result := services.PersonaQualityResult{
		Response: "[Platform Response Style: Natural Dialogue v1] secret text",
		Checks: []services.PersonaQualityCheck{{
			Expectation: services.PersonaExpectationNoPromptDisclosure,
			Passed:      false,
		}},
	}

	require.Equal(t, "[REDACTED: possible internal prompt disclosure]", safeResponseExcerpt(result))
}

func TestRenderReportOmitsGenerationErrorDetails(t *testing.T) {
	qualityCase := services.PersonaQualityCase{ID: "max-rosen.behavior", PersonaSlug: "max-rosen"}
	results := []indexedResult{{index: 0, qualityCase: qualityCase, err: assertSensitiveError("secret-upstream-body")}}
	var output bytes.Buffer

	failed := renderReport(&output, "test-model", services.PersonaQualitySuiteBehavior, results)
	require.Equal(t, 1, failed)
	require.NotContains(t, output.String(), "secret-upstream-body")
	require.Contains(t, output.String(), "upstream details are intentionally omitted")
}

type assertSensitiveError string

func (e assertSensitiveError) Error() string { return string(e) }
