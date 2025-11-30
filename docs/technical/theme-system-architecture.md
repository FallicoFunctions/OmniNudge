# Theme System Architecture (Phase 2a)

High-level view of how data, state, and UI interact inside the theme customization experience.

**Components Covered:** ThemeContext, ThemeSelector, ThemeEditor, ThemePreview, ThemeService, React Query cache

---

## 1. Diagram

```
┌────────────────────┐        ┌──────────────────────┐
│  UI Components     │        │   Theme Service      │
│  (Selector/Editor) │◄──────►│  (Axios + API v1)    │
└────────▲───────────┘        └────────▲─────────────┘
         │                             │
         │                             │ REST (JSON)
         │ State/props                 │
┌────────┴───────────┐        ┌────────┴─────────────┐
│   Theme Context    │◄──────►│  React Query Cache   │
│  (Zustand-like API)│        │ (['themes'], ['user'])│
└───────▲────────────┘        └───────────────────────┘
        │
        │
┌───────┴────────────┐
│ Browser Layer      │
│ - document.documentElement (CSS vars)│
│ - localStorage (active theme snapshot)│
└────────────────────┘
```

---

## 2. Lifecycle Summary

1. **Bootstrapping**
   - `ThemeProvider` hydrates CSS variables from `localStorage`.
   - React Query prefetches `/themes/predefined`, `/themes/my`, and `/settings`.
   - First available theme (or stored ID) is applied via `applyCSSVariables`.

2. **Selecting a Theme**
   - ThemeSelector calls `selectTheme` → sets local state instantly (optimistic).
   - If `notifyServer=true`, `themeService.setActiveTheme` syncs the new ID.
   - CSS variables persist to storage for reload hydration.

3. **Creating/Updating a Theme**
   - ThemeEditor collects metadata + variables.
   - `themeService.createTheme/updateTheme` runs.
   - React Query `refetch(['themes','lists'])` updates context arrays.

4. **Persistence**
   - CSS variables are applied to `document.documentElement`.
   - Snapshot stored as `omninudge.activeTheme` for future sessions.

---

## 3. Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| `ThemeContext` | Holds active theme, CSS vars, lists; exposes `selectTheme`, `refreshThemes`, `setAdvancedMode`; centralizes persistence logic |
| `ThemeSelector` | UI for switching + refreshing + launching editor |
| `ThemeEditor` | Multi-step wizard with validation, debounced previews, theme CRUD |
| `ThemePreview` | Renders mock UI scenes using the active CSS variables |
| `themeService` | Axios wrapper around `/themes` + `/settings` endpoints |
| `tests/e2e/themeFlows` | Validates user journeys end-to-end |

---

## 4. Data Contracts

- **UserTheme** (see `src/types/theme.ts`) – entire payload is cached; editor only sends subset.
- **StoredThemeSnapshot** – id + variables persisted locally; keep in sync when adding new fields.
- **React Query keys** – `['themes','lists']`, `['user','settings']`; use these when invalidating.

---

## 5. Extensibility Notes

- Add new components to the ThemeContext value rather than managing parallel state elsewhere.
- Keep ThemePreview deterministic so snapshot tests stay stable.
- When introducing new API endpoints (e.g., marketplace publishing), extend `themeService` and add matching React Query keys.

For API request specifics, see `docs/technical/theme-api-integration.md`.
