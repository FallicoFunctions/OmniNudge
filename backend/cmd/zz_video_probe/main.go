// Command zz_video_probe animates one stored still and prints what rendered it.
//
// It exists for a narrow question the whole test suite cannot answer: does a
// video render record the checkpoint it used. The image path proved that
// model_id was declared, decoded by nothing and stored nowhere; the fix is
// shared, but the video worker was five tags behind and had never run it, and
// a deployed tag is not something a unit test can see.
//
// Not a test. It spends GPU money and leaves rows behind.
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/queue"
	"github.com/omninudge/backend/internal/services"
)

func main() {
	list := flag.Bool("list", false, "print stills that can be animated, and do nothing else")
	asset := flag.String("asset", "", "the image asset id to animate")
	prompt := flag.String("prompt", "she blinks and turns her head slightly", "motion prompt")
	seconds := flag.Int("seconds", 5, "clip length")
	timeout := flag.Duration("timeout", 30*time.Minute, "how long to wait")
	save := flag.String("save", "", "download the clips this job produced into this directory, and do nothing else")
	jobID := flag.String("job", "", "the job to save from (with --save)")
	clips := flag.Bool("clips", false, "list rendered video clips, and do nothing else")
	flag.Parse()

	if *clips {
		if err := listClips(); err != nil {
			fmt.Fprintln(os.Stderr, "zz_video_probe:", err)
			os.Exit(1)
		}
		return
	}
	if strings.TrimSpace(*save) != "" {
		if err := saveClip(*jobID, *save); err != nil {
			fmt.Fprintln(os.Stderr, "zz_video_probe:", err)
			os.Exit(1)
		}
		return
	}

	if err := run(*list, *asset, *prompt, *seconds, *timeout); err != nil {
		fmt.Fprintln(os.Stderr, "zz_video_probe:", err)
		os.Exit(1)
	}
}

func run(list bool, assetID, prompt string, seconds int, timeout time.Duration) error {
	ctx := context.Background()
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		return err
	}
	defer db.Close()

	if list {
		return listStills(ctx, db)
	}
	if assetID == "" {
		return fmt.Errorf("--asset is required (try --list)")
	}
	id, err := uuid.Parse(assetID)
	if err != nil {
		return fmt.Errorf("bad asset id: %w", err)
	}

	var owner, persona int
	err = db.Pool.QueryRow(ctx, `
		SELECT owner_user_id, persona_id FROM omnichat_media_assets WHERE id = $1`, id).
		Scan(&owner, &persona)
	if err != nil {
		return fmt.Errorf("look up asset: %w", err)
	}

	media := models.NewOmniChatMediaRepository(db.Pool)
	enqueuer := queue.NewQueueClient(cfg.Redis.Addr, cfg.Redis.Password)
	if enqueuer == nil {
		return fmt.Errorf("no redis")
	}

	free := false
	job, err := media.CreateGenerationJob(ctx, owner, models.OmniChatGenerationRequest{
		Kind:            models.OmniChatMediaKindVideo,
		Mode:            models.OmniChatGenerationModeImageToVideo,
		PersonaID:       persona,
		SourceAssetID:   &id,
		Prompt:          prompt,
		EffectivePrompt: prompt,
		AspectRatio:     "9:16",
		DurationSeconds: seconds,
		BillingRequired: &free,
	}, cfg.OmniChatMedia.Provider)
	if err != nil {
		return fmt.Errorf("create job: %w", err)
	}
	if err := enqueuer.EnqueueOmniChatGeneration(ctx, job.ID); err != nil {
		return fmt.Errorf("enqueue: %w", err)
	}
	fmt.Printf("job %s queued (persona %d, owner %d, source %s)\n", job.ID, persona, owner, id)

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		time.Sleep(15 * time.Second)
		var status, meta, errCode string
		err := db.Pool.QueryRow(ctx, `
			SELECT status, COALESCE(provider_metadata::text, ''), COALESCE(error_code, '')
			  FROM omnichat_generation_jobs WHERE id = $1`, job.ID).Scan(&status, &meta, &errCode)
		if err != nil {
			return err
		}
		fmt.Printf("  %s  %s %s\n", time.Now().Format("15:04:05"), status, errCode)
		// "succeeded", not "completed". The first version of this loop watched
		// for the wrong word and polled a finished job for twenty-five minutes,
		// which looks exactly like work still in progress.
		if status == "succeeded" || status == "failed" || status == "cancelled" {
			return report(ctx, db, job.ID)
		}
	}
	return fmt.Errorf("timed out after %s", timeout)
}

