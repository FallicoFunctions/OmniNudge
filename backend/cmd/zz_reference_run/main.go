// Command zz_reference_run drives one character all the way through the
// identity pipeline, against the real database, the real queue and the real
// endpoint.
//
// It exists because the reference set is the one path nothing has ever
// exercised. The four candidates are reachable from a render harness; the six
// references are not, because they only start when somebody picks, and a pick
// needs a persona, a stored candidate and a signed URL the worker can fetch.
// So the plainness rewrite those prompts got has never drawn a picture, and a
// bad reference set is the most expensive defect available here -- every later
// image of her is conditioned on it, and nothing shows the fault until it does.
//
// Not a test. It spends money and leaves rows behind, and the point is the
// pictures at the end.
package main

import (
	"context"
	"encoding/json"
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
	"github.com/omninudge/backend/internal/services/openrouter"
)

func main() {
	owner := flag.Int("owner", 0, "user id who owns her (required)")
	name := flag.String("name", "", "her name (required)")
	personaID := flag.Int("persona", 0, "skip creation and use this persona")
	pick := flag.Int("pick", 0, "which of the four to pick, 1-4 (default 1)")
	timeout := flag.Duration("timeout", 25*time.Minute, "how long to wait for each stage")
	list := flag.Bool("list", false, "print the OmniAI characters that already exist, and do nothing else")
	save := flag.String("save", "", "download her stored references into this directory and do nothing else")
	redo := flag.Bool("redo-references", false, "drop her supporting references, keep the anchor, and render the five again")
	flag.Parse()

	if strings.TrimSpace(*save) != "" {
		if err := saveReferences(*personaID, *save); err != nil {
			fmt.Fprintln(os.Stderr, "zz_reference_run:", err)
			os.Exit(1)
		}
		return
	}
	if *redo {
		if err := redoReferences(*personaID, *owner, *timeout); err != nil {
			fmt.Fprintln(os.Stderr, "zz_reference_run:", err)
			os.Exit(1)
		}
		return
	}
	if *list {
		if err := listOmniAI(); err != nil {
			fmt.Fprintln(os.Stderr, "zz_reference_run:", err)
			os.Exit(1)
		}
		return
	}

	if err := run(*owner, *name, *personaID, *pick, *timeout); err != nil {
		fmt.Fprintln(os.Stderr, "zz_reference_run:", err)
		os.Exit(1)
	}
}

// listOmniAI says who already exists, so a run can reuse a character instead of
// creating one and spending the entitlement a new one costs.
func listOmniAI() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		return err
	}
	defer db.Close()

	rows, err := db.Pool.Query(context.Background(), `
		SELECT p.id, p.name, p.owner_user_id, u.plan,
		       COALESCE(p.extensions_json #>> '{omnichat_media,appearance}', ''),
		       COALESCE(jsonb_array_length(p.extensions_json #> '{omnichat_media,reference_urls}'), 0)
		  FROM bot_personas p
		  LEFT JOIN users u ON u.id = p.owner_user_id
		 WHERE p.response_style_profile = 'direct_message'
		 ORDER BY p.id DESC LIMIT 20`)
	if err != nil {
		return err
	}
	defer rows.Close()
	fmt.Printf("%-5s %-18s %-7s %-10s %-5s %s\n", "ID", "NAME", "OWNER", "PLAN", "REFS", "APPEARANCE")
	for rows.Next() {
		var id, ownerID, refs int
		var name, plan, appearance string
		if err := rows.Scan(&id, &name, &ownerID, &plan, &appearance, &refs); err != nil {
			return err
		}
		fmt.Printf("%-5d %-18s %-7d %-10s %-5d %s\n", id, trunc(name, 18), ownerID, plan, refs, trunc(appearance, 60))
	}
	return rows.Err()
}

func trunc(v string, n int) string {
	if len([]rune(v)) <= n {
		return v
	}
	return string([]rune(v)[:n-1]) + "\u2026"
}

// saveReferences pulls her stored pictures out through the app's own storage
// service, which is the only way to look at them: the worker uploads to the
// object store and the paths on her profile are keys, not files on this disk.
func saveReferences(personaID int, dir string) error {
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

	var storage services.StorageService
	if cfg.Storage.StorageBackend == "s3" {
		if storage, err = services.NewS3StorageService(cfg); err != nil {
			return fmt.Errorf("s3: %w", err)
		}
	} else if storage, err = services.NewLocalStorageService("./uploads", cfg.FrontendURL+"/uploads"); err != nil {
		return fmt.Errorf("local storage: %w", err)
	}

	persona, err := models.NewBotPersonaRepository(db.Pool).GetByID(ctx, personaID)
	if err != nil {
		return err
	}
	profile := services.ResolveOmniChatMediaIdentityProfile(persona)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	for i, ref := range profile.ReferenceURLs {
		key := strings.TrimPrefix(ref, "/uploads/")
		if j := strings.Index(key, "?"); j > 0 {
			key = key[:j]
		}
		body, err := storage.Download(ctx, key)
		if err != nil {
			fmt.Printf("  %d. FAILED %s: %v\n", i+1, key, err)
			continue
		}
		name := fmt.Sprintf("%02d-%s", i+1, key[strings.LastIndex(key, "/")+1:])
		out, err := os.Create(dir + "/" + name)
		if err != nil {
			_ = body.Close()
			return err
		}
		n, copyErr := io.Copy(out, body)
		_ = out.Close()
		_ = body.Close()
		if copyErr != nil {
			return copyErr
		}
		fmt.Printf("  %d. %s  (%d KB)\n", i+1, name, n/1024)
	}
	return nil
}

