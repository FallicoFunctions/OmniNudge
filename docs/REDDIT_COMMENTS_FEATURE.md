# Reddit Comments Feature

## Overview

The Reddit Comments feature allows users to discuss Reddit posts directly on your platform. This creates a community discussion layer on top of Reddit content without affecting the original Reddit posts.

## How It Works

### Two Types of Comments

When viewing a Reddit post on your platform, users will see **two separate comment sections**:

1. **Community Discussion (Site-Only Comments)**
   - Comments created by your platform's users
   - Only visible on your website
   - Fully interactive (users can reply, vote, etc.)
   - **Never sent to Reddit**
   - Stored in your database

2. **Reddit Comments (Read-Only)**
   - Original comments from Reddit
   - Fetched via Reddit's public API
   - Read-only display
   - Provides context from the original Reddit discussion

## User Experience

### Viewing a Reddit Post

1. User browses Reddit posts on `/reddit` page
2. User clicks on a post to view details
3. Redirected to `/reddit/r/{subreddit}/comments/{postId}`
4. Post detail page shows:
   - Original Reddit post content
   - Clear notice that comments are site-only
   - Form to add a site-only comment
   - List of site-only comments from your community
   - Read-only Reddit comments section (if available)

### Adding Comments

When a user adds a comment on a Reddit post:
- Comment is stored in your platform's database
- Comment is associated with the Reddit post via a special identifier: `reddit_{subreddit}_{postId}`
- Other users on your platform can see and respond to the comment
- **The comment never appears on Reddit**

## Technical Implementation

### Frontend

**RedditPostPage Component** ([frontend/src/pages/RedditPostPage.tsx](../frontend/src/pages/RedditPostPage.tsx))
- Fetches Reddit comments via `redditService.getPostComments()`
- Fetches local comments via custom endpoint (TODO: implement backend)
- Displays both comment sections with clear labeling
- Provides comment form for site-only comments

### Backend (TODO)

**Required Backend Implementation:**

1. **Local Comment Storage**
   - Store comments for Reddit posts in the existing `comments` table
   - Use a pseudo-post-id convention: `reddit_{subreddit}_{postId}`
   - Associate comments with this identifier

2. **API Endpoints**
   ```
   GET  /api/v1/reddit/posts/:subreddit/:postId/comments
   POST /api/v1/reddit/posts/:subreddit/:postId/comments
   ```

3. **Data Model**
   - Reuse existing comment structure
   - Add `reddit_post_reference` field to distinguish Reddit post comments
   - Store: subreddit, reddit_post_id, reddit_post_title (for context)

### Current Status

**Implemented:**
- ✅ Reddit post detail page UI
- ✅ Two-section layout (site comments + Reddit comments)
- ✅ Comment form interface
- ✅ Reddit API comment fetching (read-only)
- ✅ Clear user notice about site-only comments
- ✅ Navigation from Reddit feed to post detail

**TODO:**
- ⏳ Backend endpoint for creating site-only comments on Reddit posts
- ⏳ Backend endpoint for fetching site-only comments on Reddit posts
- ⏳ Comment voting on site-only Reddit post comments
- ⏳ Nested replies to site-only comments
- ⏳ Moderation tools for site-only comments

## User Benefits

### Why Site-Only Comments?

1. **Community Building**
   - Creates your own discussion community around Reddit content
   - Users can have conversations without needing a Reddit account
   - Build a curated community with your moderation standards

2. **Content Curation**
   - Filter and moderate discussions to match your community values
   - Remove toxic behavior that might exist in original Reddit threads
   - Create a safer space for discussion

3. **Engagement**
   - Users stay on your platform instead of leaving for Reddit
   - Increases time-on-site metrics
   - Builds platform-specific discussion culture

4. **Integration with Platform Features**
   - Site comments can integrate with your notification system
   - Users can follow specific discussions
   - Comments can reference your platform's posts and users

## User Communication

### Clear Messaging

The Reddit post detail page includes a prominent notice:

> **Note:** This page shows the Reddit post content. Comments you see below are from Reddit. Any comments you add here are **only visible on this site** and will not appear on Reddit.

This ensures users understand:
- Their comments won't appear on Reddit
- They're participating in your platform's community discussion
- Reddit comments are shown for reference only

## Moderation

### Hub-Based Moderation

- Comments on Reddit posts are moderated by your platform's hub moderators
- The hub assignment can be based on:
  - Subreddit mapping (e.g., r/technology → h/technology)
  - User selection when sharing the Reddit post
  - Automatic categorization based on subreddit topics

### Report System

- Users can report inappropriate comments
- Reports go to hub moderators (not Reddit moderators)
- Standard platform moderation tools apply

## Privacy & Legal Considerations

### Copyright

- Reddit content is displayed via their public API
- Comments created on your platform are your users' content
- Reddit comments are attributed to original authors
- Links to original Reddit posts provide proper attribution

### Data Storage

- Reddit post metadata is cached temporarily (5-minute stale time)
- Site-only comments are permanent in your database
- User-generated content is subject to your platform's terms of service

## Future Enhancements

### Planned Features

1. **Reddit Post Voting**
   - Allow users to vote on Reddit posts (stored locally, not sent to Reddit)
   - Display your platform's community score vs. Reddit score

2. **Comment Sorting**
   - Sort site comments by: newest, oldest, most votes, most replies
   - Sort Reddit comments (already sorted by Reddit API)

3. **Saved Posts**
   - Users can save Reddit posts to their profile
   - Create collections of saved posts

4. **Crossposting**
   - Share Reddit posts to your platform's hubs
   - Creates a bridge between Reddit content and your community

5. **Real-time Updates**
   - WebSocket support for live comment updates
   - Notification when someone replies to your comment

## API Reference

### Reddit Service

**Get Post Comments** (Reddit API)
```typescript
redditService.getPostComments(subreddit: string, postId: string)
// Returns: RedditComment[]
```

### Local Comments (TODO)

**Get Local Comments for Reddit Post**
```typescript
// TODO: Implement
commentsService.getRedditPostComments(subreddit: string, postId: string)
// Returns: Comment[]
```

**Create Local Comment on Reddit Post**
```typescript
// TODO: Implement
commentsService.createRedditPostComment({
  subreddit: string,
  reddit_post_id: string,
  content: string,
  parent_id?: number
})
// Returns: Comment
```

## Testing

### Test Scenarios

1. **View Reddit Post with Comments**
   - Navigate to any Reddit post from the feed
   - Verify both comment sections appear
   - Verify Reddit comments are read-only
   - Verify site comment form is present

2. **Add Site-Only Comment** (when backend is implemented)
   - Click on a Reddit post
   - Type a comment in the site comment form
   - Submit the comment
   - Verify it appears in the site-only section
   - Verify it does NOT appear on Reddit (check Reddit directly)

3. **Comment Persistence**
   - Add a comment to a Reddit post
   - Navigate away and return to the same post
   - Verify your comment is still visible

4. **Multi-User Comments**
   - User A adds a comment on a Reddit post
   - User B views the same Reddit post
   - Verify User B can see User A's comment

## Summary

This feature creates a **community discussion layer** on top of Reddit content, allowing users to:
- Discuss Reddit posts without leaving your platform
- Build community without requiring Reddit accounts
- Maintain your own moderation standards
- Keep users engaged on your platform

**Key Point:** All comments created on your platform are **site-only** and never interact with Reddit's servers. This is clearly communicated to users to avoid confusion.
