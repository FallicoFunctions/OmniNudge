# Theme API Integration Guide

Reference for frontend engineers adding or consuming theme-related endpoints.

---

## 1. Base Config

- Axios instance: `src/services/api.ts`
- Base URL: `import.meta.env.VITE_API_URL || http://localhost:8080/api/v1`
- Auth: JWT via `Authorization: Bearer <token>` header (handled in interceptor)
- Timeout: 10s

---

## 2. Available Methods (`themeService`)

| Method | HTTP | Path | Notes |
|--------|------|------|-------|
| `getPredefinedThemes()` | GET | `/themes/predefined` | Returns `{ themes: UserTheme[] }` |
| `getMyThemes(limit?, offset?)` | GET | `/themes/my` | Pagination supported |
| `getTheme(id)` | GET | `/themes/:id` | Fetch single theme (used for edit detail) |
| `createTheme(payload)` | POST | `/themes` | Requires `theme_name`, `theme_type`, `scope_type` |
| `updateTheme(id, payload)` | PUT | `/themes/:id` | Partial updates allowed |
| `deleteTheme(id)` | DELETE | `/themes/:id` | Not wired into UI yet |
| `setActiveTheme(themeId)` | POST | `/themes/active` | Persists on server; used after `selectTheme` |
| `getUserSettings()` | GET | `/settings` | Includes `active_theme_id`, `advanced_mode_enabled` |
| `setAdvancedMode(enabled)` | POST | `/themes/advanced-mode` | Toggles advanced UI |
| `browseThemes`/`installTheme`/... | Misc | Additional marketplace endpoints for later phases |

---

## 3. React Query Patterns

```ts
const { data, isLoading, refetch } = useQuery({
  queryKey: ['themes', 'lists'],
  queryFn: async () => {
    const [predefined, myThemes] = await Promise.all([
      themeService.getPredefinedThemes(),
      themeService.getMyThemes().then((res) => res.themes),
    ]);
    return { predefined, custom: myThemes };
  },
  staleTime: 1000 * 60 * 5,
});
```

- Use `refetchThemeLists()` after create/update/delete operations.
- Optimistic updates: `selectTheme` immediately sets `activeTheme` but still awaits `setActiveTheme` for persistence.
- Cache busting: `queryClient.setQueryData(['user','settings'], updater)` keeps `advanced_mode_enabled` in sync.

---

## 4. Error Handling

- All service methods throw Axios errors; wrap calls in try/catch inside UI hooks/components.
- `ThemeContext` centralizes error state so selectors and editors can display inline messages.
- For auth failures, the Axios interceptor clears the token and redirects to `/login`.

---

## 5. Adding a New Endpoint

1. Define the TypeScript types in `src/types/theme.ts`.
2. Add method to `themeService` with typed params + return value.
3. Create or update React Query hooks/selectors to call the new method.
4. Extend tests:
   - Unit test for `themeService`
   - Flow test if UI interacts with it
5. Document the endpoint here and in `docs/THEME_API_TESTS.md`.
