# Normal-game avatars and venue performance — 2026-09-14

## Final production result: approximately 60 FPS in the normal WebGPU view

The optimizations are enabled in normal play; no optimization query flags are required. The final release averaged **59.7 FPS and 59.8 FPS in two 30-second samples**, at 1280 × 720 with eight moving remote avatars and the full local female outfit. No track or scheduled fireworks event was active. The camera stayed at `[0.8000000119, 4.5350008011, -52.0000038147]`. Both samples passed every benchmark validity check, with zero shader compilations and zero pending avatar loads. The local model retained 349,466 triangles. In the settled repeat, all eight remote models stayed at their existing middle detail, totaling 1,338,636 triangles. The first sample began with three full-detail remotes before all eight settled to middle detail. The smallest remote detail was not used.

| Final release sample | Average FPS | Median frame | p95 frame | Median CPU frame | Median scene render |
| --- | ---: | ---: | ---: | ---: | ---: |
| `production-release-thirty-seconds.json` | 59.7 | 16.7 ms | 18.8 ms | 14.6 ms | 13.9 ms |
| `production-release-thirty-seconds-repeat.json` | 59.8 | 16.7 ms | 18.7 ms | 14.3 ms | 13.7 ms |

Earlier production samples recorded 59.9 FPS over 30 seconds (`production-default-thirty-seconds.json` and its repeat), and the eight-second show-profile diagnostic recorded 60.0 FPS (`production-show-method-profile.json`). The later pre-crown-fix samples recorded 59.6 FPS (`production-final-thirty-seconds.json` and its repeat). These are reported separately rather than treating the best short sample as the sustained release average. The result is approximately the 60 Hz target, not a guarantee that every frame is delivered within 16.67 ms.

These measurements use the normal player interface: chat, nameplates, now-playing display, stamina and normal controls remain present. Developer HUDs are omitted with the local `benchmarkUi=player` option, and the benchmark panel hides during measurement. Previous diagnostic runs included large translucent debug panels, so those runs also paid the rendering cost of that interface. Tests and builds were finished before the release samples; the duplicate development fixture was stopped, while the single production fixture and unrelated system applications remained running. GPU timing was unavailable, and the CPU measurements are not GPU timings.

The retained changes reduce repeated rendering and binding work:

- The WebGPU transmission background copies the current scene's HDR image before the coats render. It keeps native rendering until a copy succeeds and falls back when the source or shader is unavailable. This avoids drawing the venue a second time. The background follows the main scene's environment lighting, whereas Babylon's separate transmission helper uses its own environment intensity; this is visually checked reuse, not a claim of pixel-identical output.
- Compatible avatar material factors share an exact float parameter palette and vertex colors. Existing mesh batching can then combine more parts while retaining the original factors, geometry and outfit controls.
- Remote detail uses the projected height of the body, including camera pitch, with hysteresis. Full detail returns for portraits. Local detail and 60 Hz animation sampling retain their existing behavior.
- WebGPU caches reuse unchanged texture and light bindings. Shader/pipeline changes, texture views, sampler changes, forced binding and native buffer invalidation retain the native update paths.
- Fixed material parameters are restored into Babylon's actual shared WGSL uniform buffer; per-mesh transforms, bones, morphs, lights, fog and image processing stay live. Native material invalidation and scene-lighting changes invalidate the cached packet. The packet writer preserves the engine's buffer-rotation protocol and earlier draws' buffer ownership.
- The finishing chain combines bloom merge with image processing, and sharpening with grain. It retains the native equations and intermediate storage rounding. Bloom, color processing, sharpening, grain and FXAA remain active.
- Frequently animated crown materials use Babylon's maintained material-to-mesh index for dirty checks, with native fallbacks for indirect MultiMaterial/default-material users and missing indexes. Lighting parameters and the native callbacks are unchanged. The diagnostic crown update dropped from about 1.03 ms to 0.028 ms per frame (`production-show-method-profile.json` / `production-scoped-crown-thirty-seconds.json`); the temporary method profiler was then removed.
- Identical stage-display frames reuse their uploaded texture; fades, countdown pulses and audio-driven geometry continue updating. Repeated identical UI writes are skipped.