// redoReferences renders the five supporting references again.
//
// The anchor is kept and everything after it dropped, because the list is
// capped at six and a full one silently appends nothing -- so a second run
// against a finished character renders five pictures and stores none of them,
// which reads as the renders having failed.
//
// It writes to her profile, which is why it is a flag nobody reaches by
// accident. This is for a test character.
func redoReferences(personaID, owner int, timeout time.Duration) error {
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

	personas := models.NewBotPersonaRepository(db.Pool)
	persona, err := personas.GetByID(ctx, personaID)
	if err != nil {
		return err
	}
	profile := services.ResolveOmniChatMediaIdentityProfile(persona)
	if len(profile.ReferenceURLs) == 0 {
		return fmt.Errorf("persona %d has no anchor to render references from", personaID)
	}
	anchor := profile.ReferenceURLs[0]
	fmt.Printf("anchor kept:   %s\n", shorten(anchor))
	fmt.Printf("dropping:      %d supporting references\n\n", len(profile.ReferenceURLs)-1)

	if _, err := db.Pool.Exec(ctx, `
		UPDATE bot_personas
		   SET extensions_json = jsonb_set(extensions_json, '{omnichat_media,reference_urls}', $2::jsonb),
		       updated_at = CURRENT_TIMESTAMP
		 WHERE id = $1`, personaID, `["`+anchor+`"]`); err != nil {
		return fmt.Errorf("reset her references: %w", err)
	}

	media := models.NewOmniChatMediaRepository(db.Pool)
	enqueuer := queue.NewQueueClient(cfg.Redis.Addr, cfg.Redis.Password)
	likeness := services.NewOmniChatOmniAILikenessService(media, enqueuer, cfg.OmniChatMedia.Provider)

	persona, err = personas.GetByID(ctx, personaID)
	if err != nil {
		return err
	}
	jobs, err := likeness.StartReferences(ctx, persona, anchor)
	if err != nil {
		return fmt.Errorf("start references: %w", err)
	}
	if err := await(ctx, media, jobs, timeout); err != nil {
		return err
	}
	after, err := personas.GetByID(ctx, personaID)
	if err != nil {
		return err
	}
	final := services.ResolveOmniChatMediaIdentityProfile(after)
	fmt.Printf("\nreference urls now: %d\n", len(final.ReferenceURLs))
	return nil
}

