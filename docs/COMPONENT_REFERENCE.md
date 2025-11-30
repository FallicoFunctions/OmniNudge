# Component Reference - CSS Customization Guide

This document lists all themeable components in OmniNudge with their CSS class names and customization options. Use this reference when creating custom themes.

**Last Updated:** 2025-11-29
**For Phase:** 2+

---

## Overview

All components in OmniNudge use **stable, semantic class names** following the BEM (Block Element Modifier) naming convention. This ensures your custom CSS will continue to work across updates.

**Naming Pattern:**
```
.component-name              // Block
.component-name__element     // Element
.component-name--modifier    // Modifier
```

---

## Global Layout Components

### Navigation Bar

**Class:** `.navigation-bar`

**Elements:**
- `.navigation-bar__logo` - Platform logo
- `.navigation-bar__menu` - Main menu container
- `.navigation-bar__item` - Menu item
- `.navigation-bar__link` - Menu link
- `.navigation-bar__user` - User profile section
- `.navigation-bar__avatar` - User avatar
- `.navigation-bar__username` - Username display
- `.navigation-bar__notifications` - Notification bell icon
- `.navigation-bar__unread-badge` - Unread count badge

**CSS Variables:**
- `--navigation-height` - Height of navigation bar (default: 64px)
- `--navigation-background` - Background color
- `--navigation-text-color` - Text color
- `--navigation-hover-color` - Hover state color

**Example Customization:**
```css
.navigation-bar {
  background: var(--navigation-background);
  height: var(--navigation-height);
  box-shadow: var(--shadow-md);
}

.navigation-bar__link:hover {
  color: var(--primary-color);
}
```

---

### Sidebar

**Class:** `.sidebar-container`

**Elements:**
- `.sidebar-container__header` - Sidebar header
- `.sidebar-container__section` - Section divider
- `.sidebar-container__item` - Sidebar item
- `.sidebar-container__link` - Sidebar link
- `.sidebar-container__icon` - Item icon
- `.sidebar-container__label` - Item label

**CSS Variables:**
- `--sidebar-width` - Width of sidebar (default: 280px)
- `--sidebar-background` - Background color
- `--sidebar-text-color` - Text color

**Example Rearrangement:**
```css
/* Move sidebar to right side */
[data-page="feed"] {
  display: flex;
  flex-direction: row-reverse;
}

.sidebar-container {
  order: 2;
}
```

---

## Feed Components

### Post Card

**Class:** `.feed-post-card`

**Elements:**
- `.feed-post-card__header` - Post header
- `.feed-post-card__author` - Author name
- `.feed-post-card__avatar` - Author avatar image
- `.feed-post-card__timestamp` - Time posted
- `.feed-post-card__title` - Post title
- `.feed-post-card__body` - Post content
- `.feed-post-card__media` - Media container (images/videos)
- `.feed-post-card__actions` - Action buttons container
- `.feed-post-card__upvote` - Upvote button
- `.feed-post-card__downvote` - Downvote button
- `.feed-post-card__comment-btn` - Comment button
- `.feed-post-card__share-btn` - Share button
- `.feed-post-card__stats` - Statistics (votes, comments count)

**CSS Variables:**
- `--post-card-padding` - Inner padding
- `--post-card-border-radius` - Corner rounding
- `--post-card-background` - Background color
- `--post-card-border-color` - Border color

**Example Customization:**
```css
.feed-post-card {
  background: var(--surface-color);
  border-radius: var(--post-card-border-radius);
  padding: var(--post-card-padding);
  margin-bottom: var(--spacing-md);
  border: 1px solid var(--border-color);
}

/* Make post cards more compact */
.feed-post-card {
  padding: var(--spacing-sm);
}

/* Change post card layout */
.feed-post-card__header {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}
```

---

### Comment Thread

**Class:** `.comment-thread`

**Elements:**
- `.comment-thread__item` - Individual comment
- `.comment-thread__avatar` - Commenter avatar
- `.comment-thread__author` - Commenter name
- `.comment-thread__timestamp` - Comment time
- `.comment-thread__body` - Comment text
- `.comment-thread__actions` - Action buttons (reply, vote)
- `.comment-thread__replies` - Nested replies container
- `.comment-thread__indent` - Reply indentation

