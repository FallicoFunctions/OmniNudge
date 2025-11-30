# Creating Your First Custom Theme

This tutorial walks you through building a brand-new OmniNudge theme from scratch in less than 15 minutes.

**Audience:** Designers, community managers, power users  
**Prerequisites:** Frontend Phase 2a environment (Vite dev server) + backend running at `:8080`

---

## Step 0 – Prep

1. Open `http://localhost:5173` and log in.
2. Confirm the backend is running (`http://localhost:8080/api/v1/themes/predefined` should return JSON).
3. Grab a palette (example: [Coolors – Desert Bloom](https://coolors.co/f97316-7c2d12-fff7ed-fffbeb-fed7aa)).

---

## Step 1 – Launch the Theme Editor

1. From the dashboard, tap the **Active Theme** dropdown.
2. Hit **Create New Theme**. The ThemeEditor modal fills the screen with four steps:
   - Base Theme
   - Info
   - Variables
   - Review & Save

---

## Step 2 – Base Theme

- Choose **Start from Scratch** if you want clean defaults, *or* pick a predefined theme closest to your palette.
- Selecting a base copies its CSS variables into the editor, so you only change what matters.

> Undo shortcuts work inside the editor (`⌘/Ctrl + Z`), and each change is tracked in the variable history stack.

---

## Step 3 – Info

| Field | Example |
|-------|---------|
| **Theme Name** | `Desert Bloom` |
| **Description** | `Warm oranges with soft sand surfaces` |
| **Set as Active** | Leave checked so it applies automatically once saved |

If the name or description violates validation (empty, >100 chars), errors appear inline—fix them before proceeding.

---

## Step 4 – Variables

1. Use the left-hand list to jump between categories (Colors, Typography, Spacing, Layout).
2. Each variable shows:
   - Label + helper text
   - Color picker or numeric input
   - Reset button
3. Update the key values:
   ```text
   --color-primary: #f97316
   --color-background: #fff7ed
   --color-surface: #fffbeb
   --color-text-primary: #7c2d12
   --color-border: #fed7aa
   ```
4. Watch the right-hand preview (desktop & mobile) update live. If colors feel off, tweak saturation/lightness directly in the picker.
5. Toggle the preview pages (Feed/Profile/Messages) to check different surfaces.

---

## Step 5 – Review & Save

The final step summarizes:

- Theme metadata
- Count of overridden variables
- Contrast warnings (if any)
- A confirmatory preview card

Click **Create Theme**:

1. The editor calls `themeService.createTheme`.
2. React Query invalidates `['themes', 'lists']`.
3. Context updates and (if “Set as Active” stayed checked) calls `setActiveTheme`.
4. CSS variables persist to `localStorage`, so reloads keep the new theme.

---

## Step 6 – Share / Iterate

- Reopen the selector → “My Themes” → confirm “Desert Bloom” appears.
- Click **Edit** to reopen the wizard in update mode.
- Send the theme ID to teammates; they can load it via **Refresh** in the selector.

---

## Bonus: Versioning Tips

- Use the description to note palette or font changes (“v1.1 – increased contrast”).
- Duplicate a theme by editing, renaming, and saving as new.
- Pair with screenshots from the preview for changelog posts.

You're ready to move on to Advanced Mode if you need per-page overrides or raw CSS, but most branding updates can be achieved through this workflow.
