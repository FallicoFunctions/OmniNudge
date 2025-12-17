# Project Overview & Roadmap

**Project Name:** OmniNudge (working title)
**Project Type:** Universal Social Platform - Starting with Reddit Browser + Encrypted Chat
**Target Phase 1 Launch:** 12 months from start
**Development Approach:** Solo developer, part-time (~2 hours/day)

---

## Table of Contents

1. [Vision & Goals](#vision--goals)
2. [Core Value Proposition](#core-value-proposition)
3. [The New Strategy](#the-new-strategy)
4. [Six-Phase Roadmap](#six-phase-roadmap)
5. [Technology Stack](#technology-stack)
6. [Timeline Overview](#timeline-overview)
7. [Cost Estimates](#cost-estimates)
8. [Success Metrics](#success-metrics)
9. [Risk Mitigation](#risk-mitigation)

---

## Vision & Goals

### The Ultimate Vision

Build the **end-all-be-all of social media** - a single platform combining the best of YouTube, Facebook, Twitter, Instagram, Snapchat, Patreon, Reddit, LinkedIn, and more. A universal social platform where users can:
- Discover content and people
- Create and share media
- Connect privately with encryption
- Build communities
- Monetize their creativity
- Maintain anonymity or build professional identity

### The Problem You're Solving

**Current State:**
- Social media is fragmented across dozens of platforms
- Each platform has different strengths but significant weaknesses
- Users juggle multiple apps for different needs
- Reddit is great for discovery but weak for private communication
- No platform offers both anonymity AND professional networking
- Creator economy is scattered across multiple platforms

**Your Solution:**
A single platform that evolves to do it all, starting with a focused MVP that solves immediate needs.

### Core Principle

**Anonymity-first with optional professional identity**

Users start anonymous by default. They can choose to:
- Stay anonymous for casual browsing and chatting
- Create pseudonymous creator profiles
- Add professional/verified identity (optional, separate section)

This flexibility is a competitive advantage over platforms that force real identity.

---

## Core Value Proposition

### Phase 1 (MVP) - What Makes You Unique

**1. Reddit Browser + Social Layer**
- Browse Reddit posts using public API
- Create your own posts/comments on the platform
- Unified feed mixing Reddit content and platform content
- Find chat partners through posts and comments

**2. Encrypted Multimedia Chat**
- End-to-end encrypted messaging
- Real-time delivery via WebSocket
- Share images, videos, and media collections
- Personal slideshows (upload and share your photos/videos)

**3. Reddit Slideshow Feature**
- Browse Reddit media together in synchronized slideshow
- Both users see same content in real-time
- Chat remains active during viewing
- Perfect for discovering content together

**4. User Acquisition Without Marketing**
- Users find each other through platform posts
- Can still manually recruit from Reddit subreddits
- r/MakeNewFriendsHere, r/Needafriend, r/chat, etc.
- Post about your platform, users join organically

---

## The New Strategy

### What Changed

**Original Plan:**
- Reddit OAuth login
- Post directly to Reddit
- Reddit Chat API for messaging non-users
- Seamless Reddit integration

**Reality:**
- Reddit denied API access
- OAuth, posting, and Reddit Chat unavailable

**New Strategy:**
- Username/password authentication (email optional)
- Use Reddit's **public JSON API** (no approval needed)
- Build platform-native posts/comments system
- Create value as standalone social network
- Reddit becomes content source, not integration point

### What You Can Still Do

✅ **Browse Reddit posts** - Public API provides full access
✅ **View Reddit media** - Images, videos, all accessible
✅ **Reddit slideshow** - Browse media together while chatting
✅ **User discovery** - Through your platform's posts
✅ **All chat features** - E2E encryption, multimedia, everything works

❌ **Reddit OAuth** - Users register with username/password
❌ **Post to Reddit** - Users post on your platform instead
❌ **Reddit Chat** - No automated invitation system

### Why This Still Works

**Value Proposition Shifts:**

From: "Reddit-integrated chat platform"
To: "Social network with Reddit browsing + encrypted chat"

**User Acquisition:**
- Users still find each other (on your platform instead of Reddit)
- Can manually promote in Reddit subreddits
- Word of mouth from satisfied users
- Quality features keep users engaged

**Competitive Advantage:**
- Reddit browsing + chat together (unique feature)
- E2E encryption (privacy-focused)
- Multimedia slideshows (nobody else does this)
- Foundation for universal platform (long-term vision)

---

## Six-Phase Roadmap

### Phase 1: Reddit Browser + Chat (Year 1)

**Timeline:** 12 months
**Goal:** Launch MVP, validate concept, reach 100 active users

**Core Features:**
- Username/password authentication
- Browse Reddit posts (public API)
- Platform-native posts and comments
- User profiles
- E2E encrypted direct messaging
- Real-time chat (WebSocket)
- Image and video sharing
- Personal slideshows
- Reddit media slideshows
- Synchronized video playback
- User settings and preferences

**Tech Stack:**
- Backend: Go + Gin + PostgreSQL
- Frontend: React + TypeScript
- Encryption: Web Crypto API
- Hosting: Single VPS (~$20/month)

**Success Criteria:**
- Platform is stable and functional
- 100 active users
- Users spending 20+ min/day on platform
- Positive user feedback
- Costs under $50/month

---

### Phase 2: Content Creation Layer (Year 2)

**Goal:** Transform from chat app to social platform

**New Features:**
- Video uploads and hosting
- Image feeds (Instagram-style)
- Short-form video (TikTok-style)
- Stories (Snapchat-style)
- User profiles with followers
- Content discovery feed
- Search functionality
- Voice and video calling

**Monetization Foundation:**
- Tip jar (users can tip each other)
- Basic subscription system (optional)

**Target:** 1,000-10,000 active users

---

### Phase 3: Creator Economy (Year 3)

**Goal:** Enable creators to earn money

**New Features:**
- Patreon-like subscriptions
- Exclusive content for subscribers
- Ad revenue sharing
- Creator analytics
- Marketplace (digital goods, services)
- Badges and rewards system
- Leaderboards

**Revenue Model:**
- Platform takes 10-15% of creator earnings
- Premium features subscription
- Advertising (non-intrusive)

**Target:** 10,000-50,000 active users, break-even financially

---

### Phase 4: Communities & Live Features (Year 4)

**Goal:** Build community layer

**New Features:**
- Groups/Communities (Facebook/Discord-style)
- Forums (Reddit competitor for real)
- Live streaming (Twitch-style)
- Events and meetups
- Wikis and knowledge bases
- Moderation tools
- Community governance

**Target:** 50,000-200,000 active users

---

### Phase 5: Professional Network (Year 5)

**Goal:** Add professional layer (optional for users)

**New Features:**
- Professional profiles (separate from anonymous profiles)
- Portfolio hosting
- Job board
- Business pages
- B2B marketplace
- Verified identity system
- Professional networking features

**Note:** This is **opt-in** only. Users can remain fully anonymous.

**Target:** 200,000+ active users, sustainable profitable business

### Phase 6: Omni Email + Productivity Cloud (Year 6)

**Goal:** Make OmniNudge the primary communications and productivity hub users rely on daily.

**New Features:**
- **Native Omni email service** that issues `username@omninudge.com` mailboxes while the long-term hosting/provider decision remains open.
- **Bring-your-own email connectors** for Gmail, Outlook, custom IMAP/SMTP, etc. Users can both receive and send using any linked identity from a single composer.
- **Unified inbox with Outlook-style folders** plus color labels, favorites, pinning, and deep search across all connected accounts.
- **Unlimited custom rule engine** (filters, forwarding, auto-label, folder routing, reminders, snooze) so power users can automate every workflow.
- **Productivity suite of first-party editors** (documents, spreadsheets, slide decks, diagrams) with import/export for CSV, Excel, PowerPoint, Visio/Lucidchart, and enhanced embeds from Google Workspace or Microsoft 365 files.
- **Cross-platform integrations** so users can attach Google Drive, OneDrive, Dropbox, or other storage for seamless opening/saving beside native Omni files.
- **Collaboration fundamentals**: multi-user editing, inline comments, presence indicators, granular version history, and offline-first clients that resync safely once connectivity returns.

**Target:** Daily active users rely on OmniNudge email/productivity for personal and professional work, with at least 25% of total MAU linking an external email provider and 10% collaborating inside native editors every week.

---

## Technology Stack

### Backend (Current)

- **Language:** Go 1.21+
- **Framework:** Gin (HTTP) + Gorilla (WebSocket)
- **Database:** PostgreSQL 14+
- **Authentication:** JWT tokens
- **Password Hashing:** bcrypt
- **Architecture:** Monolithic (Phase 1-2), migrate to microservices in Phase 3

### Frontend (Planned)

- **Framework:** React 18+ with TypeScript
- **Build Tool:** Vite
- **State Management:** TanStack Query + Context API
- **Routing:** React Router
- **Styling:** Tailwind CSS
- **Encryption:** Web Crypto API
- **WebSocket:** Native WebSocket client

### Infrastructure

**Phase 1 (0-500 users):**
- Single VPS (DigitalOcean/Hetzner)
- PostgreSQL on same VPS
- Nginx reverse proxy
- Cost: ~$20-25/month

**Phase 2 (1,000-10,000 users):**
- Separate app servers + load balancer
- Managed PostgreSQL
- Redis for caching
- CDN for media (CloudFlare/AWS)
- Cost: ~$200-500/month

**Phase 3+ (10,000+ users):**
- Microservices architecture
- Multiple regions
- Database sharding
- Advanced caching layers
- Cost: ~$1,000-5,000/month

### Reddit Integration

- **Reddit Public API:** No authentication required
- **Endpoints Used:**
  - `/r/{subreddit}.json` - Browse posts
  - `/r/{subreddit}/comments/{post_id}.json` - Post details
  - `/user/{username}/about.json` - User info
- **Rate Limiting:** Respect Reddit's limits (60 requests/min recommended)
- **Caching:** Cache Reddit responses (5-15 min) to reduce API calls

---

## Timeline Overview

### Month 0: Planning & Setup (Complete)
✅ Environment setup
✅ Database setup
✅ Project structure
✅ Initial migrations
✅ Basic auth system

### Months 1-2: Core Backend
- Reddit public API integration
- Platform posts and comments system
- User authentication (username/password)
- Basic user profiles
- Settings management

### Months 3-4: Messaging System
- WebSocket server
- Message models and storage
- Real-time delivery
- E2E encryption setup
- Read receipts and typing indicators

### Months 5-6: Media Features
- Image and video upload
- Personal slideshow creation
- Slideshow controls (play, pause, next, previous)
- Media storage (S3/R2/CDN)

### Months 7-8: Reddit Features
- Reddit slideshow implementation
- Subreddit browsing UI
- Post detail views
- Synchronized playback

### Months 9-10: Frontend Polish
- Responsive design
- Mobile optimization
- PWA capabilities
- Theme system (dark/light)
- UI/UX refinement

### Months 11-12: Testing & Launch
- Security audit
- Performance optimization
- Bug fixes
- Beta testing
- Public launch

---

## Cost Estimates

### Phase 1 (First Year)

**Infrastructure:**
- VPS Hosting: $12-15/month
- Domain Name: $12/year ($1/month)
- Media Storage: $5-10/month
- SSL Certificate: Free (Let's Encrypt)

**Total: ~$20-30/month** (~$250-350/year)

**One-Time:**
- Development tools: $0 (all free/open-source)
- Initial setup: $0

### Phase 2 (Year 2)

**Infrastructure:**
- App Servers: $100-200/month
- Managed Database: $50-100/month
- Redis: $20-30/month
- CDN: $30-50/month
- Media Storage: $20-50/month

**Total: ~$250-500/month**

### Phase 3+ (Year 3+)

**Revenue-generating**, costs covered by:
- Creator transaction fees (10-15%)
- Premium subscriptions
- Advertising revenue

**Target:** Break-even by end of Year 3

---

## Success Metrics

### Phase 1 (MVP)

**User Metrics:**
- 100 registered users
- 50 daily active users
- 20+ minutes average session time
- 10+ messages sent per user per week
- 3+ Reddit slideshows created per user per week

**Technical Metrics:**
- <500ms message delivery time
- <2s page load time
- 99% uptime
- <50MB memory per user session

**Engagement Metrics:**
- 30% weekly retention rate
- 50% user sends at least one message per week
- 20% user creates at least one post per week

### Phase 2 (Growth)

- 1,000+ registered users
- 500+ daily active users
- 50+ pieces of content created per day
- 10% of users become content creators

### Phase 3 (Monetization)

- 10,000+ registered users
- Revenue > Costs
- 100+ paying creators
- $5,000+/month gross revenue

---

## Risk Mitigation

### Technical Risks

**Risk:** Reddit blocks public API access
**Mitigation:** Already using it, no auth required, minimal risk. Worst case: Remove Reddit features, focus on native platform.

**Risk:** Can't handle user growth
**Mitigation:** Start small, optimize early, scale horizontally as needed.

**Risk:** Security vulnerabilities
**Mitigation:** Regular security audits, follow best practices, E2E encryption limits server-side exposure.

### Business Risks

**Risk:** Can't acquire users without Reddit API
**Mitigation:** Focus on quality features, word of mouth, manual promotion in subreddits, social media marketing.

**Risk:** Costs spiral out of control
**Mitigation:** Start with minimal infrastructure, scale based on revenue, keep Phase 1 costs under $50/month.

**Risk:** Users don't see value
**Mitigation:** MVP validation phase, listen to feedback, pivot features if needed, unique features (slideshows) as differentiator.

### Competition Risks

**Risk:** Discord/Telegram already dominate chat
**Mitigation:** Focus on unique features (Reddit browsing, synchronized slideshows), target different use case (discovery + chat).

**Risk:** Reddit adds similar features
**Mitigation:** You're not competing with Reddit, you're complementary. If they add features, it validates the concept.

---

## Development Philosophy

### Principles

1. **Ship fast, iterate faster**
   - Get MVP out in 12 months
   - Validate assumptions early
   - Don't over-engineer

2. **User feedback drives decisions**
   - Listen to actual users
   - Data over opinions
   - Be willing to pivot

3. **Quality over quantity**
   - 100 happy users > 1,000 unhappy users
   - Stable, fast, secure from day one
   - Polish core features before adding new ones

4. **Sustainable pace**
   - Part-time development is fine
   - Avoid burnout
   - Consistent progress > sprints

5. **Privacy first**
   - E2E encryption non-negotiable
   - Minimal data collection
   - User controls over their data

### Technical Decisions

- **Go backend:** Fast, efficient, single binary deployment
- **React frontend:** Mature ecosystem, component reusability
- **PostgreSQL:** Reliable, flexible, great for relational data
- **JWT auth:** Stateless, scalable, simple to implement
- **Monolithic start:** Simpler to develop and deploy initially

---

## How to Use This Roadmap

### For Development

1. Follow the monthly timeline in Phase 1
2. Build features in order (each builds on previous)
3. Commit regularly with clear messages
4. Test thoroughly before moving to next feature
5. Document as you go

### For Planning

1. Review this overview document regularly
2. Adjust timeline based on actual progress
3. Re-evaluate assumptions after each milestone
4. Keep costs documented
5. Track metrics from day one

### For Future Reference

This document is the **north star**. When you're lost in implementation details, come back here to remember:
- Why you're building this
- What the ultimate vision is
- What phase you're in
- What success looks like

---

## Next Steps

1. ✅ Complete backend foundation (done)
2. 📍 **You are here:** Planning complete, ready to build
3. ⏭️ Next: Implement Reddit public API integration
4. ⏭️ Then: Platform posts and comments system
5. ⏭️ Then: Messaging system

**Let's build something amazing.**

---

**Document Version:** 2.0 (Updated after Reddit API strategy pivot)
**Last Updated:** November 2025
**Status:** Active Development
