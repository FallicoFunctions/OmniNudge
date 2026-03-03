# Code Refactoring Guide - Eliminating Redundancy

This document describes the reusable components and utilities created to eliminate code duplication across the OmniNudge project.

---

## GROUND TRUTH (Updated 2026-02-26)

### What Already EXISTS in the Codebase ✓

**Frontend UI components** (`frontend/src/components/ui/`):
- `Button.tsx` ✓
- `Alert.tsx` ✓
- `Input.tsx` ✓
- `Textarea.tsx` ✓
- `ModalHeader.tsx` ✓
- `ModalCloseButton.tsx` ✓
- `AboutPanel.tsx` ✓
- `ConfirmDialog.tsx` ✓
- `LoadingSpinner.tsx` ✓
- `Toast.tsx` + `ToastContainer.tsx` ✓
- `index.ts` barrel export ✓

**Backend utilities**:
- `internal/utils/pagination.go` ✓
- `internal/utils/cursor.go` ✓
- `internal/helpers/permissions.go` ✓

**What DOES NOT exist yet**:
- `internal/api/middleware/auth_helpers.go` (`GetAuthenticatedUserID` / `GetOptionalUserID`) — will be built in REFACTOR_01
- `internal/services/mocks/` — will be built in REFACTOR_02/03

### Adoption Status
The UI components exist but are not yet adopted everywhere — many pages still use inline button/alert/input patterns. Adoption will happen incrementally as each screen is touched during feature work. Do not do a mass adoption sweep; use components on new code and when touching existing code.

---

## Overview

Based on a comprehensive audit of the codebase, we identified significant code duplication (~15-20%) across both frontend and backend. This refactoring introduces reusable components and utilities to eliminate this redundancy.

## Frontend - Reusable UI Components

All new UI components are located in `/frontend/src/components/ui/` and can be imported from the barrel export:

```typescript
import { Button, Alert, Input, Textarea, ModalHeader, AboutPanel } from '@/components/ui';
```

### 1. Button Component (`Button.tsx`)

**Replaces:** 85+ instances of duplicated button styling with `disabled:opacity-50/60`

**Usage:**
```typescript
import { Button } from '@/components/ui';

// Primary button (default)
<Button onClick={handleClick}>Submit</Button>

// Variants: 'primary' | 'secondary' | 'danger' | 'ghost'
<Button variant="secondary">Cancel</Button>
<Button variant="danger">Delete</Button>
<Button variant="ghost">Close</Button>

// Sizes: 'sm' | 'md' | 'lg'
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>

// Loading state
<Button isLoading={isSubmitting}>Save</Button>

// All standard button props supported
<Button disabled={!isValid} type="submit" className="mt-4">
  Create Post
</Button>
```

**Benefits:**
- Consistent styling across all buttons
- Built-in loading state with spinner
- Automatic disabled styling
- Type-safe variants and sizes

---

### 2. Alert Component (`Alert.tsx`)

**Replaces:** 22+ instances of duplicated alert/message boxes

**Usage:**
```typescript
import { Alert } from '@/components/ui';

// Variants: 'error' | 'success' | 'warning' | 'info'
<Alert variant="error">
  Failed to save post. Please try again.
</Alert>

<Alert variant="success">
  Post created successfully!
</Alert>

<Alert variant="warning">
  This action cannot be undone.
</Alert>

// With close button
<Alert variant="info" onClose={() => setShowAlert(false)}>
  New features are available!
</Alert>
```

**Old Pattern (Duplicated 22+ times):**
```typescript
// ❌ Don't do this anymore
<div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
  Error message here
</div>
```

**New Pattern:**
```typescript
// ✅ Do this instead
<Alert variant="error">Error message here</Alert>
```

---

### 3. Input Component (`Input.tsx`)

**Replaces:** 64+ instances of duplicated input styling with `focus:ring-2`

