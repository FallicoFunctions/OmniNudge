# Phase 4: Creator Platform & Paywalls

**Timeline:** Months 25-30 (6 months)
**Cost:** $90,000-120,000
**Team:** 2-3 developers + 1 designer

---

## Overview

Phase 4 transforms OmniNudge from a Reddit integration platform into a **full-fledged content creation platform**. This is where creators can build audiences, monetize content, and earn real coins (not yet cash - that's Phase 5).

**Key Difference from Earlier Phases:**
- Phases 1-3: Platform for Reddit users to chat and share
- Phase 4+: Platform becomes THE destination for creators and audiences

---

## Core Features

### 1. Native Content Creation System

**Creator Profiles:**
- Public profile page (username, avatar, bio, social links)
- Banner image/cover photo
- Creator stats (total posts, followers, join date)
- Portfolio/gallery view of all public posts
- Subscription tiers display (free vs. paid access)
- Verification badges for established creators

**Post Creation - ANY File Type:**
- **Documents:** .pdf, .docx, .xlsx, .pptx, .txt, .md
- **Design Files:** .psd, .ai, .figma, .sketch, .xd
- **Audio Projects:** .logic, .als (Ableton), .flp (FL Studio), .ptx (Pro Tools)
- **Video Projects:** .prproj (Premiere), .aep (After Effects)
- **3D Models:** .blend, .obj, .fbx, .stl
- **Code:** .zip of projects, .ipynb notebooks, source files
- **Images/Videos:** .jpg, .png, .gif, .mp4, .mov, .webm
- **Archives:** .zip, .rar, .7z (for bundled content)

**File Size Limits:**
- Free users: 100 MB per file
- Premium users: 500 MB per file
- Creators with 1,000+ followers: 1 GB per file
- Creators with 10,000+ followers: 5 GB per file (upon request)

**Post Types:**
- **Text posts** (like Twitter/X)
- **Image galleries** (multiple images)
- **Video posts** (embedded player)
- **File download posts** (any file type)
- **Mixed media** (text + images + files)
- **Series/Collections** (group related posts together)

**Post Privacy Options:**
- **Public Free:** Anyone can view/download
- **Public Paid:** Anyone can buy with coins (one-time or subscription)
- **Followers Only:** Free for followers
- **Subscribers Only:** Only paid subscribers can access
- **Private:** Only visible to you (drafts)

---

### 2. Patreon-Style Paywall System

**Monetization Models:**

**A. Per-Post Purchases:**
- Creator sets coin price per post (minimum 10 coins = $0.10)
- User pays once, keeps access forever
- No recurring charges
- Good for: tutorials, templates, project files, one-off content

**B. Subscription Tiers:**
- Creator creates tiers (e.g., "Bronze," "Silver," "Gold")
- Each tier has monthly coin cost (e.g., 500 coins/month = $5)
- Subscribers get access to ALL posts in that tier or lower
- Good for: ongoing content, exclusive updates, community access

**Example Tier Structure:**
```
Free Tier:
- 2 public posts per month
- Basic portfolio access
- No downloads

Bronze Tier (500 coins/month = $5):
- Access to all Bronze posts
- Early access to new content
- Download basic templates/files

Silver Tier (1,000 coins/month = $10):
- All Bronze benefits
- Access to premium tutorials
- Monthly exclusive file pack
- Priority support

Gold Tier (2,500 coins/month = $25):
- All Silver benefits
- 1-on-1 monthly feedback session
- Custom requests
- Lifetime access to all past content
```

**Revenue Split (Phase 4):**
- Creator: 85% of coins earned
- Platform: 15% commission
- Example: User pays 100 coins → Creator gets 85 coins, Platform gets 15 coins
- **Note:** Phase 4 does NOT include cash out - creators accumulate coins only
- Cash conversion comes in Phase 5

**Creator Analytics Dashboard:**
- Total coins earned (lifetime and monthly)
- Active subscribers per tier
- Post performance (views, purchases, downloads)
- Follower growth over time
- Revenue projections
- Top-performing content
- Audience demographics (if available)

---

### 3. Groups & Communities

**Group Types:**

**A. Public Groups:**
- Anyone can join
- Searchable and discoverable
- Like subreddits but native to platform
- Creator can monetize group membership (optional)
- Free or paid entry (one-time or monthly)

**B. Private Groups:**
- Invite-only or application-based
- Not searchable
- Good for: exclusive communities, premium supporters, collaborations

**Group Features:**
- Group chat (text + voice)
- Shared file repository
- Event scheduling
- Polls and voting
- Group announcements (creator only)
- Member roles (admin, moderator, member)

**Monetization:**
- Free groups (no entry fee)
- Paid groups (e.g., 200 coins to join once)
- Subscription groups (e.g., 300 coins/month)
- Group-exclusive posts (only group members can view)

---

### 4. Discovery & Search

**Content Discovery:**
- Trending posts (based on views + purchases)
- Trending creators (based on follower growth)
- Category browsing (Art, Music, Code, Design, Writing, etc.)
- Tag system (#tutorial, #template, #freebie, etc.)
- Search by file type (e.g., "find all .psd files")
- Personalized recommendations (based on follows and purchases)

**Creator Discovery:**
- Featured creators (hand-picked by platform)
- New creators spotlight
- Category leaders (top creators per category)
- Search creators by name, skills, tags

**Algorithm Considerations:**
- Prioritize quality over quantity
- Don't bury small creators
- Mix of trending and new content
- User control over feed (chronological vs. algorithm)

---

### 5. Following & Notifications

**Follow System:**
- Follow creators to see their posts in your feed
- Follow counts displayed on profiles
- Followers can't access paid content for free (just see updates)
- Creator can offer "follower perks" (optional)

**Notification Types:**
- New post from followed creator
- Creator goes live (if streaming - Phase 5)
- Subscription renewal reminder (3 days before)
- Comment replies
- New follower milestone (100, 1k, 10k, etc.)
- Group activity (if member)

**Notification Settings:**
- Per-creator notification preferences
- Email digests (daily/weekly summary)
- Push notifications (mobile - future)
- Mute specific creators without unfollowing

---

### 6. Content Moderation

**Why Needed:**
- Public platform = legal liability
- Must prevent illegal content (CSAM, piracy, etc.)
- DMCA compliance required
- Prevent scams and fraud

**Moderation Tools:**

**Automated:**
- PhotoDNA for CSAM detection
- File hash checking for known pirated content
- Spam detection (duplicate posts, bot behavior)
- Malware scanning for uploaded files

**Manual:**
- User reporting system
- Moderator queue for flagged content
- Creator appeals process
- Strike system (3 strikes = account suspension)

**Content Policies:**
- No illegal content (obvious)
- No copyrighted material without permission
- No malware or phishing
- No misleading/scam content
- No hate speech or harassment
- NSFW content allowed but must be tagged

**DMCA Compliance:**
- Copyright holder can submit takedown request
- Creator has 48 hours to respond
- If valid, content removed + strike issued
- If invalid, content restored + counter-notice filed
- Repeat offenders banned

---

### 7. Technical Implementation

**File Storage:**
- AWS S3 or Cloudflare R2 (cheaper)
- Separate buckets for free vs. paid content
- CDN for fast global delivery
- Encrypted storage for paid content (prevent piracy)
- Access control via signed URLs (time-limited)

**Payment Processing:**
- Users buy coins via Stripe Checkout (same as Phase 2)
- Coins stored in user account balance
- Post purchases deduct coins from balance
- Subscriptions auto-renew monthly (charge coins from balance)
- Low balance warnings (< 100 coins)

**Access Control:**
- Database tracks who purchased what
- Middleware checks permissions before serving files
- Signed URLs expire after 1 hour (must re-auth)
- Download limits: 3 downloads per purchase (prevent sharing)

**Database Schema Additions:**
```sql
-- Creators
CREATE TABLE creators (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  display_name VARCHAR(100),
  bio TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  verified BOOLEAN DEFAULT FALSE,
  total_followers INTEGER DEFAULT 0,
  total_posts INTEGER DEFAULT 0,
  total_earnings_coins INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Posts
CREATE TABLE creator_posts (
  id UUID PRIMARY KEY,
  creator_id UUID REFERENCES creators(id),
  title VARCHAR(255),
  description TEXT,
  post_type VARCHAR(50), -- 'text', 'image', 'video', 'file', 'mixed'
  privacy VARCHAR(50), -- 'public_free', 'public_paid', 'followers', 'subscribers', 'private'
  coin_price INTEGER DEFAULT 0,
  tier_required VARCHAR(50), -- NULL if public, or tier name
  view_count INTEGER DEFAULT 0,
  purchase_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Post Files
CREATE TABLE post_files (
  id UUID PRIMARY KEY,
  post_id UUID REFERENCES creator_posts(id),
  file_name VARCHAR(255),
  file_type VARCHAR(100),
  file_size BIGINT,
  storage_url TEXT,
  download_count INTEGER DEFAULT 0,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE creator_subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  creator_id UUID REFERENCES creators(id),
  tier_name VARCHAR(50),
  coin_cost INTEGER,
  status VARCHAR(50), -- 'active', 'cancelled', 'expired'
  next_billing_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Post Purchases
CREATE TABLE post_purchases (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  post_id UUID REFERENCES creator_posts(id),
  coins_paid INTEGER,
  purchased_at TIMESTAMP DEFAULT NOW()
);

-- Follows
CREATE TABLE creator_follows (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  creator_id UUID REFERENCES creators(id),
  followed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, creator_id)
);

-- Groups
CREATE TABLE creator_groups (
  id UUID PRIMARY KEY,
  creator_id UUID REFERENCES creators(id),
  name VARCHAR(100),
  description TEXT,
  group_type VARCHAR(50), -- 'public', 'private'
  access_type VARCHAR(50), -- 'free', 'paid_once', 'subscription'
  coin_price INTEGER DEFAULT 0,
  member_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Group Memberships
CREATE TABLE group_memberships (
  id UUID PRIMARY KEY,
  group_id UUID REFERENCES creator_groups(id),
  user_id UUID REFERENCES users(id),
  role VARCHAR(50), -- 'admin', 'moderator', 'member'
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);
```

**API Endpoints (New):**
```
POST   /api/creators/register           - Become a creator
GET    /api/creators/:id                - Get creator profile
PUT    /api/creators/:id                - Update creator profile

POST   /api/posts                       - Create new post
GET    /api/posts/:id                   - Get post details
PUT    /api/posts/:id                   - Update post
DELETE /api/posts/:id                   - Delete post
GET    /api/posts/:id/files             - Get post files (if authorized)

POST   /api/posts/:id/purchase          - Purchase a post
GET    /api/users/me/purchases          - Get user's purchased posts

POST   /api/creators/:id/subscribe      - Subscribe to creator tier
DELETE /api/subscriptions/:id           - Cancel subscription
GET    /api/users/me/subscriptions      - Get user's subscriptions

POST   /api/creators/:id/follow         - Follow creator
DELETE /api/creators/:id/follow         - Unfollow creator
GET    /api/users/me/following          - Get followed creators

GET    /api/discover/trending           - Get trending posts
GET    /api/discover/creators           - Get trending creators
GET    /api/search?q=&type=&category=   - Search posts/creators

POST   /api/groups                      - Create group
GET    /api/groups/:id                  - Get group details
POST   /api/groups/:id/join             - Join group
DELETE /api/groups/:id/leave            - Leave group
GET    /api/groups/:id/members          - Get group members

POST   /api/reports                     - Report content
GET    /api/creators/me/analytics       - Get creator analytics dashboard
```

---

### 8. Development Timeline

**Month 25-26: Core Creator Platform**
- Creator profile system
- Post creation (text, images, basic files)
- File upload and storage (S3/R2 integration)
- Basic access control (free vs. paid posts)
- Purchase flow (coins → access)

**Month 27-28: Subscriptions & Groups**
- Subscription tier system
- Auto-renewal logic
- Group creation and management
- Group chat integration (leverage Phase 1 chat)
- Follower/following system

**Month 29: Discovery & Moderation**
- Search and discovery features
- Trending algorithms
- Content reporting system
- Automated moderation tools (PhotoDNA, malware scanning)
- Moderator dashboard (internal use)

**Month 30: Analytics & Polish**
- Creator analytics dashboard
- Revenue tracking
- Performance optimization
- File type support expansion (ensure ALL types work)
- Bug fixes and UX improvements
- Beta testing with select creators

---

### 9. Cost Breakdown

**Development:** $60,000-80,000
- 2 backend developers × 6 months × $5,000-6,000/month
- 1 frontend developer × 6 months × $5,000-6,000/month

**Design:** $10,000-15,000
- UI/UX for creator profiles, post creation, dashboards
- Design system updates
- Mobile responsiveness

**Infrastructure:**
- File storage (S3/R2): ~$500-2,000/month (scales with usage)
- CDN: ~$100-500/month
- Database scaling: ~$200-500/month
- Moderation tools (PhotoDNA API): ~$500/month

**Legal/Compliance:**
- DMCA agent registration: $6
- Terms of Service updates: $2,000-5,000
- Content policy drafting: $2,000-3,000

**Testing & QA:** $5,000-10,000
- Beta testing program
- Bug bounty (optional)
- Security audit for file uploads

**Total Phase 4 Cost:** $90,000-120,000

---

### 10. Success Metrics

**Creator Adoption:**
- 100+ active creators within 3 months
- 1,000+ active creators within 12 months
- 10% of platform users become creators

**Monetization:**
- Average creator earns 5,000+ coins/month (not yet cashable)
- 20% of creators earn 10,000+ coins/month
- Platform earns 15% commission on all transactions

**Engagement:**
- 50% of users follow at least 1 creator
- 20% of users purchase at least 1 post
- 10% of users subscribe to at least 1 creator tier
- Average 5 posts per creator per month

**Content Quality:**
- Less than 1% of content flagged for moderation
- Less than 0.1% DMCA takedown rate
- 4+ star average creator rating (if implemented)

---

### 11. Risks & Mitigations

**Risk 1: Low Creator Adoption**
- *Why:* Creators may not leave established platforms (Patreon, Gumroad)
- *Mitigation:* Lower fees (15% vs. Patreon's 12% but better features), onboarding incentives, aggressive outreach to small creators

**Risk 2: Piracy & Content Theft**
- *Why:* Users share paid content illegally
- *Mitigation:* Download limits, watermarking (for images/videos), DMCA enforcement, encrypted storage, signed URLs

**Risk 3: Storage Costs Explode**
- *Why:* Large files (5GB project files) = expensive storage
- *Mitigation:* Tiered upload limits, archive old content (cheaper storage class), charge creators for excessive storage

**Risk 4: Legal Liability**
- *Why:* Hosting user content = potential for illegal/harmful material
- *Mitigation:* Strong Terms of Service, automated moderation, human review team, DMCA compliance, safe harbor protections

**Risk 5: Competition**
- *Why:* Patreon, Gumroad, Ko-fi already established
- *Mitigation:* Unique integration (creator platform + Reddit + chat all in one), better features, lower fees, niche focus

---

### 12. Phase 4 vs. Phase 5 Distinction

**Phase 4 (This Phase):**
- Creators earn coins
- Coins stay in platform
- No cash out yet
- Lower regulatory burden
- Simpler accounting

**Phase 5 (Next Phase):**
- Coins convert to real money
- Stripe Connect integration
- 1099 tax forms
- Money transmitter licenses (potentially)
- Live streaming with tips/donations
- YouTube integration
- Much higher complexity

**Why Split?**
- Phase 4 proves the creator platform works BEFORE adding cash-out complexity
- Allows testing monetization models without legal/tax overhead
- Gives time to build creator base before enabling withdrawals
- Easier to iterate and fix issues when money is still "play money"

---

## Summary

Phase 4 is the **biggest transformation** of the platform. It goes from "Reddit integration tool" to "creator economy platform." This phase:

- Enables creators to upload ANY file type
- Provides Patreon-style subscription tiers
- Allows per-post paywalls
- Creates discovery and search systems
- Builds groups and communities
- Implements content moderation
- Tracks analytics and revenue

**Timeline:** 6 months
**Cost:** $90,000-120,000
**Outcome:** A full creator platform where creators earn coins (not yet cash)

**Next:** Phase 5 adds cash-out, live streaming, and YouTube integration.
