# Phase 1 - MVP Features

**Launch Target:** October-November 2026
**Development Time:** 10-11 months at 2 hours/day
**User Goal:** Launch with core features for real-world use

---

## Authentication & User Management

- Reddit OAuth login integration
- User profile creation (from Reddit account)
- User profile display on your site (shows Reddit karma, account age, recent posts)
- Session management
- Logout functionality

---

## Reddit Integration - Posts

### Browsing Posts
- Browse posts from any subreddit on your site
- Display posts with your custom UI
- Filter posts by Reddit's native sorting (hot, new, top, rising, best)
- Click post title to view full post on your site
- Click username to view Reddit profile on your site
- Indicator showing if post author is on your platform vs Reddit-only

### Creating Posts
- Create text posts to Reddit from your site
- Auto-append signature to posts ("Posted from [YourSite] - Click for multimedia chat")
- UI indicators for posts made on your site:
  - Icon next to username
  - Highlight treatment (glow/border)
  - "Posted via [YourSite]" metadata display

---

## Two-Tier Messaging System

### Platform Messages (Both users on your site)

**Core Messaging:**
- E2E encrypted text messaging
- Real-time delivery via WebSocket
- Persistent message storage
- DM inbox interface
- Conversation list view
- Unread message counter

**Message Status:**
- Sending
- Sent ✓
- Delivered ✓✓
- Read (only shown on most recent read message)

**Features:**
- Read receipts (asymmetric - per user setting)
- Typing indicators ("UserX is typing...")
- Online/offline status indicators

### Reddit Chat Fallback (Other user NOT on your site)

**Integration:**
- Integration with Reddit Chat API
- Send text messages via Reddit
- Send images via Reddit Chat
- Send GIFs via Reddit Chat
- Warning banner when entering Reddit Chat mode

**Invitation System:**
- Auto-append invitation link to Reddit messages (toggleable in settings)
- "Send Invite" button for Reddit-only users
- Unique invitation links per user

**Storage & Sync:**
- Store Reddit chat history locally
- Sync Reddit messages to your database
- Visual indicator for Reddit-sourced messages (📱 icon)

### Migration System

When a non-platform user joins your site:
- One-time migration of Reddit chat history (last 100 messages or 30 days)
- Import all messages to your database
- Upgrade conversation from Reddit Chat to platform
- Show upgrade banner in chat
- Mark old messages as "via Reddit, not encrypted" (📱)
- Mark new messages as encrypted (🔒)
- Notify both users of conversation upgrade

---

## Media Sharing

### Image Handling

**Upload:**
- Upload images from device
- Multi-file selection (Ctrl+Click or Cmd+Click)
- Mobile: Select multiple from photo gallery
- Display images inline in chat
- Click to enlarge

**URL Pasting:**
- Direct image URLs (.jpg, .png, .gif, .webp)
- Imgur links
- Reddit image posts
- Giphy/Tenor GIFs
- Automatic preview generation

### Video Handling

**Upload & Embedding:**
- Upload videos from device
- Video URL embedding from the two supported video sites
- Display video in chat window
- Chat remains visible during video playback

**Synchronized Playback:**
- Sharer controls playback (play/pause/seek)
- Playback state syncs to viewer in real-time
- Only sharer can control (viewer just watches)

### Personal Slideshow

**Creation:**
- Upload multiple images/videos at once
- Multi-file selection from device
- Create slideshow from uploaded files

**Controls:**
- Navigation controls (Next/Previous buttons)
- Arrow key navigation support
- Sharer controls navigation initially
- Ability to transfer control to other user
- Only one person controls at a time

**Auto-Advance:**
- Configurable intervals for images: 3s, 5s, 10s, 15s, 30s
- Configurable intervals for videos: 0s (immediate), 3s, 5s, 10s after video ends
- Turn off auto-advance option

**Experience:**
- Display slideshow in main area
- Chat remains visible and active on side/bottom
- Both users can type while viewing

### Reddit Subreddit Slideshow

**Setup:**
- Enter any subreddit name
- Fetch media-only posts from subreddit
- Filter out text-only posts
- For text+image posts, display only the image
- Display post title above each image/video/gif

**Media Types:**
- Images from Reddit
- Videos from Reddit
- GIFs from Reddit
- Only show media that displays inline on Reddit (no external navigation required)

**Controls:**
- Sort options (hot, new, top, rising, best, controversial)
- Change sort mid-browse
- Navigation controls (Next/Previous buttons)
- Arrow key navigation support
- Auto-advance feature (same intervals as personal slideshow)
- Sharer controls navigation initially
- Ability to transfer control to other user
- Only one person controls at a time

**Interaction:**
- Click on image to open original Reddit post (on your site)
- Chat remains visible and active during slideshow
- Both users can comment on what they're viewing

---

## User Features

### Blocking
- Block users from sending messages
- Blocked user can't send new messages
- Messages from blocked user never show as delivered
- No notification to blocked user (silent)
- Unblock option
- View block list in settings

### Notifications
- Notification sounds when receiving messages
- Toggle to turn sound on/off
- Inbox badge counter showing unread count
- Browser tab title updates with unread count

### Messaging Actions
- "Send DM" button on posts (if user is on platform)
- "Send Invite" or "Message via Reddit" button (if user is Reddit-only)
- Platform status indicator on all posts (✅ On Platform / ⚪ Reddit Only)
- Warning modal before sending Reddit message

