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

### Minimal Ad System

**Ad Placement (Free Tier Users Only):**
- Small banner in subreddit feed (between posts every 10-15 posts)
- Never in active chats
- Never during media viewing (slideshows, videos)
- Never during voice/video calls
- Never intrusive pop-ups

**Ad Types:**
- Display ads (images/banners)
- Text ads (like Google AdSense)
- No video ads (too intrusive)
- No auto-play audio
- No pop-ups or interstitials

**Ad Network:**
- Google AdSense (easiest integration)
- Or direct ad sales for niche-specific advertising
- Contextual targeting (based on subreddit being viewed)

**Revenue Expectations:**
- $1-5 per 1,000 impressions (CPM)
- With 1,000 active users viewing 10 pages/day: ~10,000 impressions/day
- Estimated: $10-50/day = $300-1,500/month at 1,000 users
- At 10,000 users: $3,000-15,000/month potential

**Ad-Free Options:**
- Purchase premium membership ($4.99/month)
- Receive Platinum/Diamond awards (temporary ad-free)
- High karma users (optional - 5,000+ karma)

**User Control:**
- Can't block ads on free tier
- But ads are minimal and non-intrusive
- Clear upgrade path to remove them

**Implementation:**
- Phase 2 Month 7-8
- After reward system in place (so users can go ad-free)
- Start with minimal ads, increase only if needed
- Monitor user complaints and adjust

**Balance:**
- Ads should never hurt user experience
- Better to have fewer ads than drive users away
- Focus on sustainable, non-annoying advertising

---

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

### MySpace-Style Theme Customization System

**Phase 1:** Dark/light only
**Phase 2:** Comprehensive customization system with 5 progressive levels

See complete specification: [/docs/COMPONENT_REFERENCE.md](../COMPONENT_REFERENCE.md), [/docs/CSS_VARIABLES.md](../CSS_VARIABLES.md), [/docs/THEME_CREATION_GUIDE.md](../THEME_CREATION_GUIDE.md)

**Level 1: Predefined Themes**
- 8 professionally designed themes:
  - OmniNudge Light
  - OmniNudge Dark
  - Midnight (deep blue dark)
  - Sunset (warm orange/pink gradients)
  - Forest (green nature-inspired)
  - Ocean (blue aquatic)
  - Lavender (soft purple)
  - Monochrome (black & white)
- One-click installation
- Apply globally across all pages

**Level 2: Advanced Mode - CSS Variable Customization**
- Toggle "Advanced Mode" in settings
- Customize 100+ CSS variables:
  - Colors (primary, background, text, borders, semantic)
  - Typography (fonts, sizes, weights, line heights)
  - Spacing (8-tier scale from xs to 3xl)
  - Border radius and shadows
  - Component-specific variables
- Visual controls (color pickers, sliders, number inputs)
- Real-time preview before applying
- All variables available (no tier limits in Phase 2)

**Level 3: Advanced Mode - Full Custom CSS**
- Raw CSS editor with syntax highlighting (Monaco Editor or CodeMirror)
- Target specific components:
  - `.feed-post-card` - Post cards
  - `.navigation-bar` - Navigation
  - `.sidebar-container` - Sidebar
  - `.message-bubble` - Messages
  - `.profile-header` - Profile
  - And 50+ more components
- Server-side CSS sanitization (blocks XSS patterns)
- Live preview in real-time
- Share themes with community

**Level 4: Advanced Mode - Per-Page Themes**
- Different theme for each page:
  - Feed theme
  - Profile theme
  - Settings theme
  - Messages theme
  - Notifications theme
  - Search theme
- Page-specific CSS using data attributes:
  - `[data-page="feed"]` - Target feed page
  - `[data-page="profile"]` - Target profile page
- Fallback to global theme when no page override
- Component-specific styling per page

**Level 5: Component Rearrangement (CSS-based)**
- Use CSS Grid/Flexbox to restructure layouts:
  - Move sidebar left/right
  - Reorder feed sections
  - Change component visibility
  - Create custom layouts (3-column, centered, magazine-style)
- No drag-and-drop UI (pure CSS control)
- Maximum customization within security constraints

**Database Tables:**
- `user_themes` - Custom theme storage
- `user_theme_overrides` - Per-page customizations
- `user_installed_themes` - Marketplace theme tracking (Phase 3)
- `marketplace_items` - General marketplace (Phase 3+)

**Security:**
- CSS sanitization blocks:
  - `url()` function (prevents external resource loading)
  - `@import` statements
  - JavaScript execution patterns (`javascript:`, `expression()`)
  - HTML injection attempts
