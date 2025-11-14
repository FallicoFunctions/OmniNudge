# Phase 2 - Enhancement & Growth

**Target Start:** After Phase 1 launch (November 2026+)
**Development Time:** 6-9 months
**User Goal:** Add advanced features based on user feedback and drive growth through rewards

---

## Advanced Communication

### WebRTC Voice & Video Calling

**Voice Calling:**
- Real-time voice calls between two users
- P2P connection (low latency)
- Call controls (mute, end call)
- Audio quality indicators
- Network quality detection

**Video Calling:**
- Real-time video calls between two users
- P2P connection for efficiency
- Camera on/off toggle
- Switch between front/back camera (mobile)
- Video quality adaptation based on bandwidth
- Screen layout options (side-by-side, picture-in-picture)

**During Media Viewing:**
- Voice/video calls can happen during slideshows
- Video call in corner, slideshow continues in main area
- Or picture-in-picture mode
- Chat still accessible

**Screen Sharing:**
- Share entire screen (desktop only)
- Share specific window (desktop only)
- Not available on mobile browsers (browser limitation)
- Viewer can see shared screen in real-time
- Sharer can stop sharing anytime

### Audio Messages & Voice Notes

**Voice Note Recording:**
- Press and hold to record
- Up to 5 minutes length (Phase 1 was capped at 1 min)
- Preview before sending
- Re-record option
- Visual recording indicator

**Playback:**
- Dynamic waveform visualization showing audio amplitude
- Duration display
- Progress bar with scrubbing (jump to any point)
- Playback speed controls (1x, 1.5x, 2x)
- Click to play/pause

**Audio File Uploads:**
- Upload .mp3, .wav, .m4a, .ogg files
- Same playback controls as voice notes
- Display file name and size

---

## Privacy & Identity Features

### Pseudonym System

**Default Pseudonym:**
- Set default pseudonym in global settings
- All new chats start with this name
- Can be changed anytime

**Per-Chat Pseudonyms:**
- Override default in specific conversations
- Different name for each chat if desired
- Change mid-conversation as many times as wanted
- Changes apply retroactively (all past messages show new name)

**Reddit Username Reveal:**
- Clicking pseudonym opens user profile
- Profile shows real Reddit username
- Can view Reddit post history
- Provides accountability while maintaining casual privacy

**User Experience:**
- In chat: "april3938" (pseudonym)
- On profile: "jeff039" (Reddit username)
- Semi-anonymous system

### Auto-Delete Messages

**Per-User Settings:**
- Each user sets their own auto-delete preference
- Not per-conversation (individual choice)
- Settings apply only to messages YOU receive

**Time Options:**
- 30 minutes
- 1 hour
- 5 hours
- 24 hours
- 2 days
- 7 days
- 30 days
- Never (keep forever)

**Implementation:**
- Server-side cron job deletes expired messages
- Client-side countdown timer shows time remaining
- Visual indicator on messages: "🕐 Deletes in 23m"
- Can change setting anytime (affects future messages)

**Feature Flag:**
- Can be built but disabled initially
- Enable when ready via configuration

### Save Position in Reddit Slideshow

**Functionality:**
- Option to save where you left off in a subreddit slideshow
- Return later and resume from same position
- Per-subreddit tracking
- User toggle: "Remember position in slideshows"

**User Experience:**
- Exit slideshow at post #47
- Come back later: "Continue from where you left off? (Post #47)"
- Or start from beginning

---

## Enhanced Media & Sharing

### Multiple Slideshow Types Simultaneously

**Phase 1 Limitation:** Only one slideshow type at a time
**Phase 2 Enhancement:** Can have multiple active

**Examples:**
- Personal slideshow + Reddit slideshow open together
- External video playing + personal slideshow
- Picture-in-picture layouts

**UI Considerations:**
- Tabbed interface for multiple media sources
- Or split-screen view
- Chat always remains accessible

### External Video During Slideshow

**Functionality:**
- Play external video while personal/Reddit slideshow is active
- Picture-in-picture mode
- Or switch between sources
- Synchronized playback still works

### Link Preview Cards

**Automatic Preview Generation:**
- When user pastes a URL (non-image), generate preview
- Fetch page metadata (Open Graph tags, meta tags)
- Display preview card with:
  - Page title
  - Description (first 100-150 characters)
  - Thumbnail image (if available)
  - Domain name
  - Favicon

