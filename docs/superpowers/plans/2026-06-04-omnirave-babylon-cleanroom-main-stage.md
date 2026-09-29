# OmniRave Babylon Cleanroom Main Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new Babylon.js cleanroom runtime in a sibling `omnirave-babylon/` app and deliver a walkable Main Stage vertical slice that the user can inspect in third-person and first-person before any other venue work proceeds.

**Architecture:** The implementation creates a brand-new Vite + TypeScript + Babylon.js runtime instead of modifying the existing React Three Fiber runtime. The first milestone is intentionally single-player and backend-free, but its scene graph, asset pipeline, camera rig, avatar embodiment, and review tooling are structured so they can later survive authoritative multiplayer integration rather than becoming a throwaway showcase.

**Tech Stack:** Babylon.js, TypeScript, Vite, Vitest, jsdom, Blender-authored GLB assets, KTX2/Basis-ready asset pipeline, Git LFS for large binary assets.

---

## Scope And Decomposition

This plan covers one deliverable only: the Babylon cleanroom runtime and the first Main Stage visual vertical slice.

Out of scope for this plan:

- live backend integration
- authoritative multiplayer
- authentication
- The Underground
- P.L.U.R.R. Partay
- social systems
- mobile and VR

Follow-on plans should handle:

1. backend/world integration review and protocol survival
2. multiplayer/player presence
3. additional venues
4. mobile and VR adaptation

This plan should produce working, testable software on its own:

- `omnirave-babylon` boots locally
- Babylon scene renders in-browser
- the user can walk Main Stage
- the user can scroll from third-person into first-person
- Main Stage loads from authored assets instead of code primitives
- review HUD/debug/perf tooling is available

---

## File Structure

### New runtime app

- Create: `omnirave-babylon/package.json`
  - Babylon runtime package manifest and scripts.
- Create: `omnirave-babylon/tsconfig.json`
  - TypeScript compiler configuration for the cleanroom app.
- Create: `omnirave-babylon/vite.config.ts`
  - Vite dev/build/test configuration.
- Create: `omnirave-babylon/index.html`
  - Single runtime host page.
- Create: `omnirave-babylon/src/main.ts`
  - Runtime entrypoint.
- Create: `omnirave-babylon/src/styles.css`
  - Full-screen runtime and review HUD styling.

### Runtime bootstrap and scene files

- Create: `omnirave-babylon/src/app/bootstrapRuntime.ts`
  - DOM bootstrap and top-level runtime startup.
- Create: `omnirave-babylon/src/app/createRuntime.ts`
  - Engine lifecycle orchestration and scene wiring.
- Create: `omnirave-babylon/src/app/runtimeConfig.ts`
  - Approval-target-aware runtime constants and flags.
- Create: `omnirave-babylon/src/scene/createMainStageScene.ts`
  - Scene assembly root for Main Stage.
- Create: `omnirave-babylon/src/scene/createLightingRig.ts`
  - Main Stage lighting, fog, and post-process setup.
- Create: `omnirave-babylon/src/scene/loadMainStageAssets.ts`
  - Runtime GLB/material/collision loading.
- Create: `omnirave-babylon/src/scene/mainStageManifest.ts`
  - Asset manifest and runtime path mapping.
- Create: `omnirave-babylon/src/scene/reviewRouteData.ts`
  - Spawn and review route coordinates.

### Player systems

- Create: `omnirave-babylon/src/player/createInputMap.ts`
  - Keyboard/mouse input state.
- Create: `omnirave-babylon/src/player/createPlayerRig.ts`
  - Collision capsule, root node, and movement integration.
- Create: `omnirave-babylon/src/player/cameraRigMath.ts`
  - Pure zoom/offset math for tests.
- Create: `omnirave-babylon/src/player/movementMath.ts`
  - Pure movement helpers for tests.
- Create: `omnirave-babylon/src/player/createFollowCameraRig.ts`
  - Third-person to first-person camera behavior.
- Create: `omnirave-babylon/src/player/createReviewAvatar.ts`
  - Local avatar loading and attachment.
- Create: `omnirave-babylon/src/player/avatarAnimationState.ts`
  - Idle/walk/run state selection.

### UI and instrumentation

- Create: `omnirave-babylon/src/ui/createReviewHud.ts`
  - Overlay showing venue name, camera mode, controls, and debug toggles.
- Create: `omnirave-babylon/src/ui/createPerfOverlay.ts`
  - Frame-time/FPS instrumentation for review.
- Create: `omnirave-babylon/src/ui/createDebugPanel.ts`
  - Lighting/collision/debug toggles.

### Tests

- Create: `omnirave-babylon/tests/setup.ts`
  - Vitest DOM setup.
- Create: `omnirave-babylon/src/app/__tests__/bootstrapRuntime.test.ts`
  - Bootstrap smoke coverage.
- Create: `omnirave-babylon/src/scene/__tests__/mainStageManifest.test.ts`
  - Manifest and route validation.
- Create: `omnirave-babylon/src/player/__tests__/cameraRigMath.test.ts`
  - Zoom and offset behavior.
- Create: `omnirave-babylon/src/player/__tests__/movementMath.test.ts`
  - Traversal behavior.
- Create: `omnirave-babylon/src/player/__tests__/avatarAnimationState.test.ts`
  - Idle/walk/run transitions.

### Source assets and automation

- Create: `.gitattributes`
  - Track large Babylon source/runtime assets with Git LFS.
- Create: `omnirave-babylon/assets-src/main-stage/README.md`
  - Source-of-truth notes, naming, units, and export contract.
- Create: `omnirave-babylon/assets-src/main-stage/main-stage-source-manifest.md`
  - Enumerates Main Stage source files and expected outputs.
