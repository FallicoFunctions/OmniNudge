# CSS Variables Reference

This document lists all CSS custom properties (variables) available in OmniNudge for theme customization. These variables cascade throughout the application and provide the foundation for creating custom themes.

**Last Updated:** 2025-11-29
**For Phase:** 2+

---

## Overview

CSS variables provide a powerful way to customize OmniNudge's appearance without writing complex CSS. By changing a single variable, you can update colors, spacing, typography, and more throughout the entire application.

### Quick Start for Editors

1. Open the **Theme Editor → Variables** tab.
2. Use the search input to jump to any variable name from this document (e.g., `--color-primary`).
3. Hover the info icon in the editor to read the same description shown in the tables below.
4. Resetting a variable in the editor restores the “Default” value listed here.

> **Sync with Components:** Variables map 1:1 to Tailwind tokens in `ThemePreview`, ThemeSelector, and the rest of the UI, so updating the value here propagates everywhere automatically.

**How to use CSS variables:**

```css
/* Define variables in :root */
:root {
  --primary-color: #3B82F6;
  --background-color: #1F2937;
}

/* Use variables in your styles */
.button--primary {
  background: var(--primary-color);
}
```

---

## Color System

### Primary Colors

Brand colors used for interactive elements, buttons, and primary actions.

| Variable | Default (Light) | Default (Dark) | Usage |
|----------|----------------|----------------|-------|
| `--primary-color` | `#3B82F6` | `#3B82F6` | Primary brand color |
| `--primary-color-light` | `#60A5FA` | `#60A5FA` | Lighter variant for hover states |
| `--primary-color-dark` | `#2563EB` | `#2563EB` | Darker variant for active states |
| `--primary-color-alpha` | `rgba(59, 130, 246, 0.1)` | `rgba(59, 130, 246, 0.1)` | Transparent primary for backgrounds |

**Example:**
```css
:root {
  --primary-color: #8B5CF6; /* Purple theme */
  --primary-color-light: #A78BFA;
  --primary-color-dark: #7C3AED;
}
```

---

### Background Colors

Surface and background colors for layouts and components.

| Variable | Default (Light) | Default (Dark) | Usage |
|----------|----------------|----------------|-------|
| `--background-color` | `#FFFFFF` | `#111827` | Main page background |
| `--background-color-alt` | `#F9FAFB` | `#1F2937` | Alternate background (sidebar, etc.) |
| `--surface-color` | `#FFFFFF` | `#1F2937` | Card/component surface |
| `--surface-color-hover` | `#F3F4F6` | `#374151` | Surface hover state |
| `--surface-color-active` | `#E5E7EB` | `#4B5563` | Surface active/selected state |

**Example:**
```css
/* Darker theme */
:root {
  --background-color: #0F172A;
  --background-color-alt: #1E293B;
  --surface-color: #1E293B;
}
```

---

### Text Colors

Text and content colors with hierarchy.

| Variable | Default (Light) | Default (Dark) | Usage |
|----------|----------------|----------------|-------|
| `--text-color` | `#111827` | `#F9FAFB` | Primary text |
| `--text-color-secondary` | `#6B7280` | `#9CA3AF` | Secondary/muted text |
| `--text-color-tertiary` | `#9CA3AF` | `#6B7280` | Tertiary/placeholder text |
| `--text-color-inverse` | `#FFFFFF` | `#111827` | Text on colored backgrounds |
| `--link-color` | `#3B82F6` | `#60A5FA` | Hyperlinks |
| `--link-color-hover` | `#2563EB` | `#3B82F6` | Hyperlinks on hover |

---

### Border Colors

Border and divider colors.

| Variable | Default (Light) | Default (Dark) | Usage |
|----------|----------------|----------------|-------|
| `--border-color` | `#E5E7EB` | `#374151` | Default borders |
| `--border-color-light` | `#F3F4F6` | `#4B5563` | Subtle borders |
| `--border-color-dark` | `#D1D5DB` | `#1F2937` | Prominent borders |
| `--border-color-focus` | `#3B82F6` | `#3B82F6` | Focus state borders |

---

### Semantic Colors

Status and feedback colors.

| Variable | Default (Light) | Default (Dark) | Usage |
|----------|----------------|----------------|-------|
| `--success-color` | `#10B981` | `#10B981` | Success states |
| `--success-color-light` | `#34D399` | `#34D399` | Success backgrounds |
| `--warning-color` | `#F59E0B` | `#F59E0B` | Warning states |
| `--warning-color-light` | `#FBBF24` | `#FBBF24` | Warning backgrounds |
| `--error-color` | `#EF4444` | `#EF4444` | Error states |
| `--error-color-light` | `#F87171` | `#F87171` | Error backgrounds |
| `--info-color` | `#3B82F6` | `#3B82F6` | Info states |
| `--info-color-light` | `#60A5FA` | `#60A5FA` | Info backgrounds |

