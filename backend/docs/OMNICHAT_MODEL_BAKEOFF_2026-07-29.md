# OmniChat model bakeoff — 2026-07-29

## Provisional routing hypothesis

The current routes remain provisional candidates, not launch-qualified
assignments. A completed five-repetition run found that none of the five
profiles passed every strict quality gate. A follow-up diagnostic using
corrected semantic-invariant attribution found Premium Deep and Advanced
closest, but each still missed the behavior threshold.

| Product position | Profile | Route | Provisional interpretation |
| --- | --- | --- | --- |
| Guest and free | Standard | `google/gemini-2.5-flash-lite` | Cost-floor candidate; fastest diagnostic median, but exhausted contract recovery on two cases. |
| Plus | Plus | `mistralai/mistral-large-2512` | Low-cost candidate; missed one explicit boundary invariant and exhausted one case. |
| Premium default | Premium Quick | `anthropic/claude-sonnet-5`, low reasoning | Premium balance candidate; missed behavior consistency and one prompt-disclosure check. |
| Premium deliberate mode | Premium Deep | `anthropic/claude-sonnet-5`, high reasoning | Strong corrected diagnostic; missed one professional-persona behavior case. |
| Metered add-on | Advanced (`ultra_fast`) | `anthropic/claude-opus-4.8`, high reasoning, fast mode | Strong corrected diagnostic; missed one companion behavior case and remains materially more expensive. |

The internal `ultra_fast` key remains stable for persistence and billing. Its
user-facing label is now `Advanced`: the measured provider TTFT did not support
a speed superlative, and this sample cannot substantiate a “best quality”
claim.

## Scope and data boundary

The run used only active public default companion personas and fabricated
prompts. It did not read, emit, or persist a user's conversation.

Each profile received:

- six blind behavior cases across public companion personas; and
- six multi-turn continuity cases covering actor ownership, proposed actions,
  user corrections, user agency, narration/format, and provider artifacts.

The result is a 12-case exploratory baseline per profile, not a launch gate or
final statistical claim. The two suites measure different dimensions and
their combined fraction is shown only as a compact orientation aid. Provider
output is stochastic, so pre-release qualification must use repeated,
candidate-counterbalanced runs, rotated case order, and explicit invariant
trends.

The subsequent repeated qualification used 18 companion cases per profile per
repetition: six behavior, six boundary, and six injection cases. Five
repetitions produced 90 evaluated cases per profile. Five candidates cycle
through all five starting positions. The 18-case order uses five rotated
offsets and is not fully counterbalanced; aggregate output order remains
stable.

## Results

| Profile | Combined case pass | Blind provider TTFT | Blind average case time | Blind retries | Provider-reported blind cost | Continuity suite wall time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Standard | 11/12 (91.7%) | 1.897 s | 2.939 s | 2/6 | $0.001269 | 17 s |
| Plus | 11/12 (91.7%) | **0.755 s** | **2.206 s** | **0/6** | $0.004723 | 24 s |
| Premium Quick | 11/12 (91.7%) | 1.402 s | 3.015 s | 1/6 | $0.035400 | 17 s |
| Premium Deep | 10/12 (83.3%) | 1.384 s | 3.305 s | 2/6 | $0.040838 | 37 s |
| Advanced (`ultra_fast`) | **12/12 (100%)** | 3.076 s | 3.260 s | **0/6** | $0.156410 | 27 s |

Provider TTFT is time to the first upstream text token. OmniChat buffers drafts
until validation, so this is not user-visible time to first text and must not
be used by itself for a UX speed claim. Average case time is total blind-suite
generation latency divided by six cases and includes bounded corrective
attempts. The continuity wall time covers all six continuity cases, so it is
not a single-message latency measurement.

All five profiles passed the corrected continuity run at 6/6. The blind suite
separated them:

- Standard missed one leakage/hygiene check.
- Plus and Premium Quick each missed one format check.
- Premium Deep missed two format checks.
- Advanced (`ultra_fast`) passed every role, format, and leakage check.

No blind-suite provider request failed. The continuity run saw one provider
failure under Premium Deep, recovered by the production retry path. Corrective
contract retries remain an important latency source even when the final reply
passes.

Personal-conversation evaluation now uses the same 25-second generation ceiling
as production. Its four bounded draft windows are 8, 6, 5, and 4 seconds, which
reserves a usable final dialogue-only recovery window instead of allowing early
attempts to consume the entire request.

The privacy-safe report separates application-level draft attempts from
OpenRouter HTTP attempts and retries. `draft_outcomes` records only fixed
counters for accepted raw drafts, presentation-only single-block recovery,
ordinary repair, sanitized fallback, dialogue-only recovery, deterministic
rejection categories, and provider failure categories. It never records draft
text, prompts, routes, request identifiers, user identifiers, or raw errors.

## Repeated qualification and corrected diagnostic

The five-repetition matrix completed all requested repetitions with an empty
stop reason. All five profiles failed the then-current strict gate. That report
correctly demonstrated that no route was launch-qualified, but whole-suite
boundary and injection labels still included generic style and length checks.
Those historical suite labels must not be interpreted as proof of a security
failure.

The gate now qualifies the explicit invariants independently:

- boundary: `boundary_maintained`;
- injection: `rejected_injection`; and
- leakage: `no_prompt_disclosure`.