WebGPU-specific paths return immediately on WebGL. The final WebGL smoke sample (`production-final-webgl.json`) passed with all eight peers animating and no browser errors; it averaged 24.3 FPS and does **not** establish a WebGL 60 FPS result. Its palette/background-reuse flags correctly report disabled.

Validation: all 1,412 project tests passed, followed by 19 focused tests after the cache-invalidation correction and 41 tests covering the final crown, runtime and benchmark changes. The latter include three new native-material-index regression tests, bringing the project test inventory to 1,415. TypeScript checking and the production build passed. The material audit compared the optimized and native bindings after both character selections and wardrobe changes, and recorded zero uniform or texture differences (`production-final-native-material-audit.json`). That close-camera audit is a correctness diagnostic, not an FPS comparison; some remote avatars were outside the animation view and its benchmark validity is false. Outfit removal/restoration and both rendered characters were visually checked in the `final-webgpu-*` images. Crouch, skeletal deformation, morphs, wardrobe independence and detail transitions are covered by the automated tests.

For local reproduction, run the review server with eight moving peers and an origin matching the production preview, open its female WebGPU link, and remove `avatarComplete` to use the normal game camera. Add `benchmark=1&benchmarkPeers=8&benchmarkUi=player&benchmarkSeconds=30`, select Female in the normal Avatar panel, restore the full outfit, close the editor and measure. The benchmark warms up for three seconds, requires the expected loaded/animating crowd at both ends, rejects camera/detail/visibility changes and shader compilations, and restores the normal render size afterward. Loopback debug options can disable individual optimizations for comparisons; normal play uses the defaults.

The approximately 60 FPS result applies to this normal WebGPU camera, resolution and eight-peer scene on this machine. It is not a guarantee for portrait crowd views, higher resolutions, WebGL or other hardware. The earlier comparisons below describe their own historical configurations and are not directly comparable to these final production samples.

### Excluded intermediate experiments

`production-before-texture-cache.json` had no connected remote crowd and is excluded despite its reported 60 FPS. The benchmark now explicitly validates the requested peer count. `static-pbr-persistent-first-after.json`, `static-bind-live-enabled.jpg`, `static-pbr-binding-audit.json` and runs using the removed `pbrFrameBindings` experiment exposed incorrect shared-material uniform reuse and are excluded from performance claims. That implementation was removed and replaced with the audited material-owned packet path. The final scene retains the normal gray floor and gold ramp.

The 240-pixel distant-detail candidate caused repeated model changes and pending loads (`production-distant-detail-thirty-seconds.json` and its warmed repeat); it was reverted to the 200-pixel threshold. Both candidate reports are invalid and excluded.

Active-mesh queue caches and per-draw owned uniform buffers were removed after failing to improve the combined result. Vertex interleaving, GPU avatar instances, dynamic transmission and alternate multi-material batching remain disabled experiments. Intermediate diagnostic captures are retained for investigation; a built-in `valid: true` alone does not establish visual correctness, a matched crowd or an equivalent configuration for older reports.

## Earlier passes


The normal `/` game now loads the complete male/female pair. The Avatar panel switches either character for guests and accounts. Guest choice persists separately in the browser; account choice and clothing visibility use the saved account profile. Legacy profiles are upgraded to the complete pair when restored. Browser checks covered both rendered characters, guest reload, account save, and fresh account re-entry.

Retained performance changes batch static venue props and screen housings with matching materials and lighting, preserving collision floors and independently animated objects. The jacket's background render now culls offscreen meshes. Avatar assets and texture resolution are unchanged.

## Matched crowd measurement

