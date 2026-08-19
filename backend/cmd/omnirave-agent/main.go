// Command omnirave-agent keeps one character present in OmniRave.
//
// It is not a mind. It admits a character, connects it to the world, walks it
// around, reports honestly what it did, and does that again when the session
// ends -- which it always does, because a world token is good for five minutes
// and the world evicts the session when it expires. Renewal is the design, not
// a workaround for it: re-admitting is what re-asks whether this character is
// still allowed to be here, so a withdrawal or a sanction takes hold within one
// token lifetime.
//
// What it does have is a disposition, which it reads about itself and which
// colours three things: whether it goes out at all, how long it stays, and how
// it moves while it is there. That is arithmetic on traits the world already
// moved, and no model is asked anything at any point. See policy.go.
//
// Deciding what to say, and who to go and see by name, is cognition, and
// cognition is still deliberately not here.
package main

import (
	"context"
	"errors"
	"log"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/omninudge/backend/internal/omniraveworld/world"
)

const (
	// Transient trouble -- the world restarting, a dropped socket, the API
	// briefly unreachable -- clears quickly, so retry quickly and give up
	// ground slowly.
	transientBackoffBase = 2 * time.Second
	transientBackoffMax  = time.Minute
	// A refusal does not clear quickly. A character that has been withdrawn,
	// retired or sanctioned is refused every single time, and the only thing
	// retrying every two seconds achieves is load. Start a minute apart and
	// spread out to a quarter of an hour; the process stays up so that a
	// character which becomes admissible again is picked up without anyone
	// restarting anything.
	refusedBackoffBase = time.Minute
	refusedBackoffMax  = 15 * time.Minute
	// healthySession is how long a session has to last before the connection
	// path counts as working. Anything shorter and the transient backoff keeps
	// climbing, so a world that accepts connections and immediately drops them
	// is not hammered either.
	healthySession = 30 * time.Second
	// shutdownReportTimeout bounds the final report on the way out. A visit
	// that really happened is worth a couple of seconds to record, and no more
	// than that: SIGINT means leave.
	shutdownReportTimeout = 5 * time.Second
)

// agent is one character's driver.
type agent struct {
	cfg Config
	api *apiClient
	// walkable is the world's own definition of where a character may stand,
	// used so this process never asks for a step the server would refuse.
	walkable func(world.Vec3) bool
	now      func() time.Time

	transient *backoff
	refused   *backoff
	// rng is the character's own stream of choices. It is one stream, seeded
	// once, so a run started with a known seed makes the same decisions in the
	// same order -- which is what stops "it went out less" from being an
	// anecdote.
	rng *rand.Rand
}

