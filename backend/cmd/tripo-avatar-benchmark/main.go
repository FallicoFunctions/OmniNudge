package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

const (
	tripoBaseURL  = "https://api.tripo3d.ai/v2/openapi"
	maxImageBytes = 10 << 20
	maxModelBytes = 250 << 20
)

var orderedViews = []string{
	"front-v1.png",
	"left-profile-v1.png",
	"back-v1.png",
	"right-profile-v1.png",
}

type tripoClient struct {
	apiKey string
	http   *http.Client
}

func main() {
	inputDir := flag.String("input-dir", "../omnirave-babylon/assets-src/avatars/reference-turnarounds/male-luxury-festival", "directory containing the four turnaround views")
	outputDir := flag.String("output-dir", "../omnirave-babylon/assets-src/avatars/omniavatar-v2/tripo-benchmark/male", "directory for benchmark artifacts")
	modelsFlag := flag.String("models", "P1-20260311,v3.1-20260211", "comma-separated Tripo model versions")
	flag.Parse()

	_ = godotenv.Load()
	apiKey := strings.TrimSpace(os.Getenv("TRIPO_API_KEY"))
	if apiKey == "" {
		fatal(errors.New("TRIPO_API_KEY is not configured"))
	}
	models := splitNonEmpty(*modelsFlag)
	if len(models) == 0 {
		fatal(errors.New("at least one model version is required"))
	}
	if err := os.MkdirAll(*outputDir, 0o755); err != nil {
		fatal(fmt.Errorf("create output directory: %w", err))
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	client := &tripoClient{
		apiKey: apiKey,
		http:   &http.Client{Timeout: 5 * time.Minute},
	}
	balance, frozen, err := client.balance(ctx)
	if err != nil {
		fatal(fmt.Errorf("read API wallet balance: %w", err))
	}
	fmt.Printf("Tripo API wallet: %.0f available, %.0f frozen credits.\n", balance, frozen)
	if balance <= 0 {
		fatal(errors.New("tripo API wallet has no available credits"))
	}

	tokens := make([]string, 0, len(orderedViews))
	for _, name := range orderedViews {
		fmt.Printf("Uploading %s...\n", name)
		token, err := client.uploadImage(ctx, filepath.Join(*inputDir, name))
		if err != nil {
			fatal(fmt.Errorf("upload %s: %w", name, err))
		}
		tokens = append(tokens, token)
	}

	results := make([]map[string]any, 0, len(models))
	for _, modelVersion := range models {
		fmt.Printf("Submitting %s multiview/PBR task...\n", modelVersion)
		started := time.Now()
		taskID, err := client.createTask(ctx, modelVersion, tokens)
		if err != nil {
			fatal(fmt.Errorf("create %s task: %w", modelVersion, err))
		}
		output, err := client.waitForTask(ctx, taskID)
		if err != nil {
			fatal(fmt.Errorf("wait for %s task: %w", modelVersion, err))
		}
		modelURL, err := selectModelURL(output)
		if err != nil {
			fatal(fmt.Errorf("select %s output: %w", modelVersion, err))
		}
		artifactName := safeName(modelVersion) + ".glb"
		written, err := client.downloadModel(ctx, modelURL, filepath.Join(*outputDir, artifactName))
		if err != nil {
			fatal(fmt.Errorf("download %s output: %w", modelVersion, err))
		}
		duration := time.Since(started).Round(time.Second)
		fmt.Printf("Completed %s in %s (%d bytes).\n", modelVersion, duration, written)
		results = append(results, map[string]any{
			"modelVersion": modelVersion,
			"taskId":       taskID,
			"status":       "success",
			"duration":     duration.String(),
			"artifact":     artifactName,
			"bytes":        written,
		})
	}

	report, err := json.MarshalIndent(map[string]any{
		"generatedAt": time.Now().UTC().Format(time.RFC3339),
		"inputOrder":  orderedViews,
		"results":     results,
	}, "", "  ")
	if err != nil {
		fatal(err)
	}
	reportPath := filepath.Join(*outputDir, "benchmark-results.json")
	if err := os.WriteFile(reportPath, append(report, '\n'), 0o644); err != nil {
		fatal(err)
	}
	fmt.Printf("Wrote %s\n", reportPath)
}

func (c *tripoClient) balance(ctx context.Context) (float64, float64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, tripoBaseURL+"/user/balance", nil)
	if err != nil {
		return 0, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	data, err := c.doJSON(req)
	if err != nil {
		return 0, 0, err
	}
	balance, balanceOK := data["balance"].(float64)
	frozen, frozenOK := data["frozen"].(float64)
	if !balanceOK || !frozenOK {
		return 0, 0, errors.New("tripo wallet response is missing balance fields")
	}
	return balance, frozen, nil
}

func (c *tripoClient) uploadImage(ctx context.Context, path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer func() { _ = file.Close() }()
	info, err := file.Stat()
	if err != nil {
		return "", err
	}
	if info.Size() <= 0 || info.Size() > maxImageBytes {
		return "", fmt.Errorf("image size %d is outside 1..%d bytes", info.Size(), maxImageBytes)
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filepath.Base(path))
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(part, file); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tripoBaseURL+"/upload/sts", &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	data, err := c.doJSON(req)
	if err != nil {
		return "", err
	}
	return requiredString(data, "image_token")
}

func (c *tripoClient) createTask(ctx context.Context, modelVersion string, tokens []string) (string, error) {
	files := make([]map[string]string, 0, len(tokens))
	for _, token := range tokens {
		files = append(files, map[string]string{"type": "png", "file_token": token})
	}
	payload := map[string]any{
		"type":          "multiview_to_model",
		"model_version": modelVersion,
		"files":         files,
		"texture":       true,
		"pbr":           true,
		"export_uv":     true,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tripoBaseURL+"/task", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	data, err := c.doJSON(req)
	if err != nil {
		return "", err
	}
	return requiredString(data, "task_id")
}

func (c *tripoClient) waitForTask(ctx context.Context, taskID string) (map[string]any, error) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, tripoBaseURL+"/task/"+url.PathEscape(taskID), nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
		data, err := c.doJSON(req)
		if err != nil {
			return nil, err
		}
		status, _ := data["status"].(string)
		progress, _ := data["progress"].(float64)
		fmt.Printf("  %s: %s %.0f%%\n", taskID, status, progress)
		switch status {
		case "success":
			output, ok := data["output"].(map[string]any)
			if !ok {
				return nil, errors.New("successful task has no output")
			}
			return output, nil
		case "failed", "banned", "expired", "cancelled":
			return nil, fmt.Errorf("tripo task ended with status %q", status)
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ticker.C:
		}
	}
}

