// Command zz_identity_check asks whether a rendered reference is still her.
//
// Identity is the one thing the reference pipeline exists to protect, and the
// only standard applied to it so far has been somebody looking at the pictures
// and thinking they seem right. That standard produced six wrong conclusions
// about framing in a single day, on the same images.
//
// So this puts her anchor beside each render and asks a vision model the one
// question that matters, forced to a single word. It is not a perfect judge.
// It is a repeatable one, applied identically to both arms, which is what makes
// two arms comparable at all.
package main

import (
	"context"
	"encoding/base64"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/services/openrouter"
)

const identityPrompt = `You are shown two photographs. The first is a reference photograph of a person. The second is a different photograph that is supposed to be the same person.

Answer with exactly one word: SAME or DIFFERENT.

Answer SAME if the two photographs show the same individual -- the same face, judged on bone structure, eye shape and spacing, nose, mouth and jawline. Clothing, hair styling, lighting, expression, camera distance and background are irrelevant and must be ignored: the same person photographed on two days in two outfits is SAME.

Answer DIFFERENT if a person who knew them would say these are two people.

One word. No explanation.`

func main() {
	anchor := flag.String("anchor", "", "path to her anchor picture (required)")
	dir := flag.String("dir", "", "directory of renders to judge (required)")
	flag.Parse()
	if *anchor == "" || *dir == "" {
		fmt.Fprintln(os.Stderr, "zz_identity_check: --anchor and --dir are required")
		os.Exit(1)
	}
	if err := run(*anchor, *dir); err != nil {
		fmt.Fprintln(os.Stderr, "zz_identity_check:", err)
		os.Exit(1)
	}
}

func run(anchorPath, dir string) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	model := strings.TrimSpace(cfg.OpenRouter.ImageReviewModel)
	if model == "" || strings.TrimSpace(cfg.OpenRouter.APIKey) == "" {
		return fmt.Errorf("an OpenRouter key and image review model are needed")
	}
	client := openrouter.NewClient(cfg.OpenRouter.APIKey, model)

	anchorURL, err := dataURL(anchorPath)
	if err != nil {
		return err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	var names []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".png") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	same, different, unreadable := 0, 0, 0
	for _, name := range names {
		candidate, err := dataURL(filepath.Join(dir, name))
		if err != nil {
			return err
		}
		answer, err := client.Generate(context.Background(), []openrouter.Message{
			{Role: openrouter.RoleSystem, Content: identityPrompt},
			{Role: openrouter.RoleUser, Content: "Are these the same person?",
				ImageDataURLs: []string{anchorURL, candidate}},
		}, func(string) {})
		verdict := strings.ToUpper(strings.TrimSpace(answer))
		switch {
		case err != nil:
			verdict, unreadable = "unavailable: "+err.Error(), unreadable+1
		case strings.HasPrefix(verdict, "SAME"):
			verdict, same = "SAME", same+1
		case strings.HasPrefix(verdict, "DIFFERENT"):
			verdict, different = "DIFFERENT", different+1
		default:
			unreadable++
		}
		fmt.Printf("  %-14s %s\n", name, verdict)
	}
	fmt.Printf("\n%s: %d same, %d different, %d unreadable\n", filepath.Base(dir), same, different, unreadable)
	return nil
}

func dataURL(path string) (string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(raw), nil
}
