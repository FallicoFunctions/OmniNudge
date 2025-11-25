# Phase 1 - MVP Features

**Launch Target:** 12 months from start
**Development Time:** ~2 hours/day
**User Goal:** Launch with core features, achieve 100 active users
**Strategy:** Build standalone platform with Reddit public API integration

---

## Authentication & User Management

- **Username/password registration** (email optional)
- Password hashing with bcrypt
- JWT-based session management
- User profile creation and editing
- Avatar upload
- Account settings
- Logout functionality
- Password reset (email required)

**Note:** No Reddit OAuth - users register directly on platform

---

## Reddit Integration (Public API)

### Browsing Reddit Posts
- Browse posts from any subreddit
- Display posts with custom UI
- Filter by Reddit's sorting (hot, new, top, rising, controversial)
- Time filters (hour, day, week, month, year, all)
- Post details view
- View Reddit comments (read-only, links to Reddit)
- Pagination and infinite scroll
- Search subreddits

### Reddit Media
- Display images from Reddit posts
- Display videos from Reddit posts
- Thumbnail previews
- Full media viewing
- Direct links to Reddit source

**Limitations:**
- Cannot post to Reddit
- Cannot comment on Reddit
- Cannot vote on Reddit
- Read-only access via public API

---

## Platform Social Layer

### Platform Posts
- Create text posts on the platform
- Add titles and body content
- Tag posts with topics/categories
- Edit your own posts
- Delete your own posts
- View count tracking

### Platform Comments
- Comment on platform posts
- Reply to comments (nested threading)
- Edit your own comments
- Delete your own comments
- Sort comments (new, top, controversial)

### Unified Feed
- Mixed feed showing:
  - Reddit posts (indicated with 🌐 icon)
  - Platform posts (indicated with 💬 icon)
- Filter to show only Reddit or only platform posts
- Sort by date, popularity, etc.
- User can distinguish post types at a glance

### User Discovery
- View other users' profiles
- See their posts and comments
- "Send Message" button on profiles
- "Block User" functionality
- Online/offline indicators

---

## Messaging System

### Platform Messages (E2E Encrypted)

**Core Messaging:**
- End-to-end encrypted text messages
- Real-time delivery via WebSocket
- Persistent message storage (encrypted blobs)
- DM inbox interface
- Conversation list view
- Unread message counter

**Message Status:**
- Sending
- Sent ✓
- Delivered ✓✓
- Read ✓✓ (blue)

**Features:**
- Read receipts (toggle in settings)
- Typing indicators ("User is typing...")
- Online/offline status
- Message timestamps
- Conversation search

**Privacy:**
- Messages encrypted on client before sending
- Server stores encrypted blobs only
- Private keys never leave user's browser
- Decryption happens client-side only

---

## Media Sharing

### Image Handling

**Upload:**
- Upload images from device
- Multi-file selection
- Drag and drop support
- Display images inline in chat
- Click to enlarge/fullscreen
- Image compression for performance

**Supported Formats:**
- JPEG, PNG, GIF, WebP
- Max size: 10MB per image
- Automatic thumbnail generation

### Video Handling

**Upload:**
- Upload videos from device
- Display video player in chat
- Playback controls
- Chat remains visible during playback

**Supported Formats:**
- MP4, WebM
- Max size: 100MB per video
- Automatic transcoding (Phase 2)

### Personal Slideshow

**Creation:**
- Upload multiple images/videos
- Create slideshow from uploaded files
- Add captions (optional)

**Controls:**
- Next/Previous navigation
- Keyboard arrow keys support
- Auto-advance with configurable intervals (3s, 5s, 10s, 15s, 30s)
- Turn off auto-advance option
- Sharer controls by default
- Transfer control to other user
- Only one person controls at a time

**Experience:**
- Slideshow displays in main chat area
- Chat remains visible on side/bottom
- Both users can type while viewing
- Synchronized viewing (both see same slide)

### Reddit Subreddit Slideshow

**Setup:**
- Enter any subreddit name
- Fetch media-only posts from subreddit via public API
- Filter out text-only posts
- Display post title above each image/video

**Media Types:**
- Images from Reddit posts
- Videos from Reddit posts
- GIFs from Reddit
- Inline media only (no external navigation)

**Controls:**
- Sort options (hot, new, top, rising, controversial)
- Change sort mid-browse
- Next/Previous navigation
- Keyboard arrow key support
- Auto-advance feature (same as personal slideshow)
- Sharer controls initially
- Transfer control to other user
- Only one person controls at a time

**Interaction:**
- Click media to view full post details
- Link to original Reddit post
- Chat remains active during slideshow
- Both users can comment on what they're viewing
- "Save to favorites" option

---

## User Features

### Blocking
- Block users from sending messages
- Blocked user can't send new messages
- No notification to blocked user (silent)
- Unblock option
- View block list in settings

### Notifications
- Browser notifications for new messages
- Sound notifications (toggle in settings)
- Inbox badge counter showing unread count
- Browser tab title updates with unread count

### User Actions
- "Send DM" button on user profiles
- "Block User" option
- Report user (moderation - Phase 2)
- View user's post history