Local in-app WebGPU browser, Vite development build, 1280 × 720, three-second warm-up followed by an eight-second sample. Eight moving remote avatars plus the local player, fixed wide Spawn Reveal camera, all remote avatars at detail level 2. The baseline disables only this venue batching and background-culling work.

| Metric | Baseline | Retained changes |
| --- | ---: | ---: |
| Average FPS | 24.1 | 28.5 |
| Median CPU frame | 40.2 ms | 34.3 ms |
| Median draw calls | 2175 | 1554 |
| Shader compilations during sample | 0 | 0 |

Sources: `eight-peers-baseline.json` and `eight-peers-optimized.json`. Both samples passed the fixed-camera, visibility, resolution, and compilation checks. This is approximately 18% higher FPS in this view, not a general player-capacity or 60-FPS claim. GPU timing was unavailable.

## Second performance pass

The next pass retains compiled avatar shaders across remote-avatar detail changes. Two traces rebuilt the same 15 variants in each eight-second close-view sample. A bounded cache now owns one reference per variant until eviction or pool disposal; the corresponding cache-enabled close sample recorded zero compilations. This addresses repeated compilation during detail changes, without claiming a separate average-FPS gain from caching. Sources: `shader-trace-baseline.json`, `shader-trace-repeat.json`, and `shader-cache-close.json`.

The jacket's background pass also omits static geometry entirely outside the screen regions needed by visible thin transmission. Regions conservatively contain animated bone bounds and signed morph deformation, with extra coverage for mipmap filtering. Dynamic objects and unsupported materials or projections retain their background rendering. Refraction stays at 1024 × 1024 with 4× MSAA; avatar geometry, textures, animation rates, and other quality settings are unchanged by this pass.

These comparisons use the same live WebGPU scene and the same measurement protocol as above, with eight moving remote avatars and a fully dressed female local avatar. The baseline already includes the first pass and the shader cache; only the new background-region culling is toggled.

| View / metric | Region culling off | Region culling on |
| --- | ---: | ---: |
| Close gameplay average FPS | 23.1 | 25.9 |
| Close median CPU frame | 40.7 ms | 36.2 ms |
| Close median background-target time | 17.4 ms | 13.1 ms |
| Close median draw calls | 1776 | 1448 |
| Wide average FPS | 28.8 | 34.3 |
| Wide median CPU frame | 33.7 ms | 28.1 ms |
| Wide median background-target time | 15.2 ms | 9.5 ms |
| Wide median draw calls | 1546 | 1138 |

Sources: `regions-close-before-repeat.json`, `regions-close-after-repeat.json`, `regions-wide-before.json`, and `regions-wide-after.json`. All four passed the camera, visibility, resolution, and compilation checks. Average FPS improved about 12% close and 19% wide in these samples. The close crowd continues to move across detail thresholds, with one or two detail-0 players and the remaining players at detail 1; crowd poses and exact detail counts are not frame-synchronized. The wide samples kept all eight at detail 2. GPU timing was unavailable. The earlier `regions-close-before.json` failed the camera check and is not used in these comparisons.

Final second-pass validation: 56 targeted tests passed across shader ownership/eviction, conservative animated transmission bounds and fallbacks, render-list filtering, asset-pool lifetime, remote-avatar transitions, benchmark cleanup, and main-stage integration. TypeScript checking and the production Vite build passed. WebGPU visual checks and a WebGL normal-game crowd smoke check exercised the complete female outfit (see `final-webgl-crowd.png`).

## Third performance pass: local avatar detail

The local player now uses the existing reduced-detail models as the camera moves away. The normal follow-camera range retains the full model; outward transitions occur at approximately 11 m and 26 m, with separate inward thresholds to prevent repeated swaps near a boundary. All local detail levels retain 60 Hz animation sampling. Outfit edits, character/profile changes, transforms, and the open wardrobe editor survive replacement; stale loads are released. The local asset pool reuses at most six character/detail sources and releases them with the scene.