func main() {
	cfg, err := LoadConfig(osGetenv)
	if err != nil {
		// Fail closed and loudly, the way the other binaries here do. An agent
		// that starts half-configured looks alive and is not.
		log.Fatal(err)
	}

	api, err := newAPIClient(cfg, &http.Client{Timeout: 15 * time.Second})
	if err != nil {
		log.Fatal(err)
	}

	worldConfig := world.DefaultConfig()
	seed := cfg.Seed
	if seed == 0 {
		seed = time.Now().UnixNano()
	}
	rng := rand.New(rand.NewSource(seed))
	runner := &agent{
		cfg:       cfg,
		api:       api,
		walkable:  worldConfig.Walkable.IsValid,
		now:       func() time.Time { return time.Now().UTC() },
		transient: newBackoff(transientBackoffBase, transientBackoffMax, rng.Float64),
		refused:   newBackoff(refusedBackoffBase, refusedBackoffMax, rng.Float64),
		rng:       rng,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	log.Printf("omnirave-agent: persona %d, api %s, world %s, origin %s",
		cfg.PersonaID, cfg.OmniGameAPIURL, cfg.WorldSocketURL, cfg.Origin)
	runner.run(ctx)
	log.Printf("omnirave-agent: stopped")
}

// run is the life of the character: read who it is, decide whether to go out,
// go, come home, and ask again.
//
// The disposition is read fresh each time round rather than held, because the
// last outing may well have changed it -- that is the circuit this closes.
func (a *agent) run(ctx context.Context) {
	for ctx.Err() == nil {
		self, err := a.api.disposition(ctx)
		if err != nil {
			// Not knowing who it is, is not a reason to stay in. Neutral is
			// what this agent was before it could read anything about itself,
			// so an unreachable disposition degrades to exactly that rather
			// than to a character that never leaves.
			log.Printf("omnirave-agent: could not read the character's disposition (%v); going out as neutral", err)
			self = disposition{}
		}

		if !self.goesOut(a.rng) {
			delay := self.timeAtHome(a.rng)
			log.Printf("omnirave-agent: persona %d is not going out this time; asking again in %s",
				a.cfg.PersonaID, delay.Round(time.Second))
			a.sleep(ctx, delay)
			continue
		}

		a.outing(ctx, self)
		if ctx.Err() != nil {
			return
		}
		a.sleep(ctx, self.timeAtHome(a.rng))
	}
}

// outing is one stretch of being in the world: admit, live, report, and admit
// again until the character has had enough.
//
// It is several sessions, not one. A world token lasts five minutes and the
// world ends the session when it expires, so what the budget actually decides
// is whether the next admission happens -- the agent used to answer that with
// an unconditional yes, forever.
func (a *agent) outing(ctx context.Context, self disposition) {
	startedAt := a.now()
	budget := self.visitBudget(a.rng)
	log.Printf("omnirave-agent: going out for about %s", budget.Round(time.Minute))

	for ctx.Err() == nil {
		if !self.stillOut(a.now().Sub(startedAt), budget) {
			log.Printf("omnirave-agent: that is enough for now; going home")
			return
		}

		admission, err := a.api.admit(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			switch {
			case errors.Is(err, errAdmissionRefused), errors.Is(err, errAdmissionUnavailable):
				delay := a.refused.next()
				log.Printf("omnirave-agent: persona %d was not admitted (%v); waiting %s before asking again",
					a.cfg.PersonaID, err, delay.Round(time.Second))
				a.sleep(ctx, delay)
			default:
				delay := a.transient.next()
				log.Printf("omnirave-agent: admission failed (%v); retrying in %s", err, delay.Round(time.Second))
				a.sleep(ctx, delay)
			}
			continue
		}
		a.refused.reset()
		log.Printf("omnirave-agent: admitted as %s (%s)", admission.PlayerName, admission.PlayerID)

		sessionStart := a.now()
		itin, sessionErr := a.liveSession(ctx, admission, self)
		lived := a.now().Sub(sessionStart)
		if lived >= healthySession {
			a.transient.reset()
		}

		switch {
		case ctx.Err() != nil:
			log.Printf("omnirave-agent: disconnected after %s on shutdown", lived.Round(time.Second))
			// The visit happened; record it before leaving, on a context that
			// the signal has not already cancelled.
			reportCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), shutdownReportTimeout)
			a.reportVisit(reportCtx, itin, self)
			cancel()
			return
		case sessionErr != nil:
			log.Printf("omnirave-agent: session ended after %s: %v", lived.Round(time.Second), sessionErr)
		default:
			// The ordinary case: the world token expired and the world closed
			// the session, exactly as intended.
			log.Printf("omnirave-agent: session ended after %s", lived.Round(time.Second))
		}

		a.reportVisit(ctx, itin, self)

		if sessionErr != nil {
			delay := a.transient.next()
			log.Printf("omnirave-agent: reconnecting in %s", delay.Round(time.Second))
			a.sleep(ctx, delay)
		}
	}
}

// sleep waits, but never past a shutdown.
func (a *agent) sleep(ctx context.Context, delay time.Duration) {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
	case <-timer.C:
	}
}