### Settings
- Notification sound toggle
- Read receipt toggle
- Typing indicator toggle
- Theme selection (dark/light)
- Privacy settings
- Account management
- Data export (Phase 2)

---

## UI/UX

### Responsive Design
- Mobile-responsive design
- Works on phones, tablets, desktop
- Touch-optimized controls
- PWA-capable (install to home screen)

### Chat Interface
- Clean, modern interface
- One chat window open at a time
- Switch between conversations via inbox
- Smooth animations and transitions
- Message grouping by time

### Themes
- Dark mode (default)
- Light mode
- Theme toggle in settings
- Consistent across entire platform

### Emoji Reactions
- Limited emoji reaction set (5-10 reactions)
- Click emoji to react to messages
- Show reaction count
- Multiple users can add same reaction

---

## Infrastructure & Backend

### Core Technology Stack
- **Backend:** Go with Gin web framework
- **Frontend:** React with TypeScript
- **Database:** PostgreSQL for persistent data
- **Real-time:** WebSocket for messaging
- **Storage:** S3/R2/CDN for media files
- **Encryption:** Web Crypto API (client-side)

### Key Systems
- WebSocket server for real-time messaging
- Reddit public API integration (no auth required)
- E2E encryption (Web Crypto API)
- JWT-based session management
- RESTful API design
- Image/video upload handling
- Rate limiting and caching

### Security
- HTTPS/SSL certificates (Let's Encrypt)
- E2E encryption for messages
- Secure session management
- Password hashing (bcrypt)
- Input validation and sanitization
- Rate limiting to prevent abuse
- CORS configuration
- XSS and CSRF protection

---

## Deployment

### Initial Deployment
- Single VPS hosting (DigitalOcean, Hetzner, or Linode)
- Domain name and DNS configuration
- Nginx reverse proxy
- SSL certificate (automated renewal)
- PostgreSQL on same VPS
- Automated database backups
- Basic monitoring and logging

### Hosting Requirements (100-500 users)
- 2GB RAM minimum
- 2 vCPU
- 50GB SSD storage
- Linux (Ubuntu 22.04 LTS)

### Estimated Monthly Costs
- VPS: $12-15/month
- Storage (media files): $5-10/month
- Domain: $12/year ($1/month)
- **Total: ~$20-30/month**

---

## Success Criteria for Phase 1 Launch

### Technical
- [ ] All core features working without critical bugs
- [ ] E2E encryption functioning correctly
- [ ] User authentication secure and reliable
- [ ] Reddit public API integration stable
- [ ] Media uploads and slideshows functioning
- [ ] WebSocket connections stable
- [ ] Site loads in under 3 seconds
- [ ] Mobile responsive on iOS and Android

### User Experience
- [ ] Can register and login with username/password
- [ ] Can browse Reddit posts on the platform
- [ ] Can create platform posts and comments
- [ ] Can send encrypted DMs to other users
- [ ] Can share images and create slideshows
- [ ] Can browse Reddit media together via slideshow
- [ ] Intuitive UI that users understand immediately

### Performance
- [ ] Handles 100+ concurrent users
- [ ] Messages deliver in under 500ms
- [ ] Images load in under 2 seconds
- [ ] No memory leaks during extended use
- [ ] Database queries optimized

### Security
- [ ] E2E encryption verified
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
- [ ] Session management secure
- [ ] Passwords properly hashed

---

## What Phase 1 Does NOT Include

These features are deferred to Phase 2 or later:

**Deferred to Phase 2:**
- Voice/video calling
- Audio messages and voice notes
- Group chats
- Auto-delete messages
- Multiple chat windows simultaneously
- Link previews in chat
- Full emoji picker
- Friend/contact system
- Push notifications (mobile apps)
- Save position in Reddit slideshow
- Advanced search
- Content recommendation algorithm

**Deferred to Phase 3:**
- Monetization features (tips, subscriptions)
- Creator tools
- Analytics dashboard
- Advanced moderation tools
- API for third-party integrations

**Deferred to Phase 4:**
- Communities/groups
- Forums
- Live streaming
- Events system

**Deferred to Phase 5:**
- Professional network features
- Job board
- B2B marketplace
- Verified identity

---

## Timeline Breakdown

**Month 0:** Environment setup (complete)

**Months 1-2:**
- Reddit public API integration
- Platform posts and comments
- User profiles

**Months 3-4:**
- Messaging system
- WebSocket real-time delivery
- E2E encryption

**Months 5-6:**
- Image/video uploads
- Personal slideshow
- Media storage

**Months 7-8:**
- Reddit slideshow
- Unified feed
- Post interactions

**Months 9-10:**
- Frontend polish
- Mobile optimization
- Theme system

**Months 11-12:**
- Security audit
- Performance optimization
- Beta testing
- Launch

---

## Key Differentiators

What makes Phase 1 platform unique:

1. **Synchronized Media Viewing** - Browse Reddit media together in real-time
2. **Personal Slideshow Sharing** - Share your own photos/videos seamlessly
3. **Reddit Browser + Social Layer** - Mix Reddit content with platform posts
4. **E2E Encryption** - Privacy-first messaging
5. **Unified Experience** - One place for discovery and chatting
6. **No App Required** - Works in any browser, PWA-capable

---

**Ready to build? Let's create something amazing.**