**Example:**
```css
/* Custom semantic colors */
:root {
  --success-color: #22C55E; /* Brighter green */
  --error-color: #DC2626;   /* Deeper red */
}
```

---

## Typography

### Font Families

| Variable | Default | Usage |
|----------|---------|-------|
| `--font-family-base` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | Body text |
| `--font-family-heading` | `inherit` | Headings (inherits base by default) |
| `--font-family-monospace` | `"SF Mono", Monaco, "Cascadia Code", monospace` | Code blocks |

**Example:**
```css
/* Custom fonts */
:root {
  --font-family-base: "Inter", sans-serif;
  --font-family-heading: "Playfair Display", serif;
}
```

---

### Font Sizes

| Variable | Default | Usage |
|----------|---------|-------|
| `--font-size-xs` | `0.75rem` (12px) | Very small text |
| `--font-size-sm` | `0.875rem` (14px) | Small text |
| `--font-size-base` | `1rem` (16px) | Body text |
| `--font-size-lg` | `1.125rem` (18px) | Large text |
| `--font-size-xl` | `1.25rem` (20px) | Extra large text |
| `--font-size-2xl` | `1.5rem` (24px) | Headings |
| `--font-size-3xl` | `1.875rem` (30px) | Large headings |
| `--font-size-4xl` | `2.25rem` (36px) | Display headings |

**Example:**
```css
/* Larger base font for accessibility */
:root {
  --font-size-base: 1.125rem; /* 18px */
}
```

---

### Font Weights

| Variable | Default | Usage |
|----------|---------|-------|
| `--font-weight-normal` | `400` | Body text |
| `--font-weight-medium` | `500` | Emphasized text |
| `--font-weight-semibold` | `600` | Subheadings |
| `--font-weight-bold` | `700` | Headings, strong emphasis |

---

### Line Heights

| Variable | Default | Usage |
|----------|---------|-------|
| `--line-height-tight` | `1.25` | Headings |
| `--line-height-normal` | `1.5` | Body text |
| `--line-height-relaxed` | `1.75` | Long-form content |

---

## Spacing

Consistent spacing scale for margins, padding, and gaps.

| Variable | Default | Usage |
|----------|---------|-------|
| `--spacing-xs` | `0.25rem` (4px) | Extra small spacing |
| `--spacing-sm` | `0.5rem` (8px) | Small spacing |
| `--spacing-md` | `1rem` (16px) | Medium spacing |
| `--spacing-lg` | `1.5rem` (24px) | Large spacing |
| `--spacing-xl` | `2rem` (32px) | Extra large spacing |
| `--spacing-2xl` | `3rem` (48px) | 2x large spacing |
| `--spacing-3xl` | `4rem` (64px) | 3x large spacing |

**Example:**
```css
/* Compact spacing */
:root {
  --spacing-md: 0.75rem;
  --spacing-lg: 1.25rem;
}

/* Use in components */
.feed-post-card {
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}
```

---

## Border Radius

Corner rounding for components.

| Variable | Default | Usage |
|----------|---------|-------|
| `--border-radius-sm` | `0.25rem` (4px) | Small elements |
| `--border-radius-md` | `0.5rem` (8px) | Default radius |
| `--border-radius-lg` | `0.75rem` (12px) | Cards, modals |
| `--border-radius-xl` | `1rem` (16px) | Large components |
| `--border-radius-full` | `9999px` | Circular elements (avatars, pills) |

**Example:**
```css
/* Sharp corners */
:root {
  --border-radius-sm: 0;
  --border-radius-md: 0;
  --border-radius-lg: 0;
}

/* Very rounded */
:root {
  --border-radius-lg: 1.5rem;
}
```

---

## Shadows

Elevation and depth system.

| Variable | Default | Usage |
|----------|---------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.05)` | Subtle shadow |
| `--shadow-md` | `0 4px 6px rgba(0, 0, 0, 0.1)` | Default shadow |
| `--shadow-lg` | `0 10px 15px rgba(0, 0, 0, 0.1)` | Prominent shadow |
| `--shadow-xl` | `0 20px 25px rgba(0, 0, 0, 0.15)` | Large shadow |
| `--shadow-inner` | `inset 0 2px 4px rgba(0, 0, 0, 0.06)` | Inner shadow |

**Example:**
```css
/* Flat design (no shadows) */
:root {
  --shadow-sm: none;
  --shadow-md: none;
  --shadow-lg: none;
}

