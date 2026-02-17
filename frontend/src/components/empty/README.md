# Empty State Design System

## When to Use Empty States

Empty states appear when:
- **No data exists yet** (new user, first use)
- **User action cleared data** (deleted all, filtered all out)
- **Search/filter returned no results**
- **Error prevented data from loading**
- **User lacks permission** to view content

**Don't use empty states when:**
- Data is loading (use skeleton loader instead)
- Temporary network issue (use error toast + retry)
- Space is very constrained (dropdowns/typeahead rows, tiny inline helper copy)

## Empty State vs Loading State

```tsx
// GOOD: Show appropriate state
{isLoading ? (
  <SkeletonPost />
) : posts.length === 0 ? (
  <EmptyPosts onCreate={handleCreate} />
) : (
  posts.map(post => <PostCard post={post} />)
)}

// BAD: Showing empty state while loading
{posts.length === 0 ? <EmptyPosts /> : posts.map(...)}
```

## EmptyState vs EmptyMessage

- Use `EmptyState` for page-level, section-level, or card-level "no content" moments where the user needs context and an action.
- Use `EmptyMessage` only for compact inline contexts where a full visual state would be too heavy (autocomplete menus, short helper rows).

## Component Usage

### Basic Empty State

```tsx
import { EmptyState } from '@/components/empty';
import { Inbox } from 'lucide-react';

<EmptyState
  illustration="messages"
  icon={Inbox}
  title="No messages yet"
  description="Start a conversation to see messages here."
  action={{
    label: 'New Message',
    onClick: () => openComposer()
  }}
  secondaryAction={{
    label: 'Learn More',
    onClick: () => openHelp()
  }}
/>
```

## Illustration Variants

The design system includes optimized inline SVG illustrations:

- `noData`
- `noResults`
- `error`
- `permission`
- `messages`
- `posts`
- `media`
- `members`
- `notifications`

### Pre-configured Variants

Use these for common scenarios:

```tsx
import {
  EmptyInbox,
  EmptySearchResults,
  EmptyNotifications,
  EmptyConversations,
  EmptyPosts,
  EmptyGallery,
  EmptyMembers,
  ErrorState,
  PermissionDenied,
} from '@/components/empty';

// Messages page
<EmptyInbox onCompose={openComposer} />

// Search results
<EmptySearchResults query={searchQuery} />

// Notifications
<EmptyNotifications />

// Posts feed
<EmptyPosts onCreate={createPost} />

// Error handling
<ErrorState onRetry={refetch} />

// Permission denied
<PermissionDenied
  resource="this hub"
  onRequestAccess={requestAccess}
/>
```

## Copy Guidelines

### ✅ Good Copy

- **Helpful**: Explain what happened and what to do next
- **Actionable**: Provide clear next steps
- **Encouraging**: Positive tone, not blame
- **Concise**: 1-2 sentences max

**Examples:**
- "No messages yet. Start a conversation!"
- "No posts in this hub. Be the first to share!"
- "Couldn't find anything. Try different keywords."

### ❌ Bad Copy

- **Negative**: "No data found" (sounds like error)
- **Vague**: "Nothing here" (unhelpful)
- **Blaming**: "You haven't created anything" (accusatory)
- **Wordy**: Long explanations

## Empty State Patterns

### 1. First Use (New User)
User hasn't created any data yet.

```tsx
<EmptyPosts
  onCreate={createPost}
/>
```

**Tone:** Encouraging, show value
**Action:** Primary action to get started

### 2. No Results (Search/Filter)
User action resulted in no matches.

```tsx
<EmptySearchResults query={query} />
```

**Tone:** Neutral, suggest alternatives
**Action:** Optional - clear filters, try different search

### 3. All Cleared (User Deleted All)
User intentionally removed all items.

```tsx
<EmptyState
  icon={Trash}
  title="Archive is empty"
  description="Deleted items will appear here."
/>
```

**Tone:** Neutral confirmation
**Action:** Usually none (expected state)

### 4. Error State
Something went wrong.

```tsx
<ErrorState
  title="Failed to load posts"
  description="Check your connection and try again."
  onRetry={refetch}
/>
```

**Tone:** Apologetic, solution-focused
**Action:** Retry, contact support

### 5. Permission Denied
User lacks access.

```tsx
<PermissionDenied
  resource="this private hub"
  onRequestAccess={requestAccess}
/>
```

**Tone:** Clear, not accusatory
**Action:** Request access, go back

## Icon Selection

Match icon to context:
- **Inbox** - Messages, email
- **Search** - No search results
- **AlertCircle** - Errors
- **Lock** - Permission denied
- **MessageSquare** - Conversations
- **Users** - Members, groups
- **FileText** - Posts, documents
- **Image** - Gallery, media
- **Bell** - Notifications

## Accessibility

All empty states include:
- Semantic HTML structure
- Descriptive text (screen reader friendly)
- Keyboard-accessible actions
- Sufficient color contrast
- Meaningful alt text for icons

## Examples by Use Case

### Messages Page
```tsx
{conversations.length === 0 ? (
  <EmptyConversations onCreate={startConversation} />
) : (
  <ConversationList conversations={conversations} />
)}
```

### Search Results
```tsx
{isSearching ? (
  <LoadingSpinner />
) : results.length === 0 ? (
  <EmptySearchResults query={query} />
) : (
  <SearchResults results={results} />
)}
```

### Error Handling
```tsx
{error ? (
  <ErrorState onRetry={() => refetch()} />
) : isLoading ? (
  <SkeletonPost />
) : posts.length === 0 ? (
  <EmptyPosts onCreate={createPost} />
) : (
  posts.map(post => <PostCard post={post} />)
)}
```

### Permission Denied
```tsx
{!hasAccess ? (
  <PermissionDenied
    resource="this private hub"
    onRequestAccess={requestAccess}
  />
) : (
  <HubContent />
)}
```

## Testing Empty States

1. **Clear all data** - Verify empty state appears
2. **Filter to nothing** - Check "no results" variant
3. **Break permission** - Test "access denied" variant
4. **Simulate errors** - Verify error state shows
5. **Screen reader** - Ensure text is descriptive
6. **Keyboard nav** - Tab to all actions

## Storybook

Browse all variants in Storybook:

- `Design System/Empty States`
