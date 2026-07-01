// Command openrouter-poc is a manual proof-of-concept for the OpenRouter
// chat client backing OmniChat. Run it directly (from backend/, so it picks
// up backend/.env) to confirm streaming works end-to-end against the live API:
//
//	go run ./cmd/openrouter-poc "Describe a foggy harbor town at midnight."
package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/omninudge/backend/internal/services/openrouter"
)

func main() {
	_ = godotenv.Load() // best-effort; falls back to real env vars if absent

	apiKey := os.Getenv("OPENROUTER_API_KEY")
	if apiKey == "" {
		fmt.Fprintln(os.Stderr, "OPENROUTER_API_KEY is not set (check backend/.env)")
		os.Exit(1)
	}
	model := os.Getenv("OPENROUTER_MODEL")
	if model == "" {
		model = "openrouter/free"
	}

	prompt := "Describe a foggy harbor town at midnight in two sentences."
	if len(os.Args) > 1 {
		prompt = strings.Join(os.Args[1:], " ")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client := openrouter.NewClient(apiKey, model)

	fmt.Println("model:", model)
	fmt.Println("prompt:", prompt)
	fmt.Println("streaming response:")

	full, err := client.Generate(ctx, []openrouter.Message{
		{Role: openrouter.RoleSystem, Content: "You are a concise, vivid creative writing assistant."},
		{Role: openrouter.RoleUser, Content: prompt},
	}, func(token string) {
		fmt.Print(token)
	})
	fmt.Println()

	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}

	fmt.Println("---")
	fmt.Println("full response length:", len(full))
}
