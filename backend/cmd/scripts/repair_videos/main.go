package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
)

type candidate struct {
	id       int
	mediaURL string
}

type redditInfoResponse struct {
	Data struct {
		Children []struct {
			Data struct {
				Media       *redditMedia   `json:"media"`
				SecureMedia *redditMedia   `json:"secure_media"`
				Preview     *redditPreview `json:"preview"`
			} `json:"data"`
		} `json:"children"`
	} `json:"data"`
}

type redditMedia struct {
	RedditVideo *redditVideo `json:"reddit_video"`
}

type redditVideo struct {
	FallbackURL string `json:"fallback_url"`
	HLSURL      string `json:"hls_url"`
}

type redditPreview struct {
	Images []struct {
		Source struct {
			URL string `json:"url"`
		} `json:"source"`
	} `json:"images"`
}

func main() {
	dryRun := flag.Bool("dry-run", true, "only print updates without writing")
	limit := flag.Int("limit", 0, "limit number of updates (0 = no limit)")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		panic(err)
	}
	defer db.Close()

	ctx := context.Background()
	rows, err := db.Pool.Query(ctx, `
		SELECT id, media_url
		FROM platform_posts
		WHERE (
			media_url ILIKE 'http%://v.redd.it/%'
			OR media_url ILIKE 'http%://v.redd.it/%/DASH_%'
			OR media_url ILIKE 'http%://v.redd.it/%/DASH_%?%'
		)
		ORDER BY id ASC
	`)
	if err != nil {
		panic(err)
	}
	defer rows.Close()

	var candidates []candidate
	for rows.Next() {
		var c candidate
		if err := rows.Scan(&c.id, &c.mediaURL); err != nil {
			panic(err)
		}
		candidates = append(candidates, c)
	}
	if err := rows.Err(); err != nil {
		panic(err)
	}

	if len(candidates) == 0 {
		fmt.Println("No v.redd.it posts found to repair.")
		return
	}

	client := &http.Client{Timeout: 10 * time.Second}
	updated := 0

	for _, c := range candidates {
		if *limit > 0 && updated >= *limit {
			break
		}

		base := extractVideoBase(c.mediaURL)
		if base == "" {
			fmt.Printf("SKIP %d: could not parse video id from %s\n", c.id, c.mediaURL)
			continue
		}

		videoURL := findPlayableMP4(client, base)
		var thumbnailURL string
		if videoURL == "" {
			videoURL, thumbnailURL = findPlayableFromRedditInfo(client, base)
		}
		if videoURL == "" {
			fmt.Printf("SKIP %d: no playable video found for %s\n", c.id, c.mediaURL)
			continue
		}
		if thumbnailURL == "" {
			_, thumbnailURL = findPlayableFromRedditInfo(client, base)
		}
		thumbnailURL = strings.TrimSpace(thumbnailURL)

		localThumbnail := ""
		if thumbnailURL != "" {
			if stored, err := downloadAndStoreThumbnail(client, thumbnailURL); err == nil {
				localThumbnail = stored
			}
		}

		if *dryRun {
			fmt.Printf("DRY RUN %d: %s -> %s\n", c.id, c.mediaURL, videoURL)
		} else {
			_, err := db.Pool.Exec(ctx, `
				UPDATE platform_posts
				SET media_url = $1, media_type = 'video', thumbnail_url = COALESCE($2, thumbnail_url)
				WHERE id = $3
			`, videoURL, nullIfEmpty(localThumbnail), c.id)
			if err != nil {
				fmt.Printf("ERROR %d: %v\n", c.id, err)
				continue
			}
			fmt.Printf("UPDATED %d: %s -> %s\n", c.id, c.mediaURL, videoURL)
		}
		updated++
	}
}

func extractVideoBase(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if u.Host == "" {
		// raw might be missing scheme
		u, err = url.Parse("https://" + strings.TrimPrefix(raw, "//"))
		if err != nil {
			return ""
		}
	}
	if !strings.Contains(u.Host, "v.redd.it") {
		return ""
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		return ""
	}
	return "https://v.redd.it/" + parts[0]
}

