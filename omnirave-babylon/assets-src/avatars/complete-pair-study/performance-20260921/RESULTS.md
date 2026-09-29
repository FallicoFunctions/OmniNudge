# Chrome performance check — 21 September 2026

The current build has **not reached the 60 FPS target**. These measurements were taken on battery with Low Power Mode enabled. The Mac also had substantial compressed memory. They are not a like-for-like comparison with the earlier powered runs or the previous fireworks implementation.

## Changes from this pass

- Hidden show queues retain the latest state without rebuilding their DOM on each room snapshot. Opening the queue refreshes it synchronously. Operator controls remain live, including while queues are hidden.
- The local avatar review server accepts `--performance-show`, using the existing server show scheduler to run automatic fireworks during the crowd test. Production scheduling is unchanged.
- `benchmarkFireworks=1` requires nonzero generated firework geometry during at least 90% of sampled frames. This catches the obsolete assumption that selecting the stage's “Fireworks finale” preset starts the new shared show. The geometry count establishes effects activity, not screen coverage.
- Frame reports separate show-control CPU work from scene rendering and record median/peak firework quad counts.
- The avatar models, authored walk/run tracks, pose transitions, wardrobe, and detail thresholds were preserved.

## Final measurements

Chrome WebGPU, 1280 × 720, 3-second warm-up plus 30-second sample, mixed idle/walk/run remote peers, full local female model (349,466 triangles), all six outfit categories visible. Stage finale lighting and the current automatic fireworks show were active. Both samples used the same immutable production preview copied to `/tmp/omnirave-performance-20260921-preview`, served on port 5206.

| Sample | Average FPS | Median frame | p95 frame | Median CPU | Fireworks active frames | Valid |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| [Eight avatars](chrome-8-final-battery.json) | 24.3 | 35.7 ms | 84 ms | 30.3 ms | 100% | True |
| [Sixteen avatars](chrome-16-final-battery.json) | 19.6 | 43.4 ms | 97.7 ms | 37.2 ms | 100% | True |

Both samples had the expected loaded/animating avatar count at both endpoints, no pending loads, no shader compilations, no GPU validation errors, and a fixed camera at `[0.8000000119, 4.5350008011, -52.0000038147]`. Eight peers stayed at middle detail. The sixteen-peer sample began and ended with ten middle-detail and six far-detail avatars; the moving crowd can change detail during the sample. No avatar copies were built or released during either final sample.

The preliminary sixteen-peer sample was 14.1 FPS. The final 19.6 FPS result must **not** be presented as a gain from the queue optimization: crowd detail distribution and host load varied, and the test origin changed. The queue improvement is established by a mutation-observer test: zero hidden-queue DOM mutations during 30 snapshot/update pairs, while operator controls update and reopening displays the newest roster.

## Diagnosis and limits

The warmed CPU/GPU diagnostic is saved in `chrome-16-current-profile-warm.json`. Its instrumentation adds overhead; its 10.7 FPS is not a release benchmark. Mesh rendering and active-mesh evaluation dominate the CPU profile. In the final unprofiled sixteen-peer sample, median scene rendering was 27.2 ms, crowd updates 2.9 ms, and show-control updates 2.1 ms. GPU pass timings are diagnostic and must not be summed as independent frame costs.

A powered, stable-load comparison is still needed to assess the earlier eight-player performance and continue toward sixteen players at 60 FPS. Power preferences were not changed. Experimental avatar instancing and alternate buffer layouts remain off.

## Validation

- 99 focused frontend checks passed before the queue change, including the authored locomotion, remote avatars, show controls, and benchmark checks.
- 41 focused checks passed after the queue change, including overlapping checks, the hidden-queue regression, lifecycle/integration checks, fireworks rendering, and benchmark validation.
- TypeScript checking and the production build passed.
- Avatar-review command tests and world tests passed.
- Final Chrome console warnings/errors: none. Queue reopening/closing also checked in Chrome.
- Build/source hashes and test logs are included beside this report in `validation.json`, `frontend-tests.log`, `final-tests.log`, and `final-build.log`.

## Reproduction

Build the current frontend, start a production preview, and run the local avatar review server with `--runtime` matching that preview, `--port 5205 --peers 16 --moving-peers --performance-show`. Use the female WebGPU review link, remove `avatarComplete` for the normal camera, and add `benchmark=1&benchmarkPeers=16&benchmarkLocalDetail=0&benchmarkUi=player&benchmarkSeconds=30&benchmarkFireworks=1`. Select Female and restore the full outfit if necessary. Hide the queues, disable adaptive local detail, select Fireworks finale, let the crowd finish loading, and measure. Save only samples passing all checks. Use eight peers and `benchmarkPeers=8` for the smaller workload.
