# Frontend Setup Guide – OmniNudge Theme System

**Updated:** November 29, 2025  
**Frontend Stack:** React 19 · Vite 7 · TypeScript · Tailwind 3 · TanStack Query 5 · Vitest 3

This guide explains how to run, test, and maintain the Phase 2a theme system that already lives in `frontend/`.

---

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20.x LTS | Required by Vite/Tailwind |
| npm | 10+ | Bundled with Node 20 |
| Backend API | `http://localhost:8080/api/v1` | Must run for theme APIs |

Check versions:

```bash
node -v
npm -v
```

---

## 2. Install & Configure

```bash
cd frontend
npm install
cp .env.example .env.development   # if not already present
```

Important env vars:

```env
VITE_API_URL=http://localhost:8080/api/v1
VITE_WS_URL=ws://localhost:8080/ws
```

> Production builds read `.env.production` (already committed). Adjust URLs as needed before deploys.

---

## 3. Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server on `http://localhost:5173` |
| `npm run build` | Type-check (`tsc -b`) + Vite production bundle |
| `npm run preview` | Serve the build output locally |
| `npm run test` | Vitest watch mode (unit + integration + e2e + visual snapshots) |
| `npm run test -- run` | Single Vitest run (CI friendly) |
| `npm run lint` | ESLint using the project config |

### Tailwind Notes

- Version pinned at **3.4.18** (downgraded from v4 for stability).  
- Classes are mostly utility-based; CSS variables supply the theme values.  
- No PostCSS tweaking needed—`postcss.config.js` already wires the default Tailwind plugin chain.

---

## 4. Theme System Quick Reference

- `src/contexts/ThemeContext.tsx` – central provider that loads predefined/custom themes via `themeService`, applies CSS variables, and exposes `selectTheme`.
- `src/components/themes/*` – selector, gallery, editor, preview, preview cards.
- `tests/` – organized into `unit/`, `integration/`, `e2e/`, and `visual/` suites.  
  - Visual snapshots live in `tests/visual/__snapshots__/`.
- Documentation:
  - `docs/user/how-to-customize-your-theme.md`
  - `docs/user/creating-your-first-custom-theme.md`
  - `docs/technical/theme-system-architecture.md`
  - `docs/technical/theme-api-integration.md`

---

## 5. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Tailwind classes suddenly missing | Ensure Tailwind 3.4.18 is installed; delete `node_modules` + lockfile, then `npm install`. |
| Vite dev server shows 404s for theme endpoints | Start the backend (`backend/cmd/server`) or update `VITE_API_URL`. |
| Theme selector dialog never closes in tests | Run `npm run test` so Vitest + Testing Library handle async flushing (e2e suite already covers this). |
| Snapshot tests fail after intentional UI tweaks | Run `npm run test -- -u` to update snapshots, review the diff, then commit the new `.snap` files. |
| LocalStorage errors in SSR | Functions that touch `window` guard against undefined, but if you add new code, gate it with `typeof window !== 'undefined'`. |

---

## 6. Recommended Workflow

1. `npm run dev` while building ThemeSelector/Editor changes.
2. Keep `npm run test` running in another terminal; it watches files and reruns suites.
3. When adding CSS variables, follow `docs/technical/adding-css-variables.md`.
4. Update `docs/*` whenever you introduce new flows so designers and engineers stay in sync.

With this workflow the front‑end stays aligned with the fully implemented theme system and the checklist for Phase 2a remains green.