**Usage:**
```typescript
import { Input } from '@/components/ui';

// Basic input
<Input
  type="text"
  placeholder="Enter username"
  value={username}
  onChange={(e) => setUsername(e.target.value)}
/>

// With label
<Input
  label="Email Address"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>

// With error
<Input
  label="Password"
  type="password"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  error={passwordError}
/>

// With helper text
<Input
  label="Username"
  helperText="Must be 3-20 characters"
  value={username}
  onChange={(e) => setUsername(e.target.value)}
/>

// All standard input props supported
<Input
  required
  maxLength={100}
  disabled={isLoading}
  autoFocus
/>
```

**Old Pattern (Duplicated 64+ times):**
```typescript
// ❌ Don't do this anymore
<input
  className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
  type="text"
  value={value}
  onChange={onChange}
/>
```

**New Pattern:**
```typescript
// ✅ Do this instead
<Input value={value} onChange={onChange} />
```

---

### 4. Textarea Component (`Textarea.tsx`)

**Replaces:** Similar to Input, for multi-line text fields

**Usage:**
```typescript
import { Textarea } from '@/components/ui';

<Textarea
  label="Description"
  placeholder="Enter a description..."
  value={description}
  onChange={(e) => setDescription(e.target.value)}
  rows={5}
  error={descriptionError}
  helperText="Max 500 characters"
/>
```

---

### 5. ModalHeader Component (`ModalHeader.tsx`)

**Replaces:** 3+ modals with identical header patterns

**Usage:**
```typescript
import { ModalHeader } from '@/components/ui';

// In your modal component
<div className="modal">
  <ModalHeader
    title="Create New Post"
    onClose={handleClose}
  />
  {/* Modal content */}
</div>

// With subtitle
<ModalHeader
  title="Report a Bug"
  subtitle="Help us improve OmniNudge"
  onClose={handleClose}
/>
```

**Old Pattern (Duplicated in 3+ modals):**
```typescript
// ❌ Don't do this anymore
<div className="flex items-start justify-between mb-6">
  <div>
    <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
      Title
    </h2>
  </div>
  <button onClick={onClose} className="ml-4 text-[var(--color-text-secondary)]">
    ✕
  </button>
</div>
```

**New Pattern:**
```typescript
// ✅ Do this instead
<ModalHeader title="Title" onClose={onClose} />
```

---

### 6. AboutPanel Component (`AboutPanel.tsx`)

**Replaces:** `HubAboutPanel` and `SubredditAboutPanel` (95% code similarity)

**Usage:**
```typescript
import { AboutPanel } from '@/components/ui';
import type { AboutPanelStat } from '@/components/ui';

// For Hub
const hubStats: AboutPanelStat[] = [
  { label: 'Members', value: hub.subscriber_count },
  { label: 'Visibility', value: hub.type, format: (v) => v.charAt(0).toUpperCase() + v.slice(1) },
  { label: 'Created', value: hub.created_at, format: (v) => new Date(v).toLocaleDateString() },
];

<AboutPanel
  title="About this hub"
  isLoading={isLoading}
  isError={isError}
  description={hub.description}
  stats={hubStats}
/>

// For Subreddit
const subredditStats: AboutPanelStat[] = [
  { label: 'Members', value: about.subscribers },
  { label: 'Online', value: about.active_user_count },
  { label: 'Created', value: about.created_utc, format: (v) => new Date(v * 1000).toLocaleDateString() },
];

<AboutPanel
  title="About this subreddit"
  isLoading={isLoading}
  isError={isError}
  icon={iconUrl}
  htmlDescription={sidebarHtml}
  stats={subredditStats}
/>
```

**Benefits:**
- Single component replaces 2 files with 95% duplicate code
- Flexible stat display with custom formatting
- Supports both plain text and HTML descriptions
- Consistent loading/error states

---

## Backend - Reusable Utilities

### 1. Authentication Helper (`middleware/auth_helpers.go`)

