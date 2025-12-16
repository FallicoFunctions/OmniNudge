# URL Restructuring Changelog

**Date:** January 2025
**Status:** Completed

## Overview

This document tracks the URL restructuring changes made to simplify and clean up the OmniNudge application's URL structure. The changes affect both frontend routes and backend API endpoints.

## Summary of Changes

### 1. Removed Redundant Feed Pages
**Before:** Application had separate dedicated pages for:
- `/reddit` - Reddit feed page
- `/hubs` - Hubs feed page
- `/posts` - Posts feed page

**After:** All feeds consolidated into the home page (`/`)
- Home page now serves as the unified "Omni feed" showing combined content
- Individual content can still be accessed via direct URLs

### 2. Subreddit URLs Simplified
**Before:**
- Frontend: `/reddit/r/:subreddit`
- Backend API: `/api/v1/reddit/r/:subreddit`

**After:**
- Frontend: `/r/:subreddit`
- Backend API: `/api/v1/reddit/r/:subreddit` (unchanged)

**Rationale:** Removed redundant `/reddit` prefix from frontend URLs while keeping backend consistent.

### 3. Hub URLs Simplified
**Before:**
- Frontend: `/hubs/h/:hubname`
- Backend API: `/api/v1/hubs/h/:hubname` (for popular/all feeds)

**After:**
- Frontend: `/h/:hubname`
- Backend API: `/api/v1/hubs/h/:hubname` (unchanged for special feeds like popular/all)

**Rationale:** Removed redundant `/hubs` prefix from frontend URLs.

### 4. Reddit Post URLs Simplified
**Before:**
- Frontend: `/reddit/r/:subreddit/comments/:postId`
- Backend API: `/api/v1/reddit/r/:subreddit/comments/:postId`

**After:**
- Frontend: `/r/:subreddit/comments/:postId`
- Backend API: `/api/v1/reddit/r/:subreddit/comments/:postId` (unchanged)

## Detailed URL Mapping

### Frontend Routes

#### Public Routes (No Auth Required)
| Old URL | New URL | Description |
|---------|---------|-------------|
| `/reddit` | `/` | Reddit feed (now part of home) |
| `/hubs` | `/` | Hubs feed (now part of home) |
| `/posts` | `/` | Posts feed (now part of home) |
| `/reddit/r/:subreddit` | `/r/:subreddit` | Subreddit page |
| `/reddit/r/:subreddit/comments/:postId` | `/r/:subreddit/comments/:postId` | Reddit post detail |
| `/reddit/r/:subreddit/comments/:postId/:commentId` | `/r/:subreddit/comments/:postId/:commentId` | Reddit comment permalink |
| `/hubs/h/:hubname` | `/h/:hubname` | Hub page |
| `/reddit/user/:username` | `/reddit/user/:username` | Reddit user profile (unchanged) |
| `/posts/:postId` | `/posts/:postId` | Platform post detail (unchanged) |
| `/users/:username` | `/users/:username` | User profile (unchanged) |

#### Protected Routes (Auth Required)
| URL | Description |
|-----|-------------|
| `/posts/create` | Create post |
| `/hubs/create` | Create hub |
| `/messages` | Messages inbox |
| `/settings` | User settings |
| `/themes` | Theme customization |

### Backend API Endpoints

#### Reddit Endpoints (No changes to backend)
All Reddit endpoints remain under `/api/v1/reddit`:
- `GET /reddit/frontpage` - Reddit frontpage
- `GET /reddit/r/:subreddit` - Subreddit posts
- `GET /reddit/r/:subreddit/comments/:postId` - Reddit post with comments
- `GET /reddit/r/:subreddit/media` - Subreddit media
- `GET /reddit/user/:username/about` - Reddit user info
- `GET /reddit/user/:username/:section` - Reddit user content
- `GET /reddit/posts/:subreddit/:postId/comments` - Local comments on Reddit posts
- `GET /reddit/subreddits/autocomplete` - Subreddit search