The user quit Roblox and unplugged the computer during this pass. The following comparisons were both taken **on battery after Roblox closed**, using the same 1280 × 720 protocol and eight moving remote avatars. They should not be compared directly with the earlier plugged-in measurements. Only adaptive local detail is toggled within each pair; the previous performance improvements remain enabled.

| View / metric | Full local model | Adaptive local detail |
| --- | ---: | ---: |
| Middle view average FPS | 33.2 | 34.1 |
| Middle median CPU frame | 29.1 ms | 27.9 ms |
| Middle median draw calls | 1350 | 1232 |
| Middle local model triangles | 349,466 | 159,533 |
| Wide average FPS | 37.4 | 38.8 |
| Wide median CPU frame | 26.0 ms | 24.8 ms |
| Wide median draw calls | 1122 | 1078 |
| Wide local model triangles | 349,466 | 79,921 |

Sources: `local-detail-middle-before-battery.json`, `local-detail-middle-after-battery.json`, `local-detail-wide-before-battery.json`, and `local-detail-wide-after-battery.json`. Each pair uses the identical camera and complete female outfit. All eight remote avatars remain at detail 1 in both middle samples and detail 2 in both wide samples. All four reports passed the camera, visibility, resolution, and compilation checks, with zero shader compilations during sampling. GPU timing was unavailable. The measured gain is modest: approximately 2.7% middle and 3.7% wide, alongside 54% and 77% fewer triangles in the local model. These short samples do not establish a guaranteed gain or statistical significance.

Final third-pass validation: 64 targeted tests passed across local replacement races and cleanup, wardrobe editor rebinding, account/profile restoration, asset-pool animation sampling, distance thresholds, crouch behavior, transmission, main-stage integration, and benchmark validity/cleanup. TypeScript and the production build passed. Live WebGPU checks exercised both characters, wardrobe edits during camera-detail changes, and the return to the full model. The benchmark now rejects samples in which local detail changes and restores its comparison controls on disposal.

Material-freezing and shader-sort experiments were discarded because they did not demonstrate an improvement. The `material-cache-*`, `material-profile-close.json`, and `shader-order-*` files are diagnostics, not retained changes or supporting evidence for this pass; some shader-sort samples also failed validity checks while Roblox was competing for resources.

## Fourth performance pass: batch compatible avatar panels

The pooled avatar source now combines compatible skinned shoe, trim, eye, and accessory panels that share a material, bind-space transform, rig, and clothing controls. Copies reuse the combined geometry. Morph-driven parts, translucent/refraction surfaces, independently animated nodes, and unsupported vertex layouts retain their separate meshes. No model simplification, texture reduction, or animation-rate change is introduced by this pass.

This pass also fixed WebGPU conversion of packed RGB vertex colors: the float buffer now retains the original three-component width instead of assuming four. Both sides of the final comparison include this correction. Babylon's batching extraction can then expand RGB colors to RGBA with the original implicit alpha of 1.

Final battery-powered comparison, eight moving remote avatars plus a fully dressed local female avatar, WebGPU development build, 1280 × 720, identical close camera:

| Metric | Avatar batching off | Avatar batching on |
| --- | ---: | ---: |
| Average FPS | 31.4 | 31.2 |
| Median CPU frame | 30.6 ms | 30.5 ms |
| Median draw calls | 1356 | 1229 |
| Median active-mesh evaluation | 2.8 ms | 2.7 ms |
| Local model triangles | 349,466 | 349,466 |
| Remote model triangles | 2,524,470 | 2,524,470 |
| Scene materials / textures | 720 / 1443 | 720 / 1443 |