- Content Security Policy headers
- Rate limiting (10 saves/hour, 50 previews/hour)
- See [/docs/SECURITY_GUIDELINES.md](../SECURITY_GUIDELINES.md)

**Phase 2 Implementation Timeline:**

**Phase 2a: Foundation (Months 1-2)**
- Predefined themes + CSS variable customization
- Advanced Mode toggle
- Theme persistence across devices
- Live preview component
- CSS sanitization service
- 8 predefined themes seeded

**Phase 2b: Per-Page & Component Targeting (Months 3-4)**
- Per-page theme overrides
- Component-specific styling
- Component reference documentation
- Page data attributes in routing
- CSS editor with autocomplete

**Phase 2c: Full CSS & Sharing (Months 5-6)**
- Full CSS editor (Monaco/CodeMirror)
- Theme sharing (publish/browse/install)
- Public theme browser with ratings
- Theme preview before installation
- All features remain free

**Phase 3: Marketplace & Monetization**
- Theme marketplace with purchases
- In-site currency (credits)
- Creator earnings (70/30 split)
- HTML + CSS customization (sandboxed)
- Premium tiers (optional)
- See [/docs/MARKETPLACE_SPEC.md](../MARKETPLACE_SPEC.md)

**Deliverables:**
- Users select from 8 predefined themes
- Advanced users customize every visual aspect
- CSS-only customization (safe, Phase 2)
- HTML + CSS customization (sandboxed, Phase 3)
- Share and install community themes (free in Phase 2)
- Full marketplace ecosystem (Phase 3)
- Maximum customization = maximum engagement

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

**Month 1-2: Theme Foundation (Phase 2a)**
- Predefined themes system (8 themes)
- CSS variable customization
- Advanced Mode toggle
- Live preview component
- CSS sanitization service
- Theme persistence & cross-device sync

**Month 3-4: Per-Page Themes (Phase 2b)**
- Per-page theme overrides
- Component-specific styling
- Component reference documentation
- Page data attributes
- CSS editor with autocomplete
- Voice/video calling + screen sharing

**Month 5-6: Full CSS & Sharing (Phase 2c)**
- Full CSS editor (Monaco/CodeMirror)
- Theme sharing (publish/browse/install)
- Public theme browser with ratings
- Audio messages + voice notes + transcription
- Pseudonym system + auto-delete

**Month 7-8: Rewards & Social**
- Comprehensive reward system
- Stripe payments + coin purchases
- Leaderboards (karma, awards, invites)
- Friend system + multiple chat windows
- Enhanced media features + link previews

**Month 9: Polish & Additional Features**
- Message search, editing, deletion, pinning, archiving
- Full emoji picker + GIF integration
- Drag-and-drop upload
- Advanced typing indicators
- Chat history export

**Total: 9 months**

**Note:** Theme customization system is integrated throughout Phase 2a-2c. Marketplace and monetization deferred to Phase 3.

---

## Success Criteria for Phase 2

**Technical:**
- [ ] WebRTC voice/video working reliably
- [ ] Stripe payments processing correctly
- [ ] Reward system tracking accurately
- [ ] Leaderboards updating in real-time
- [ ] Pseudonyms applied retroactively
- [ ] Auto-delete cron job running properly
- [ ] CSS sanitization blocks all XSS patterns
- [ ] Theme system persists across devices
- [ ] Per-page theme overrides work correctly
- [ ] Live preview shows changes in real-time

**Theme System:**
- [ ] Users can select from 8 predefined themes
- [ ] Advanced Mode users can customize 100+ CSS variables
- [ ] Full CSS editor with syntax highlighting functional
- [ ] Users can publish and share themes
- [ ] Public theme browser displays community themes
- [ ] One-click theme installation works
- [ ] Theme ratings and reviews functional
- [ ] All theme features remain free in Phase 2

**User Engagement:**
- [ ] 30% of users have purchased coins
- [ ] Average user has 3+ friends
- [ ] 50% of users have earned karma
- [ ] Voice/video calls happen regularly
- [ ] Invitation rate increases with reward system
- [ ] 40% of users customize their theme beyond defaults
- [ ] 10% of users publish themes to community
- [ ] Average user installs 2-3 community themes

**Revenue (if 1000 active users):**
- [ ] $500-1000/month from coin purchases
- [ ] Covers hosting costs
- [ ] Some profit for continued development
- [ ] Foundation built for Phase 3 marketplace revenue

---

**Phase 2 transforms the platform from functional MVP to feature-rich, highly customizable social platform with MySpace-level personalization.**
