# Theme Creation Guide

A comprehensive step-by-step guide to creating custom themes for OmniNudge.

**Last Updated:** 2025-11-29
**For Phase:** 2+
**Difficulty:** Beginner to Advanced

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Level 1: Using Predefined Themes](#level-1-using-predefined-themes)
4. [Level 2: Customizing CSS Variables](#level-2-customizing-css-variables)
5. [Level 3: Writing Full Custom CSS](#level-3-writing-full-custom-css)
6. [Level 4: Per-Page Themes](#level-4-per-page-themes)
7. [Level 5: Component Rearrangement](#level-5-component-rearrangement)
8. [Testing Your Theme](#testing-your-theme)
9. [Publishing to Marketplace](#publishing-to-marketplace)
10. [Best Practices](#best-practices)

---

## Introduction

OmniNudge offers **5 levels of customization**, from simple color changes to complete layout restructuring. This guide walks you through each level with practical examples.

**What you'll need:**
- Basic understanding of CSS (Levels 1-2)
- Intermediate CSS knowledge (Level 3)
- Advanced CSS Grid/Flexbox knowledge (Levels 4-5)
- Browser with DevTools (Chrome, Firefox, Safari, Edge)

**What you'll create:**
- Custom color schemes
- Typography changes
- Layout modifications
- Complete visual redesigns

---

## Getting Started

### Accessing Theme Settings

1. Click on your profile avatar (top-right)
2. Select **Settings**
3. Navigate to **Appearance** tab
4. Find the **Theme Customization** section

### Understanding Advanced Mode

OmniNudge has two modes:

**Basic Mode (Default):**
- Choose from predefined themes
- Adjust CSS variables with visual controls
- Safe and simple

**Advanced Mode:**
- Write custom CSS directly
- Full control over styling
- Per-page theme customization
- Component rearrangement

**To enable Advanced Mode:**
1. Go to Settings → Appearance
2. Toggle **"Advanced Theme Editing"**
3. Accept the terms (understand CSS can break layout)

---

## Level 1: Using Predefined Themes

**Difficulty:** Beginner
**Time:** 2 minutes
**Mode:** Basic

### Step 1: Browse Themes

In Settings → Appearance, you'll see 8 predefined themes:

1. **OmniNudge Light** - Clean, minimal light theme
2. **OmniNudge Dark** - Modern dark theme
3. **Midnight** - Deep blue dark theme
4. **Sunset** - Warm orange/pink gradient theme
5. **Forest** - Green nature-inspired theme
6. **Ocean** - Blue aquatic theme
7. **Lavender** - Soft purple theme
8. **Monochrome** - Black and white theme

### Step 2: Preview and Apply

1. Click on any theme card to see a live preview
2. The preview shows your feed with the theme applied
3. Click **"Apply Theme"** to activate it
4. Your theme syncs across all your devices

### Step 3: Customize Variables (Optional)

Even with predefined themes, you can tweak individual variables:

1. Click **"Customize Variables"** on your active theme
2. Adjust colors using color pickers
3. Change font sizes with sliders
4. Modify spacing with number inputs
5. Click **"Save Changes"**

**Example:** Take the "Midnight" theme and make it even darker by adjusting `--background-color` to a deeper blue.

---

## Level 2: Customizing CSS Variables

**Difficulty:** Beginner to Intermediate
**Time:** 15-30 minutes
**Mode:** Basic or Advanced

### What Are CSS Variables?

CSS variables are reusable values that cascade throughout the application. Changing one variable updates every place that uses it.

**Example:**
```css
/* Define the variable */
:root {
  --primary-color: #3B82F6;
}

/* It's used in many places */
.button { background: var(--primary-color); }
.link { color: var(--primary-color); }
.badge { border: 1px solid var(--primary-color); }

/* Change it once, updates everywhere */
:root {
  --primary-color: #8B5CF6; /* Now everything is purple */
}
```

### Step 1: Choose Your Colors

Use a color palette generator like:
- [Coolors.co](https://coolors.co)
- [Adobe Color](https://color.adobe.com)
- [Material Design Color Tool](https://material.io/resources/color)

Pick 5-7 colors:
1. Primary color (brand color)
2. Background color
3. Surface color (cards, components)
4. Text color
5. Accent color
6. Success/error colors (optional)

### Step 2: Set Core Variables

In Advanced Mode, create a new theme and start with these essential variables:

```css
:root {
  /* Brand Color */
  --primary-color: #8B5CF6;
  --primary-color-light: #A78BFA;
  --primary-color-dark: #7C3AED;

  /* Backgrounds */
  --background-color: #0F172A;
  --surface-color: #1E293B;

  /* Text */
  --text-color: #F1F5F9;
  --text-color-secondary: #94A3B8;

  /* Borders */
  --border-color: #334155;
}
```

### Step 3: Test and Refine

1. Click **"Preview"** to see your changes
2. Navigate through different pages (feed, profile, messages)
3. Check contrast ratios for readability
4. Adjust as needed

### Step 4: Add Typography

```css
:root {
  /* Fonts */
  --font-family-base: "Inter", sans-serif;
  --font-family-heading: "Playfair Display", serif;

  /* Sizes */
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;

  /* Line heights */
  --line-height-normal: 1.6;
}
```

### Step 5: Customize Spacing

```css
:root {
  /* Compact spacing */
  --spacing-md: 0.875rem;
  --spacing-lg: 1.25rem;

  /* Or generous spacing */
  --spacing-md: 1.25rem;
  --spacing-lg: 2rem;
}
```

### Step 6: Border Radius and Shadows

```css
:root {
  /* Rounded corners */
  --border-radius-lg: 1rem;

  /* Sharp corners */
  --border-radius-md: 0;
  --border-radius-lg: 0;

  /* Subtle shadows */
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.1);

  /* Flat design (no shadows) */
  --shadow-md: none;
  --shadow-lg: none;
}
```

### Complete Example: "Cyberpunk" Theme

```css
:root {
  /* Neon colors */
  --primary-color: #FF00FF;
  --primary-color-light: #FF66FF;
  --primary-color-dark: #CC00CC;

  --accent-color: #00FFFF;

  /* Dark backgrounds */
  --background-color: #0A0E27;
  --surface-color: #1A1F3A;

  /* Bright text */
  --text-color: #00FFFF;
  --text-color-secondary: #FF00FF;

  /* Glowing borders */
  --border-color: #FF00FF;

  /* Sharp corners */
  --border-radius-md: 0;
  --border-radius-lg: 2px;

  /* Neon glow shadows */
  --shadow-md: 0 0 20px rgba(255, 0, 255, 0.5);
  --shadow-lg: 0 0 40px rgba(0, 255, 255, 0.6);

  /* Monospace font */
  --font-family-base: "Courier New", monospace;
}
```

---

## Level 3: Writing Full Custom CSS

**Difficulty:** Intermediate to Advanced
**Time:** 1-3 hours
**Mode:** Advanced

### When to Use Full CSS

Use full CSS when you want to:
- Change component layouts
- Add custom animations
- Override specific component styles
- Create unique visual effects

### Step 1: Understanding Component Classes

Refer to [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) for all available classes.

**Key components:**
- `.navigation-bar` - Top navigation
- `.sidebar-container` - Left/right sidebar
- `.feed-post-card` - Post cards in feed
- `.message-bubble` - Message bubbles
- `.button` - All buttons

### Step 2: Start with Variables

Always define your CSS variables first (as in Level 2), then add custom CSS on top:

```css
/* Variables first */
:root {
  --primary-color: #8B5CF6;
  --background-color: #0F172A;
  /* ... */
}

/* Custom CSS after */
.feed-post-card {
  border-left: 4px solid var(--primary-color);
  transform: rotate(-0.5deg);
}
```

### Step 3: Customize Post Cards

**Example: Card with accent border**
```css
.feed-post-card {
  border-left: 4px solid var(--primary-color);
  background: var(--surface-color);
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-md);
  transition: transform var(--transition-normal);
}

.feed-post-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}
```

**Example: Compact card layout**
```css
.feed-post-card {
  padding: var(--spacing-sm);
}

.feed-post-card__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.feed-post-card__title {
  font-size: var(--font-size-base);
  margin-bottom: var(--spacing-xs);
}
```

### Step 4: Customize Navigation

**Example: Centered navigation**
```css
.navigation-bar {
  display: flex;
  justify-content: center;
  padding: 0 var(--spacing-lg);
}

.navigation-bar__menu {
  display: flex;
  gap: var(--spacing-md);
}
```

**Example: Transparent navigation**
```css
.navigation-bar {
  background: transparent;
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
```

### Step 5: Customize Message Bubbles

**Example: Different bubble shapes**
```css
.message-bubble--sent {
  background: var(--primary-color);
  border-radius: 1rem 1rem 0.25rem 1rem;
  /* Pointed corner on bottom-right */
}

.message-bubble--received {
  background: var(--surface-color);
  border-radius: 1rem 1rem 1rem 0.25rem;
  /* Pointed corner on bottom-left */
}
```

**Example: iMessage-style bubbles**
```css
.message-bubble--sent {
  background: #007AFF;
  color: white;
  border-radius: 18px;
  padding: 8px 14px;
}

.message-bubble--received {
  background: #E5E5EA;
  color: black;
  border-radius: 18px;
  padding: 8px 14px;
}
```

### Step 6: Add Animations

**Example: Fade in posts**
```css
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.feed-post-card {
  animation: fadeIn 0.4s ease-out;
}
```

**Example: Button hover effect**
```css
.button--primary {
  position: relative;
  overflow: hidden;
  transition: all 0.3s;
}

.button--primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.button--primary:active {
  transform: translateY(0);
}
```

### Step 7: Custom Comment Threading

**Example: Colorful thread lines**
```css
.comment-thread__replies {
  border-left: 3px solid var(--primary-color);
  margin-left: var(--spacing-lg);
  padding-left: var(--spacing-md);
}

/* Alternate colors for nested comments */
.comment-thread__replies .comment-thread__replies {
  border-left-color: var(--accent-color);
}

.comment-thread__replies .comment-thread__replies .comment-thread__replies {
  border-left-color: var(--success-color);
}
```

---

## Level 4: Per-Page Themes

**Difficulty:** Advanced
**Time:** 2-4 hours
**Mode:** Advanced

### What Are Per-Page Themes?

Per-page themes let you style each page differently. For example:
- Dark theme for messages
- Light theme for feed
- Colorful theme for profile

### Step 1: Understanding Data Attributes

Each page has a `data-page` attribute:
- `[data-page="feed"]` - Main feed page
- `[data-page="profile"]` - User profiles
- `[data-page="messages"]` - Messaging page
- `[data-page="settings"]` - Settings page
- `[data-page="notifications"]` - Notifications
- `[data-page="search"]` - Search results

### Step 2: Create a Global Theme

Start with a base theme that applies to all pages:

```css
:root {
  --primary-color: #3B82F6;
  --background-color: #FFFFFF;
  --text-color: #111827;
}
```

### Step 3: Override for Specific Pages

**Example: Dark messages page**
```css
[data-page="messages"] {
  --background-color: #111827;
  --surface-color: #1F2937;
  --text-color: #F9FAFB;
  --border-color: #374151;
}
```

**Example: Colorful profile pages**
```css
[data-page="profile"] {
  --primary-color: #8B5CF6;
  --background-color: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --surface-color: rgba(255, 255, 255, 0.1);
  --text-color: #FFFFFF;
}

[data-page="profile"] .profile-header__banner {
  border-radius: var(--border-radius-lg);
  overflow: hidden;
}
```

**Example: Minimalist settings page**
```css
[data-page="settings"] {
  --background-color: #F9FAFB;
  --surface-color: #FFFFFF;
  --border-radius-lg: 0;
  --shadow-md: none;
}

[data-page="settings"] .settings-section {
  border-bottom: 1px solid var(--border-color);
  border-radius: 0;
}
```

### Step 4: Page-Specific Component Styling

**Example: Larger posts on feed**
```css
[data-page="feed"] .feed-post-card {
  max-width: 900px;
  margin: 0 auto var(--spacing-lg);
}

[data-page="feed"] .feed-post-card__title {
  font-size: var(--font-size-2xl);
}
```

**Example: Compact message list**
```css
[data-page="messages"] .message-bubble {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-sm);
}

[data-page="messages"] .conversation-list__item {
  padding: var(--spacing-sm);
}
```

### Complete Example: Multi-Page Theme

```css
/* Global base */
:root {
  --font-family-base: "Inter", sans-serif;
  --transition-normal: 300ms;
}

/* Feed: Light and airy */
[data-page="feed"] {
  --primary-color: #3B82F6;
  --background-color: #F9FAFB;
  --surface-color: #FFFFFF;
  --text-color: #111827;
}

/* Profile: Purple and bold */
[data-page="profile"] {
  --primary-color: #8B5CF6;
  --background-color: #1E1B4B;
  --surface-color: #2D2A5A;
  --text-color: #F1F5F9;
}

[data-page="profile"] .profile-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* Messages: Dark and focused */
[data-page="messages"] {
  --primary-color: #10B981;
  --background-color: #0F172A;
  --surface-color: #1E293B;
  --text-color: #F1F5F9;
}

/* Settings: Minimal and clean */
[data-page="settings"] {
  --background-color: #FFFFFF;
  --surface-color: #F9FAFB;
  --border-radius-lg: 0;
  --shadow-md: none;
}
```

---

## Level 5: Component Rearrangement

**Difficulty:** Expert
**Time:** 3-6 hours
**Mode:** Advanced

### What Is Component Rearrangement?

Using CSS Grid and Flexbox, you can completely restructure page layouts without touching HTML.

**Warning:** Advanced technique that can break layouts if done incorrectly. Always test thoroughly.

### Step 1: Understanding Grid Areas

OmniNudge pages use CSS Grid with named areas:

```css
/* Default feed layout */
[data-page="feed"] {
  display: grid;
  grid-template-areas:
    "nav nav"
    "sidebar main"
    "sidebar footer";
  grid-template-columns: 280px 1fr;
}

.navigation-bar { grid-area: nav; }
.sidebar-container { grid-area: sidebar; }
.feed-main { grid-area: main; }
```

### Step 2: Move Sidebar to Right

```css
[data-page="feed"] {
  display: grid;
  grid-template-areas:
    "nav nav"
    "main sidebar"
    "footer sidebar";
  grid-template-columns: 1fr 280px;
}
```

### Step 3: Three-Column Layout

```css
[data-page="feed"] {
  display: grid;
  grid-template-areas:
    "nav nav nav"
    "left main right"
    "left footer right";
  grid-template-columns: 240px 1fr 320px;
  gap: var(--spacing-lg);
}

.sidebar-container { grid-area: left; }
.feed-main { grid-area: main; }
.feed-trending { grid-area: right; }
```

### Step 4: Centered Content Layout

```css
[data-page="feed"] {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.feed-main {
  max-width: 600px;
  width: 100%;
}

.sidebar-container {
  display: none; /* Hide sidebar for minimalist look */
}
```

### Step 5: Magazine-Style Feed

```css
[data-page="feed"] .feed-main {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacing-lg);
}

.feed-post-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.feed-post-card__media {
  flex-grow: 1;
  object-fit: cover;
}
```

### Step 6: Horizontal Message Layout

**Example: Side-by-side conversations**
```css
[data-page="messages"] {
  display: grid;
  grid-template-areas:
    "nav nav"
    "list chat";
  grid-template-columns: 350px 1fr;
}

.conversation-list { grid-area: list; }
.message-thread { grid-area: chat; }
```

### Step 7: Profile Sidebar Layout

```css
[data-page="profile"] {
  display: grid;
  grid-template-areas:
    "header header"
    "sidebar content";
  grid-template-columns: 300px 1fr;
  gap: var(--spacing-lg);
}

.profile-header {
  grid-area: header;
}

.profile-sidebar {
  grid-area: sidebar;
  /* User info, stats */
}

.profile-content {
  grid-area: content;
  /* Posts, activity */
}
```

### Complete Example: Masonry Feed Layout

```css
[data-page="feed"] {
  padding: 0 var(--spacing-lg);
}

[data-page="feed"] .feed-main {
  columns: 3;
  column-gap: var(--spacing-lg);
}

.feed-post-card {
  break-inside: avoid;
  margin-bottom: var(--spacing-lg);
  display: inline-block;
  width: 100%;
}

/* Responsive */
@media (max-width: 1200px) {
  [data-page="feed"] .feed-main {
    columns: 2;
  }
}

@media (max-width: 768px) {
  [data-page="feed"] .feed-main {
    columns: 1;
  }
}
```

---

## Testing Your Theme

### Browser DevTools

1. Open DevTools (F12 or Cmd+Option+I)
2. Go to Elements/Inspector tab
3. Inspect components to verify CSS is applied
4. Check Console for errors

### Preview Mode

1. Click **"Preview"** in theme editor
2. Navigate through all pages:
   - Feed
   - Your profile
   - Someone else's profile
   - Messages
   - Settings
   - Notifications
3. Test interactions:
   - Hover states
   - Click buttons
   - Open modals
   - Scroll long lists

### Contrast Checking

Use tools to verify text is readable:
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- Chrome DevTools (Lighthouse accessibility audit)

**WCAG Standards:**
- AA: 4.5:1 for normal text, 3:1 for large text
- AAA: 7:1 for normal text, 4.5:1 for large text

### Mobile Testing

1. Use DevTools responsive mode
2. Test at breakpoints:
   - 320px (small phone)
   - 375px (iPhone)
   - 768px (tablet)
   - 1024px (desktop)

### Cross-Browser Testing

Test in:
- Chrome/Chromium
- Firefox
- Safari (if on Mac)
- Edge

---

## Publishing to Marketplace

(Phase 3 feature - coming soon)

### Step 1: Prepare Your Theme

1. Give your theme a descriptive name
2. Write a clear description (what makes it unique?)
3. Add tags (e.g., "dark", "minimal", "colorful")
4. Choose a category
5. Set a price (or make it free)

### Step 2: Create Preview Images

Take screenshots of:
- Feed page with your theme
- Profile page
- Messages page
- Settings page

### Step 3: Submit for Review

1. Click **"Publish to Marketplace"**
2. Fill out theme details
3. Upload preview images
4. Set pricing
5. Submit for moderation

### Step 4: Moderation

Themes are reviewed for:
- No malicious CSS
- No offensive content
- Proper functionality
- Quality standards

Reviews typically take 24-48 hours.

### Step 5: Share and Earn

Once approved:
- Your theme appears in marketplace
- Users can install with one click
- You earn 70% of sales
- Track downloads and ratings

---

## Best Practices

### Performance

**Do:**
- Use CSS variables for maintainability
- Minimize animations on mobile
- Use `will-change` sparingly
- Optimize transitions

**Don't:**
- Create infinite animations
- Use complex shadows everywhere
- Nest selectors too deeply (max 3 levels)
- Override every single component

### Accessibility

**Do:**
- Maintain sufficient contrast ratios (4.5:1 minimum)
- Use relative units (rem, em) for font sizes
- Test with screen readers
- Keep focus indicators visible

**Don't:**
- Remove focus outlines completely
- Use color alone to convey information
- Create low-contrast text
- Hide important UI elements

### Maintainability

**Do:**
- Comment your CSS sections
- Use consistent naming
- Group related styles
- Document color choices

**Don't:**
- Hardcode values everywhere
- Use magic numbers without comments
- Create overly specific selectors
- Copy-paste without understanding

### Design Principles

**Do:**
- Start with a color palette
- Use a consistent spacing scale
- Limit font families (2-3 max)
- Create visual hierarchy
- Test in both light and dark modes

**Don't:**
- Use too many colors
- Mix conflicting design styles
- Forget about mobile users
- Ignore existing design patterns

---

## Common Patterns

### Glass Morphism

```css
.surface {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}
```

### Neumorphism

```css
.card {
  background: #E0E5EC;
  box-shadow:
    9px 9px 16px rgba(163, 177, 198, 0.6),
    -9px -9px 16px rgba(255, 255, 255, 0.5);
  border-radius: 20px;
}

.card:active {
  box-shadow:
    inset 9px 9px 16px rgba(163, 177, 198, 0.6),
    inset -9px -9px 16px rgba(255, 255, 255, 0.5);
}
```

### Gradient Backgrounds

```css
.page {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* Animated gradient */
.page {
  background: linear-gradient(
    -45deg,
    #ee7752,
    #e73c7e,
    #23a6d5,
    #23d5ab
  );
  background-size: 400% 400%;
  animation: gradientShift 15s ease infinite;
}

@keyframes gradientShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
```

### Dark Mode with Auto-Detection

```css
/* Light theme */
:root {
  --bg: #FFFFFF;
  --text: #111827;
}

/* Dark theme (respects system preference) */
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111827;
    --text: #F9FAFB;
  }
}

/* User can override with manual toggle */
:root[data-theme="light"] {
  --bg: #FFFFFF;
  --text: #111827;
}

:root[data-theme="dark"] {
  --bg: #111827;
  --text: #F9FAFB;
}
```

---

## Troubleshooting

### My CSS isn't applying

1. Check for syntax errors in DevTools Console
2. Verify class names match [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md)
3. Check CSS specificity (your selectors may be too weak)
4. Clear cache and hard refresh (Cmd+Shift+R or Ctrl+Shift+R)

### Colors look wrong

1. Verify hex codes are correct
2. Check for typos in variable names
3. Ensure variables are defined in `:root`
4. Test in both light/dark modes

### Layout is broken

1. Check CSS Grid syntax
2. Verify `grid-template-areas` spelling matches `grid-area` values
3. Test at different screen sizes
4. Remove complex layout changes and add back incrementally

### Theme doesn't save

1. Check that you're logged in
2. Verify you're under the theme size limit (100KB)
3. Look for error messages in the UI
4. Try again in a few minutes (server may be busy)

---

## Getting Help

**Documentation:**
- [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) - Component classes
- [CSS_VARIABLES.md](CSS_VARIABLES.md) - All available variables
- [SECURITY_GUIDELINES.md](SECURITY_GUIDELINES.md) - Security best practices

**Community:**
- Browse themes in the marketplace for inspiration
- Check theme comments for tips from creators
- Ask questions in the OmniNudge community hub

**Developer Tools:**
- Use browser DevTools to inspect existing themes
- Try the live preview before saving
- Test on multiple devices

---

## Examples Gallery

### Minimalist Light
```css
:root {
  --primary-color: #000000;
  --background-color: #FFFFFF;
  --surface-color: #FAFAFA;
  --text-color: #000000;
  --border-radius-lg: 0;
  --shadow-md: none;
  --font-family-base: "Helvetica Neue", sans-serif;
}
```

### Retro Terminal
```css
:root {
  --primary-color: #00FF00;
  --background-color: #000000;
  --surface-color: #0A0A0A;
  --text-color: #00FF00;
  --font-family-base: "Courier New", monospace;
  --border-radius-lg: 0;
  --shadow-md: none;
}

.feed-post-card {
  border: 1px solid #00FF00;
  background: #000000;
}
```

### Soft Pastel
```css
:root {
  --primary-color: #FF6B9D;
  --background-color: #FFF5F7;
  --surface-color: #FFFFFF;
  --text-color: #4A4A4A;
  --border-color: #FFE5EC;
  --border-radius-lg: 20px;
  --shadow-md: 0 4px 20px rgba(255, 107, 157, 0.1);
}
```

---

**Ready to create your theme?** Start with Level 1 and work your way up. Happy theming!

**Last Updated:** 2025-11-29
**Guide Version:** 1.0
**For:** OmniNudge Phase 2+
