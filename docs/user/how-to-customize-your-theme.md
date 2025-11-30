# How to Customize Your Theme

Practical guide for non-technical creators who want to personalize OmniNudge without touching code.

**Last Updated:** 2025-11-29  
**Applies To:** Frontend Phase 2a (Theme System)

---

## 1. Know the Tools

| Tool | Where | What it does |
|------|-------|--------------|
| **Theme Selector** | Dashboard → Appearance → *Active Theme* card | Switch between the 8 predefined palettes or any theme you've created |
| **Theme Editor** | Same menu → **Create New Theme** or **Edit** | Walks you through naming, picking a base theme, and tweaking CSS variables |
| **Live Preview** | Right side of the editor | Shows feed/profile/messages mockups that update in real time |
| **Advanced Mode** | Settings → Appearance → toggle | Unlocks raw CSS + per-page overrides (optional) |

> Tip: Keep the preview docked on the page you care about (Feed, Profile, or Messages) so you can iterate faster.

---

## 2. Quick Customization Workflow

1. **Open the selector** and note which theme is active.
2. **Click “Create New Theme”** (or *Edit* if you want to branch off an existing one).
3. **Choose a base theme** that is closest to what you want. This saves time because the variable grid will be pre-populated.
4. **Name + describe it** (e.g., “Investor Dark – extra contrast for late-night sessions”).
5. **Tweak variables**:
   - Colors tab → adjust primary/background/surface colors via color pickers.
   - Typography tab → bump font sizes or swap fonts for headings.
   - Spacing/Layout tabs → change corner radius, shadows, spacing scale.
6. **Watch the preview** while you adjust. If something looks wrong, hit **Undo (⌘/Ctrl + Z)** or the “Reset variable” button in the editor.
7. **Save & Set Active**. The editor can automatically activate the theme and the ThemeContext will push the CSS variables to `:root`, so your whole session updates instantly.

---

## 3. Customize Like a Pro

### Color Checklist

- Keep body text contrast ≥ 4.5:1 against the background (the Review step flags low contrast combos).
- Pair warm primaries (orange) with cool accents (teal) for depth.
- Use semantic colors (`--color-success`, `--color-warning`, etc.) sparingly so statuses remain recognizable.

### Typography Tips

- `--font-size-base` controls 90% of body text. Increasing to `1.0625rem` (17px) improves readability without breaking layout.
- Mix fonts by setting `--font-family-heading` to a serif while leaving base text sans-serif.

### Spacing & Layout

- Rounder UI → increase `--border-radius-lg` / `--border-radius-2xl`.
- Compact UI → reduce `--spacing-md` and `--spacing-lg`.
- Elevated cards → boost `--shadow-md` / `--shadow-lg`.

---

## 4. Testing Checklist

Before sharing or publishing a theme:

1. Switch between Feed, Profile, and Messages in the preview.
2. Toggle both Desktop and Mobile layouts.
3. Hit the Refresh icon in the selector to make sure your theme persists and loads from the backend.
4. Reload localhost:5173—active theme should hydrate from storage instantly.
5. Ask a teammate to try the theme to confirm CSS variables sync with their account.

---

## 5. Troubleshooting

| Issue | Fix |
|-------|-----|
| Colors revert when reloading | Make sure “Set as active theme after saving” stays checked before hitting Save |
| Dialog won’t close after selecting | Wait for “Updating…” state to finish or refresh the themes list |
| Preview freezes | The editor throttles updates every 200 ms; rapid slider movements might appear delayed—pause a second |
| Hard to read text | Use the Review step—warnings list any pair below WCAG AA contrast |

Need more control? Enable **Advanced Mode** and open `frontend/src/styles/theme-overrides.css` to write scoped CSS, or follow the “Creating Your First Custom Theme” tutorial next.

---

## Video Walkthrough (Optional Resource)

Upcoming Loom recording outline:

1. 30-second overview of the selector + live preview.
2. 2-minute demo walking through the wizard with the “Desert Bloom” palette.
3. Quick peek at Advanced Mode + how CSS variables cascade.

> Once recorded, drop the link here so designers have a visual companion to this doc.