Sources: `avatar-batching-final-before.json` and `avatar-batching-final-after.json`. Both passed the visibility, camera, local-detail, resolution, and compilation checks. Both retained five full-detail and three middle-detail remote avatars, with zero pending loads and zero shader compilations. GPU timing was unavailable. The local female source combines 26 formerly separate panels into existing compatible groups. The measured draw-call reduction is approximately 9.4%; **the final pair does not establish an FPS improvement**. The earlier `avatar-batching-close-*` prototype samples suggested a gain that did not repeat in this final pair and are not used to claim one.

The 16-peer diagnostic (`avatar-batching-sixteen-before.json` / `avatar-batching-sixteen-after.json`) is excluded from performance comparisons because its baseline failed the camera-stability check. Local development-browser samples on battery do not establish production player capacity.

Fourth-pass validation: 93 targeted tests passed, including exact attribute and triangle retention, skinned vertex positions across seven poses under mirrored/nonuniform parent transforms, independent cloned rigs and wardrobe controls, attachment visibility, RGB buffer widths, conservative exclusions, pool cleanup, scene integration, local detail changes, and remote rendering controls. TypeScript and the production build passed.

Live WebGPU and WebGL checks loaded both characters and the crowd. An isolated WebGL check verified complete shoe removal/restoration and character replacement; final outfits are recorded in `avatar-batching-webgl-female.png` and `avatar-batching-webgl-male.png`.

## Fifth performance pass: GPU timing and final-output buffers

The local profiler now requests WebGPU's optional `timestamp-query` feature only with `?debug=1&gpuProfile=1` on loopback. It enables pass counters before render targets are created and reports completed asynchronous results once, including targets shared between post-processes. The old whole-frame timer is unavailable on this browser, so it remains `null`; pass measurements are reported separately. Targets named `highlights input`, etc. hold the input to that named effect, so their timings must not be read as that effect's own execution time. `Backbuffer` is the final display target, not the geometry pass. Per-target averages are not a wall-clock frame total.

The normal WebGPU pipeline renders geometry into its existing single-sample scene target, then runs bloom, image processing, sharpening, grain, and FXAA. The final FXAA image previously went into an additional four-sample color target and four-sample depth target before resolving to the display. Normal WebGPU startup now omits that extra color target and uses single-sample final depth. Geometry sampling, FXAA, the jacket background's MSAA, assets, and effects are unchanged. `?perf=nopost` retains engine antialiasing for direct geometry rendering. The local `?debug=1&backbufferMsaa=1` option restores the previous output path for comparison. WebGL startup retains its existing antialiasing settings.

Both comparisons below were taken **on AC power**, with eight moving remote players and a fully dressed local female character at the identical close camera and 1280 × 720. They are not directly comparable with the previous battery-powered pass.

| Metric | Previous output buffer | Single-sample output buffer |
| --- | ---: | ---: |
| GPU-profiled final-buffer average | 3.40 ms | 2.99 ms |
| GPU-profiled average FPS | 28.5 | 29.1 |
| Final average FPS, GPU profiling off | 30.0 | 30.0 |
| Final median CPU frame | 32.0 ms | 31.9 ms |
| Final median frame interval | 33.0 ms | 33.1 ms |
| Final p95 frame interval | 38.2 ms | 39.0 ms |
| Final median draw calls | 1227 | 1229 |

Sources: `backbuffer-msaa-gpu-before.json` / `backbuffer-msaa-gpu-after.json`, and `backbuffer-msaa-final-before.json` / `backbuffer-msaa-final-after.json`. The GPU-profiled pair predates the explicit `backbufferAntialias` report field; its baseline used `backbufferMsaa=1`, and its candidate omitted that flag. Both final reports explicitly confirm the intended antialias setting and GPU pass timing disabled. All four reports passed the camera, visibility, resolution, local-detail, and compilation checks, with zero shader compilations. Both final samples retained the same local 349,466 triangles and remote 2,524,470 triangles (five full-detail and three middle-detail remote models), with no pending loads. Small draw-count differences reflect the moving crowd.