func findPlayableMP4(client *http.Client, base string) string {
	candidates := []string{
		base + "/HLSPlaylist.m3u8",
		base + "/DASH_1080.mp4",
		base + "/DASH_720.mp4",
		base + "/DASH_480.mp4",
		base + "/DASH_360.mp4",
		base + "/DASH_240.mp4",
		base + "/HLSPlaylist.m3u8?source=fallback",
		base + "/DASH_1080.mp4?source=fallback",
		base + "/DASH_720.mp4?source=fallback",
		base + "/DASH_480.mp4?source=fallback",
		base + "/DASH_360.mp4?source=fallback",
		base + "/DASH_240.mp4?source=fallback",
	}

	for _, c := range candidates {
		if urlOK(client, c) {
			return c
		}
	}
	return ""
}

func findPlayableFromRedditInfo(client *http.Client, raw string) (string, string) {
	infoURL := "https://www.reddit.com/api/info.json?url=" + url.QueryEscape(raw)
	req, err := http.NewRequest("GET", infoURL, nil)
	if err != nil {
		return "", ""
	}
	req.Header.Set("User-Agent", "OmniNudge-Agent/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return "", ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", ""
	}

	var info redditInfoResponse
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", ""
	}
	if len(info.Data.Children) == 0 {
		return "", ""
	}
	post := info.Data.Children[0].Data
	thumb := extractPreviewURL(post.Preview)
	if post.SecureMedia != nil && post.SecureMedia.RedditVideo != nil && post.SecureMedia.RedditVideo.HLSURL != "" {
		return post.SecureMedia.RedditVideo.HLSURL, thumb
	}
	if post.Media != nil && post.Media.RedditVideo != nil && post.Media.RedditVideo.HLSURL != "" {
		return post.Media.RedditVideo.HLSURL, thumb
	}
	if post.SecureMedia != nil && post.SecureMedia.RedditVideo != nil && post.SecureMedia.RedditVideo.FallbackURL != "" {
		return post.SecureMedia.RedditVideo.FallbackURL, thumb
	}
	if post.Media != nil && post.Media.RedditVideo != nil && post.Media.RedditVideo.FallbackURL != "" {
		return post.Media.RedditVideo.FallbackURL, thumb
	}
	return "", thumb
}

func extractPreviewURL(preview *redditPreview) string {
	if preview == nil || len(preview.Images) == 0 {
		return ""
	}
	return html.UnescapeString(preview.Images[0].Source.URL)
}

func nullIfEmpty(s string) *string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return &s
}

func downloadAndStoreThumbnail(client *http.Client, rawURL string) (string, error) {
	decoded := html.UnescapeString(rawURL)
	req, err := http.NewRequest("GET", decoded, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "OmniNudge-Agent/1.0")
	req.Header.Set("Referer", "https://www.reddit.com/")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("thumbnail fetch status %d", resp.StatusCode)
	}

	if err := os.MkdirAll("uploads", 0o755); err != nil {
		return "", err
	}

	ext := path.Ext(resp.Request.URL.Path)
	if ext == "" {
		ext = ".jpg"
	}
	filename := fmt.Sprintf("thumb_%d%s", time.Now().UnixNano(), ext)
	storagePath := filepath.Join("uploads", filename)

	out, err := os.Create(storagePath)
	if err != nil {
		return "", err
	}
	defer out.Close()

	if _, err := io.Copy(out, resp.Body); err != nil {
		_ = os.Remove(storagePath)
		return "", err
	}

	return "/uploads/" + filename, nil
}

func urlOK(client *http.Client, target string) bool {
	req, err := http.NewRequest("GET", target, nil)
	if err != nil {
		return false
	}
	req.Header.Set("User-Agent", "OmniNudge-Agent/1.0")
	req.Header.Set("Range", "bytes=0-1")

	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusPartialContent
}