**CSS Variables:**
- `--comment-indent-size` - Indent for nested comments (default: 24px)
- `--comment-background` - Background color
- `--comment-border-left` - Left border for threading

**Example Customization:**
```css
/* Increase threading visual */
.comment-thread__replies {
  margin-left: var(--comment-indent-size);
  border-left: 2px solid var(--border-color);
  padding-left: var(--spacing-md);
}
```

---

## Profile Components

### Profile Header

**Class:** `.profile-header`

**Elements:**
- `.profile-header__banner` - Cover image
- `.profile-header__avatar` - Profile picture
- `.profile-header__info` - User info section
- `.profile-header__username` - Username
- `.profile-header__bio` - User biography
- `.profile-header__stats` - Statistics (posts, karma, etc.)
- `.profile-header__stat-item` - Individual stat
- `.profile-header__actions` - Action buttons (message, block, etc.)

**Example Customization:**
```css
.profile-header {
  position: relative;
  min-height: 300px;
}

.profile-header__banner {
  height: 200px;
  background-size: cover;
  background-position: center;
}

.profile-header__avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  border: 4px solid var(--background-color);
  margin-top: -60px;
}
```

---

### Profile Tabs

**Class:** `.profile-tabs`

**Elements:**
- `.profile-tabs__nav` - Tab navigation
- `.profile-tabs__tab` - Individual tab
- `.profile-tabs__tab--active` - Active tab modifier
- `.profile-tabs__content` - Tab content container

---

## Messages Components

### Message Bubble

**Class:** `.message-bubble`

**Elements:**
- `.message-bubble__content` - Message text
- `.message-bubble__timestamp` - Message time
- `.message-bubble__status` - Delivery/read status
- `.message-bubble__media` - Attached media
- `.message-bubble--sent` - Sent by current user modifier
- `.message-bubble--received` - Received from other user modifier

**CSS Variables:**
- `--message-bubble-sent-bg` - Background for sent messages
- `--message-bubble-received-bg` - Background for received messages
- `--message-bubble-border-radius` - Bubble rounding

**Example Customization:**
```css
/* Sent messages (right-aligned, blue) */
.message-bubble--sent {
  background: var(--primary-color);
  color: white;
  align-self: flex-end;
  border-radius: var(--message-bubble-border-radius);
}

/* Received messages (left-aligned, gray) */
.message-bubble--received {
  background: var(--surface-color);
  color: var(--text-color);
  align-self: flex-start;
  border-radius: var(--message-bubble-border-radius);
}
```

---

### Conversation List

**Class:** `.conversation-list`

**Elements:**
- `.conversation-list__item` - Individual conversation
- `.conversation-list__avatar` - Contact avatar
- `.conversation-list__name` - Contact name
- `.conversation-list__preview` - Message preview
- `.conversation-list__timestamp` - Last message time
- `.conversation-list__unread` - Unread message count badge
- `.conversation-list__item--active` - Active conversation modifier

---

## Form Components

### Input Field

**Class:** `.input-field`

**Elements:**
- `.input-field__label` - Field label
- `.input-field__input` - Text input
- `.input-field__helper` - Helper text
- `.input-field__error` - Error message
- `.input-field--error` - Error state modifier

**CSS Variables:**
- `--input-border-color` - Border color
- `--input-focus-color` - Focus state border color
- `--input-background` - Background color
- `--input-text-color` - Text color

---

### Button

**Class:** `.button`

**Modifiers:**
- `.button--primary` - Primary action button
- `.button--secondary` - Secondary action button
- `.button--danger` - Destructive action button
- `.button--ghost` - Text-only button
- `.button--disabled` - Disabled state

**CSS Variables:**
- `--button-primary-bg` - Primary button background
- `--button-primary-text` - Primary button text color
- `--button-border-radius` - Button corner rounding

**Example Customization:**
```css
.button--primary {
  background: var(--primary-color);
  color: white;
  border-radius: var(--button-border-radius);
  padding: var(--spacing-sm) var(--spacing-lg);
}

.button--primary:hover {
  background: var(--primary-color-dark);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}
```

---

## Settings Components

### Settings Section

**Class:** `.settings-section`

**Elements:**
- `.settings-section__header` - Section header
- `.settings-section__title` - Section title
- `.settings-section__description` - Section description
- `.settings-section__content` - Section content
- `.settings-section__row` - Settings row
- `.settings-section__label` - Setting label
- `.settings-section__control` - Setting control (toggle, input, etc.)

