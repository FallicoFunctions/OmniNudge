# Loading State Design System

## When to Use Each Pattern

### Loading Duration Guidelines

- **< 500ms**: No indicator (feels instant)
- **500ms - 3s**: Spinner or skeleton
- **> 3s**: Progress bar with percentage
- **> 10s**: Progress bar with estimated time remaining

### Pattern Selection

#### 1. LoadingSpinner
**Use when:**
- Action takes 500ms - 3s
- Loading something simple (button action, small data fetch)
- Space is limited

**Sizes:**
- `small`: Inline with text, small buttons
- `medium`: Default, general purpose
- `large`: Full page/section loading

```tsx
import { LoadingSpinner, LoadingSpinnerCentered } from '@/components/loading';

<LoadingSpinner size="small" />
<LoadingSpinnerCentered /> // Centered in container
```

#### 2. SkeletonLoader
**Use when:**
- Initial page load (content not yet available)
- Known structure/layout
- Want to show where content will appear
- Better UX than blank screen or spinner

**Available Skeletons:**
- `SkeletonText`: Text lines
- `SkeletonImage`: Image placeholders
- `SkeletonCard`: Generic card
- `SkeletonPost`: Post/article card
- `SkeletonList`: List of items
- `SkeletonMessage`: Chat message bubble

```tsx
import { SkeletonPost, SkeletonList } from '@/components/loading';

// While loading posts
<SkeletonPost />
<SkeletonPost />

// While loading list
<SkeletonList items={5} />
```

#### 3. ProgressBar
**Use when:**
- Long-running task (> 3s)
- Can track progress (file upload, export, processing)
- User needs to know how long to wait

**Modes:**
- **Determinate**: Know the progress (0-100%)
- **Indeterminate**: Unknown duration, but want to show activity

```tsx
import { ProgressBar, CircularProgress } from '@/components/loading';

// Upload progress
<ProgressBar value={uploadProgress} showLabel />

// Processing (unknown duration)
<ProgressBar />

// Circular variant
<CircularProgress value={75} showLabel />
```

## Examples by Use Case

### Button Loading
```tsx
<button disabled={isLoading}>
  {isLoading ? <LoadingSpinner size="small" /> : 'Submit'}
</button>
```

### Page Loading
```tsx
{isLoading ? (
  <div className="space-y-4">
    <SkeletonPost />
    <SkeletonPost />
    <SkeletonPost />
  </div>
) : (
  posts.map(post => <PostCard post={post} />)
)}
```

### File Upload
```tsx
<ProgressBar
  value={uploadProgress}
  showLabel
  size="medium"
/>
```

### Search Results
```tsx
{isSearching ? (
  <LoadingSpinnerCentered />
) : results.length > 0 ? (
  <SearchResults results={results} />
) : (
  <EmptyState />
)}
```

## Best Practices

1. **Don't stack multiple loaders** - One indicator per section
2. **Match the pattern to duration** - Follow duration guidelines
3. **Provide context** - Add text like "Loading posts..." when helpful
4. **Be consistent** - Same scenarios should use same patterns
5. **Test slow connections** - Verify loaders appear and look good
6. **Accessibility** - All loaders include proper ARIA labels

## Accessibility

All loading components include:
- `role="status"` or `role="progressbar"`
- `aria-label` for screen readers
- `sr-only` text where appropriate
- Keyboard navigation support (no focus traps)

## Showcase (Storybook-Equivalent)

- Dev route: `/dev/loading-states`
- Includes:
  - Spinner sizes
  - Shimmer effect
  - Skeleton variants (post, list, card)
  - Determinate and indeterminate progress bars
  - Duration-threshold simulator based on:
    - `<500ms`: none
    - `500ms-3s`: spinner/skeleton
    - `>3s`: progress bar when measurable

## Slow 3G Test Checklist

1. Open browser DevTools and enable network throttle `Slow 3G`.
2. Visit `/`, `/posts/:id`, `/users/:username`.
3. Confirm skeletons render quickly and no severe layout shift appears.
4. Trigger long-running actions (upload/export where available) and verify progress indicators remain visible.
