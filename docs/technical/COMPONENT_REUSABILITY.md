# Component Reusability Pattern

## Critical Design Principle

**Posts MUST look identical regardless of where they are displayed.**

This document outlines the component reusability pattern used in OmniNudge to ensure visual and functional consistency across the application.

## The Problem

Initially, different pages (HomePage, HubsPage, RedditPage) had their own implementations of post cards. This led to:

1. **Visual inconsistency** - Posts looked different on different pages
2. **Feature inconsistency** - Some pages had Share/Save/Hide buttons, others didn't
3. **Code duplication** - Same rendering logic repeated across files
4. **Maintenance burden** - Bug fixes or features had to be applied in multiple places

## The Solution: Shared Components

We now use **shared post card components** that render identically across all pages.

### Components

#### 1. `/frontend/src/components/reddit/RedditPostCard.tsx`

**Purpose:** Renders Reddit posts with all features

**Features included:**
- Play button for expandable images/videos
- External link badges with domain display
- Flair badges
- Full metadata (subreddit, author, score, timestamp)
- Share, Save, Hide, Crosspost buttons
- Comment count link

**Used in:**
- [HomePage.tsx](frontend/src/pages/HomePage.tsx) - Omni feed
- [RedditPage.tsx](frontend/src/pages/RedditPage.tsx) - Reddit feed & specific subreddits

**Example usage:**
```tsx
<RedditPostCard
  post={redditPost}
  useRelativeTime={useRelativeTime}
  isSaved={isSaved}
  isSaveActionPending={isSaveActionPending}
  pendingShouldSave={pendingShouldSave}
  onShare={() => handleShareRedditPost(post)}
  onToggleSave={(shouldSave) => toggleSaveRedditPostMutation.mutate({ post, shouldSave })}
  onHide={() => handleSetHideTarget({ type: 'reddit', post })}
  onCrosspost={() => handleCrosspostSelection({ type: 'reddit', post })}
/>
```

#### 2. `/frontend/src/components/hubs/HubPostCard.tsx`

**Purpose:** Renders hub/platform posts with all features

**Features included:**
- VoteButtons component (upvote/downvote)
- Thumbnail image
- Full metadata (hub name, author, score, timestamp)
- Share, Save, Hide, Crosspost buttons
- Delete button (for post owner)
- Comment count link

**Used in:**
- [HomePage.tsx](frontend/src/pages/HomePage.tsx) - Omni feed
- [HubsPage.tsx](frontend/src/pages/HubsPage.tsx) - Hubs feed & specific hubs

**Example usage:**
```tsx
<HubPostCard
  post={hubPost}
  useRelativeTime={useRelativeTime}
  currentUserId={user?.id}
  hubNameMap={hubNameMap}
  currentHubName={hubname}
  isSaved={isSaved}
  isSavePending={isSavePending}
  isHiding={isHiding}
  isDeleting={isDeleting}
  onShare={() => handleSharePost(post.id)}
  onToggleSave={(shouldSave) => handleToggleSavePost(post.id, !shouldSave)}
  onHide={() => handleHidePost(post.id)}
  onCrosspost={() => handleCrosspostSelection(post)}
  onDelete={() => handleDeletePost(post.id)}
/>
```

## Implementation Guidelines

### DO

✅ **Use shared components for post rendering**
- Always import and use `RedditPostCard` or `HubPostCard`
- Never create inline post rendering logic

✅ **Pass all required props**
- Include event handlers (onShare, onToggleSave, etc.)
- Include state flags (isSaved, isPending, etc.)
- Include context (currentUserId, hubNameMap, etc.)

✅ **Maintain feature parity**
- All features in the shared component should be available
- Use optional props to conditionally enable features
- Pass appropriate handlers for user-specific actions

### DON'T

❌ **Create simplified versions**
- Don't create "HomePage version" vs "HubsPage version"
- Don't strip out features for different contexts

❌ **Duplicate rendering logic**
- Don't copy-paste the post card JSX
- Don't create similar-but-different components

❌ **Inline post rendering**
- Don't render posts directly in page components
- Always extract to shared components

## Testing Checklist

When adding or modifying post-related features:

- [ ] Does the post look identical on HomePage (Omni feed)?
- [ ] Does the post look identical on HubsPage (Hub feed)?
- [ ] Does the post look identical on specific hub page?
- [ ] Does the Reddit post look identical on HomePage (Omni feed)?
- [ ] Does the Reddit post look identical on RedditPage (Reddit feed)?
- [ ] Does the Reddit post look identical on specific subreddit page?
- [ ] Are all interactive features (Share, Save, Hide, Crosspost) working?
- [ ] Do vote buttons work correctly?
- [ ] Do links navigate to the correct pages?

## File Locations

### Shared Components
- `/frontend/src/components/reddit/RedditPostCard.tsx` - Reddit post card
- `/frontend/src/components/hubs/HubPostCard.tsx` - Hub post card
- `/frontend/src/components/VoteButtons.tsx` - Vote buttons (used by HubPostCard)
- `/frontend/src/components/reddit/FlairBadge.tsx` - Flair badges (used by RedditPostCard)

### Pages Using Shared Components
- `/frontend/src/pages/HomePage.tsx` - Omni feed (uses both)
- `/frontend/src/pages/HubsPage.tsx` - Hub feed (uses HubPostCard)
- `/frontend/src/pages/RedditPage.tsx` - Reddit feed (uses RedditPostCard)

## Common Patterns

### Conditional Features

Some features should only be available to authenticated users:

```tsx
<HubPostCard
  post={post}
  // ... other props
  onShare={user ? () => handleShare() : undefined}  // Only if authenticated
  onToggleSave={user ? (shouldSave) => handleSave(shouldSave) : undefined}
  onHide={user ? () => handleHide() : undefined}
/>
```

The component handles undefined handlers gracefully by not rendering those buttons.

### Pending States

Always pass pending states to show loading indicators:

```tsx
<HubPostCard
  post={post}
  isSavePending={saveMutation.isPending && saveMutation.variables?.postId === post.id}
  isDeleting={deleteMutation.isPending && deleteMutation.variables === post.id}
  // ... other props
/>
```

### Event Handlers

Wrap event handlers to pass the correct arguments:

```tsx
<HubPostCard
  post={post}
  onToggleSave={(shouldSave) => handleToggleSavePost(post.id, !shouldSave)}
  // Note: The component passes the NEW state, but the handler expects the CURRENT state
  // So we invert it with !shouldSave
/>
```

## Future Enhancements

When adding new features to posts:

1. Add the feature to the shared component
2. Add props to control the feature
3. Update ALL pages that use the component
4. Test on ALL pages to ensure consistency

## Related Documentation

- [README.md](README.md) - Project overview
- [BACKEND_API_SUMMARY.md](BACKEND_API_SUMMARY.md) - API endpoints
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - Deployment guide
