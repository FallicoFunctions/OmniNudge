# OmniRave launch-avatar handoff

Current scope: the male and female launch avatars with one complete outfit each. Extra clothing and OmniAI conversion are deferred. No paid provider or artist work is in progress.

Continued on September 14:

- Increased coverage of the existing female ponytail ribbons and brightened their pink color. No polygons were added; roots and secondary hair displacement are preserved. `pony-coverage/` retains the prior native/model files, mapping and checks. Current front render: `female-front.png`.
- Both player and multiplayer imports now use lossless gzip transport, validated by size and SHA-256 after decoding. The six ordinary GLBs remain a versioned fallback for older browsers or failed compressed requests. Each production build regenerates and verifies delivery copies.
- Hero downloads are **19.4 MiB male** (from 77.6) and **15.6 MiB female** (from 71.0); distance downloads are 3.5–8.1 MiB. All decoded bytes exactly match the model exports. This changes network transfer size, not the GPU geometry budget.
- A production test server blocked ordinary complete-avatar GLBs. Both heroes, all four distance assets and eight moving venue peers still loaded. No complete-avatar fallback was requested. The fixture initially also blocked the venue itself; correcting that fixture rule and retrying restored the venue. The retained log records that failed fixture attempt.
- At a fixed 1280 × 720 in the isolated crowd scene, an Apple M1 with 16 GiB RAM on AC power measured **60 FPS with 8**, **60 FPS with 16**, and **37.1 FPS with 32** avatars. Automatic distance detail and the existing reduced transparency pass were enabled. One earlier sample overlapped material validation and is explicitly discarded in the record. These results do not compare directly with the earlier battery/Low Power Mode run. The complete venue's live readout was approximately 30 FPS with eight moving peers and automatic resolution; that was a smoke check, not the same fixed-resolution benchmark.
- This continuation passes 45 relevant tests across seven files: 31 rig/crowd/expression/crouch cases, nine download cases and five account cases. The initial download run hit a shared DOM-only test cleanup; supporting the Node test environment resolved it. `download-tests.log`, the four passing suites in `delivery-tests-initial.log`, and `delivery-account-tests.log` retain the results. `delivery-production-build.log` records the passing TypeScript and production build. Native root checks cover 27 movement samples and seven expression/secondary combinations. All three changed GLBs report zero validation errors; knit, coating and transmission checks were refreshed.

Earlier selector/startup work:

- The normal signed-in Avatar panel selects Male or Female. The existing body stays visible while the replacement loads. A failed load retains it and offers a retry.
- Successful selections start with the complete outfit, save to the account and reach other players. A fresh local account launch restored the selected female character.
- Loading feedback starts during renderer initialization. Failed or stalled WebGPU initialization falls back to a fresh WebGL canvas; late WebGPU completion is released.
- All three female distance exports now carry the corrected hair material. The latest fabric and hairline files have current material checks and full-body renders.

`male-front.png` and the refreshed `female-front.png` show the current models at 1536 × 2048. They still differ visibly from the original reference artwork. Geometry, garment details and material appearance have not received final visual acceptance. Existing zipper and hardware locations remain fixed under user direction.

Validation:

- 105 relevant tests across 15 files pass across the retained runs. `selection-tests-initial.log` includes three initial failures caused by a test reading the new loading status instead of the outfit-save status. The scoped query was corrected; all four account-save tests pass in `avatar-tests.log` and `startup-tests.log`.
- TypeScript and the final production build pass (`production-build.log`).
- The local WebGPU sender and WebGL observer received both character switches without browser warnings/errors during that check. Fresh WebGL account restoration passed. A subsequent WebGPU launch stalled before the startup fix; the final post-fix WebGPU launch succeeded. `browser-validation.json` records the scope.
- Portable fabric, coating and transmission reports match the current six model hashes. The material-only export and female hair-transfer export reported zero glTF errors; warnings remain recorded in those source reports.

Remaining release work: visual acceptance against the artwork, a timed complete-venue/device and real-network loading check, and verification of the actual production account/deployment environment. The local crowd measurements and byte reductions above do not establish performance on other devices or networks. This handoff does not declare all of OmniRave ready to deploy. No deployment has been performed.