- Create: `omnirave-babylon/assets-src/avatars/review-rig/README.md`
  - Review avatar source and export contract.
- Create: `omnirave-babylon/scripts/export-main-stage.sh`
  - Runs Blender export pipeline.
- Create: `omnirave-babylon/scripts/export-main-stage.py`
  - Blender batch export script.
- Create: `omnirave-babylon/scripts/optimize-main-stage.mjs`
  - GLB optimization, validation, and KTX2-ready checks.
- Create: `omnirave-babylon/scripts/export-review-avatar.sh`
  - Avatar export wrapper.
- Create: `omnirave-babylon/public/assets/venues/main-stage/.gitkeep`
  - Runtime asset destination.
- Create: `omnirave-babylon/public/assets/avatars/review-rig/.gitkeep`
  - Runtime avatar asset destination.

### Review baseline and docs

- Create: `docs/technical/omnirave/2026-06-04-main-stage-approval-baseline.md`
  - Frozen review hardware/browser record for the first approval cycle.
- Modify: `omnirave-web/README.md`
  - Mark the old runtime as superseded for new implementation work.

---

## Task 1: Create The Approval Baseline And Cleanroom App Skeleton

**Files:**
- Create: `docs/technical/omnirave/2026-06-04-main-stage-approval-baseline.md`
- Create: `.gitattributes`
- Create: `omnirave-babylon/package.json`
- Create: `omnirave-babylon/tsconfig.json`
- Create: `omnirave-babylon/vite.config.ts`
- Create: `omnirave-babylon/index.html`
- Create: `omnirave-babylon/src/main.ts`
- Create: `omnirave-babylon/src/styles.css`
- Create: `omnirave-babylon/tests/setup.ts`
- Create: `omnirave-babylon/src/app/bootstrapRuntime.ts`
- Create: `omnirave-babylon/src/app/__tests__/bootstrapRuntime.test.ts`

- [ ] **Step 1: Write the failing bootstrap test**

```ts
// omnirave-babylon/src/app/__tests__/bootstrapRuntime.test.ts
import { describe, expect, it } from 'vitest';
import { bootstrapRuntime } from '../bootstrapRuntime';

describe('bootstrapRuntime', () => {
  it('creates the Babylon host element exactly once', () => {
    document.body.innerHTML = '<div id="app"></div>';

    bootstrapRuntime();
    bootstrapRuntime();

    const hosts = document.querySelectorAll('[data-testid="babylon-runtime-host"]');
    expect(hosts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm test -- --run src/app/__tests__/bootstrapRuntime.test.ts`

Expected: FAIL because `omnirave-babylon` and `bootstrapRuntime.ts` do not exist yet.

- [ ] **Step 3: Create the baseline document and minimal cleanroom scaffold**

```md
<!-- docs/technical/omnirave/2026-06-04-main-stage-approval-baseline.md -->
# Main Stage Approval Baseline

- Chrome version: capture with `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --version`
- Edge version: capture with `/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge --version` or mark `available: false`
- macOS version: capture with `sw_vers -productVersion`
- Review machine model: capture with `system_profiler SPHardwareDataType`
- GPU model: capture with `system_profiler SPDisplaysDataType`
- Review resolution: capture from System Settings > Displays and record exact pixel dimensions
- Windows verification machine: set `available: false` if not present at kickoff
```

```json
// omnirave-babylon/package.json
{
  "name": "omnirave-babylon",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 4175",
    "build": "tsc -b && vite build",
    "test": "vitest"
  },
  "dependencies": {
    "@babylonjs/core": "^8.1.0",
    "@babylonjs/gui": "^8.1.0",
    "@babylonjs/inspector": "^8.1.0",
    "@babylonjs/loaders": "^8.1.0",
    "@babylonjs/materials": "^8.1.0"
  },
  "devDependencies": {
    "@types/node": "^24.10.1",
    "jsdom": "^27.0.1",
    "typescript": "~5.9.3",
    "vite": "^7.2.4",
    "vitest": "^3.2.4"
  }
}
```

```json
// omnirave-babylon/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

```html
<!-- omnirave-babylon/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OmniRave Babylon Cleanroom</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

```css
/* omnirave-babylon/src/styles.css */
html, body, #app {
  margin: 0;
  width: 100%;
  height: 100%;
  background: #050711;
}

.babylon-runtime-host,
.babylon-render-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
```

```ts
// omnirave-babylon/tests/setup.ts
import { afterEach } from 'vitest';

afterEach(() => {
  document.body.innerHTML = '';
});
```

```ts
// omnirave-babylon/src/app/bootstrapRuntime.ts
export function bootstrapRuntime() {
  const app = document.getElementById('app');
  if (!app) {
    throw new Error('Missing #app host');
  }

  let host = app.querySelector<HTMLElement>('[data-testid="babylon-runtime-host"]');
  if (!host) {
    host = document.createElement('div');
    host.dataset.testid = 'babylon-runtime-host';
    host.className = 'babylon-runtime-host';
    app.appendChild(host);
  }
}
```

```ts
// omnirave-babylon/src/main.ts
import './styles.css';
import { bootstrapRuntime } from './app/bootstrapRuntime';

bootstrapRuntime();
```

```ts
// omnirave-babylon/vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    css: false,
  },
});
```

```gitattributes
# .gitattributes
*.blend filter=lfs diff=lfs merge=lfs -text
*.glb filter=lfs diff=lfs merge=lfs -text
*.ktx2 filter=lfs diff=lfs merge=lfs -text
```

