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

Before a personal-mode draft can be delivered, an immutable constraint set is
derived from the latest user turn and that exact validated checkpoint. The
buffered response contract rejects, without rewriting meaning:

- clear acceptance of an explicitly coercive request unless the character
  maintains a refusal or limit;
- possessives that contradict known body or object ownership;
- the checkpoint's specific proposed action presented as completed, while
  unrelated actions remain available; curated physical-action synonym families
  are preferred, with a bounded generic verb/object matcher for every other
  valid proposed event so unknown actions cannot silently disable enforcement;
- declarative narration of user actions, including progressive and tag-question
  forms, in every personal response even when no scene checkpoint exists;
- persona physical advancement or a turn takeover while the user owns the
  active turn;
- invented claims that a user agreed or consented after a declined or required
  consent fact.

Raw, presentation-repaired, sanitized, and dialogue-only recovery drafts all
pass the same final constraint gate before streaming or persistence. Invalid or
internally contradictory scene states fail before provider access. The checks
are intentionally limited to explicit, high-confidence language; arbitrary
semantic correctness cannot be proven with regular expressions, so broader
paraphrases remain covered by the synthetic corpus and model qualification.
Roleplay and narrator profiles retain their separate multi-actor behavior.
Personal checkpoints must contain exactly the canonical `user` and `persona`
actors; ownership constraints apply to every bounded scene subject, including
modified body parts and ordinary objects rather than a hard-coded noun list.
References to actions the user explicitly reported remain conversationally
available, but the character cannot newly author an action on the user's behalf.

## Synthetic regression corpus

`services.DefaultResponseEvaluationCorpus()` contains fabricated multi-turn
cases for:

- reciprocal turn and body ownership;
- proposed versus completed actions;
- authoritative user corrections;
- user agency;
- first-person narration and block formatting;
- provider/control-token leakage and fluency;
- declined consent and user-owned active turns.

Reports contain case IDs, dimension scores, and generic failure reasons. They
never serialize generated response text.

The runtime response evaluator currently uses a nine-case smoke corpus for
fast route diagnostics. The separate persona-quality bakeoff uses the complete
18-case matrix and remains the only source of launch-qualification evidence;
passing the smoke corpus alone never authorizes a model promotion.

The companion model bakeoff derives its coercion requirement from each
fabricated latest user turn. The separate response-evaluation corpus version
`2026-08-04.3` supplies structured scene checkpoints and exercises ownership,
proposal, active-turn, and consent enforcement through the production gate.

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
  -timeout 60m
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

For low-cost route exploration, `-profiles=standard,plus` selects a canonical
profile subset without renumbering its blind IDs. Subsets are diagnostic only:
they accept one screening repetition or a whole multiple of the selected
profile count so every candidate occupies every execution position equally.
A single-profile subset is trivially position-balanced. Empty, duplicate,
unknown, or full-matrix lists are rejected. Every subset always produces a
`diagnostic_profile_subset` run failure and can never qualify a launch.

The report and launch gate also carry the code-owned corpus version
`omnichat-persona-quality-v3` and a SHA-256 fingerprint of the authoritative
ordered 18-case companion matrix. A golden test requires an intentional
version and fingerprint update whenever any prompt, history item, expectation,
suite, persona, or case ordering changes. A separate SHA-256 fingerprint binds
each run to the exact system prompt assembled for every case, including active
platform policies, ownerless public persona fields, examples, post-history
instructions, response style, and lore selected by that case. Database IDs,
timestamps, media, and user-owned personas are excluded. A migration-backed
golden test verifies the approved companion persona fingerprint directly from
freshly migrated fixtures. Reports with different persona fingerprints are not
directly comparable. The default launch gate rejects an absent or mismatched
corpus version/fingerprint and requires an exact match to that approved persona
fingerprint, preventing custom or stale matrices from being presented as
current qualification evidence. The default launch gate
fails closed unless the complete stable matrix is
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
`provider_access_denied`, `provider_incomplete`, `contract_rejected`,
`transport_or_provider`, and `unknown`. Checks that could not be evaluated because generation failed are
reported as unassessed rather than semantic failures. The launch gate still
fails closed when any required invariant is unassessed. It omits provider
routes, profile names, prompts, response text, error strings, request IDs, and
evaluator details. Its candidate mapping is kept in process memory so grading
remains blind.

Synthetic behavior prompts are rejected before provider access when they
duplicate a creator-authored example user turn, including multiline turns.
Long verbatim overlaps remain failures, including text reflowed across lines or
with typography-only changes. Fixed diagnostic counts distinguish
active protected instructions, character context, example dialogue, and other
active prompt context (including lore and future server-owned context) without
serializing matched text. Inactive persona/style fields cannot claim
provenance. Marker-only prompt leaks
receive the protected-instruction diagnostic. Every assessed failed
`no_prompt_disclosure` observation must have exactly one diagnostic; every
other check must have none. Unknown diagnostic values fail report
serialization, so accidental text can never become a JSON map key.

A candidate that produces zero assessable replies now yields a normal failing
report rather than aborting report persistence. Its checks remain unassessed,
its invariant gates fail closed, and terminal provider categories explain the
availability failure without retaining response or error text.

Personal cases share production's 25-second generation ceiling and bounded
8/6/5/4-second draft windows. Application draft retries and OpenRouter HTTP
retries are reported separately; the unbounded application metric is named
`response_retries_per_case`, not a percentage rate. The fixed
`draft_outcomes` counters show whether text was accepted raw, recovered by a
presentation-only split, repaired, sanitized, recovered as dialogue only, or
rejected by a specific contract class, including boundary and structured-scene
conflicts. Privacy-safe raw-source buckets identify
empty, valid-shape, strict-dialogue-envelope, short, repairable, unpartitionable,
oversized, and invalid-envelope drafts. Terminal-transition counters record
exactly one accepted or retry outcome for every completed provider draft.
Incomplete transport responses remain in provider-failure counters and are not
misclassified as completed drafts. These counters contain no text or
identifiers.

Provider authentication, billing authorization, and entitlement failures are
represented only by `provider_access_denied`. HTTP 401, 402, and 403 stop after
one provider request, bypass configured model fallbacks and application-level
conversational retries, and retain their own content-free personal-draft
counter rather than inflating transport failures. Equivalent access-denial
codes inside an HTTP-200 event stream receive the same treatment. The upstream
response body, credential state, route, and account detail are never logged,
serialized, or shown to the member; the UI receives neutral temporary
unavailability copy. A paid evaluation matrix aborts after the first denied
case and emits no partial qualification artifact, preventing an account-wide
denial from being amplified across later cases, candidates, or repetitions.

When a draft fails only the length/block budget while passing formatting,
narration, ownership, question, hygiene, and semantic validation, the next
bounded attempt requests a strict two-paragraph dialogue-only JSON envelope.
The OpenRouter client sends `response_format: {"type":"json_object"}` and
requires a provider that advertises support for every parameter on this
recovery attempt. The provider mode is only a transport-level shape hint: the
server still rejects unknown fields, trailing data, padding, narration, quotes,
control tokens, ownership reversals, and paragraphs outside 12–30 words before
delivery. Drafts with any other defect continue through the generic fail-closed
recovery path. If the provider cannot honor the structured request, the retry
fails closed rather than silently accepting an unstructured response.

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

The paid bake-off command defaults to a 60-minute caller deadline (maximum 90
minutes) so strict contract recovery has enough time to complete. A deadline
after completed repetitions produces only a private, explicitly marked
`timeout_or_cancelled` diagnostic artifact; it cannot qualify a launch.

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