func (c *tripoClient) downloadModel(ctx context.Context, rawURL, path string) (int64, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" {
		return 0, errors.New("tripo returned an invalid or non-HTTPS model URL")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return 0, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("model download returned HTTP %d", resp.StatusCode)
	}
	tmp := path + ".partial"
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return 0, err
	}
	written, copyErr := io.Copy(out, io.LimitReader(resp.Body, maxModelBytes+1))
	closeErr := out.Close()
	if copyErr != nil {
		return 0, copyErr
	}
	if closeErr != nil {
		return 0, closeErr
	}
	if written > maxModelBytes {
		_ = os.Remove(tmp)
		return 0, errors.New("model exceeds the 250 MB download limit")
	}
	if err := os.Rename(tmp, path); err != nil {
		return 0, err
	}
	return written, nil
}

func (c *tripoClient) doJSON(req *http.Request) (map[string]any, error) {
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	limited, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	var envelope map[string]any
	if err := json.Unmarshal(limited, &envelope); err != nil {
		return nil, fmt.Errorf("tripo returned HTTP %d with invalid JSON", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tripo returned HTTP %d: %v", resp.StatusCode, envelope["message"])
	}
	if code, ok := envelope["code"].(float64); ok && code != 0 {
		return nil, fmt.Errorf("tripo error %.0f: %v", code, envelope["message"])
	}
	data, ok := envelope["data"].(map[string]any)
	if !ok {
		return nil, errors.New("tripo response has no data object")
	}
	return data, nil
}

func requiredString(data map[string]any, key string) (string, error) {
	value, ok := data[key].(string)
	if !ok || value == "" {
		return "", fmt.Errorf("tripo response has no %s", key)
	}
	return value, nil
}

func selectModelURL(output map[string]any) (string, error) {
	for _, key := range []string{"pbr_model", "model", "base_model"} {
		if value, ok := output[key].(string); ok && value != "" {
			return value, nil
		}
	}
	return "", errors.New("task output contains no downloadable model")
}

func splitNonEmpty(value string) []string {
	var values []string
	for _, item := range strings.Split(value, ",") {
		if item = strings.TrimSpace(item); item != "" {
			values = append(values, item)
		}
	}
	return values
}

func safeName(value string) string {
	return strings.NewReplacer("/", "-", "\\", "-", ":", "-").Replace(value)
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "tripo-avatar-benchmark:", err)
	os.Exit(1)
}