---

### Theme Selector

**Class:** `.theme-selector`

**Elements:**
- `.theme-selector__grid` - Theme preview grid
- `.theme-selector__card` - Individual theme preview
- `.theme-selector__card--active` - Active theme modifier
- `.theme-selector__preview` - Visual preview
- `.theme-selector__name` - Theme name
- `.theme-selector__author` - Theme creator

---

## Utility Components

### Modal

**Class:** `.modal`

**Elements:**
- `.modal__overlay` - Background overlay
- `.modal__container` - Modal container
- `.modal__header` - Modal header
- `.modal__title` - Modal title
- `.modal__close` - Close button
- `.modal__body` - Modal content
- `.modal__footer` - Modal footer with actions

---

### Toast Notification

**Class:** `.toast`

**Elements:**
- `.toast__container` - Toast wrapper
- `.toast__message` - Message text
- `.toast__icon` - Status icon
- `.toast__close` - Close button
- `.toast--success` - Success modifier
- `.toast--error` - Error modifier
- `.toast--info` - Info modifier

---

## Page-Specific Targeting

Use data attributes to target specific pages:

```css
/* Feed page only */
[data-page="feed"] .post-card {
  /* Custom styles */
}

/* Profile page only */
[data-page="profile"] .header {
  /* Custom styles */
}

/* Settings page only */
[data-page="settings"] {
  background: var(--background-color-alt);
}

/* Messages page only */
[data-page="messages"] .sidebar {
  width: 300px;
}
```

**Available Pages:**
- `feed` - Main feed page
- `profile` - User profile pages
- `settings` - Settings page
- `messages` - Messaging page
- `notifications` - Notifications page
- `search` - Search results page

---

## Component State Classes

### Common States

```css
.is-loading { /* Loading state */ }
.is-disabled { /* Disabled state */ }
.is-active { /* Active state */ }
.is-focused { /* Focus state */ }
.is-hovered { /* Hover state */ }
.is-hidden { /* Hidden state */ }
```

---

## Tips for Custom Themes

### Use CSS Variables

Always use CSS variables for colors, spacing, and other theme-able properties:

```css
/* Good - uses variables */
.post-card {
  background: var(--surface-color);
  padding: var(--spacing-md);
  border-radius: var(--border-radius-lg);
}

/* Bad - hardcoded values */
.post-card {
  background: #1F2937;
  padding: 16px;
  border-radius: 12px;
}
```

### Component Rearrangement

Use CSS Grid and Flexbox for layout changes:

```css
/* Reorder feed components */
[data-page="feed"] {
  display: grid;
  grid-template-areas:
    "nav nav"
    "sidebar main"
    "sidebar aside";
  grid-template-columns: 280px 1fr;
}

.navigation-bar { grid-area: nav; }
.sidebar-container { grid-area: sidebar; }
.feed-main { grid-area: main; }
.feed-trending { grid-area: aside; }
```

### Responsive Design

Consider different screen sizes:

```css
/* Desktop */
.feed-post-card {
  max-width: 800px;
}

/* Tablet (handled by media queries, not user CSS) */
/* User CSS can still affect responsive breakpoints */
@media (max-width: 768px) {
  .sidebar-container {
    width: 100%;
  }
}
```

---

## Limitations

### What You Cannot Do (Phase 2)

- Add new HTML elements (Phase 3+)
- Use external resources (`url()` blocked for security)
- Use `@import` statements
- Execute JavaScript
- Access user data via CSS

### What You Can Do

- Change colors, fonts, spacing, borders
- Rearrange components with CSS Grid/Flexbox
- Show/hide elements with `display: none`
- Add animations and transitions
- Create completely custom layouts
- Override any default styling

---

## Getting Help

**See also:**
- [CSS_VARIABLES.md](CSS_VARIABLES.md) - Complete CSS variable reference
- [THEME_CREATION_GUIDE.md](THEME_CREATION_GUIDE.md) - Step-by-step theme creation
- [SECURITY_GUIDELINES.md](SECURITY_GUIDELINES.md) - Security best practices

**Questions?**
- Check the theme browser for examples from other users
- Test your CSS in the live preview before saving
- Use browser DevTools to inspect component classes