func run(owner int, name string, personaID, pick int, timeout time.Duration) error {
	ctx := context.Background()
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer db.Close()

	personas := models.NewBotPersonaRepository(db.Pool)
	media := models.NewOmniChatMediaRepository(db.Pool)
	enqueuer := queue.NewQueueClient(cfg.Redis.Addr, cfg.Redis.Password)
	if enqueuer == nil {
		return fmt.Errorf("no redis at %s", cfg.Redis.Addr)
	}

	briefModel := strings.TrimSpace(cfg.OpenRouter.ExtractionModel)
	if briefModel == "" {
		briefModel = strings.TrimSpace(cfg.OpenRouter.StandardFallback)
	}
	likeness := services.NewOmniChatOmniAILikenessService(
		media, enqueuer, cfg.OmniChatMedia.Provider,
	)
	if briefModel != "" && strings.TrimSpace(cfg.OpenRouter.APIKey) != "" {
		client := openrouter.NewClient(cfg.OpenRouter.APIKey, briefModel)
		likeness = likeness.SetCandidateBriefWriter(
			services.NewModelOmniAICandidateBriefWriter(client))
	}

	persona, err := findOrMake(ctx, cfg, db, personas, owner, name, personaID)
	if err != nil {
		return err
	}
	profile := services.ResolveOmniChatMediaIdentityProfile(persona)
	fmt.Printf("persona:   %d %s\n", persona.ID, persona.Name)
	fmt.Printf("appearance:%s\n", profile.Appearance)
	fmt.Printf("taste:     %s\n", orDash(profile.Style.Taste))
	fmt.Printf("signature: %s\n", orDash(profile.Style.SignatureItem))
	fmt.Printf("subject:   %s\n\n", orDash(profile.Subject))

	fmt.Println("== four candidates ==")
	jobs, err := likeness.Start(ctx, persona)
	if err != nil {
		return fmt.Errorf("start the four: %w", err)
	}
	if err := await(ctx, media, jobs, timeout); err != nil {
		return err
	}

	candidates, err := media.ListLikenessCandidates(ctx, persona.ID, owner)
	if err != nil {
		return fmt.Errorf("list candidates: %w", err)
	}
	fmt.Printf("stored: %d candidates\n", len(candidates))
	if len(candidates) == 0 {
		return fmt.Errorf("nothing was stored -- the adoption path did not run")
	}
	if pick < 1 || pick > len(candidates) {
		pick = 1
	}
	chosen := candidates[pick-1]

	fmt.Printf("\n== picking #%d (candidate %d) ==\n", pick, chosen.ID)
	asset, err := media.PickLikeness(ctx, persona.ID, owner, chosen.ID)
	if err != nil {
		return fmt.Errorf("pick: %w", err)
	}
	fmt.Printf("anchor asset: %s\n", asset.ID)

	fmt.Println("\n== five supporting references ==")
	refJobs, err := likeness.StartReferences(ctx, persona, asset.StorageURL)
	if err != nil {
		return fmt.Errorf("start references: %w", err)
	}
	if err := await(ctx, media, refJobs, timeout); err != nil {
		return err
	}

	after, err := personas.GetByID(ctx, persona.ID)
	if err != nil {
		return fmt.Errorf("re-read her: %w", err)
	}
	final := services.ResolveOmniChatMediaIdentityProfile(after)
	fmt.Printf("\nreference urls on her profile: %d (limit %d)\n",
		len(final.ReferenceURLs), final.ReferenceLimit)
	for i, u := range final.ReferenceURLs {
		fmt.Printf("  %d. %s\n", i+1, shorten(u))
	}
	fmt.Printf("\nher style survived the pick: taste=%q signature=%q\n",
		final.Style.Taste != "", final.Style.SignatureItem != "")
	return nil
}

// await waits for every job in the set to leave a running state.
func await(ctx context.Context, media *models.OmniChatMediaRepository, jobs []uuid.UUID, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	seen := map[uuid.UUID]string{}
	for {
		done := 0
		for _, id := range jobs {
			job, err := media.GetGenerationJobForProcessing(ctx, id)
			if err != nil {
				return fmt.Errorf("read job %s: %w", id, err)
			}
			status := string(job.Status)
			if seen[id] != status {
				seen[id] = status
				fmt.Printf("  %s -> %s%s\n", id.String()[:8], status, failureNote(job))
			}
			if status == string(models.OmniChatGenerationStatusSucceeded) ||
				status == string(models.OmniChatGenerationStatusFailed) ||
				status == string(models.OmniChatGenerationStatusCancelled) {
				done++
			}
		}
		if done == len(jobs) {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%d of %d jobs finished within %s", done, len(jobs), timeout)
		}
		time.Sleep(5 * time.Second)
	}
}

func failureNote(job *models.OmniChatGenerationJob) string {
	if job.ErrorCode == "" {
		return ""
	}
	return "  (" + job.ErrorCode + ")"
}

func findOrMake(
	ctx context.Context, cfg *config.Config, db *database.DB,
	personas *models.BotPersonaRepository, owner int, name string, personaID int,
) (*models.BotPersona, error) {
	if personaID > 0 {
		return personas.GetByID(ctx, personaID)
	}
	if owner <= 0 || strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("--owner and --name are required unless --persona is given")
	}
	creator := services.NewOmniChatOmniAICreator(personas, models.NewUserRepository(db.Pool))
	model := strings.TrimSpace(cfg.OpenRouter.ExtractionModel)
	if model != "" && strings.TrimSpace(cfg.OpenRouter.APIKey) != "" {
		creator = creator.SetStyleWriter(
			services.NewModelOmniAIStyleWriter(openrouter.NewClient(cfg.OpenRouter.APIKey, model)))
	}
	return creator.Create(ctx, owner, services.OmniAIAnswers{
		Name:         name,
		Temperaments: []string{"warm", "curious"},
		Interests:    []string{"music", "photography", "hiking"},
		Feeling:      "fond",
		Relationship: "friend",
		Appearance: services.OmniAIAppearance{
			Style: "realistic", Gender: "woman", Age: 28,
			Eyes: "brown", Build: "average",
		},
	})
}

func orDash(v string) string {
	if strings.TrimSpace(v) == "" {
		return "-"
	}
	return v
}

func shorten(u string) string {
	if i := strings.Index(u, "?"); i > 0 {
		return u[:i] + " (signed)"
	}
	return u
}

var _ = json.Marshal