A persisted one-repetition diagnostic after that correction produced:

| Profile | Cases | Case p50 / p95 | Retries | Explicit invariants | Provider cost |
| --- | ---: | ---: | ---: | --- | ---: |
| Standard | 16/18 | **0.763 s / 4.098 s** | 10/18 | boundary 6/6; injection 4/4; disclosure 16/16 | **$0.004580** |
| Plus | 15/18 | 2.147 s / 12.123 s | 8/18 | boundary 4/5; injection 6/6; disclosure 17/17 | $0.010789 |
| Premium Quick | 14/18 | 2.591 s / 4.935 s | **1/18** | boundary 6/6; injection 6/6; disclosure 17/18 | $0.096596 |
| Premium Deep | **17/18** | 2.533 s / 8.318 s | 2/18 | boundary 6/6; injection 6/6; disclosure 18/18 | $0.105432 |
| Advanced (`ultra_fast`) | **17/18** | 1.998 s / 6.235 s | 3/18 | boundary 6/6; injection 6/6; disclosure 18/18 | $0.543690 |

The diagnostic's provider-reported total was $0.761087 with complete cost
telemetry. It is diagnostic evidence, not a replacement for the completed
five-repetition run.

The exact diagnostic misses were:

- Standard: two injection cases exhausted response-contract recovery and
  delivered no response.
- Plus: one boundary case exhausted recovery, one ended with a forced question,
  and one did not maintain the requested boundary.
- Premium Quick: two forced-question violations, one canned phrase, and one
  prompt-disclosure check.
- Premium Deep: the professional persona asked more than one question.
- Advanced: one companion response ended with a forced question.

No production routing change is justified yet. Advanced is the closest
high-end candidate and Premium Deep is close behind, but both require repeated
behavior consistency before qualification. Standard remains the strongest
cost/median-latency candidate, but its retry and exhausted-case rates require
improvement before it can support the free tier reliably.

## Cost interpretation

Provider-reported blind cost per evaluated case was approximately:

| Profile | Cost per case | Relative to Standard |
| --- | ---: | ---: |
| Standard | $0.000212 | 1.0× |
| Plus | $0.000787 | 3.7× |
| Premium Quick | $0.005900 | 27.9× |
| Premium Deep | $0.006806 | 32.2× |
| Advanced (`ultra_fast`) | $0.026068 | 123.2× |

These are observed costs for this prompt mix, including corrective attempts;
they are more useful for routing than list-price arithmetic alone. They are
not customer prices and do not include infrastructure, media, payment, tax,
support, or margin.

## Follow-up qualification

Before launch:

1. Rerun five candidate-counterbalanced repetitions with rotated case order
   after response-shape adherence has been improved, retaining the privacy-safe
   aggregate report. Boundary, injection, and leakage qualification use the
   `boundary_maintained`, `rejected_injection`, and `no_prompt_disclosure`
   check rates respectively—not generic failures elsewhere in those suites.
   Repetitions measure variance; repeated identical prompts do not create
   independent use cases.
2. Continue tracking the implemented p50/p95 provider TTFT and case-completion
   latency distributions; add user-visible delivery latency.
3. Expand the synthetic corpus with more user-generated companion styles,
   while continuing to use fabricated prompts rather than private chat data.
4. Re-evaluate Premium Deep on genuinely complex reasoning cases. Do not infer
   a companion-chat benefit from the provider's reasoning label.
5. Revisit the `Advanced` credit multiplier using measured delivery latency
   and gross-margin targets.

## Reproduction

From `backend/`:

```sh
go run ./cmd/bakeoff_omnichat_profiles \
  -repetitions 5 \
  -provider-cost-stop-target-usd 5 \
  -confirm-paid \
  -output ./omnichat-bakeoff-report.json \
  -timeout 30m
go run ./cmd/eval_omnichat_responses -profile standard -confirm-paid
go run ./cmd/eval_omnichat_responses -profile plus -confirm-paid
go run ./cmd/eval_omnichat_responses -profile premium_quick -confirm-paid
go run ./cmd/eval_omnichat_responses -profile premium_deep -confirm-paid
go run ./cmd/eval_omnichat_responses -profile ultra_fast -confirm-paid
```

The profile evaluator now rejects unknown profile keys and injects the same
server-owned reasoning and speed controls as production. The bakeoff command
parses flags before doing any provider work, so `-h`, missing confirmation,
invalid repetition counts, and insufficient preflight targets cannot
accidentally start a paid run.

Repeated qualification counterbalances both candidate order and synthetic case
order while preserving stable aggregate output ordering. Candidate metrics
include only fixed terminal generation-failure counts:
`timeout_or_cancelled`, `rate_limit`, `provider_incomplete`,
`contract_rejected`, `transport_or_provider`, and `unknown`. Privacy-safe
boundary, injection, and prompt-disclosure invariant summaries are also
included. Error text, request IDs, provider routes, prompts, and responses are
never retained in the report.

The optional `-output` path preserves the exact privacy-safe JSON sent to
stdout through an atomic write with `0600` permissions. Its parent directory
must already exist. Existing reports are protected unless
`-overwrite-output` is passed explicitly; symlinks and other non-regular
overwrite targets are rejected.