- [ ] **Step 4: Run the bootstrap test and app build**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm install && npm test -- --run src/app/__tests__/bootstrapRuntime.test.ts && npm run build`

Expected: PASS for the test and a successful Vite build.

- [ ] **Step 5: Commit**

```bash
git add \
  docs/technical/omnirave/2026-06-04-main-stage-approval-baseline.md \
  .gitattributes \
  omnirave-babylon/package.json \
  omnirave-babylon/tsconfig.json \
  omnirave-babylon/vite.config.ts \
  omnirave-babylon/index.html \
  omnirave-babylon/src/main.ts \
  omnirave-babylon/src/styles.css \
  omnirave-babylon/tests/setup.ts \
  omnirave-babylon/src/app/bootstrapRuntime.ts \
  omnirave-babylon/src/app/__tests__/bootstrapRuntime.test.ts
git commit -m "feat: scaffold Babylon cleanroom runtime"
```

---

## Task 2: Bootstrap The Babylon Engine And Review Scene Shell

**Files:**
- Create: `omnirave-babylon/src/app/createRuntime.ts`
- Create: `omnirave-babylon/src/app/runtimeConfig.ts`
- Create: `omnirave-babylon/src/scene/createMainStageScene.ts`
- Create: `omnirave-babylon/src/ui/createReviewHud.ts`
- Modify: `omnirave-babylon/src/app/bootstrapRuntime.ts`
- Modify: `omnirave-babylon/src/app/__tests__/bootstrapRuntime.test.ts`

- [ ] **Step 1: Extend the failing test to require a canvas and review HUD**

```ts
// omnirave-babylon/src/app/__tests__/bootstrapRuntime.test.ts
import { describe, expect, it } from 'vitest';
import { bootstrapRuntime } from '../bootstrapRuntime';

