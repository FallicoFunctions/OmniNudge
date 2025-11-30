# Phase 1 Frontend Testing Guide

This guide will help you test all Phase 1 features locally before deployment.

## Prerequisites

- Backend server running on `http://localhost:8080`
- Frontend dev server running on `http://localhost:5176`
- PostgreSQL database running with `chatreddit_dev` database

## Testing Checklist

### 1. Authentication Flow ✓

#### Registration
1. Navigate to `http://localhost:5176/`
2. You should be redirected to `/login`
3. Click "Create an account" link
4. Fill in the registration form:
   - Username: `testuser1`
   - Email: `test@example.com` (optional)
   - Password: `password123`
5. Click "Create Account"
6. **Expected**: Successful registration and automatic login, redirected to home page

#### Login
1. If logged in, click "Logout" in the navigation
2. Navigate to `/login`
3. Enter credentials:
   - Username: `testuser1`
   - Password: `password123`
4. Click "Sign In"
5. **Expected**: Successful login, redirected to home page with username displayed in nav

#### Protected Routes
1. While logged out, try to access `http://localhost:5176/reddit`
2. **Expected**: Redirected to `/login`
3. After logging in, access should be granted

---

### 2. Reddit Feed (Phase 1 Core Feature)

Navigate to: `http://localhost:5176/reddit`

#### Default Feed
1. **Expected**: Should display posts from r/popular with "hot" sorting
2. Verify posts display:
   - Post titles
   - Subreddit names (r/...)
   - Authors (u/...)
   - Scores (upvotes)
   - Thumbnails (if available)
   - Number of comments
   - Post time
   - Links to Reddit ("View on Reddit")

#### Subreddit Navigation
1. Click on any popular subreddit shortcut (e.g., "r/AskReddit", "r/worldnews")
2. **Expected**: Feed updates to show that subreddit's posts
3. Verify the "Currently viewing" text updates

#### Custom Subreddit
1. Type a subreddit name in the input box (e.g., "programming")
2. Click "Go"
3. **Expected**: Feed updates to show posts from r/programming
4. Try an invalid subreddit (e.g., "thissubredditdoesntexist9999")
5. **Expected**: Should show an error message or empty state

#### Sort Options
1. Select different sort options from the dropdown:
   - Hot (default)
   - New
   - Top
   - Rising
2. **Expected**: Feed updates to show posts in the selected order
3. Verify the order makes sense (e.g., "new" shows recent posts)

#### Loading States
1. Switch between subreddits quickly
2. **Expected**: Should see "Loading posts..." message while fetching
3. No infinite loops or repeated requests

---

### 3. Posts Feed (Phase 1 Core Feature)

Navigate to: `http://localhost:5176/posts`

#### Viewing Posts
1. **Expected**: Should display the platform's post feed
2. If no posts exist, should show "No posts yet. Be the first to create one!"

#### Creating a Post
1. Click "Create Post" button
2. **Expected**: Form expands showing:
   - Hub selection dropdown (general, technology, discussion, news)
   - Title input (required)
   - Content textarea (optional)
3. Fill in the form:
   - Select a hub (e.g., "general")
   - Title: "Test Post from Testing Guide"
   - Content: "This is a test post to verify the posting system works."
4. Click "Submit Post"
5. **Expected**:
   - Loading state shows "Creating..."
   - Form closes on success
   - New post appears at the top of the feed
   - Fields are cleared

#### Voting on Posts
1. Find any post in the feed
2. Click the upvote button (▲)
3. **Expected**: Score increases by 1
4. Click the downvote button (▼)
5. **Expected**: Score decreases (net change of -2 from upvote)
6. **Note**: The vote should be reflected immediately (optimistic update)

#### Post Metadata
Verify each post shows:
- Hub name (e.g., "h/general")
- Author username (e.g., "u/testuser1")
- Post date
- Score (vote count)
- Comment count
- Share and Save buttons (may not be fully functional yet)

---

### 4. Messages/Chat (Phase 1 Core Feature)

Navigate to: `http://localhost:5176/messages`

#### Initial State
1. **Expected**: Two-panel layout
   - Left: Conversations list
   - Right: Chat area or empty state
2. If no conversations, left panel shows "No conversations yet"

#### Starting a New Conversation
1. Click "+ New Chat" button
2. **Expected**: Modal or form appears asking for a username
3. Create a second test account first (see Registration above)
   - Username: `testuser2`
   - Password: `password123`
4. Log back in as `testuser1`
5. Enter `testuser2` in the new chat form
6. Type a message: "Hello from testuser1!"
7. Click "Send" or press Enter
8. **Expected**:
   - New conversation appears in the left panel
   - Message appears in the chat area
   - Input field clears

#### Sending Messages
1. In an existing conversation, type a message
2. Click "Send"
3. **Expected**:
   - Message appears in the chat area
   - Shows sender username
   - Shows timestamp
   - Input clears

#### Receiving Messages
1. Open two browser windows side by side:
   - Window 1: Logged in as `testuser1`
   - Window 2: Logged in as `testuser2`
2. Send a message from testuser1 to testuser2
3. **Expected (with WebSocket)**:
   - testuser2's window updates in real-time
   - Conversation moves to top of list
   - Unread count updates
4. **Current behavior (without WebSocket)**:
   - May need to refresh or navigate away and back
   - Will be enhanced with WebSocket in future update

