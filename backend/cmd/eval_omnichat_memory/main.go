// Command eval_omnichat_memory checks whether the extraction model actually
// obeys the salience and distinctiveness rubric.
//
// Unit tests cover the ranking arithmetic with hand-written scores, which was
// never the risky part. The risk is that a real model reads a real transcript
// and returns a comfortable 0.5 for everything, at which point recall quietly
// degrades to lexical search -- and lexical search was measured ranking the
// wrong memory first. This runs the real prompt and reports the separation.
//
// Usage:
//
//	OPENROUTER_API_KEY=... go run ./cmd/eval_omnichat_memory
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/joho/godotenv"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/openrouter"
)

// defaultExtractionModel mirrors config.OpenRouter.ExtractionModel's default so
// the eval exercises what the worker would actually run when nothing is
// configured. Pointing it at anything else measures a model nobody uses.
const defaultExtractionModel = "google/gemini-3.5-flash-lite"

func main() {
	var (
		caseName    = flag.String("case", "", "optional single case name")
		caseTimeout = flag.Duration("case-timeout", 60*time.Second, "timeout per extraction")
		modelFlag   = flag.String("model", "", "override the model; defaults to the configured extraction model")
		repeats     = flag.Int("repeats", 1, "runs per case (1-5); >1 exposes score instability")
	)
	flag.Parse()

	_ = godotenv.Load(".env", "backend/.env")

	if *repeats < 1 || *repeats > 5 {
		fatalf("repeats must be between 1 and 5")
	}
	apiKey := os.Getenv("OPENROUTER_API_KEY")
	if apiKey == "" {
		fatalf("OPENROUTER_API_KEY is required")
	}
	// Extraction has its own setting; it is not the chat model any more, even
	// though both currently name the same route. Reading the standard model here
	// would validate calibration production never exercises the moment they
	// diverge.
	model := strings.TrimSpace(*modelFlag)
	if model == "" {
		model = strings.TrimSpace(os.Getenv("OMNICHAT_MODEL_EXTRACTION"))
	}
	if model == "" {
		model = defaultExtractionModel
	}

	cases := services.DefaultOmniChatMemoryEvalCases()
	if name := strings.TrimSpace(*caseName); name != "" {
		filtered := cases[:0:0]
		for _, evalCase := range cases {
			if evalCase.Name == name {
				filtered = append(filtered, evalCase)
			}
		}
		if len(filtered) == 0 {
			fatalf("unknown case %q", name)
		}
		cases = filtered
	}

	// Extraction is persona-agnostic by design -- it reads the transcript, not
	// the character -- so a minimal stand-in keeps the eval free of seed data.
	persona := &models.BotPersona{ID: 1, Name: "Eval", IsActive: true}
	extractor := services.NewModelOmniChatMemoryExtractor(openrouter.NewClient(apiKey, model))

	results := make([]services.OmniChatMemoryEvalResult, 0, len(cases)*(*repeats))
	for run := 1; run <= *repeats; run++ {
		for _, evalCase := range cases {
			ctx, cancel := context.WithTimeout(context.Background(), *caseTimeout)
			result := services.RunOmniChatMemoryEval(ctx, extractor, persona, evalCase)
			cancel()
			results = append(results, result)
		}
	}

	failed := render(model, *repeats, results)
	if failed > 0 {
		os.Exit(1)
	}
}

func render(model string, repeats int, results []services.OmniChatMemoryEvalResult) int {
	fmt.Printf("# OmniChat memory extraction calibration\n\n")
	fmt.Printf("Model: `%s`  |  repeats: %d\n\n", model, repeats)

	writer := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
	_, _ = fmt.Fprintln(writer, "CASE\tEPISODES\tDISTINCT\tSALIENCE\tRESULT")

	failed := 0
	for _, result := range results {
		status := "pass"
		switch {
		case result.Err != nil:
			status = "ERROR: " + sanitize(result.Err.Error())
			failed++
		case len(result.Failures) > 0:
			status = "FAIL: " + strings.Join(result.Failures, "; ")
			failed++
		}
		_, _ = fmt.Fprintf(writer, "%s\t%d\t%.2f\t%.2f\t%s\n",
			result.Case.Name, len(result.Episodes),
			result.TopDistinctiveness, result.TopSalience, status)
	}
	_ = writer.Flush()

	// A score alone cannot tell a miscalibrated model from a miscalibrated
	// expectation, so failures print what was actually remembered.
	for _, result := range results {
		if result.Passed() || len(result.Episodes) == 0 {
			continue
		}
		fmt.Printf("\n%s recorded:\n", result.Case.Name)
		for _, episode := range result.Episodes {
			fmt.Printf("  - %q (d=%.2f s=%.2f) %s\n",
				episode.Title, episode.Distinctiveness, episode.Salience, episode.Summary)
		}
	}

	pairs := services.EvaluateOmniChatMemoryPairs(results)
	if len(pairs) > 0 {
		fmt.Printf("\n## Calibration separation\n\n")
		fmt.Printf("The assertion that matters: an extraordinary event must outscore an\n")
		fmt.Printf("ordinary one in the same setting by at least %.2f.\n\n", services.MinimumOmniChatMemoryPairMargin)
		pairWriter := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
		_, _ = fmt.Fprintln(pairWriter, "MEMORABLE\tSCORE\tROUTINE\tSCORE\tMARGIN\tRESULT")
		for _, pair := range pairs {
			status := "pass"
			if !pair.Passed {
				status = "FAIL"
				failed++
			}
			_, _ = fmt.Fprintf(pairWriter, "%s\t%.2f\t%s\t%.2f\t%+.2f\t%s\n",
				pair.Memorable, pair.MemorableScore,
				pair.Routine, pair.RoutineScore, pair.Margin, status)
		}
		_ = pairWriter.Flush()
	}

	fmt.Printf("\n")
	if failed == 0 {
		fmt.Printf("All checks passed.\n")
	} else {
		fmt.Printf("%d check(s) failed.\n", failed)
	}
	return failed
}

// sanitize keeps provider errors from echoing credentials into a shared report.
func sanitize(message string) string {
	for _, secret := range []string{os.Getenv("OPENROUTER_API_KEY"), os.Getenv("DATABASE_URL")} {
		if strings.TrimSpace(secret) != "" {
			message = strings.ReplaceAll(message, secret, "[redacted]")
		}
	}
	return message
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "eval_omnichat_memory: "+format+"\n", args...)
	os.Exit(2)
}
