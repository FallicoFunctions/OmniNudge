package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/handlers"
)

type designRow struct {
	id         int
	hubName    string
	designName string
	isActive   bool
	html       string
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	dsn := resolveDatabaseURL()
	if dsn == "" {
		fatalf("DATABASE_URL is required, or provide DB_HOST/DB_PORT/DB_USER/DB_NAME")
	}

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		fatalf("connect: %v", err)
	}
	defer pool.Close()

	rows, err := pool.Query(ctx, `
		SELECT d.id, h.name, COALESCE(d.name, ''), d.is_active, d.html_content
		FROM hub_ai_designs d
		JOIN hubs h ON h.id = d.hub_id
		ORDER BY d.id
	`)
	if err != nil {
		fatalf("query hub_ai_designs: %v", err)
	}
	defer rows.Close()

	total := 0
	invalid := make([]string, 0)
	activeInvalid := make([]string, 0)
	for rows.Next() {
		var row designRow
		if err := rows.Scan(&row.id, &row.hubName, &row.designName, &row.isActive, &row.html); err != nil {
			fatalf("scan hub_ai_designs: %v", err)
		}
		total++

		if err := handlers.ValidateAIDesignHTMLForAudit(row.html); err != nil {
			line := fmt.Sprintf("id=%d hub=%s name=%q active=%t reason=%s", row.id, row.hubName, row.designName, row.isActive, err)
			invalid = append(invalid, line)
			if row.isActive {
				activeInvalid = append(activeInvalid, line)
			}
		}
	}
	if err := rows.Err(); err != nil {
		fatalf("read hub_ai_designs: %v", err)
	}

	fmt.Printf("Scanned %d hub_ai_designs rows\n", total)
	if len(invalid) == 0 {
		fmt.Println("Invalid rows: none")
		return
	}

	fmt.Println("Invalid rows:")
	for _, line := range invalid {
		fmt.Printf("- %s\n", line)
	}
	if len(activeInvalid) > 0 {
		fmt.Println("Invalid active rows:")
		for _, line := range activeInvalid {
			fmt.Printf("- %s\n", line)
		}
	}
}

func resolveDatabaseURL() string {
	loadDotEnv(".env")
	loadDotEnv("backend/.env")

	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		return dsn
	}

	host := envOrDefault("DB_HOST", "localhost")
	port := envOrDefault("DB_PORT", "5432")
	user := os.Getenv("DB_USER")
	name := os.Getenv("DB_NAME")
	password := os.Getenv("DB_PASSWORD")
	if user == "" || name == "" {
		return ""
	}
	if password != "" {
		return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", user, password, host, port, name)
	}
	return fmt.Sprintf("postgres://%s@%s:%s/%s?sslmode=disable", user, host, port, name)
}

func loadDotEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	keys := make([]string, 0)
	values := make(map[string]string)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" || os.Getenv(key) != "" {
			continue
		}
		keys = append(keys, key)
		values[key] = strings.Trim(strings.TrimSpace(value), `"'`)
	}
	sort.Strings(keys)
	for _, key := range keys {
		_ = os.Setenv(key, values[key])
	}
}

func envOrDefault(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