#### Multiple Conversations
1. Create conversations with different users
2. **Expected**:
   - Each conversation listed separately
   - Shows last message preview
   - Shows timestamp
   - Shows unread count (if applicable)
3. Click between conversations
4. **Expected**: Chat area updates to show selected conversation's messages

#### Encryption Note
- Backend already encrypts messages
- Frontend currently sends plain text
- Encryption happens transparently on the backend
- This ensures data-at-rest encryption

---

### 5. Theme System (Phase 2A - Already Complete)

Navigate to: `http://localhost:5176/themes`

#### Theme Selection
1. **Expected**: Grid of predefined themes
2. Click on any theme card
3. **Expected**: App colors update immediately with smooth transition
4. Verify all pages reflect the new theme:
   - Navigate to /reddit, /posts, /messages
   - All should use the selected theme colors

#### Theme Editor (if enabled)
1. If advanced mode is enabled, try editing CSS variables
2. Changes should apply in real-time
3. Save custom themes

---

### 6. Navigation & Layout

#### Main Navigation
Verify the navigation bar contains:
- Logo/App name
- Links to: Reddit, Posts, Messages, Themes
- Theme selector dropdown (or link)
- User info (username)
- Logout button

#### Navigation Behavior
1. Click each navigation link
2. **Expected**: Smooth transitions between pages
3. URL updates correctly
4. No page reloads (SPA behavior)
5. Back/forward buttons work

#### Responsive Design
1. Resize browser window to mobile width (<768px)
2. **Expected**:
   - Layout adapts to mobile
   - Navigation becomes mobile-friendly (may collapse)
   - Content remains readable

---

### 7. Error Handling

#### Network Errors
1. Stop the backend server
2. Try to create a post or send a message
3. **Expected**: Error message displayed to user
4. **Important**: No app crashes or blank screens

#### Invalid Data
1. Try to create a post with empty title
2. **Expected**: Form validation prevents submission
3. Try to start a chat with non-existent user
4. **Expected**: Error message from backend

#### 401 Unauthorized
1. Manually delete the `auth_token` from localStorage (browser DevTools > Application > Local Storage)
2. Try to perform an action
3. **Expected**: Redirected to login page

---

### 8. Performance Checks

#### Initial Load
1. Open DevTools > Network tab
2. Hard refresh the page (Cmd+Shift+R / Ctrl+Shift+F5)
3. Verify:
   - No unnecessary duplicate requests
   - Theme queries only fire when authenticated
   - No infinite loops in console

#### Cache Behavior
1. Navigate to Reddit page
2. Switch to Posts page
3. Return to Reddit page
4. **Expected**: Reddit data loads from cache (instant load)
5. After 5 minutes, should refetch (staletime configured)

#### Console Errors
1. Open DevTools > Console
2. Navigate through all pages
3. **Expected**: No red errors
4. Warnings are acceptable but investigate if excessive

---

## Common Issues & Fixes

### Issue: "Load failed" or CORS errors
**Solution**: Ensure backend middleware allows `localhost:5176` in CORS settings

### Issue: Infinite 401 loops
**Solution**: Verified fixed in `ThemeContext.tsx` - queries disabled when not authenticated

### Issue: Can't see Reddit posts
**Solution**: Check that backend Reddit integration is configured (may need Reddit API credentials)

### Issue: Messages don't update in real-time
**Status**: WebSocket integration pending - currently requires manual refresh

### Issue: Theme not applying on login
**Solution**: ThemeContext now properly checks authentication before fetching

---

## Success Criteria

Phase 1 is ready for deployment when:

- [ ] User can register and login
- [ ] User can browse Reddit posts from any subreddit
- [ ] User can create and vote on platform posts
- [ ] User can send and receive encrypted messages
- [ ] No console errors during normal usage
- [ ] No infinite loading or request loops
- [ ] All navigation works correctly
- [ ] Theme system applies colors across all pages
- [ ] Protected routes redirect unauthenticated users

---

## Next Steps After Testing

1. **If all tests pass**: Proceed with deployment (see `docs/DEPLOYMENT_CHECKLIST.md`)
2. **If issues found**: Document them and fix before deployment
3. **After deployment**:
   - Set up monitoring
   - Test on production environment
   - Gather user feedback (even if just you initially)

---

## Testing Log Template

Use this template to document your testing session:

```
Date: ________
Tester: ________
Environment: Local (localhost:5176)

Feature                    | Status | Notes
--------------------------|--------|------------------
Registration              | ☐ Pass ☐ Fail |
Login                     | ☐ Pass ☐ Fail |
Reddit - Default Feed     | ☐ Pass ☐ Fail |
Reddit - Subreddit Select | ☐ Pass ☐ Fail |
Reddit - Sort Options     | ☐ Pass ☐ Fail |
Posts - View Feed         | ☐ Pass ☐ Fail |
Posts - Create Post       | ☐ Pass ☐ Fail |
Posts - Voting            | ☐ Pass ☐ Fail |
Messages - New Chat       | ☐ Pass ☐ Fail |
Messages - Send Message   | ☐ Pass ☐ Fail |
Messages - View Convos    | ☐ Pass ☐ Fail |
Theme Selection           | ☐ Pass ☐ Fail |
Navigation                | ☐ Pass ☐ Fail |
Error Handling            | ☐ Pass ☐ Fail |

Overall Result: ☐ Ready for Deployment ☐ Needs Fixes

Issues Found:
1.
2.
3.
```