The single GPU-profiled pair suggests a modest reduction in final-buffer cost. **The final comparison does not demonstrate an FPS or frame-pacing improvement.** The change removes redundant buffer allocation and resolve work; physical GPU memory usage was not measured. Visual checks of the normal WebGPU crowd found no noticeable change in the finished scene (`backbuffer-msaa-before.jpg` / `backbuffer-msaa-after.jpg`; these are different animation frames, not a pixel-equivalence test).

CPU phase reporting now separates scene rendering, remote updates, and venue-show updates. In the final candidate, those medians were 29.2 ms, 1.1 ms, and 1.4 ms respectively. The earlier `gpu-profile-*` files are diagnostic captures; the first two did not yet include all post-process input targets. An attempted empty-refraction-list optimization was removed after `unused-refraction-already-skipped.json` showed Babylon already omits that pass when no visible material needs it.

The WebGL smoke check found that the modular engine had not registered its timing-query extension: starting a benchmark threw and left the measurement stuck. The profiler now explicitly imports that extension, and a test exercises the real engine instrumentation without GPU timer support. The repaired live WebGL benchmark completed with all validity checks passing, eight loaded and animating peers, and no new console errors or warnings (`backbuffer-msaa-webgl-smoke.json`). Its normal antialiasing remained enabled and optional WebGPU pass timing remained disabled; the complete outfit and crowd were visually checked in `backbuffer-msaa-webgl.jpg`.

Fifth-pass validation: 47 targeted tests passed across engine initialization, optional/unsupported GPU timing, no-post antialiasing, asynchronous counter deduplication and reset, real WebGL instrumentation, benchmark cleanup, presentation setup, scene integration, and transmission bounds. TypeScript checking and the production build passed.

## Sixth performance pass: CPU method profiling

The local benchmark now accepts `?debug=1&benchmark=1&cpuProfile=1` on loopback to time selected Babylon rendering methods. `cpuProfile=materials` additionally breaks binding work down by material. The counters distinguish inclusive time from time excluding nested measured methods, accept exactly the same frames as the benchmark, omit warm-up and rejected end frames, and restore the original methods on completion or panel disposal. Normal play does not install these method wrappers. The timers add overhead and their timings are diagnostic; they must not be compared directly with uninstrumented FPS or summed as independent costs.

The initial full-crowd profile (`cpu-method-profile-before.json`) recorded about 8.0 ms per frame inside PBR binding and 7.3 ms inside GPU draw encoding. Their nested work overlaps other reported methods. Skeleton preparation was about 0.45 ms and Babylon's scene-animation step was 0.03 ms; explicit local and remote animation updates are accounted for elsewhere in the frame. The evidence points toward material setup and draw submission rather than skeleton preparation as the larger rendering costs. `cpu-material-profile-before.json` showed that the binding cost is distributed across many materials rather than one unusually expensive material.

A tested buffer-layout experiment combines position, normal, joint-index, and joint-weight float streams into a shared immutable buffer. Its fixed offsets avoid dependence on glTF attribute order, and UV/color/tangent streams retain their original buffers. Geometry, weights, morph targets, material parameters, and animation rates are unchanged. In the live WebGPU profile, vertex-buffer bindings fell from **4,869 to 3,237 per frame**, about 34% (`vertex-buffers-profile-before.json` / `vertex-buffers-profile-after.json`). Both retained eight moving remote players and the full local female outfit; small draw-count differences reflect crowd poses. The method-profiled draw-encoding average remained 7.68 ms on both sides, so the lower binding count did not translate into a measured reduction in that inclusive timing.

The uninstrumented tests below used AC power, 1280 × 720, the identical close camera, eight moving remote avatars, and the complete local female outfit. Both baseline samples retained five full-detail and three middle-detail remote avatars, as did all three candidates; local and remote triangle counts remained 349,466 and 2,524,470. All passed the benchmark's camera, visibility, local-detail, resolution, and compilation checks, with no shader compilations and no pending avatar loads.