#### Hub Endpoints
Hub endpoints remain under `/api/v1/hubs`:
- `GET /hubs` - List all hubs
- `GET /hubs/h/all` - All hubs feed
- `GET /hubs/h/popular` - Popular hubs feed
- `GET /hubs/:name` - Get specific hub
- `GET /hubs/:name/posts` - Hub posts
- `GET /hubs/search` - Search hubs
- `GET /hubs/trending` - Trending hubs

#### Feed Endpoints (New)
- `GET /feed/home` - Combined feed (hubs + Reddit posts)

#### Post Endpoints
- `GET /posts/feed` - Platform posts feed
- `GET /posts/:id` - Get post by ID
- `GET /posts/:id/comments` - Get post comments

## Frontend Components Affected

### Files Modified
1. **frontend/src/App.tsx**
   - Updated route definitions
   - Removed `/reddit`, `/hubs`, `/posts` routes
   - Changed `/reddit/r/:subreddit` to `/r/:subreddit`
   - Changed `/hubs/h/:hubname` to `/h/:hubname`

2. **frontend/src/components/reddit/RedditPostCard.tsx**
   - Updated post URL from `/reddit/r/...` to `/r/...` (line 106)
   - Updated subreddit link from `/reddit/r/...` to `/r/...` (line 209)

3. **frontend/src/pages/RedditPostPage.tsx**
   - Updated API call to use `/reddit/r/:subreddit/comments/:postId` (line 1015)
   - Added missing TypeScript interface properties: `permalink`, `link_flair_text`, `link_flair_background_color`, `link_flair_text_color`

4. **frontend/src/pages/HomePage.tsx**
   - Added subreddit search bar functionality
   - Implemented combined feed display
   - Added navigation to new URL structure

5. **frontend/src/pages/PostDetailPage.tsx**
   - Updated subreddit links to use `/r/:subreddit` pattern (line 323)

6. **frontend/src/pages/UserProfilePage.tsx**
   - Updated hub links to use `/h/:hubname` pattern (line 65)

### Backend Components Affected

#### No Breaking Changes
The backend API structure remains unchanged. All changes were frontend-only, maintaining backward compatibility.

## Migration Notes

### For Frontend Developers
1. **Links to subreddits:** Use `/r/:subreddit` instead of `/reddit/r/:subreddit`
2. **Links to hubs:** Use `/h/:hubname` instead of `/hubs/h/:hubname`
3. **API calls:** Continue using `/api/v1/reddit/r/:subreddit/...` for backend calls
4. **Combined feed:** Use `/` (home) instead of separate `/reddit`, `/hubs`, `/posts` pages

### For Backend Developers
No changes required. All backend endpoints remain the same.

## Testing Checklist

- [x] Reddit post links work correctly from feed
- [x] Subreddit links navigate properly
- [x] Hub links navigate properly
- [x] Reddit post detail pages load
- [x] TypeScript compilation successful
- [ ] All backend tests pass
- [ ] Integration tests updated

## Rollback Plan

If rollback is needed:
1. Revert changes in App.tsx to restore old route structure
2. Revert URL changes in RedditPostCard.tsx, PostDetailPage.tsx, UserProfilePage.tsx
3. Remove subreddit search from HomePage.tsx
4. Restore dedicated Reddit/Hubs/Posts pages

## Benefits

1. **Cleaner URLs:** Shorter, more intuitive URLs (`/r/pics` vs `/reddit/r/pics`)
2. **Simplified Navigation:** Single home page for all content discovery
3. **Consistency:** URL structure matches common patterns (like Reddit's own URLs)
4. **Better UX:** Less redundancy in URL paths
5. **Maintainability:** Fewer route definitions to manage

## Future Considerations

1. Add URL redirects for old URLs to maintain bookmark compatibility
2. Update sitemap.xml if applicable
3. Update any external documentation or API consumers
4. Consider adding canonical tags for SEO
