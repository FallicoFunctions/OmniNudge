package linkpreview

import (
	"io"
	"net/url"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

type ParsedMetadata struct {
	Title       string
	Description string
	SiteName    string
	ImageURL    string
}

func parseHTML(baseURL string, body io.Reader) (*ParsedMetadata, error) {
	doc, err := goquery.NewDocumentFromReader(body)
	if err != nil {
		return nil, err
	}

	meta := &ParsedMetadata{
		Title: firstNonEmpty(
			metaContent(doc, "property", "og:title"),
			metaContent(doc, "name", "twitter:title"),
			strings.TrimSpace(doc.Find("title").First().Text()),
		),
		Description: firstNonEmpty(
			metaContent(doc, "property", "og:description"),
			metaContent(doc, "name", "twitter:description"),
			metaContent(doc, "name", "description"),
		),
		SiteName: firstNonEmpty(
			metaContent(doc, "property", "og:site_name"),
			hostnameFromURL(baseURL),
		),
	}

	meta.ImageURL = firstNonEmpty(
		resolveURL(baseURL, metaContent(doc, "property", "og:image")),
		resolveURL(baseURL, metaContent(doc, "name", "twitter:image")),
		firstUsableImageURL(doc, baseURL),
	)

	return meta, nil
}

func metaContent(doc *goquery.Document, attrName, attrValue string) string {
	content, _ := doc.Find("meta").FilterFunction(func(_ int, selection *goquery.Selection) bool {
		value, exists := selection.Attr(attrName)
		return exists && strings.EqualFold(strings.TrimSpace(value), attrValue)
	}).First().Attr("content")
	return strings.TrimSpace(content)
}

func firstUsableImageURL(doc *goquery.Document, baseURL string) string {
	var selected string
	doc.Find("img").EachWithBreak(func(_ int, selection *goquery.Selection) bool {
		width := parseDimension(selection.AttrOr("width", ""))
		height := parseDimension(selection.AttrOr("height", ""))
		if (width > 0 && width < 16) || (height > 0 && height < 16) {
			return true
		}

		candidates := []string{
			selection.AttrOr("src", ""),
			selection.AttrOr("data-src", ""),
			firstSrcsetEntry(selection.AttrOr("srcset", "")),
			firstSrcsetEntry(selection.AttrOr("data-srcset", "")),
		}
		for _, candidate := range candidates {
			resolved := resolveURL(baseURL, candidate)
			if resolved == "" {
				continue
			}
			selected = resolved
			return false
		}

		return true
	})
	return selected
}

func firstSrcsetEntry(srcset string) string {
	if strings.TrimSpace(srcset) == "" {
		return ""
	}
	first := strings.Split(srcset, ",")[0]
	fields := strings.Fields(strings.TrimSpace(first))
	if len(fields) == 0 {
		return ""
	}
	return fields[0]
}

func parseDimension(value string) int {
	if value == "" {
		return 0
	}
	trimmed := strings.TrimSpace(strings.TrimSuffix(strings.ToLower(value), "px"))
	n, err := strconv.Atoi(trimmed)
	if err != nil {
		return 0
	}
	return n
}

func resolveURL(baseURL string, raw string) string {
	candidate := strings.TrimSpace(raw)
	if candidate == "" {
		return ""
	}

	base, err := url.Parse(baseURL)
	if err != nil {
		return ""
	}
	ref, err := url.Parse(candidate)
	if err != nil {
		return ""
	}

	resolved := base.ResolveReference(ref)
	if resolved.Scheme != "http" && resolved.Scheme != "https" {
		return ""
	}
	return resolved.String()
}

func hostnameFromURL(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return parsed.Hostname()
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