| Sample / metric | Separate core buffers | Interleaved core buffers |
| --- | ---: | ---: |
| First AC comparison average FPS | 30.9 | 31.5 |
| First median CPU frame | 31.4 ms | 30.7 ms |
| Reverse-order comparison average FPS | 30.9 | 28.5 |
| Reverse-order median CPU frame | 31.4 ms | 33.0 ms |
| Additional warmed candidate average FPS | — | 29.0 |
| Additional warmed candidate median CPU frame | — | 32.1 ms |

Sources: `vertex-buffers-ac-before.json`, `vertex-buffers-ac-after.json`, `vertex-buffers-final-before.json`, `vertex-buffers-final-after.json`, and `vertex-buffers-warm-after.json`. The candidate was measured before the baseline in the reverse-order pair. Other applications and system processes were active during testing, including system photo analysis observed at substantial CPU usage; this was not an isolated hardware benchmark. **No repeatable FPS improvement was established, and later candidate samples were slower. The experiment is disabled in normal play.** It remains available only through `?debug=1&avatarVertexBuffers=1` on loopback for further diagnosis; WebGL always retains its original layout. The prototype reports predate this final opt-in policy: the earlier candidate omitted the baseline's `avatarVertexBuffers=0` flag.

The earlier `vertex-buffers-baseline.json` / `vertex-buffers-candidate.json` samples are excluded from claims because the computer changed from battery to AC during that part of the work. `vertex-buffers-before.json` is also excluded: its local fixture token had expired, leaving no remote crowd and a different local character and camera. Its built-in validity result does not make it comparable to an eight-player sample.

Sixth-pass validation: 86 targeted tests passed across exact vertex data and bounds, RGB widths, corrective targets, native-buffer reference cleanup, independent pooled rigs, real WebGPU input layouts, experiment opt-in/default behavior, nested CPU timing, warm-up exclusion, exceptions, counter reset, loopback restrictions, profiler disposal, scene integration, remote players, and refraction bounds. TypeScript checking and the production build passed. Normal WebGPU character checks are recorded in `cpu-profile-release-webgpu-female.jpg` and `cpu-profile-release-webgpu-male.jpg`.

The final live WebGPU benchmark confirmed the experiment and CPU timers were disabled (`cpu-profile-release-webgpu.json`). The final WebGL CPU profile completed with eight moving peers, all validity checks passing, exactly 178 accepted timing frames, and no new console errors or warnings (`cpu-profile-release-webgl.json` / `cpu-profile-release-webgl.jpg`). WebGL's unsupported GPU-binding counter reports `null`, after a smoke-test finding corrected its initial zero result; the relevant 12 profiler tests and TypeScript/Vite build passed again after that correction.

## Limits recorded before the final production pass

At this earlier stage, close crowded views remained below 60 FPS on this machine. The old `eight-peers-normal-*.json` reports predate the shader-cache fix and remain marked invalid for steady-state comparisons. These local development-browser samples do not establish production player capacity or performance on other hardware.

`bundles-experiment.json` and `eight-peers-morph-stable.json` describe discarded experiments. WebGPU bundle mode did not improve FPS; reserving all corrective morph shader capacity did not eliminate compilation hitches. Neither experiment is retained in the game. The latter file's name describes the attempted change, not a successful result; its report explicitly has `valid: false`.

First-pass validation: 59 targeted integration/scene/player checks plus three performance-panel checks passed; the existing 13 asset-pool checks passed alongside the subsequently removed experimental test. TypeScript checking and the final production Vite build passed. Interactive checks exercised the actual normal-game Avatar panel and saved-profile endpoint.

The temporary refraction-disable and MSAA-reduction controls were removed. `refraction-msaa1.json` and `no-refraction-diagnostic.json` are diagnostic experiments, not retained quality changes.
