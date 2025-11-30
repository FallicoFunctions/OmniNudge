# How to Add New CSS Variables

Use this checklist whenever Phase 2a needs additional tokens for colors, typography, spacing, or layout controls.

---

## 1. Define the Variable

1. **`src/data/themeVariables.ts`**
   - Add the default value to `DEFAULT_THEME_VARIABLES`.
   - Append a descriptor to the appropriate `THEME_VARIABLE_GROUPS` category with:
     - `name`
     - `label`
     - `type` (`color`, `size`, `number`, `string`)
     - `description`
2. **`docs/CSS_VARIABLES.md`**
   - Add a new row to the relevant table (Colors, Typography, etc.) so designers know what it does.

---

## 2. Wire up the UI

- **CSSVariableEditor** – automatically renders new entries from `THEME_VARIABLE_GROUPS`. Confirm there is an icon/section for the new category.
- **ThemePreview** – if the new variable changes how cards look (e.g., a new accent color), update inline styles so the preview demonstrates it.
- **ThemePreviewCard / ThemeGallery** – any variable used in cards needs `getThemeVariable` fallbacks.

---

## 3. Data & Persistence

- No schema changes needed: `css_variables` is a JSON column, so any key/value pair is stored automatically.
- For migrations, update backend validation if necessary so the variable is whitelisted server-side.
- Ensure `DEFAULT_THEME_VARIABLES` includes a sensible value so storing snapshots without overrides still works.

---

## 4. Testing

| Test | Action |
|------|--------|
| Unit – `themeUtils.test.ts` | Add tests if normalization logic changes (e.g., new prefixes) |
| Visual – `themePreview.snapshot.test.tsx` | Refresh snapshots if new variables affect layout |
| Integration – ThemeEditor | Run `npm run test` to ensure wizard renders the new control |

---

## 5. Documentation & Release Notes

- Update `docs/user/how-to-customize-your-theme.md` if users need guidance on the new control.
- Mention the new variable in release notes so existing theme authors can adopt it.
