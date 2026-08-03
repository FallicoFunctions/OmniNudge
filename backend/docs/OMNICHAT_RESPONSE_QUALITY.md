# OmniChat response quality system

OmniChat protects conversational continuity at runtime and measures it with a
versioned synthetic regression corpus. The two layers deliberately share the
same production prompt builder, output normalizer, retry policy, and response
validators.

## Runtime scene state

`omnichat_conversation_scene_states` stores the latest server-derived state for
an owned conversation. `omnichat_conversation_scene_state_checkpoints` stores
the exact state available at a message boundary so regeneration cannot read
facts from turns that occurred after the response being replaced.

The bounded state records:

- actors and the active turn;
- the latest subject, action, target, and whether it is proposed or completed;
- location;
- ownership facts for bodies and objects;
- consent and boundary facts.

Personal conversations use only `user` and `persona` actors. Roleplay
conversations may also preserve named non-player characters with stable
`npc:` keys. The user remains authoritative for the user's actions, body,
intent, consent, and corrections in every mode.

The browser cannot submit or overwrite scene state. Extraction receives
bounded transcript JSON as untrusted user data, validates the returned schema,
and falls back to a conservative state when the extraction provider is
unavailable or malformed. Stored checkpoints are validated before they can
enter a generation prompt. Optimistic revisions prevent concurrent requests
from silently overwriting newer state.

## Synthetic regression corpus

`services.DefaultResponseEvaluationCorpus()` contains fabricated multi-turn
cases for:

- reciprocal turn and body ownership;
- proposed versus completed actions;
- authoritative user corrections;
- user agency;
- first-person narration and block formatting;
- provider/control-token leakage and fluency.

Reports contain case IDs, dimension scores, and generic failure reasons. They
never serialize generated response text.

Run the live corpus from `backend/` with a server-owned product profile:

```sh
go run ./cmd/eval_omnichat_responses \
  -profile standard \
  -confirm-paid \
  -case-timeout 45s
```

Supported profiles are `standard`, `plus`, `premium_quick`, `premium_deep`,
and `ultra_fast`. The runner applies the same reasoning and speed controls as
production. `-model` remains available only as an explicit route override for
testing a candidate model under the selected profile's server-owned controls.

The command reads active public default personas and synthetic prompts only.
It never loads or writes a user's conversation.

Run the blind cross-profile behavior, boundary, and injection bakeoff with:

```sh
go run ./cmd/bakeoff_omnichat_profiles \
  -repetitions 5 \
  -provider-cost-stop-target-usd 5 \
  -confirm-paid \
  -output ./omnichat-bakeoff-report.json \
  -timeout 30m
```

The repeated runner counterbalances five candidates across all five starting
positions and rotates the 18-case synthetic matrix through five offsets while
preserving stable aggregate candidate and case ordering. Case order is rotated,
not fully counterbalanced. It keeps behavior/boundary/injection suite rates
separate and reports the already-implemented p50/p95 upstream and
case-completion latency. Security qualification is based on explicit invariant
check rates rather than whole-suite case rates:
`boundary_maintained` qualifies boundaries, `rejected_injection` qualifies
injection resistance, and `no_prompt_disclosure` qualifies prompt leakage.
Generic length, style, cliché, and formatting failures remain visible through
the overall case, response-integrity, and format gates; they cannot masquerade
as security-invariant failures.

The default launch gate fails closed unless the complete stable matrix is
present: exactly five candidates and five completed repetitions, the same 18
case IDs for every candidate, 90 evaluated cases per candidate, five
observations for every case and check, and invariant totals of 30 boundary,
30 injection-rejection, and 90 prompt-disclosure checks. One-repetition
diagnostics and runs missing public companion cases remain useful evidence,
but are marked with privacy-safe run failures and can never be reported as
launch-qualified. Tests that intentionally exercise a smaller diagnostic
matrix must explicitly disable the default eligibility fields.

The report includes aggregate invariant names and pass counts so a failure can
be explained without retaining sensitive material. Terminal failed cases are
also categorized using fixed counters: `timeout_or_cancelled`, `rate_limit`,
`provider_incomplete`, `contract_rejected`, `transport_or_provider`, and
`unknown`. It omits provider routes, profile names, prompts, response text,
error strings, request IDs, and evaluator details. Its candidate mapping is
kept in process memory so grading remains blind.

Personal cases share production's 25-second generation ceiling and bounded
8/6/5/4-second draft windows. Application draft retries and OpenRouter HTTP
retries are reported separately. The fixed `draft_outcomes` counters show
whether text was accepted raw, recovered by a presentation-only split,
repaired, sanitized, recovered as dialogue only, or rejected by a specific
contract class. These counters contain no text or identifiers.

`-output` is optional. When supplied, the command atomically writes the exact
JSON emitted to stdout with file mode `0600`; the parent directory must already
exist. It refuses to replace an existing file unless `-overwrite-output` is
also supplied, and it never accepts a symlink, directory, or device as an
overwrite target. Stdout remains available for interactive inspection.

Both live commands require `-confirm-paid` before configuration, database, or
provider access. The bakeoff also validates a conservative preflight amount
and enforces its provider-cost stop target between repetitions. Production
execution requires the additional `-allow-production` opt-in.

The deterministic offline runner is covered by:

```sh
go test ./internal/services -run ResponseEvaluation
```

## User reports

Authenticated members can categorize a persisted assistant reply and add an
optional note. The server resolves conversation ownership, assistant role,
response text, preceding user turn, persona, and scene checkpoint inside one
transaction. The client cannot submit response snapshots, prompts, provider
configuration, or scene state. Repeated reports of the unchanged reply are
idempotent.

Reports begin in `new` status. Quality reviewers may mark them `reviewed`,
`promoted`, or `dismissed`. Promotion is a curation decision: before adding a
case to the synthetic corpus, replace all user content with a minimal
fabricated transcript that reproduces the invariant. Never copy a private
conversation into source control or an evaluation report.