/* Dramatic shadows */
:root {
  --shadow-md: 0 8px 16px rgba(0, 0, 0, 0.2);
  --shadow-lg: 0 20px 40px rgba(0, 0, 0, 0.3);
}
```

---

## Component-Specific Variables

### Navigation Bar

| Variable | Default | Usage |
|----------|---------|-------|
| `--navigation-height` | `64px` | Height of navigation |
| `--navigation-background` | `var(--surface-color)` | Navigation background |
| `--navigation-text-color` | `var(--text-color)` | Navigation text |
| `--navigation-hover-color` | `var(--primary-color)` | Hover state |
| `--navigation-border-color` | `var(--border-color)` | Bottom border |

**Example:**
```css
:root {
  --navigation-height: 72px;
  --navigation-background: #1F2937;
  --navigation-text-color: #FFFFFF;
}
```

---

### Sidebar

| Variable | Default | Usage |
|----------|---------|-------|
| `--sidebar-width` | `280px` | Sidebar width |
| `--sidebar-background` | `var(--background-color-alt)` | Sidebar background |
| `--sidebar-text-color` | `var(--text-color)` | Sidebar text |
| `--sidebar-hover-color` | `var(--surface-color-hover)` | Hover background |

---

### Post Card

| Variable | Default | Usage |
|----------|---------|-------|
| `--post-card-padding` | `var(--spacing-lg)` | Inner padding |
| `--post-card-border-radius` | `var(--border-radius-lg)` | Corner rounding |
| `--post-card-background` | `var(--surface-color)` | Card background |
| `--post-card-border-color` | `var(--border-color)` | Card border |
| `--post-card-shadow` | `var(--shadow-sm)` | Card shadow |

---

### Message Bubble

| Variable | Default | Usage |
|----------|---------|-------|
| `--message-bubble-sent-bg` | `var(--primary-color)` | Sent message background |
| `--message-bubble-received-bg` | `var(--surface-color)` | Received message background |
| `--message-bubble-border-radius` | `1rem` | Bubble rounding |
| `--message-bubble-padding` | `var(--spacing-sm)` | Inner padding |

**Example:**
```css
/* Custom message colors */
:root {
  --message-bubble-sent-bg: #10B981;      /* Green for sent */
  --message-bubble-received-bg: #6B7280;  /* Gray for received */
}
```

---

### Buttons

| Variable | Default | Usage |
|----------|---------|-------|
| `--button-primary-bg` | `var(--primary-color)` | Primary button background |
| `--button-primary-text` | `#FFFFFF` | Primary button text |
| `--button-secondary-bg` | `transparent` | Secondary button background |
| `--button-secondary-text` | `var(--primary-color)` | Secondary button text |
| `--button-danger-bg` | `var(--error-color)` | Danger button background |
| `--button-border-radius` | `var(--border-radius-md)` | Button corner rounding |
| `--button-padding-x` | `var(--spacing-lg)` | Horizontal padding |
| `--button-padding-y` | `var(--spacing-sm)` | Vertical padding |

---

### Form Inputs

| Variable | Default | Usage |
|----------|---------|-------|
| `--input-background` | `var(--surface-color)` | Input background |
| `--input-border-color` | `var(--border-color)` | Input border |
| `--input-focus-color` | `var(--primary-color)` | Focus state border |
| `--input-text-color` | `var(--text-color)` | Input text |
| `--input-placeholder-color` | `var(--text-color-tertiary)` | Placeholder text |
| `--input-border-radius` | `var(--border-radius-md)` | Corner rounding |
| `--input-padding-x` | `var(--spacing-md)` | Horizontal padding |
| `--input-padding-y` | `var(--spacing-sm)` | Vertical padding |

---

### Comment Thread

| Variable | Default | Usage |
|----------|---------|-------|
| `--comment-indent-size` | `24px` | Nested comment indent |
| `--comment-background` | `transparent` | Comment background |
| `--comment-border-left` | `2px solid var(--border-color)` | Thread line |

---

### Profile Header

| Variable | Default | Usage |
|----------|---------|-------|
| `--profile-banner-height` | `200px` | Cover image height |
| `--profile-avatar-size` | `120px` | Avatar size |
| `--profile-avatar-border` | `4px solid var(--background-color)` | Avatar border |

---

### Modal

| Variable | Default | Usage |
|----------|---------|-------|
| `--modal-background` | `var(--surface-color)` | Modal background |
| `--modal-overlay-color` | `rgba(0, 0, 0, 0.5)` | Overlay background |
| `--modal-border-radius` | `var(--border-radius-lg)` | Corner rounding |
| `--modal-max-width` | `600px` | Maximum width |

---

### Toast Notification