**Replaces:** 95+ instances of user ID extraction

**Usage:**
```go
import "github.com/omninudge/backend/internal/middleware"

// Required authentication (writes error response if not authenticated)
func (h *Handler) MyEndpoint(c *gin.Context) {
    userID, ok := middleware.GetAuthenticatedUserID(c)
    if !ok {
        return // Error already written
    }

    // Use userID...
}

// Optional authentication (no error if not authenticated)
func (h *Handler) PublicEndpoint(c *gin.Context) {
    userID, authenticated := middleware.GetOptionalUserID(c)
    if authenticated {
        // Show personalized content
    } else {
        // Show public content
    }
}
```

**Old Pattern (Duplicated 95+ times):**
```go
// ❌ Don't do this anymore
userID, exists := c.Get("user_id")
if !exists {
    c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
    return
}
uid := userID.(int)
```

**New Pattern:**
```go
// ✅ Do this instead
userID, ok := middleware.GetAuthenticatedUserID(c)
if !ok {
    return
}
```

---

### 2. Pagination Utilities (`utils/pagination.go`)

**Replaces:** 18+ instances of limit/offset parsing and validation

**Usage:**
```go
import "github.com/omninudge/backend/internal/utils"

func (h *Handler) ListItems(c *gin.Context) {
    // Parse with defaults (limit=50, max=100)
    params := utils.ParsePaginationParams(c)

    // Or with custom defaults
    params := utils.ParsePaginationParamsWithDefaults(c, 25, 200)

    // Check pagination type
    useCursor := utils.UseCursorPagination(params)

    // Adjust limit for cursor pagination (fetch N+1 to determine hasMore)
    limitArg := utils.AdjustLimitForCursor(params.Limit, useCursor)

    // Use params.Limit, params.Offset, params.Cursor
}
```

**Old Pattern (Duplicated 18+ times):**
```go
// ❌ Don't do this anymore
limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
if limit < 1 || limit > 100 {
    limit = 50
}
cursor := c.Query("cursor")
useCursorPagination := cursor != "" || offset == 0
if useCursorPagination {
    limitArg = limit + 1
}
```

**New Pattern:**
```go
// ✅ Do this instead
params := utils.ParsePaginationParams(c)
useCursor := utils.UseCursorPagination(params)
limitArg := utils.AdjustLimitForCursor(params.Limit, useCursor)
```

---

### 3. Cursor Encoding/Decoding (`utils/cursor.go`)

**Replaces:** 4 duplicate cursor files (time_cursor.go, platform_cursor.go, search_cursor.go, theme_cursor.go)

**Usage:**
```go
import "github.com/omninudge/backend/internal/utils"

// Define your cursor struct
type MyCursor struct {
    ID        int       `json:"id"`
    Timestamp time.Time `json:"timestamp"`
}

// Encode cursor to string
cursor := MyCursor{ID: 123, Timestamp: time.Now()}
encoded := utils.EncodeCursor(cursor)

// Decode string to cursor
var decoded MyCursor
err := utils.DecodeCursor(encoded, &decoded)
if err != nil {
    // Handle invalid cursor
}
```

**Old Pattern (Duplicated in 4 files):**
```go
// ❌ Don't do this anymore
// Separate encode/decode functions in each file with identical base64+JSON logic
```

**New Pattern:**
```go
// ✅ Do this instead
// Use generic EncodeCursor/DecodeCursor for any cursor type
```

---

### 4. Permission Helpers (`helpers/permissions.go`)

**Replaces:** Multiple instances of moderator checks across hub_themes.go, hub_settings.go, moderation_v2.go

