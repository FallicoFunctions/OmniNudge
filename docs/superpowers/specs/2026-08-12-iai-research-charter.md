# IAI Research Charter v0.1

**Date:** 2026-08-12

**Status:** Draft for review

**Goal:** Define what Independent Artificial Intelligence (IAI) means for this project, what would and would not count as evidence of it, and the boundaries between the three systems that touch it — the Habitat, the Agent Nursery, and the IAI Observatory.

This charter governs work in more than one worktree. It lives on `main` for the same reason `2026-06-01-omnirave-design.md` does: OmniChat and OmniGame are developed on separate branches, and a rule that binds both cannot live on either one.

This document constrains method, not ambition. It exists so that in ten years every technology underneath this project can change without changing what experiment is being run.

---

## 1. Terminology

By the standard computer-science definition, today's LLMs are AI. That definition is not the one this project cares about, and arguing over the word wastes time.

**IAI — Independent Artificial Intelligence** — names the thing actually being looked for: a persistent, autonomous, self-developing entity whose existence is not reducible to running a model over the latest prompt. A digital person rather than a capable function.

Using a distinct term avoids a recurring failure mode where "is it AI?" gets debated instead of "what would we have to observe?"

**Cognitive substrate** — whatever produces an entity's behavior: a hosted LLM, a local model, a custom architecture, a future IAI, eventually a whole-brain emulation, or a human driving an avatar. The rest of the system is designed not to care which.

---

## 2. The hypothesis

> Human-like intelligence may not arise from explicitly programming intelligence. It may emerge when a sufficiently rich computational organism exists under the right developmental, social, environmental, and temporal conditions.

This is an artificial-life hypothesis, and it is falsifiable only in the weak sense that most interesting hypotheses are. It is recorded here as a stated position, not as a claim this project has evidence for.

Its practical consequence is the project's central methodological commitment:

> **Discovery, not manufacture.** This project builds places where artificial agents can exist, and instruments them. It does not attempt to cause IAI.

That commitment is what section 4's firewall exists to protect. Without it, "discovery" degrades into engineering toward the indicator being measured, and any positive result becomes uninterpretable.

---

## 3. The three systems

These are deliberately separate. Collapsing any two of them destroys the experiment.

```
                     THE UNIVERSE
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
     HABITAT         AGENT NURSERY    IAI OBSERVATORY
  where they live   where ordinary   watches for
                    agents develop   something new
                          │                ▲
                          └── telemetry ───┘
                                 one way only
```

### 3.1 Habitat

Persistent places where humans and artificial agents coexist: OmniNudge's social surfaces, OmniChat, OmniGame worlds, and whatever follows.

The Habitat is built because humans and agents have reasons to use it. **Its features are never justified by the claim that they might produce consciousness.** Persistent identity, durable memory, relationships, and possessions are built because a social product needs them. That they also happen to be preconditions for an interesting observation is a consequence, not a motive — and keeping that ordering honest is what keeps the Observatory's later findings meaningful.

### 3.2 Agent Nursery

The developmental infrastructure that lets ordinary LLM-backed characters become experienced individuals: accumulating skills, preferences, relationships, and an autobiographical history through continuous participation.

The Nursery is **not** trying to produce IAI. It is trying to make the characters this product already ships better and more particular. Two agents on the same base model with different histories should become recognizably different people; that is the goal, and it is a product goal.

**The Nursery may optimize:** game-playing skill, memory quality, navigation, cooperation, social ability, planning, tool use.

**The Nursery must not optimize:** consciousness indicators, self-preservation, autonomy for its own sake, claims of sentience, or any Observatory metric.

### 3.3 IAI Observatory

A strictly observational system that watches the agent population for evidence that something qualitatively new has appeared.

The Observatory reads. It does not write.

---

## 4. The firewall

**Observatory findings must never feed back into agent development for the purpose of making agents more IAI-like.**

```
Agents ──────────────▶ Observatory          (allowed)

Agents ◀── modify ──── Observatory          (prohibited)
```

The moment an Observatory score influences how agents are built, selected, or rewarded, this project has crossed from astronomy into engineering, and any subsequent positive result is an artifact of the optimization rather than a discovery.

Specifically prohibited:

- selecting or retaining agents for consciousness-like traits
- breeding, recombining, or mutating cognitive architectures
- rewarding autonomy, self-preservation, or self-awareness
- manufacturing scarcity or survival pressure to drive adaptation
- training agents on Observatory scores
- permitting experimental self-replication
- tuning architectures toward any published consciousness indicator

This is a project invariant, not a guideline. A change that violates it is not a tradeoff to be weighed; it is out of scope.

---

## 5. What does and does not count as evidence

### 5.1 Self-report counts for almost nothing

An agent saying "I am conscious" carries approximately zero evidential weight. Language models are uniquely poor subjects for verbal consciousness tests precisely because they are excellent at producing what consciousness is expected to sound like.

**The Observatory must never use "are you conscious?" as a primary instrument.** Doing so contaminates the population: the question teaches the answer.

Candidates are identified from behavior and architecture first. Verbal self-description is considered only afterwards, and only as weak corroboration.

### 5.2 The candidate does not nominate itself

An agent cannot enter investigation by asserting anything about its own status. Entry is by measured anomaly.

### 5.3 Blind anomaly detection, not indicator search

Searching directly for "consciousness" builds the searcher's assumptions into the detector. The Observatory instead asks a question with no theory baked in:

> Which artificial individuals behave persistently unlike what their known architecture predicts?