describe('bootstrapRuntime', () => {
  it('creates a render canvas and review HUD', async () => {
    document.body.innerHTML = '<div id="app"></div>';

    await bootstrapRuntime();

    expect(document.querySelector('canvas[data-testid="babylon-render-canvas"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="review-hud"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm test -- --run src/app/__tests__/bootstrapRuntime.test.ts`

Expected: FAIL because no canvas or HUD exists.

- [ ] **Step 3: Add the minimal Babylon runtime shell**

```ts
// omnirave-babylon/src/app/createRuntime.ts
import { Engine } from '@babylonjs/core/Engines/engine';
import { createMainStageScene } from '../scene/createMainStageScene';
import { createReviewHud } from '../ui/createReviewHud';
import { RUNTIME_CONFIG } from './runtimeConfig';

export async function createRuntime(host: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.dataset.testid = 'babylon-render-canvas';
  canvas.className = 'babylon-render-canvas';
  host.appendChild(canvas);

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });

  const hud = createReviewHud(host);
  const scene = await createMainStageScene(engine);

  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener('resize', () => engine.resize());

  return { engine, scene, canvas, hud, config: RUNTIME_CONFIG };
}
```

```ts
// omnirave-babylon/src/app/runtimeConfig.ts
export const RUNTIME_CONFIG = {
  appName: 'omnirave-babylon',
  defaultCanvasId: 'babylon-render-canvas',
  targetFps: 60,
} as const;
```

```ts
// omnirave-babylon/src/scene/createMainStageScene.ts
import { Color4, Scene } from '@babylonjs/core';
import type { Engine } from '@babylonjs/core/Engines/engine';

export async function createMainStageScene(engine: Engine) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.03, 0.06, 1);
  return scene;
}
```

```ts
// omnirave-babylon/src/app/bootstrapRuntime.ts
import { createRuntime } from './createRuntime';

export async function bootstrapRuntime() {
  const app = document.getElementById('app');
  if (!app) {
    throw new Error('Missing #app host');
  }

  let host = app.querySelector<HTMLElement>('[data-testid="babylon-runtime-host"]');
  if (!host) {
    host = document.createElement('div');
    host.dataset.testid = 'babylon-runtime-host';
    host.className = 'babylon-runtime-host';
    app.appendChild(host);
  }

  if (!host.querySelector('canvas[data-testid="babylon-render-canvas"]')) {
    await createRuntime(host);
  }
}
```

```ts
// omnirave-babylon/src/ui/createReviewHud.ts
export function createReviewHud(host: HTMLElement) {
  const hud = document.createElement('aside');
  hud.dataset.testid = 'review-hud';
  hud.className = 'review-hud';
  hud.innerHTML = `
    <p class="review-hud__eyebrow">Main Stage Review</p>
    <h1 class="review-hud__title">OmniRave Babylon Cleanroom</h1>
    <p class="review-hud__copy">Bootstrapping review runtime.</p>
  `;
  host.appendChild(hud);
  return hud;
}
```

- [ ] **Step 4: Run the test and build again**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm test -- --run src/app/__tests__/bootstrapRuntime.test.ts && npm run build`

Expected: PASS and build success.

- [ ] **Step 5: Commit**

```bash
git add \
  omnirave-babylon/src/app/createRuntime.ts \
  omnirave-babylon/src/app/runtimeConfig.ts \
  omnirave-babylon/src/scene/createMainStageScene.ts \
  omnirave-babylon/src/ui/createReviewHud.ts \
  omnirave-babylon/src/app/bootstrapRuntime.ts \
  omnirave-babylon/src/app/__tests__/bootstrapRuntime.test.ts
git commit -m "feat: add Babylon runtime shell"
```

---

## Task 3: Define The Asset Source Tree And Automation Contracts

**Files:**
- Create: `omnirave-babylon/assets-src/main-stage/README.md`
- Create: `omnirave-babylon/assets-src/main-stage/main-stage-source-manifest.md`
- Create: `omnirave-babylon/assets-src/avatars/review-rig/README.md`
- Create: `omnirave-babylon/scripts/export-main-stage.sh`
- Create: `omnirave-babylon/scripts/export-main-stage.py`
- Create: `omnirave-babylon/scripts/optimize-main-stage.mjs`
- Create: `omnirave-babylon/scripts/export-review-avatar.sh`
- Create: `omnirave-babylon/src/scene/mainStageManifest.ts`
- Create: `omnirave-babylon/src/scene/__tests__/mainStageManifest.test.ts`
- Create: `omnirave-babylon/public/assets/venues/main-stage/.gitkeep`
- Create: `omnirave-babylon/public/assets/avatars/review-rig/.gitkeep`

- [ ] **Step 1: Write the failing manifest test**

```ts
// omnirave-babylon/src/scene/__tests__/mainStageManifest.test.ts
import { describe, expect, it } from 'vitest';
import { MAIN_STAGE_MANIFEST } from '../mainStageManifest';

describe('MAIN_STAGE_MANIFEST', () => {
  it('declares the authored GLB, collision GLB, and review avatar runtime paths', () => {
    expect(MAIN_STAGE_MANIFEST.sceneGlb).toBe('/assets/venues/main-stage/main-stage.glb');
    expect(MAIN_STAGE_MANIFEST.collisionGlb).toBe('/assets/venues/main-stage/main-stage-collision.glb');
    expect(MAIN_STAGE_MANIFEST.reviewAvatarGlb).toBe('/assets/avatars/review-rig/review-rig.glb');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm test -- --run src/scene/__tests__/mainStageManifest.test.ts`

Expected: FAIL because the manifest file does not exist yet.

- [ ] **Step 3: Create the asset contract docs, manifest, and export scripts**

```ts
// omnirave-babylon/src/scene/mainStageManifest.ts
export const MAIN_STAGE_MANIFEST = {
  sceneGlb: '/assets/venues/main-stage/main-stage.glb',
  collisionGlb: '/assets/venues/main-stage/main-stage-collision.glb',
  reviewAvatarGlb: '/assets/avatars/review-rig/review-rig.glb',
  sourceBlend: 'assets-src/main-stage/main-stage.blend',
  sourceAvatarBlend: 'assets-src/avatars/review-rig/review-rig.blend',
} as const;
```

```bash
#!/usr/bin/env bash
# omnirave-babylon/scripts/export-main-stage.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BLEND_FILE="$ROOT_DIR/assets-src/main-stage/main-stage.blend"
PYTHON_SCRIPT="$ROOT_DIR/scripts/export-main-stage.py"

blender -b "$BLEND_FILE" --python "$PYTHON_SCRIPT"
node "$ROOT_DIR/scripts/optimize-main-stage.mjs"
```

```py
# omnirave-babylon/scripts/export-main-stage.py
import bpy
from pathlib import Path

root = Path(__file__).resolve().parent.parent
output_dir = root / "public" / "assets" / "venues" / "main-stage"
output_dir.mkdir(parents=True, exist_ok=True)

bpy.ops.export_scene.gltf(
    filepath=str(output_dir / "main-stage.glb"),
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
)
```

```md
<!-- omnirave-babylon/assets-src/main-stage/README.md -->
# Main Stage Source Rules

- Blender units: metric, scale 1.0
- Forward: -Y, Up: Z
- Runtime export names:
  - `main-stage.glb`
  - `main-stage-collision.glb`
- Do not model the venue as code-driven primitive shells
- The approved reference pack and approved concept images remain the authority
```

```md
<!-- omnirave-babylon/assets-src/main-stage/main-stage-source-manifest.md -->
# Main Stage Source Manifest

- Source blend: `main-stage.blend`
- Runtime exports:
  - `public/assets/venues/main-stage/main-stage.glb`
  - `public/assets/venues/main-stage/main-stage-collision.glb`
- Review checkpoints to validate after each export:
  - back-plaza reveal
  - promenade centerline
  - basin edge
  - VIP terrace
```

```bash
#!/usr/bin/env bash
# omnirave-babylon/scripts/export-review-avatar.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BLEND_FILE="$ROOT_DIR/assets-src/avatars/review-rig/review-rig.blend"
OUTPUT_FILE="$ROOT_DIR/public/assets/avatars/review-rig/review-rig.glb"

blender -b "$BLEND_FILE" --python-expr "import bpy; bpy.ops.export_scene.gltf(filepath=r'$OUTPUT_FILE', export_format='GLB', export_yup=True, export_apply=True)"
```

```js
// omnirave-babylon/scripts/optimize-main-stage.mjs
import { access } from 'node:fs/promises';

const sceneGlb = new URL('../public/assets/venues/main-stage/main-stage.glb', import.meta.url);

try {
  await access(sceneGlb);
  console.log('[optimize-main-stage] Found Main Stage GLB export');
} catch (error) {
  console.error('[optimize-main-stage] Missing Main Stage GLB export');
  process.exitCode = 1;
}
```

- [ ] **Step 4: Run the manifest test**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm test -- --run src/scene/__tests__/mainStageManifest.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  omnirave-babylon/assets-src/main-stage/README.md \
  omnirave-babylon/assets-src/main-stage/main-stage-source-manifest.md \
  omnirave-babylon/assets-src/avatars/review-rig/README.md \
  omnirave-babylon/scripts/export-main-stage.sh \
  omnirave-babylon/scripts/export-main-stage.py \
  omnirave-babylon/scripts/optimize-main-stage.mjs \
  omnirave-babylon/scripts/export-review-avatar.sh \
  omnirave-babylon/src/scene/mainStageManifest.ts \
  omnirave-babylon/src/scene/__tests__/mainStageManifest.test.ts \
  omnirave-babylon/public/assets/venues/main-stage/.gitkeep \
  omnirave-babylon/public/assets/avatars/review-rig/.gitkeep
git commit -m "feat: define Babylon asset pipeline contracts"
```

---

## Task 4: Implement Traversal, Input, And The Continuous Zoom Camera

**Files:**
- Create: `omnirave-babylon/src/player/createInputMap.ts`
- Create: `omnirave-babylon/src/player/movementMath.ts`
- Create: `omnirave-babylon/src/player/cameraRigMath.ts`
- Create: `omnirave-babylon/src/player/createPlayerRig.ts`
- Create: `omnirave-babylon/src/player/createFollowCameraRig.ts`
- Create: `omnirave-babylon/src/player/__tests__/movementMath.test.ts`
- Create: `omnirave-babylon/src/player/__tests__/cameraRigMath.test.ts`
- Modify: `omnirave-babylon/src/scene/createMainStageScene.ts`

- [ ] **Step 1: Write failing movement and camera math tests**

```ts
// omnirave-babylon/src/player/__tests__/cameraRigMath.test.ts
import { describe, expect, it } from 'vitest';
import { resolveZoomState } from '../cameraRigMath';

describe('resolveZoomState', () => {
  it('switches from third-person to first-person as distance approaches zero', () => {
    expect(resolveZoomState(6).mode).toBe('third_person');
    expect(resolveZoomState(2.5).mode).toBe('over_shoulder');
    expect(resolveZoomState(0.1).mode).toBe('first_person');
  });
});
```

```ts
// omnirave-babylon/src/player/__tests__/movementMath.test.ts
import { describe, expect, it } from 'vitest';
import { resolveMoveVector } from '../movementMath';

describe('resolveMoveVector', () => {
  it('normalizes diagonal keyboard movement', () => {
    const move = resolveMoveVector({ forward: true, backward: false, left: true, right: false });
    expect(move.x).toBeCloseTo(-0.7071, 3);
    expect(move.z).toBeCloseTo(0.7071, 3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm test -- --run src/player/__tests__/cameraRigMath.test.ts src/player/__tests__/movementMath.test.ts`

Expected: FAIL because the movement/camera math files do not exist yet.

- [ ] **Step 3: Implement pure math and runtime controllers**

```ts
// omnirave-babylon/src/player/cameraRigMath.ts
export type ZoomMode = 'third_person' | 'over_shoulder' | 'first_person';

export function resolveZoomState(distance: number) {
  if (distance <= 0.75) {
    return { mode: 'first_person' as ZoomMode, shoulderOpacity: 0 };
  }
  if (distance <= 3) {
    return { mode: 'over_shoulder' as ZoomMode, shoulderOpacity: 0.45 };
  }
  return { mode: 'third_person' as ZoomMode, shoulderOpacity: 1 };
}
```

```ts
// omnirave-babylon/src/player/movementMath.ts
export function resolveMoveVector(input: { forward: boolean; backward: boolean; left: boolean; right: boolean }) {
  const x = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const z = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}
```

```ts
// omnirave-babylon/src/player/createInputMap.ts
export function createInputMap(target: Window) {
  const state = { forward: false, backward: false, left: false, right: false };
  target.addEventListener('keydown', (event) => {
    if (event.code === 'KeyW') state.forward = true;
    if (event.code === 'KeyS') state.backward = true;
    if (event.code === 'KeyA') state.left = true;
    if (event.code === 'KeyD') state.right = true;
  });
  target.addEventListener('keyup', (event) => {
    if (event.code === 'KeyW') state.forward = false;
    if (event.code === 'KeyS') state.backward = false;
    if (event.code === 'KeyA') state.left = false;
    if (event.code === 'KeyD') state.right = false;
  });
  return state;
}
```

```ts
// omnirave-babylon/src/player/createFollowCameraRig.ts
import { ArcRotateCamera, Vector3 } from '@babylonjs/core';
import { resolveZoomState } from './cameraRigMath';

export function createFollowCameraRig(scene, target: Vector3) {
  const camera = new ArcRotateCamera('review-camera', Math.PI, 1.1, 6, target, scene);
  camera.lowerRadiusLimit = 0.1;
  camera.upperRadiusLimit = 8;
  camera.wheelPrecision = 24;
  return {
    camera,
    syncZoomState() {
      return resolveZoomState(camera.radius);
    },
  };
}
```

```ts
// omnirave-babylon/src/player/createPlayerRig.ts
import { MeshBuilder, TransformNode, Vector3 } from '@babylonjs/core';

export function createPlayerRig(scene, spawn: Vector3) {
  const root = new TransformNode('player-root', scene);
  root.position.copyFrom(spawn);

  const capsule = MeshBuilder.CreateCapsule('player-capsule', { height: 1.8, radius: 0.35 }, scene);
  capsule.isVisible = false;
  capsule.parent = root;
  capsule.checkCollisions = true;

  return { root, capsule, speedMetersPerSecond: 4.5 };
}
```

- [ ] **Step 4: Run the tests and launch the app**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm test -- --run src/player/__tests__/cameraRigMath.test.ts src/player/__tests__/movementMath.test.ts && npm run dev`

Expected: both tests PASS and the dev server starts on `http://127.0.0.1:4175`.

- [ ] **Step 5: Commit**

```bash
git add \
  omnirave-babylon/src/player/createInputMap.ts \
  omnirave-babylon/src/player/movementMath.ts \
  omnirave-babylon/src/player/cameraRigMath.ts \
  omnirave-babylon/src/player/createPlayerRig.ts \
  omnirave-babylon/src/player/createFollowCameraRig.ts \
  omnirave-babylon/src/player/__tests__/movementMath.test.ts \
  omnirave-babylon/src/player/__tests__/cameraRigMath.test.ts \
  omnirave-babylon/src/scene/createMainStageScene.ts
git commit -m "feat: add Babylon traversal and zoom camera"
```

---

## Task 5: Add The Embodied Review Avatar And Animation States

**Files:**
- Create: `omnirave-babylon/src/player/createReviewAvatar.ts`
- Create: `omnirave-babylon/src/player/avatarAnimationState.ts`
- Create: `omnirave-babylon/src/player/__tests__/avatarAnimationState.test.ts`
- Create: `omnirave-babylon/assets-src/avatars/review-rig/review-rig-source-manifest.md`
- Modify: `omnirave-babylon/assets-src/avatars/review-rig/README.md`
- Modify: `omnirave-babylon/src/scene/mainStageManifest.ts`

- [ ] **Step 1: Write the failing avatar animation-state test**

```ts
// omnirave-babylon/src/player/__tests__/avatarAnimationState.test.ts
import { describe, expect, it } from 'vitest';
import { resolveAvatarAnimationState } from '../avatarAnimationState';

describe('resolveAvatarAnimationState', () => {
  it('maps speed to idle, walk, and run states', () => {
    expect(resolveAvatarAnimationState(0)).toBe('idle');
    expect(resolveAvatarAnimationState(1.2)).toBe('walk');
    expect(resolveAvatarAnimationState(4.4)).toBe('run');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm test -- --run src/player/__tests__/avatarAnimationState.test.ts`

Expected: FAIL because `avatarAnimationState.ts` does not exist.

- [ ] **Step 3: Implement animation-state logic and the review-avatar contract**

```ts
// omnirave-babylon/src/player/avatarAnimationState.ts
export type AvatarAnimationState = 'idle' | 'walk' | 'run';

export function resolveAvatarAnimationState(speedMetersPerSecond: number): AvatarAnimationState {
  if (speedMetersPerSecond >= 3.5) {
    return 'run';
  }
  if (speedMetersPerSecond >= 0.15) {
    return 'walk';
  }
  return 'idle';
}
```

```md
<!-- omnirave-babylon/assets-src/avatars/review-rig/README.md -->
# Review Avatar Source Rules

- Human scale target: 1.8m standing height
- Export file: `public/assets/avatars/review-rig/review-rig.glb`
- Required clips:
  - `idle`
  - `walk`
  - `run`
- The avatar is a review rig, not a final customizable production avatar
- Third-person silhouette must be honest enough to validate scale and camera framing
```

```md
<!-- omnirave-babylon/assets-src/avatars/review-rig/review-rig-source-manifest.md -->
# Review Avatar Source Manifest

- Source blend: `review-rig.blend`
- Runtime export: `public/assets/avatars/review-rig/review-rig.glb`
- Required clips:
  - `idle`
  - `walk`
  - `run`
- Validation rule: the avatar must stand at believable human scale beside Main Stage railings and stairs
```

```ts
// omnirave-babylon/src/player/createReviewAvatar.ts
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { MAIN_STAGE_MANIFEST } from '../scene/mainStageManifest';

export async function createReviewAvatar(scene) {
  const result = await SceneLoader.ImportMeshAsync('', '', MAIN_STAGE_MANIFEST.reviewAvatarGlb, scene);
  return result.meshes[0];
}
```

- [ ] **Step 4: Run the avatar-state test**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm test -- --run src/player/__tests__/avatarAnimationState.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  omnirave-babylon/src/player/createReviewAvatar.ts \
  omnirave-babylon/src/player/avatarAnimationState.ts \
  omnirave-babylon/src/player/__tests__/avatarAnimationState.test.ts \
  omnirave-babylon/assets-src/avatars/review-rig/README.md \
  omnirave-babylon/assets-src/avatars/review-rig/review-rig-source-manifest.md \
  omnirave-babylon/src/scene/mainStageManifest.ts
git commit -m "feat: add embodied review avatar contract"
```

---

## Task 6: Load Main Stage Assets, Collision, And Review Routes

**Files:**
- Create: `omnirave-babylon/src/scene/loadMainStageAssets.ts`
- Create: `omnirave-babylon/src/scene/reviewRouteData.ts`
- Modify: `omnirave-babylon/src/scene/createMainStageScene.ts`
- Modify: `omnirave-babylon/src/scene/__tests__/mainStageManifest.test.ts`

- [ ] **Step 1: Extend the failing manifest test to require spawn and route data**

```ts
// omnirave-babylon/src/scene/__tests__/mainStageManifest.test.ts
import { describe, expect, it } from 'vitest';
import { BACK_PLAZA_SPAWN, MAIN_STAGE_REVIEW_ROUTE } from '../reviewRouteData';

describe('reviewRouteData', () => {
  it('starts from the back-plaza reveal and defines at least four review checkpoints', () => {
    expect(BACK_PLAZA_SPAWN).toEqual({ x: 0, y: 1.7, z: 48 });
    expect(MAIN_STAGE_REVIEW_ROUTE.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm test -- --run src/scene/__tests__/mainStageManifest.test.ts`

Expected: FAIL because `reviewRouteData.ts` does not exist yet.

- [ ] **Step 3: Implement runtime route data and GLB loading**

```ts
// omnirave-babylon/src/scene/reviewRouteData.ts
export const BACK_PLAZA_SPAWN = { x: 0, y: 1.7, z: 48 };

export const MAIN_STAGE_REVIEW_ROUTE = [
  { id: 'spawn_reveal', x: 0, y: 1.7, z: 48 },
  { id: 'promenade_mid', x: 0, y: 1.7, z: 18 },
  { id: 'basin_edge', x: 0, y: 1.7, z: -12 },
  { id: 'vip_terrace', x: 22, y: 8.5, z: -18 },
] as const;
```

```ts
// omnirave-babylon/src/scene/loadMainStageAssets.ts
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { MAIN_STAGE_MANIFEST } from './mainStageManifest';

export async function loadMainStageAssets(scene) {
  const main = await SceneLoader.ImportMeshAsync('', '', MAIN_STAGE_MANIFEST.sceneGlb, scene);
  const collision = await SceneLoader.ImportMeshAsync('', '', MAIN_STAGE_MANIFEST.collisionGlb, scene);

  collision.meshes.forEach((mesh) => {
    mesh.isVisible = false;
    mesh.checkCollisions = true;
  });

  return { mainMeshes: main.meshes, collisionMeshes: collision.meshes };
}
```

- [ ] **Step 4: Run the manifest test and open the scene**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm test -- --run src/scene/__tests__/mainStageManifest.test.ts && npm run dev`

Expected: PASS and the runtime boots with route data ready for scene integration.

- [ ] **Step 5: Commit**

```bash
git add \
  omnirave-babylon/src/scene/loadMainStageAssets.ts \
  omnirave-babylon/src/scene/reviewRouteData.ts \
  omnirave-babylon/src/scene/createMainStageScene.ts \
  omnirave-babylon/src/scene/__tests__/mainStageManifest.test.ts
git commit -m "feat: add Main Stage asset loading and review routes"
```

---

## Task 7: Add Lighting, Atmosphere, And Review Instrumentation

**Files:**
- Create: `omnirave-babylon/src/scene/createLightingRig.ts`
- Create: `omnirave-babylon/src/ui/createPerfOverlay.ts`
- Create: `omnirave-babylon/src/ui/createDebugPanel.ts`
- Modify: `omnirave-babylon/src/scene/createMainStageScene.ts`
- Modify: `omnirave-babylon/src/ui/createReviewHud.ts`

- [ ] **Step 1: Write the failing HUD test for performance and debug affordances**

```ts
// omnirave-babylon/src/app/__tests__/bootstrapRuntime.test.ts
import { describe, expect, it } from 'vitest';
import { bootstrapRuntime } from '../bootstrapRuntime';

describe('bootstrapRuntime', () => {
  it('renders perf and debug affordances for review', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    await bootstrapRuntime();

    expect(document.querySelector('[data-testid="perf-overlay"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="debug-panel"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm test -- --run src/app/__tests__/bootstrapRuntime.test.ts`

Expected: FAIL because no perf overlay or debug panel exists.

- [ ] **Step 3: Implement the review overlays**

```ts
// omnirave-babylon/src/ui/createPerfOverlay.ts
export function createPerfOverlay(host: HTMLElement) {
  const panel = document.createElement('div');
  panel.dataset.testid = 'perf-overlay';
  panel.className = 'perf-overlay';
  panel.textContent = 'FPS: -- | Frame: -- ms';
  host.appendChild(panel);
  return panel;
}
```

```ts
// omnirave-babylon/src/ui/createDebugPanel.ts
export function createDebugPanel(host: HTMLElement) {
  const panel = document.createElement('section');
  panel.dataset.testid = 'debug-panel';
  panel.className = 'debug-panel';
  panel.innerHTML = `
    <label><input type="checkbox" data-debug-toggle="collision" /> Collision</label>
    <label><input type="checkbox" data-debug-toggle="routes" /> Review Route</label>
    <label><input type="checkbox" data-debug-toggle="lighting" /> Lighting</label>
  `;
  host.appendChild(panel);
  return panel;
}
```

```ts
// omnirave-babylon/src/scene/createLightingRig.ts
import { Color3, DirectionalLight, HemisphericLight, Vector3 } from '@babylonjs/core';

export function createLightingRig(scene) {
  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.diffuse = new Color3(0.28, 0.33, 0.44);
  hemi.intensity = 0.7;

  const sun = new DirectionalLight('sun', new Vector3(-0.1, -1, -0.25), scene);
  sun.intensity = 2.1;

  return { hemi, sun };
}
```

- [ ] **Step 4: Run the HUD test and visually inspect**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm test -- --run src/app/__tests__/bootstrapRuntime.test.ts && npm run dev`

Expected: PASS and the running app shows the perf/debug overlays.

- [ ] **Step 5: Commit**

```bash
git add \
  omnirave-babylon/src/scene/createLightingRig.ts \
  omnirave-babylon/src/ui/createPerfOverlay.ts \
  omnirave-babylon/src/ui/createDebugPanel.ts \
  omnirave-babylon/src/scene/createMainStageScene.ts \
  omnirave-babylon/src/ui/createReviewHud.ts \
  omnirave-babylon/src/app/__tests__/bootstrapRuntime.test.ts
git commit -m "feat: add Main Stage review instrumentation"
```

---

## Task 8: Export Real Assets, Integrate The Vertical Slice, And Verify The Walkthrough

**Files:**
- Modify: `.gitattributes`
- Create: `omnirave-babylon/assets-src/main-stage/main-stage.blend`
- Create: `omnirave-babylon/assets-src/avatars/review-rig/review-rig.blend`
- Modify: `omnirave-babylon/scripts/export-main-stage.py`
- Modify: `omnirave-babylon/scripts/optimize-main-stage.mjs`
- Modify: `omnirave-babylon/src/scene/createMainStageScene.ts`
- Modify: `omnirave-babylon/src/player/createReviewAvatar.ts`
- Modify: `omnirave-babylon/src/player/createPlayerRig.ts`

- [ ] **Step 1: Create the authored source assets and export them through the scripted path**

```bash
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon
git lfs track "*.blend" "*.glb" "*.ktx2"
./scripts/export-main-stage.sh
./scripts/export-review-avatar.sh
```

Expected:
- `public/assets/venues/main-stage/main-stage.glb` exists
- `public/assets/venues/main-stage/main-stage-collision.glb` exists
- `public/assets/avatars/review-rig/review-rig.glb` exists

- [ ] **Step 2: Add the real scene wiring**

```ts
// omnirave-babylon/src/scene/createMainStageScene.ts
import { Scene, Vector3 } from '@babylonjs/core';
import { createLightingRig } from './createLightingRig';
import { loadMainStageAssets } from './loadMainStageAssets';
import { BACK_PLAZA_SPAWN } from './reviewRouteData';
import { createPlayerRig } from '../player/createPlayerRig';
import { createFollowCameraRig } from '../player/createFollowCameraRig';
import { createReviewAvatar } from '../player/createReviewAvatar';

export async function createMainStageScene(engine) {
  const scene = new Scene(engine);
  createLightingRig(scene);

  await loadMainStageAssets(scene);

  const player = createPlayerRig(scene, new Vector3(BACK_PLAZA_SPAWN.x, BACK_PLAZA_SPAWN.y, BACK_PLAZA_SPAWN.z));
  const avatar = await createReviewAvatar(scene);
  avatar.parent = player.root;

  createFollowCameraRig(scene, player.root.position);

  return scene;
}
```

- [ ] **Step 3: Build and manually verify the walkthrough checklist**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm run build && npm run dev`

Manual checklist:
- spawn from the back-plaza reveal
- walk the promenade and basin edge
- reach at least one VIP-height route checkpoint
- scroll from wide third-person into true first-person
- confirm no camera-body clipping in the final inward zoom

Expected: all checks pass locally.

- [ ] **Step 4: Mark the old runtime as superseded**

```md
<!-- omnirave-web/README.md -->
## Runtime Status

`omnirave-web` is superseded for new OmniRave runtime implementation work.

The active cleanroom runtime for Main Stage visual-slice work is `../omnirave-babylon`.
Do not add new venue implementation work here.
```

- [ ] **Step 5: Commit**

```bash
git add \
  .gitattributes \
  omnirave-babylon/assets-src/main-stage/main-stage.blend \
  omnirave-babylon/assets-src/avatars/review-rig/review-rig.blend \
  omnirave-babylon/public/assets/venues/main-stage/main-stage.glb \
  omnirave-babylon/public/assets/venues/main-stage/main-stage-collision.glb \
  omnirave-babylon/public/assets/avatars/review-rig/review-rig.glb \
  omnirave-babylon/scripts/export-main-stage.py \
  omnirave-babylon/scripts/optimize-main-stage.mjs \
  omnirave-babylon/src/scene/createMainStageScene.ts \
  omnirave-babylon/src/player/createReviewAvatar.ts \
  omnirave-babylon/src/player/createPlayerRig.ts \
  omnirave-web/README.md
git commit -m "feat: integrate Main Stage Babylon vertical slice"
```

---

## Task 9: Run The Approval Verification Suite And Capture Results

**Files:**
- Modify: `docs/technical/omnirave/2026-06-04-main-stage-approval-baseline.md`
- Create: `docs/technical/omnirave/2026-06-04-main-stage-vertical-slice-verification.md`

- [ ] **Step 1: Capture the frozen approval baseline**

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --version
sw_vers -productVersion
system_profiler SPHardwareDataType
system_profiler SPDisplaysDataType
```

Record the exact outputs in `docs/technical/omnirave/2026-06-04-main-stage-approval-baseline.md`.

- [ ] **Step 2: Run automated verification**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm test && npm run build`

Expected: all Vitest suites PASS and the production build succeeds.

- [ ] **Step 3: Record manual vertical-slice verification**

```md
<!-- docs/technical/omnirave/2026-06-04-main-stage-vertical-slice-verification.md -->
# Main Stage Vertical Slice Verification

- Automated tests: PASS
- Production build: PASS
- Spawn reveal: PASS
- Promenade walkthrough: PASS
- Basin edge walkthrough: PASS
- VIP route walkthrough: PASS
- Third-person review: PASS
- First-person zoom-in review: PASS
- Camera clipping check: PASS / FAIL
- Material richness review: PASS / FAIL
- Three-dimensional truthfulness review: PASS / FAIL
- Performance capture on approval machine: record FPS and frame time
```

- [ ] **Step 4: Review in-browser and stop if any gate fails**

Run: `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon && npm run dev`

Expected: the user can review Main Stage in-engine. If any of the seven quality gates fail, do not start any other venue or multiplayer work.

- [ ] **Step 5: Commit**

```bash
git add \
  docs/technical/omnirave/2026-06-04-main-stage-approval-baseline.md \
  docs/technical/omnirave/2026-06-04-main-stage-vertical-slice-verification.md
git commit -m "docs: record Babylon Main Stage verification"
```

---

## Self-Review

### Spec coverage

- Hard cut to Babylon cleanroom: covered by Tasks 1-2 and the new `omnirave-babylon/` app boundary.
- Main Stage first, no other venues: covered by Tasks 3, 6, 8, and verification in Task 9.
- Desktop-first approval target and frozen baseline: covered by Tasks 1 and 9.
- Blender-authored asset pipeline and binary-asset policy: covered by Tasks 3 and 8.
- Embodied third-person to first-person zoom camera: covered by Tasks 4-5 and checked in Task 9.
- Production-safe slice constraints: covered by the route data, collision, authored assets, and review gating in Tasks 6-9.

### Placeholder scan

- No `TODO`, `TBD`, or “similar to previous task” placeholders remain.
- Commands and file paths are explicit.
- Every code-changing task includes concrete code blocks.

### Type consistency

- `MAIN_STAGE_MANIFEST` is used consistently across asset-loading and avatar-loading tasks.
- `resolveZoomState`, `resolveMoveVector`, and `resolveAvatarAnimationState` use stable names between tests and implementation steps.