**User Experience:**
- Like Discord, Slack, iMessage link previews
- Click to open link in new tab
- Preview loads asynchronously (doesn't block chat)

**Supported:**
- News articles
- Blog posts
- Product pages
- YouTube videos (enhanced preview)
- General web pages

### Social Media URL Support

**Attempt to Support:**
- Instagram posts (public only, reliability varies)
- Facebook posts (public only, reliability varies)
- Twitter/X posts and images

**Fallback:**
- If fetch fails, show error: "Can't load preview. Try uploading screenshot."
- Graceful degradation

**Note:** These platforms actively block scraping, so support is best-effort

### Enhanced Video

**Longer Uploads:**
- Increase video upload size limit
- Phase 1: 50-100MB
- Phase 2: 200-500MB

**Quality Options:**
- User can select upload quality
- HD, SD, Low options
- Affects bandwidth and storage

---

## Social Features & Comprehensive Reward System

### Friend/Contact System

**Adding Friends:**
- Send friend request
- Accept/decline requests
- Remove friends

**Friend List:**
- View all friends
- Online/offline status
- Last seen timestamp
- Quick access to friend conversations

**Friend Features:**
- Friends get priority in inbox
- "Friends Only" DM setting (only friends can message you)
- Friend suggestions based on common subreddits

### Karma Points System

**Earning Karma:**
- +10 per successful invitation (when invited user signs up)
- +5 when someone awards your post
- +3 when someone awards your message
- +2 daily login bonus
- +5 create first post
- +3 complete profile
- +1 per day active streak

**Karma Display:**
- Total karma on profile
- Karma breakdown by source
- Karma leaderboard ranking

**Functional Benefits:**
- Unlock features at karma thresholds:
  - 100 karma: Custom profile colors
  - 250 karma: Additional theme options
  - 500 karma: Priority in friend suggestions
  - 1000 karma: Custom badges

### Badge/Achievement System

**Invitation Badges:**
- "Recruiter" - 5 successful invites
- "Connector" - 10 successful invites
- "Ambassador" - 25 successful invites
- "Influencer" - 50 successful invites
- "Legend" - 100 successful invites

**Activity Badges:**
- "Early Adopter" - Joined in first month
- "Chatterbox" - Sent 1000 messages
- "Media Sharer" - Created 50 slideshows
- "Curator" - Shared 100 Reddit slideshows
- "Engaged" - 30-day login streak
- "Veteran" - 1 year on platform

**Milestone Badges:**
- Various achievements for platform milestones

**Badge Display:**
- Show on user profile
- Up to 5 "featured" badges displayed in chat (user selects)
- Badge collection page

### Award/Gift System

**Free Basic Awards:**
- Heart ❤️
- Star ⭐
- Fire 🔥
- Laugh 😂
- Clap 👏
- Unlimited use
- No cost

**Premium Awards (Cost Coins):**
- Silver Award (100 coins) - Gives recipient +5 karma
- Gold Award (500 coins) - Gives recipient +25 karma + 100 coins
- Platinum Award (1000 coins) - Gives recipient +50 karma + 500 coins + 1 week ad-free
- Diamond Award (2500 coins) - Gives recipient +100 karma + 1000 coins + 1 month ad-free

**Awarding:**
- Click award icon on post or message
- Select award type
- Confirm (deducts coins)
- Award appears on content with count
- Recipient gets notification

**Award Display:**
- Shows on posts: "❤️ 5  ⭐ 3  🏆 1"
- Shows on messages similarly
- Clicking award icon shows who gave it (optional anonymity)

### Currency System

**Earning Free Coins:**
- Daily login: +10 coins
- Successful invitation: +50 coins
- Create first post: +25 coins
- Complete profile: +20 coins
- Receive premium award: Varies by award
- 7-day streak: +50 bonus coins
- 30-day streak: +200 bonus coins

**Purchasing Coins (via Stripe):**
- 100 coins - $0.99
- 500 coins - $3.99 (22% bonus - worth $4.95)
- 1,000 coins - $6.99 (43% bonus - worth $9.90)
- 2,500 coins - $14.99 (68% bonus - worth $24.75)
- 5,000 coins - $24.99 (102% bonus - worth $49.50)

**Spending Coins:**
- Give premium awards
- Unlock premium themes (500 coins)
- Boost post visibility (100 coins)
- Custom profile features (varies)

**Coin Display:**
- Balance shown in header/profile
- Transaction history
- Earned vs purchased tracking

### Leaderboards

**Leaderboard Types:**
- Top Inviters (weekly, monthly, all-time)
- Most Awarded Users (weekly, monthly, all-time)
- Highest Karma (all-time)
- Most Active Chatters (weekly, monthly)
- Top Content Creators (posts shared)

**Leaderboard Display:**
- Dedicated leaderboard page
- Top 100 users per category
- Your rank shown prominently
- Update frequency: Every hour

**Rewards for Top Rankings:**
- Weekly #1 inviter: 500 bonus coins
- Monthly #1 karma: Special badge
- Bragging rights

### Stripe Payment Enhancement

**Payment Processing:**
- Stripe Checkout integration
- One-click purchases (saved payment methods)
- Multiple payment methods (credit, debit, digital wallets)
- International currency support
- Automatic tax calculation
- Receipt emails

**User Features:**
- Purchase history page
- Refund requests (within 7 days, unused coins)
- Payment method management
- Spending analytics

**Security:**
- PCI compliance via Stripe
- No credit card data stored on your server
- Fraud detection
- 3D Secure for high-value transactions

### Functional Rewards

**Karma-Based Unlocks:**
- 100 karma: 1 additional theme
- 250 karma: Custom profile banner
- 500 karma: Animated avatar support
- 1000 karma: Create custom badges
- 2500 karma: Priority support

**Award-Based Benefits:**
- Receiving Gold: +100 coins for giving awards
- Receiving Platinum: Ad-free for 1 week
- Receiving Diamond: Ad-free for 1 month + profile highlighting

**Premium Membership (Optional):**
- $4.99/month subscription
- 500 coins/month
- Ad-free permanently
- All themes unlocked
- Custom profile features
- Priority in friend suggestions
- Early access to new features

---

## User Experience Improvements

### Multiple Chat Windows

**Phase 1 Limitation:** One chat window at a time
**Phase 2 Enhancement:** Multiple windows simultaneously

**Implementation:**
- Tabbed interface (like browsers)
- Or separate floating windows
- Switch between active chats easily
- Up to 5 chats open at once

**Mobile:**
- Swipe between active chats
- Or tabbed interface

### Browser Corner Notifications

**Native Browser Notifications:**
- Request permission on first use
- Show notifications even when tab not focused
- Like Mac/Windows notifications
- Click notification to open chat

**Notification Content:**
- Sender name (or pseudonym)
- Message preview (first 50 characters)
- Timestamp

**Settings:**
- Enable/disable per conversation
- Enable/disable globally
- Quiet hours (no notifications during set times)

### Full Emoji Picker

**Phase 1:** Limited set (5-10 reactions)
**Phase 2:** Full emoji picker

**Features:**
- Hundreds of emojis
- Search emojis by name
- Recently used emojis
- Emoji categories
- Skin tone selection
- Custom emoji (animated GIFs)

**Usage:**
- In messages (inline)
- As reactions
- In pseudonyms (optional)

### Dynamic Audio Waveforms

**Phase 1:** Static wave icon
**Phase 2:** Dynamic waveform

**Features:**
- Shows actual audio amplitude
- Visualizes loud/quiet parts
- Interactive (click to jump to position)
- Animated during playback
- Color-coded by intensity

### Drag-and-Drop Upload

**Enhanced Upload UX:**
- Drag files from desktop onto chat
- Drag entire folders (upload all files)
- Visual drop zone indicator
- Upload progress for each file
- Multi-file uploads in parallel

**Supported:**
- Desktop browsers (full support)
- Mobile (limited support, depends on browser)

### Message Search

**Search Within Conversation:**
- Search messages by keyword
- Search by date range
- Search by media type (images, videos, etc.)
- Highlight matches
- Jump to message in conversation history

**Global Search (across all conversations):**
- Search all your conversations
- Filter by conversation
- Sort by relevance or date

### Chat History Export

**Export Formats:**
- JSON (full data)
- HTML (readable, formatted)
- CSV (for analysis)
- PDF (printable)

**Export Options:**
- Entire conversation
- Date range
- Include/exclude media
- Include/exclude metadata

**Privacy:**
- Only your messages (can't export other user's data)
- Encrypted conversations exported as encrypted (optionally decrypt)

### Custom Themes

**Phase 1:** Dark/light only
**Phase 2:** Multiple color themes

**Theme Options:**
- Ocean Blue
- Forest Green
- Sunset Orange
- Purple Night
- Rose Gold
- Cyberpunk Neon
- Minimal Gray
- High Contrast

**Customization:**
- Accent color selection
- Font size options
- Message bubble style
- Background patterns (optional)

### Profile Enhancement

**Profile Customization:**
- Profile banner image
- About me / bio (250 characters)
- Location (optional)
- Interests/tags
- Favorite subreddits

**Avatar:**
- Upload custom avatar
- Or use Reddit avatar (if they have one)
- Animated avatar support (for high karma users)

**Profile Stats:**
- Total messages sent
- Slideshows created
- Users invited
- Karma earned
- Join date
- Last seen

---

## Additional Features

### Advanced Typing Indicators

**Phase 1:** "UserX is typing..."
**Phase 2:** More detail

**Enhanced Indicators:**
- "UserX is recording a voice note..."
- "UserX is uploading an image..."
- "UserX is creating a slideshow..."
- Real-time character count (for long messages)

### Voice Message Transcription

**Automatic Transcription:**
- Voice notes automatically transcribed to text
- Uses speech-to-text API (Google Cloud Speech, AWS Transcribe, or similar)
- Displays text below voice note
- Useful for accessibility
- Searchable text

**Settings:**
- Enable/disable transcription
- Language selection

**Cost Consideration:**
- Transcription has API costs (~$0.006 per 15 seconds)
- Might be premium feature only

### Message Editing

**Edit Sent Messages:**
- Short time window (5 minutes after sending)
- Shows "edited" indicator
- View edit history (click "edited")
- Can't edit after other person replies

**Use Cases:**
- Fix typos
- Clarify message
- Add forgotten info

### Message Deletion

**Delete Options:**
- Delete for me only (removes from your view)
- Delete for everyone (removes from both users)

**Restrictions:**
- "Delete for everyone" only within 1 hour
- Shows "[Message deleted]" placeholder
- Can't delete if other person hasn't seen it yet (prevents abuse)

### Pin Messages

**Pin Important Messages:**
- Pin up to 5 messages per conversation
- Pinned messages shown at top of chat
- Quick reference for important info
- Both users see pinned messages

**Use Cases:**
- Meeting times
- Important links
- Addresses
- Instructions

### Mute Conversations

**Mute Notifications:**
- Mute specific conversations
- Duration options (1 hour, 8 hours, 24 hours, until unmuted)
- Messages still received, just no notifications
- Muted conversations marked in inbox

### Archive Conversations

**Archive Old Chats:**
- Archive conversations you're not actively using
- Remove from main inbox
- Still searchable
- View archived conversations in separate section
- Unarchive anytime

### Star/Favorite Messages

**Star Messages:**
- Mark messages as favorites/important
- Quick access to starred messages
- Per-conversation or across all conversations
- Jump to starred message in history

### GIF Search Integration

**Built-in GIF Search:**
- Search Giphy or Tenor directly in chat
- No need to leave app
- Click to send GIF
- Trending GIFs section
- GIF categories

### Sticker Packs

**Sticker Support:**
- Download sticker packs
- Send stickers in chat
- Create custom sticker packs
- Animated stickers
- Sticker marketplace (free and premium)

### Custom Emoji Reactions

**Beyond Standard Emojis:**
- Custom reaction images
- Animated reactions
- Sticker reactions
- Sound reactions (send quick sound clips)

---

## Timeline for Phase 2

**Month 1-2:** Voice/video calling + screen sharing
**Month 3:** Audio messages + voice notes + transcription
**Month 4:** Pseudonym system + auto-delete
**Month 5-6:** Comprehensive reward system + Stripe payments + leaderboards
**Month 7:** Friend system + multiple chat windows
**Month 8:** Enhanced media features + link previews
**Month 9:** Message search, editing, deletion, pinning, archiving, etc.

**Total: 6-9 months**

---

## Success Criteria for Phase 2

**Technical:**
- [ ] WebRTC voice/video working reliably
- [ ] Stripe payments processing correctly
- [ ] Reward system tracking accurately
- [ ] Leaderboards updating in real-time
- [ ] Pseudonyms applied retroactively
- [ ] Auto-delete cron job running properly

**User Engagement:**
- [ ] 30% of users have purchased coins
- [ ] Average user has 3+ friends
- [ ] 50% of users have earned karma
- [ ] Voice/video calls happen regularly
- [ ] Invitation rate increases with reward system

**Revenue (if 1000 active users):**
- [ ] $500-1000/month from coin purchases
- [ ] Covers hosting costs
- [ ] Some profit for continued development

---

**Phase 2 transforms the platform from functional MVP to feature-rich social platform.**
