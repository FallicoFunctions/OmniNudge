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
	"os"
	"time"

	"github.com/google/uuid"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/queue"
)

func main() {
	list := flag.Bool("list", false, "print stills that can be animated, and do nothing else")
	asset := flag.String("asset", "", "the image asset id to animate")
	prompt := flag.String("prompt", "she blinks and turns her head slightly", "motion prompt")
	seconds := flag.Int("seconds", 5, "clip length")
	timeout := flag.Duration("timeout", 30*time.Minute, "how long to wait")
	flag.Parse()

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
		if status == "completed" || status == "failed" {
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