| Variable | Default | Usage |
|----------|---------|-------|
| `--toast-background` | `var(--surface-color)` | Toast background |
| `--toast-text-color` | `var(--text-color)` | Toast text |
| `--toast-border-radius` | `var(--border-radius-md)` | Corner rounding |
| `--toast-shadow` | `var(--shadow-lg)` | Toast shadow |

---

## Animation & Transitions

| Variable | Default | Usage |
|----------|---------|-------|
| `--transition-fast` | `150ms` | Quick transitions |
| `--transition-normal` | `300ms` | Standard transitions |
| `--transition-slow` | `500ms` | Slow transitions |
| `--transition-easing` | `cubic-bezier(0.4, 0, 0.2, 1)` | Easing function |

**Example:**
```css
.button {
  transition: background var(--transition-normal) var(--transition-easing);
}
```

---

## Z-Index Layers

Stacking order for overlays and modals.

| Variable | Default | Usage |
|----------|---------|-------|
| `--z-index-dropdown` | `1000` | Dropdown menus |
| `--z-index-sticky` | `1100` | Sticky headers |
| `--z-index-modal-overlay` | `1200` | Modal overlay |
| `--z-index-modal` | `1300` | Modal content |
| `--z-index-toast` | `1400` | Toast notifications |
| `--z-index-tooltip` | `1500` | Tooltips |

---

## Dark Mode

OmniNudge supports automatic dark mode detection and manual toggle. The application uses the same CSS variables but with different default values based on the theme.

**How dark mode works:**

```css
/* Light theme (default) */
:root {
  --background-color: #FFFFFF;
  --text-color: #111827;
}

/* Dark theme */
:root[data-theme="dark"] {
  --background-color: #111827;
  --text-color: #F9FAFB;
}
```

**User themes override both light and dark:**

```css
/* User's custom theme applies to both */
:root,
:root[data-theme="dark"] {
  --primary-color: #8B5CF6;
  --background-color: #1E1B4B;
}
```

---

## Complete Theme Example

Here's a complete example theme using CSS variables:

```css
/* "Midnight Purple" Theme */
:root {
  /* Brand Colors */
  --primary-color: #8B5CF6;
  --primary-color-light: #A78BFA;
  --primary-color-dark: #7C3AED;

  /* Backgrounds */
  --background-color: #0F172A;
  --background-color-alt: #1E293B;
  --surface-color: #1E293B;
  --surface-color-hover: #334155;

  /* Text */
  --text-color: #F1F5F9;
  --text-color-secondary: #94A3B8;
  --text-color-tertiary: #64748B;

  /* Borders */
  --border-color: #334155;
  --border-color-light: #475569;

  /* Semantic */
  --success-color: #10B981;
  --error-color: #EF4444;

  /* Spacing (compact) */
  --spacing-md: 0.875rem;
  --spacing-lg: 1.25rem;

  /* Borders (rounded) */
  --border-radius-lg: 1rem;

  /* Shadows (subtle) */
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);

  /* Components */
  --navigation-height: 60px;
  --post-card-border-radius: 1rem;
  --message-bubble-sent-bg: #8B5CF6;
}
```

---

## Tips for Using Variables

### Cascading and Inheritance

Variables cascade down the DOM tree and can be overridden at any level:

```css
/* Global default */
:root {
  --text-color: #111827;
}

/* Page-specific override */
[data-page="profile"] {
  --text-color: #374151;
}

/* Component-specific override */
.special-section {
  --text-color: #6B7280;
}
```

### Fallback Values

Always provide fallback values for safety:

```css
.component {
  background: var(--custom-bg, var(--surface-color));
  /* If --custom-bg doesn't exist, use --surface-color */
}
```

### Variable Naming Conventions

- Use lowercase with hyphens: `--primary-color`, not `--primaryColor`
- Be specific: `--button-primary-bg`, not `--btn-bg`
- Group related variables: `--spacing-sm`, `--spacing-md`, `--spacing-lg`

---

## Browser Support

CSS variables are supported in all modern browsers:
- Chrome 49+
- Firefox 31+
- Safari 9.1+
- Edge 15+

**No IE11 support** - Consider this when choosing target browsers.

---

## Getting Help

**See also:**
- [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) - Component class names
- [THEME_CREATION_GUIDE.md](THEME_CREATION_GUIDE.md) - Step-by-step theme creation
- [SECURITY_GUIDELINES.md](SECURITY_GUIDELINES.md) - Security best practices

**Tips:**
- Use browser DevTools to inspect current variable values
- Test your theme in both light and dark modes
- Check contrast ratios for accessibility (WCAG AA: 4.5:1 for text)

---

**Last Updated:** 2025-11-29
**Total Variables:** 100+
**Status:** Phase 2 Ready
