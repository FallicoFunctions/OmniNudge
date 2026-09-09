// Command zz_runpod_template reads and repoints RunPod serverless templates.
//
// A pushed tag changes nothing until the template names it. This is the step
// the README keeps warning about, done from a terminal instead of a console so
// the before and after are both recorded.
//
// Not a test. It mutates deployed infrastructure.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/omninudge/backend/internal/config"
)

const endpoint = "https://api.runpod.io/graphql"

// template carries every field saveTemplate accepts, because the mutation
// replaces the record rather than patching it. Sending three fields would
// repoint the image and drop the container disk, the volume and the
// environment with it -- the 60 GB disk and 1800 s timeout this template needs
// are exactly the kind of thing that would vanish without a word.
type template struct {
	ID                      string        `json:"id"`
	Name                    string        `json:"name"`
	ImageName               string        `json:"imageName"`
	ContainerDiskInGb       int           `json:"containerDiskInGb"`
	VolumeInGb              int           `json:"volumeInGb"`
	VolumeMountPath         string        `json:"volumeMountPath"`
	DockerArgs              string        `json:"dockerArgs"`
	Ports                   string        `json:"ports"`
	IsServerless            bool          `json:"isServerless"`
	Readme                  string        `json:"readme"`
	ContainerRegistryAuthID *string       `json:"containerRegistryAuthId"`
	Env                     []templateEnv `json:"env"`
}

type templateEnv struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// templateInput resends everything the template already had, with one field
// changed.
func templateInput(t template, image string) map[string]any {
	env := make([]map[string]string, 0, len(t.Env))
	for _, e := range t.Env {
		env = append(env, map[string]string{"key": e.Key, "value": e.Value})
	}
	input := map[string]any{
		"id":                t.ID,
		"name":              t.Name,
		"imageName":         image,
		"containerDiskInGb": t.ContainerDiskInGb,
		"volumeInGb":        t.VolumeInGb,
		"volumeMountPath":   t.VolumeMountPath,
		"dockerArgs":        t.DockerArgs,
		"ports":             t.Ports,
		"isServerless":      t.IsServerless,
		"readme":            t.Readme,
		"env":               env,
	}
	if t.ContainerRegistryAuthID != nil {
		input["containerRegistryAuthId"] = *t.ContainerRegistryAuthID
	}
	return input
}

func main() {
	list := flag.Bool("list", false, "print every template and change nothing")
	id := flag.String("id", "", "the template to repoint")
	image := flag.String("image", "", "the image the template should run")
	flag.Parse()

	if err := run(context.Background(), *list, *id, *image); err != nil {
		fmt.Fprintln(os.Stderr, "zz_runpod_template:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, list bool, id, image string) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	key := strings.TrimSpace(cfg.OmniChatMedia.RunPodAPIKey)
	if key == "" {
		return fmt.Errorf("RUNPOD_API_KEY is not set")
	}

	if list || id == "" {
		templates, err := readTemplates(ctx, key)
		if err != nil {
			return err
		}
		fmt.Printf("%-16s %-24s %-46s %-5s %-5s %s\n", "ID", "NAME", "IMAGE", "DISK", "VOL", "ENV")
		for _, t := range templates {
			fmt.Printf("%-16s %-24s %-46s %-5d %-5d %d\n",
				t.ID, t.Name, t.ImageName, t.ContainerDiskInGb, t.VolumeInGb, len(t.Env))
		}
		if id == "" && !list {
			return fmt.Errorf("--id is required to repoint (try --list)")
		}
		return nil
	}
	if strings.TrimSpace(image) == "" {
		return fmt.Errorf("--image is required with --id")
	}

	before, err := readTemplates(ctx, key)
	if err != nil {
		return err
	}
	var target *template
	for i := range before {
		if before[i].ID == id {
			target = &before[i]
		}
	}
	if target == nil {
		return fmt.Errorf("no template with id %q", id)
	}
	fmt.Printf("before: %s (%s) -> %s\n", target.Name, target.ID, target.ImageName)
	if target.ImageName == image {
		fmt.Println("already pointing there; nothing to do")
		return nil
	}

	if err := saveTemplate(ctx, key, *target, image); err != nil {
		return err
	}

	after, err := readTemplates(ctx, key)
	if err != nil {
		return err
	}
	for _, t := range after {
		if t.ID == id {
			fmt.Printf("after:  %s (%s) -> %s\n", t.Name, t.ID, t.ImageName)
			if t.ImageName != image {
				return fmt.Errorf("the template still reads %q", t.ImageName)
			}
		}
	}
	return nil
}

func readTemplates(ctx context.Context, key string) ([]template, error) {
	var out struct {
		Data struct {
			Myself struct {
				PodTemplates []template `json:"podTemplates"`
			} `json:"myself"`
		} `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := call(ctx, key, map[string]any{
		"query": `query { myself { podTemplates {
			id name imageName containerDiskInGb volumeInGb volumeMountPath
			dockerArgs ports isServerless readme containerRegistryAuthId
			env { key value }
		} } }`,
	}, &out); err != nil {
		return nil, err
	}
	if len(out.Errors) > 0 {
		return nil, fmt.Errorf("runpod: %s", out.Errors[0].Message)
	}
	return out.Data.Myself.PodTemplates, nil
}

func saveTemplate(ctx context.Context, key string, t template, image string) error {
	var out struct {
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	err := call(ctx, key, map[string]any{
		"query": `mutation Save($input: SaveTemplateInput!) {
			saveTemplate(input: $input) { id name imageName }
		}`,
		"variables": map[string]any{"input": templateInput(t, image)},
	}, &out)
	if err != nil {
		return err
	}
	if len(out.Errors) > 0 {
		return fmt.Errorf("runpod: %s", out.Errors[0].Message)
	}
	return nil
}

func call(ctx context.Context, key string, body any, into any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+key)
	response, err := (&http.Client{Timeout: 30 * time.Second}).Do(request)
	if err != nil {
		return err
	}
	defer func() { _ = response.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("runpod returned HTTP %d: %s", response.StatusCode, strings.TrimSpace(string(raw)))
	}
	return json.Unmarshal(raw, into)
}