### Settings
- General user settings page
- Notification sound toggle
- Read receipt toggle (show/hide)
- Typing indicator toggle (show/hide)
- Auto-append invitation link toggle
- Theme selection

---

## UI/UX

### Responsive Design
- Mobile-responsive design (works on phones/tablets)
- PWA-capable (can install to home screen)
- Touch-optimized controls for mobile

### Chat Interface
- Chat always visible and accessible
- One chat window open at a time
- Switch between conversations via inbox
- Clean, modern interface
- Smooth animations and transitions

### Themes
- Dark mode theme
- Light mode theme
- Theme toggle in settings

### Emoji Reactions
- Limited emoji reaction set (5-10 quick reactions)
- Click emoji icon to react to messages
- Show reaction count on messages
- Multiple users can add same reaction

---

## Basic Reward System Foundation

**Phase 1 includes minimal foundation for Phase 2 rewards:**
- Track successful invitations (count only)
- Display invitation count on profile
- Unique invitation links per user
- Database structure for future karma/points/badges
- Stripe payment integration setup (basic infrastructure)

**Note:** Full reward system launches in Phase 2

---

## Infrastructure & Backend

### Core Technology Stack
- **Backend:** Go with Gin or Fiber web framework
- **Frontend:** React with TypeScript
- **Database:** PostgreSQL for persistent data
- **Cache:** Redis for session management and online status
- **Storage:** AWS S3, Cloudflare R2, or similar for media files
- **CDN:** CloudFlare or AWS CloudFront for media delivery

### Key Systems
- WebSocket server for real-time messaging
- Reddit API integration (OAuth, Posts API, Chat API)
- E2E encryption using Web Crypto API
- JWT-based session management
- RESTful API design
- Image/video upload handling
- URL parsing and preview generation

### Security
- HTTPS/SSL certificates (Let's Encrypt)
- E2E encryption for platform messages
- Secure session management
- Input validation and sanitization
- Rate limiting to prevent abuse
- CORS configuration
- XSS and CSRF protection

---

## Deployment

### Initial Deployment
- Single VPS hosting (DigitalOcean, Hetzner, or Linode)
- Domain name registration and DNS configuration
- Nginx reverse proxy setup
- SSL certificate installation (automated renewal)
- Database backups (automated daily)
- Basic server monitoring
- Error logging and alerting

### Hosting Requirements (100-500 users)
- 2GB RAM minimum
- 2 vCPU
- 50GB SSD storage
- Linux (Ubuntu 22.04 LTS recommended)

### Estimated Monthly Costs
- VPS: $10-12/month
- Storage (media files): $5-10/month
- Domain: $12/year ($1/month)
- **Total: ~$20-25/month**

---

## Success Criteria for Phase 1 Launch

### Technical
- [ ] All core features working without critical bugs
- [ ] E2E encryption functioning correctly
- [ ] Reddit OAuth login working reliably
- [ ] Reddit Chat API integration stable
- [ ] Media uploads and slideshows functioning on desktop and mobile
- [ ] WebSocket connections stable
- [ ] Site loads in under 3 seconds
- [ ] Mobile responsive on iOS and Android

### User Experience
- [ ] Can create Reddit post from your site
- [ ] Can browse Reddit posts on your site
- [ ] Can send DM to platform user
- [ ] Can send Reddit Chat to non-platform user
- [ ] Can share images and create slideshows
- [ ] Can browse Reddit media together via slideshow
- [ ] Can embed and sync external videos
- [ ] Invitation system successfully converts Reddit users

### Performance
- [ ] Handles 100+ concurrent users
- [ ] Messages deliver in under 500ms
- [ ] Images load quickly (under 2s)
- [ ] No memory leaks during extended use
- [ ] Database queries optimized

### Security
- [ ] E2E encryption verified
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
- [ ] Session management secure
- [ ] Reddit OAuth tokens stored securely

---

## What Phase 1 Does NOT Include

The following features are deferred to Phase 2 or 3:

**Deferred to Phase 2:**
- Voice/video calling
- Audio messages and voice notes
- Pseudonym system (Phase 1 shows Reddit usernames)
- Auto-delete messages
- Multiple chat windows open simultaneously
- Link previews in chat
- Full emoji picker
- Dynamic audio waveforms
- Friend/contact system
- Browser corner notifications
- Save position in Reddit slideshow
- Full reward system (karma, badges, awards, currency)
- Leaderboards

**Deferred to Phase 3:**
- Group chats
- Mobile native apps
- Screen sharing on mobile
- Cryptocurrency payments
- Advanced moderation tools

---

## Timeline Breakdown

**Month 0:** Learn Go fundamentals
**Months 1-2:** Reddit OAuth + post browsing
**Months 3-4:** Text chat + E2E encryption
**Months 5-6:** Image/video uploads + personal slideshow
**Months 7-8:** Reddit slideshow + external video embedding
**Months 9-10:** Reddit Chat API + migration system
**Months 11-12:** UI polish, testing, deployment

**Total: 10-11 months part-time development**

---

## Key Differentiators

What makes your Phase 1 platform unique:

1. **Synchronized Media Viewing** - Browse Reddit media together in real-time
2. **Personal Slideshow Sharing** - Share your own photos/videos seamlessly
3. **Reddit Integration** - Discovery happens on Reddit, chatting happens on your platform
4. **E2E Encryption** - Privacy-first messaging
5. **Two-Tier System** - Can message both platform users and Reddit users
6. **Seamless Onboarding** - Reddit users can join mid-conversation

---

**Ready to build? See the roadmap documents for step-by-step implementation guides.**