**Usage:**
```go
import "github.com/omninudge/backend/internal/helpers"

func (h *Handler) ModeratorOnlyEndpoint(c *gin.Context) {
    userID, _ := middleware.GetAuthenticatedUserID(c)

    // Check if user is a moderator (returns role or writes error)
    role, ok := helpers.RequireModeratorRole(c, h.modRepo, hubID, userID)
    if !ok {
        return // Error already written
    }

    // Check role level (owner or full_moderator only)
    if !helpers.RequireModeratorRoleLevel(c, role,
        []models.ModeratorRole{models.ModeratorRoleOwner, models.ModeratorRoleFullModerator},
        "Requires owner or full_moderator role") {
        return // Error already written
    }

    // Or use helper check
    if !helpers.IsOwnerOrFullModerator(role) {
        c.JSON(http.StatusForbidden, gin.H{"error": "Insufficient permissions"})
        return
    }
}

// Just check if moderator (no error response)
func (h *Handler) CheckModStatus(c *gin.Context) {
    isMod := helpers.CheckHubModerator(c.Request.Context(), h.modRepo, hubID, userID)

    // Check admin status
    isAdmin := helpers.IsAdmin(c)
}
```

**Old Pattern (Duplicated in multiple files):**
```go
// ❌ Don't do this anymore
role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hubID, userID.(int))
if err != nil || role == nil {
    c.JSON(http.StatusForbidden, gin.H{"error": "Not a moderator"})
    return
}
if *role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator {
    c.JSON(http.StatusForbidden, gin.H{"error": "Requires owner or full_moderator role"})
    return
}
```

**New Pattern:**
```go
// ✅ Do this instead
role, ok := helpers.RequireModeratorRole(c, h.modRepo, hubID, userID)
if !ok {
    return
}
if !helpers.IsOwnerOrFullModerator(role) {
    c.JSON(http.StatusForbidden, gin.H{"error": "Insufficient permissions"})
    return
}
```

---

## Migration Guide

### For Existing Components

When you encounter code that matches the old patterns:

1. **Identify the duplication** - Check if it matches any of the patterns above
2. **Import the reusable component/utility**
3. **Replace the duplicated code** with the new component/utility
4. **Test the functionality** to ensure behavior is preserved
5. **Remove the old duplicated code**

### Example Migration

**Before:**
```typescript
<div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
  {errorMessage}
</div>

<input
  className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
  type="text"
  value={username}
  onChange={(e) => setUsername(e.target.value)}
/>

<button
  className="bg-[var(--color-primary)] px-4 py-2 rounded text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
  onClick={handleSubmit}
  disabled={isSubmitting}
>
  Submit
</button>
```

**After:**
```typescript
import { Alert, Input, Button } from '@/components/ui';

<Alert variant="error">{errorMessage}</Alert>

<Input
  value={username}
  onChange={(e) => setUsername(e.target.value)}
/>

<Button onClick={handleSubmit} isLoading={isSubmitting}>
  Submit
</Button>
```

---

## Benefits of This Refactoring

### Code Quality
- **15-20% reduction in code duplication**
- **Single source of truth** for styling and behavior
- **Fix once, fixed everywhere** - bugs and improvements propagate automatically

### Maintenance
- **Easier updates** - change button style in one place, affects all buttons
- **Consistent UI/UX** - same component = same behavior everywhere
- **Smaller bundle size** - less duplicated code to ship

### Developer Experience
- **Faster development** - import existing component instead of copying/pasting
- **Type safety** - TypeScript ensures correct usage
- **Better documentation** - centralized components are easier to document

### Performance
- **Better tree shaking** - bundler can optimize shared components better
- **Consistent optimization** - performance improvements benefit all usages

---

## Next Steps

1. **Gradually migrate existing code** to use these new components/utilities
2. **Always use these components** for new features (mandated in `.claude/instructions.md`)
3. **Suggest improvements** if you find missing variants or features
4. **Document additional patterns** as you identify more duplication

---

## Questions?

If you find code duplication that isn't covered by these components, consider:
1. Can it be extracted to a new reusable component/utility?
2. Can an existing component be enhanced to cover this use case?
3. Document it and suggest a refactoring approach