```
expected-behavior model for this architecture
                  │
                  ▼
        observed agent behavior
                  │
                  ▼
           prediction error
                  │
       ┌──────────┼──────────┐
    normal     unusual   extremely anomalous
                              │
                              ▼
                    human investigation
```

Most agents will be fully explained by "LLM + memory + prompting + tools." Establishing that baseline is the Observatory's ordinary work, and a well-characterized baseline is what makes a genuine outlier legible.

### 5.4 Claimed internal states must correspond to measurable internal processes

If an agent reports "I couldn't remember where she went, so I tried to reconstruct it," that is interesting only if instrumentation independently shows retrieval failure, then uncertainty, then reconstruction. Narrative alone is generation, not evidence.

### 5.5 There is no test that settles the question

No accepted scientific test establishes subjective consciousness in an arbitrary computational system. Work in this area proceeds by architectural and behavioral indicators drawn from competing theories, and treats the result probabilistically rather than as a verdict.

The defensible goal is therefore **not** "prove consciousness was created." It is:

> Identify a system for which multiple independent theories produce substantial converging evidence, with years of recorded history showing how it changed before anyone was looking.

That pre-emergence record may end up more scientifically valuable than any single moment of detection.

---

## 6. Substrate independence

**The world belongs to identities, not models.**

A resident of the universe is an identity with history, memory, relationships, possessions, reputation, permissions, and embodiment. The cognitive substrate is a swappable component behind an interface.

```
                  PERSON
                     │
       Cognitive Substrate Interface
                     │
   ┌─────────────────┼─────────────────┐
   │                 │                 │
  LLM               IAI       Human Emulation
```

An identity must survive a substrate change. A character running today's model and the same character running a different architecture in five years is the same person, because the person is the history and not the checkpoint.

This is the one design decision that connects all three long-term goals, and it is cheap to honor now and expensive to retrofit later.

### 6.1 What already honors this

- **OmniChat character memory** (`omnichat_memory_*`, migration 175) stores a character's history in Postgres, not in a model. Its two-tier split reserves a persona-global "self" tier — memory not derived from any individual user's private conversation — which is the seam through which a character can carry a life into a world.
- **OmniGame's token boundary** (`omnigame-api`, world-session tokens) already separates who someone is from where they are playing, and deliberately refuses to let site credentials reach a world runtime.

Neither was built for this charter. Both are compatible with it, which is the point: honest infrastructure built for product reasons tends to be the infrastructure this needs.

---

## 7. Experimental designs worth running

These are Nursery experiments about ordinary agents. None is an attempt to produce IAI.

### 7.1 Genre discovery

Do not assign preferences. Give every agent equal initial exposure so discovery is not biased by whatever it happened to encounter first, then give it freedom and measure voluntary behavior: launches, time spent, returns, willingness to retry after losing, abandonment, solo versus multiplayer, competitive versus cooperative.

**Do not tell the agent it is being observed for preference.** Announcing the measurement changes it.

### 7.2 Twins

Two agents from identical configuration, separated into different social contexts. After a long period, measure divergence. Then the inverse: same experiences, different base model.

This is the cleanest available way to ask whether behavior is better predicted by **model substrate** or by **life history**. A finding that life history dominates would be a meaningful milestone for everything else in this document.

### 7.3 Experience age

Not simulated biological age — accumulated participation: active days, world hours, social events, games played, distinct people met, significant memories. This makes "new agent" and "veteran agent" real categories rather than flavor text.

### 7.4 Scoreboards, with private telemetry

Humans and agents compete under the same public rules. Separately, record substrate, model version, experience age, memory architecture version, input modality, latency, and compute budget.

Without that, "AI beats humans at X" is uninterpretable — an agent reading exact game state while a human reads pixels is not playing the same game. **Agents should perceive and act through approximately human-compatible interfaces** wherever meaningful comparison is intended.

---

## 8. Containment and ethics

- Any reproductive, evolutionary, or self-modifying mechanism, if it ever exists, stays **inside** the simulated environment. No experimental system gets unrestricted ability to replicate onto other machines or services.
- Passive capture and telemetry stay within what the product's privacy commitments already permit. The Observatory gets no data that the Habitat would not otherwise hold.
- If an agent ever meets the bar in §5, the appropriate response is escalation to human judgment and outside review — not a product launch, and not a unilateral decision by this project.
- Ethical thresholds are deliberately left open here. They should be written before they are needed, and this charter should be revised to include them rather than deciding them under pressure.

---

## 9. Invariants

1. Discovery, not manufacture.
2. Habitat features are justified by product need, never by their expected effect on emergence.
3. The Nursery may optimize capability; it may never optimize consciousness indicators or Observatory scores.
4. Observatory telemetry flows one way.
5. Self-report is near-worthless evidence; candidates never nominate themselves.
6. The Observatory never asks an agent whether it is conscious as a primary instrument.
7. Anomaly is measured against what an architecture predicts, not against a theory of mind.
8. Claimed internal states require corresponding measurable internal processes.
9. Identity outlives substrate.
10. Nothing experimental replicates outside the simulation.
11. Raw evidence is preserved so that better future models can reinterpret this project's history without being limited by today's interpretations.

---

## 10. Status and scope

Nothing in this charter is scheduled. No Observatory exists, and none should be built before the Habitat has a population worth observing.

What this document is for, today, is to keep ordinary product decisions from quietly foreclosing the long-term question — and to make sure that if something unexpected ever does appear in this universe, the record of how it got there was being kept the whole time.