func listStills(ctx context.Context, db *database.DB) error {
	rows, err := db.Pool.Query(ctx, `
		SELECT a.id, a.persona_id, a.owner_user_id, a.created_at
		  FROM omnichat_media_assets a
		 WHERE a.kind = 'image'
		 ORDER BY a.created_at DESC
		 LIMIT 15`)
	if err != nil {
		return err
	}
	defer rows.Close()
	fmt.Printf("%-38s %-8s %-6s %s\n", "ASSET", "PERSONA", "OWNER", "CREATED")
	for rows.Next() {
		var id uuid.UUID
		var persona, owner int
		var created time.Time
		if err := rows.Scan(&id, &persona, &owner, &created); err != nil {
			return err
		}
		fmt.Printf("%-38s %-8d %-6d %s\n", id, persona, owner, created.Format("2006-01-02 15:04"))
	}
	return rows.Err()
}

func report(ctx context.Context, db *database.DB, jobID uuid.UUID) error {
	// Provenance is merged into the job's provider_metadata, not stored on the
	// asset. Reading the wrong column returned "does not exist" rather than an
	// empty string, which is the only reason this probe did not quietly report
	// a missing model_id as a finding.
	var status, errCode, meta, build, model string
	err := db.Pool.QueryRow(ctx, `
		SELECT status,
		       COALESCE(error_code, ''),
		       COALESCE(provider_metadata::text, '(none)'),
		       COALESCE(provider_metadata->>'worker_build', ''),
		       COALESCE(provider_metadata->>'model_id', '')
		  FROM omnichat_generation_jobs
		 WHERE id = $1`, jobID).Scan(&status, &errCode, &meta, &build, &model)
	if err != nil {
		return err
	}
	fmt.Printf("\nstatus:       %s %s\n", status, errCode)
	fmt.Printf("worker_build: %s\n", orMissing(build))
	fmt.Printf("model_id:     %s\n", orMissing(model))
	fmt.Printf("metadata:     %s\n", meta)
	return nil
}

func orMissing(v string) string {
	if v == "" {
		return "(MISSING)"
	}
	return v
}

func openDB() (*database.DB, *config.Config, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, nil, err
	}
	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		return nil, nil, err
	}
	return db, cfg, nil
}

func listClips() error {
	ctx := context.Background()
	db, _, err := openDB()
	if err != nil {
		return err
	}
	defer db.Close()
	rows, err := db.Pool.Query(ctx, `
		SELECT j.id, j.created_at,
		       COALESCE(j.provider_metadata->>'worker_build', '(none)'),
		       COALESCE(j.provider_metadata->>'model_id', '(none)')
		  FROM omnichat_generation_jobs j
		 WHERE j.kind = 'video' AND j.status = 'succeeded'
		 ORDER BY j.created_at DESC LIMIT 12`)
	if err != nil {
		return err
	}
	defer rows.Close()
	fmt.Printf("%-38s %-18s %-8s %s\n", "JOB", "CREATED", "BUILD", "MODEL")
	for rows.Next() {
		var id uuid.UUID
		var created time.Time
		var build, model string
		if err := rows.Scan(&id, &created, &build, &model); err != nil {
			return err
		}
		fmt.Printf("%-38s %-18s %-8s %s\n", id, created.Format("2006-01-02 15:04"), build, model)
	}
	return rows.Err()
}

func saveClip(jobID, dir string) error {
	ctx := context.Background()
	db, cfg, err := openDB()
	if err != nil {
		return err
	}
	defer db.Close()

	var storage services.StorageService
	if cfg.Storage.StorageBackend == "s3" {
		if storage, err = services.NewS3StorageService(cfg); err != nil {
			return fmt.Errorf("s3: %w", err)
		}
	} else if storage, err = services.NewLocalStorageService("./uploads", cfg.FrontendURL+"/uploads"); err != nil {
		return fmt.Errorf("local storage: %w", err)
	}

	id, err := uuid.Parse(jobID)
	if err != nil {
		return fmt.Errorf("bad job id: %w", err)
	}
	var path, fileType string
	err = db.Pool.QueryRow(ctx, `
		SELECT mf.storage_path, mf.file_type
		  FROM omnichat_generation_jobs j
		  JOIN omnichat_media_assets a ON a.id = j.output_asset_id
		  JOIN media_files mf ON mf.id = a.media_file_id
		 WHERE j.id = $1`, id).Scan(&path, &fileType)
	if err != nil {
		return fmt.Errorf("locate the clip: %w", err)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	body, err := storage.Download(ctx, path)
	if err != nil {
		return fmt.Errorf("download %s: %w", path, err)
	}
	defer body.Close()
	name := dir + "/" + jobID[:8] + "-" + path[strings.LastIndex(path, "/")+1:]
	out, err := os.Create(name)
	if err != nil {
		return err
	}
	n, copyErr := io.Copy(out, body)
	_ = out.Close()
	if copyErr != nil {
		return copyErr
	}
	fmt.Printf("%s  (%d KB, %s)\n", name, n/1024, fileType)
	return nil
}
