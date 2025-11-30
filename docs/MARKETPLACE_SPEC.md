# Theme Marketplace Specification

Complete specification for OmniNudge's theme marketplace, including economics, moderation, discovery, and technical implementation.

**Last Updated:** 2025-11-29
**For Phase:** 3
**Status:** Planning / Specification

---

## Table of Contents

1. [Overview](#overview)
2. [User Stories](#user-stories)
3. [Economic Model](#economic-model)
4. [Theme Submission](#theme-submission)
5. [Moderation & Review](#moderation--review)
6. [Discovery & Search](#discovery--search)
7. [Installation & Management](#installation--management)
8. [Creator Dashboard](#creator-dashboard)
9. [Payment Processing](#payment-processing)
10. [Database Schema](#database-schema)
11. [API Endpoints](#api-endpoints)
12. [Frontend Components](#frontend-components)
13. [Future Expansions](#future-expansions)

---

## Overview

The OmniNudge Theme Marketplace is a platform where users can:
- **Discover** themes created by the community
- **Install** themes with one click
- **Rate and review** themes
- **Create and publish** their own themes
- **Earn money** from theme sales (creators)
- **Curate collections** of favorite themes

### Goals

1. **Empower Creators:** Give users tools to monetize their design skills
2. **Drive Customization:** Increase platform engagement through personalization
3. **Build Community:** Foster a creative community around theme design
4. **Revenue Stream:** Generate platform revenue through transaction fees
5. **Quality Content:** Maintain high-quality themes through curation

### Key Metrics

- Total themes published
- Monthly active theme creators
- Theme installation rate
- Average theme rating
- Creator earnings
- Platform revenue from fees

---

## User Stories

### As a Theme Browser

- I want to **browse trending themes** so I can find popular themes
- I want to **search themes by keyword** so I can find specific styles
- I want to **filter themes by category** so I can narrow my search
- I want to **preview themes before installing** so I know what I'm getting
- I want to **see theme ratings and reviews** so I can assess quality
- I want to **install a theme with one click** so it's easy

### As a Theme Creator

- I want to **publish my theme to the marketplace** so others can use it
- I want to **set a price for my theme** so I can earn money
- I want to **see download statistics** so I know how popular my theme is
- I want to **earn 70% of sales** so I'm fairly compensated
- I want to **update my theme after publishing** so I can fix bugs
- I want to **respond to reviews** so I can engage with users
- I want to **track my earnings** so I know how much I've made

### As a Platform Administrator

- I want to **review themes before approval** so malicious themes don't get published
- I want to **remove themes that violate policies** so the marketplace stays safe
- I want to **feature high-quality themes** so users see the best content
- I want to **monitor marketplace health** so I can spot issues early
- I want to **payout creators monthly** so they receive their earnings

---

## Economic Model

### Pricing Tiers

Creators can choose from predefined pricing tiers or make themes free:

| Tier | Price (Credits) | USD Equivalent | Use Case |
|------|----------------|----------------|----------|
| Free | 0 | $0.00 | Community themes, showcases |
| Basic | 100 | $1.00 | Simple color schemes |
| Standard | 250 | $2.50 | Custom CSS themes |
| Premium | 500 | $5.00 | Complex themes with animations |
| Deluxe | 1000 | $10.00 | Multi-page themes, professional work |
| Ultimate | 2500 | $25.00 | Complete visual overhauls |

**Custom Pricing:** Creators can set custom prices between 50-5000 credits.

### Revenue Split

| Party | Percentage | Example (500 credits) |
|-------|-----------|----------------------|
| **Creator** | 70% | 350 credits ($3.50) |
| **Platform** | 30% | 150 credits ($1.50) |

**Why 70/30?**
- Industry standard (Apple App Store, Steam)
- Covers payment processing, hosting, support
- Fair to creators while sustaining platform
- Competitive with other marketplaces

### In-Site Currency: Credits

**What are Credits?**
- Virtual currency used on OmniNudge
- 100 credits = $1.00 USD
- Used for themes, future marketplace items (plugins, media, etc.)

**Purchasing Credits:**
| Package | Credits | Price | Bonus |
|---------|---------|-------|-------|
| Starter | 500 | $5.00 | - |
| Basic | 1,000 | $9.00 | 10% bonus |
| Standard | 2,500 | $20.00 | 25% bonus |
| Premium | 5,000 | $35.00 | 43% bonus |
| Ultimate | 10,000 | $60.00 | 67% bonus |

**Earning Credits:**
- Selling themes
- Referral bonuses (future)
- Platform rewards (future)
- Promotional giveaways

**Withdrawal:**
- Minimum: 2,500 credits ($25)
- Fee: 5% processing fee
- Methods: PayPal, Stripe, bank transfer
- Processing time: 5-7 business days

### Refund Policy

**User Refunds:**
- 7-day money-back guarantee on all themes
- No questions asked for first refund
- Second refund requires reason
- Three or more refunds flagged for review

**Creator Impact:**
- Refunded credits returned to buyer
- Creator loses 100% of sale
- High refund rate (>10%) triggers review
- Fraudulent themes result in account suspension

---

## Theme Submission

### Submission Requirements

**Basic Information:**
- Theme name (3-50 characters)
- Short description (10-200 characters)
- Long description (50-2000 characters, Markdown supported)
- Category (dropdown)
- Tags (max 10)

**Visual Assets:**
- Thumbnail (required, 800x600px, max 500KB)
- Screenshots (3-6 required, 1920x1080px, max 1MB each)
- Preview video (optional, max 30 seconds, max 10MB)

**Theme Files:**
- CSS file (max 100KB)
- CSS variables JSON (auto-generated from CSS)
- License selection (MIT, CC BY, All Rights Reserved)

**Pricing:**
- Free or select pricing tier
- Custom price (50-5000 credits)

**Legal:**
- [ ] I own the rights to this theme
- [ ] This theme does not violate copyright
- [ ] This theme follows community guidelines
- [ ] I agree to the Creator Terms of Service

### Submission Flow

```
1. Create Theme in Editor
   ↓
2. Click "Publish to Marketplace"
   ↓
3. Fill out submission form
   ↓
4. Upload screenshots
   ↓
5. Set pricing
   ↓
6. Review and submit
   ↓
7. Automated checks run
   ↓
8. Manual review (24-48 hours)
   ↓
9. Approved → Published
   OR
   Rejected → Feedback sent
```

### Automated Checks

Before manual review, themes automatically checked for:

**Technical:**
- [ ] CSS sanitization passed
- [ ] File size under 100KB
- [ ] Valid CSS syntax
- [ ] All required fields filled
- [ ] Screenshots meet specifications

**Content:**
- [ ] No profanity in name/description
- [ ] No spam keywords
- [ ] No external links in description (except portfolio)
- [ ] No duplicate submissions

**Pass rate:** ~95% of submissions pass automated checks

---

## Moderation & Review

### Review Process

**Phase 1: Automated Checks** (instant)
- Technical validation
- Content filtering
- Duplicate detection

**Phase 2: Manual Review** (24-48 hours)
- Visual inspection
- Functionality testing
- Policy compliance check
- Quality assessment

**Phase 3: Approval or Rejection**
- Approved: Theme goes live
- Rejected: Feedback sent to creator
- Revision Needed: Creator can resubmit

### Reviewer Checklist

**Visual Quality:**
- [ ] Screenshots accurately represent theme
- [ ] Theme works on all pages (feed, profile, messages)
- [ ] No layout breaking issues
- [ ] Readable text (meets contrast ratios)
- [ ] Professional appearance

**Functionality:**
- [ ] All components styled consistently
- [ ] Hover states work
- [ ] Animations perform well
- [ ] Mobile-responsive (if applicable)

**Safety:**
- [ ] No misleading UI elements (fake admin panels, security warnings)
- [ ] No attempts to bypass sanitization
- [ ] No malicious code patterns
- [ ] No social engineering tactics

**Policy Compliance:**
- [ ] No copyright infringement
- [ ] No NSFW content (if not marked)
- [ ] No political/religious symbols (unless disclosed)
- [ ] Follows naming conventions
- [ ] Appropriate pricing for quality

### Rejection Reasons

Common reasons for rejection:

1. **Low Quality** (30%)
   - Broken layout
   - Inconsistent styling
   - Poor color choices
   - Unreadable text

2. **Policy Violation** (25%)
   - Copyright infringement
   - Misleading screenshots
   - NSFW content not marked
   - Spam submission

3. **Technical Issues** (20%)
   - CSS doesn't validate
   - Breaks core functionality
   - Performance issues
   - Browser compatibility issues

4. **Duplicate Content** (15%)
   - Exact copy of existing theme
   - Minor variation of existing theme
   - Resubmission without changes

5. **Other** (10%)
   - Inappropriate name
   - Missing required information
   - Pricing issues

**Resubmission:** Creators can fix issues and resubmit. No limit on resubmissions.

### Post-Publication Moderation

**User Reports:**
- "Report Theme" button on theme page
- Reasons: malicious, broken, copyright, spam, NSFW
- 3+ reports trigger review
- 10+ reports auto-suspend theme pending review

**Automatic Removal Triggers:**
- Average rating < 2.0 stars (10+ ratings)
- Refund rate > 25% (10+ sales)
- Creator account suspended
- Copyright DMCA claim

**Appeals Process:**
- Creators can appeal rejections/removals
- Email support with additional information
- Review by senior moderator
- Response within 5 business days

---

## Discovery & Search

### Homepage Sections

**Featured Themes** (curated by staff)
- 3-6 high-quality themes
- Rotates weekly
- Creators notified if featured
- Drives 40% of marketplace traffic

**Trending Themes** (algorithmic)
- Based on installs, ratings, recency
- Updates hourly
- Top 20 themes displayed
- Formula: `(installs * 0.4) + (avg_rating * 20) + (recency_score * 0.4)`

**New Releases**
- Themes published in last 30 days
- Sorted by publish date (newest first)
- Gives new creators visibility

**Top Rated**
- Highest average rating
- Minimum 10 ratings required
- Updated daily

**Most Popular**
- Most installs all-time
- Updated daily
- Hall of fame for creators

**Categories**
- Dark Themes
- Light Themes
- Colorful Themes
- Minimalist Themes
- Vintage/Retro Themes
- Gradient Themes
- Monochrome Themes
- Seasonal Themes
- Accessibility Themes

### Search Functionality

**Search Query:** `cyberpunk dark purple`

**Search Algorithm:**
1. **Keyword Matching:**
   - Theme name (weight: 3x)
   - Description (weight: 2x)
   - Tags (weight: 1.5x)
   - Category (weight: 1x)

2. **Relevance Scoring:**
   - Exact match > partial match > fuzzy match
   - Multiple keyword matches boost score
   - Recency bonus (published in last 30 days)

3. **Filtering:**
   - By category
   - By price range
   - By rating (3+ stars, 4+ stars, 5 stars)
   - Free only
   - New releases (last 30 days)

4. **Sorting:**
   - Relevance (default)
   - Newest first
   - Price: Low to High
   - Price: High to Low
   - Rating: High to Low
   - Most Popular

### Personalization

**For Logged-In Users:**
- **Recommended For You** - Based on installed themes and browsing history
- **Similar Themes** - On theme detail pages
- **Creator You Follow** - If creator following is implemented
- **Recently Viewed** - Last 10 themes viewed

**Algorithm:**
- Collaborative filtering (users with similar installs)
- Content-based (similar color palettes, categories)
- Popularity boost for cold start users

---

## Installation & Management

### One-Click Installation

**User Flow:**
1. Browse marketplace
2. Click theme card for details
3. Click "Preview Theme" (opens preview modal)
4. Click "Install Theme" button
5. Confirm purchase (if paid)
6. Theme instantly applied
7. Notification: "Theme installed successfully!"

**Technical Flow:**
```
1. User clicks "Install"
   ↓
2. Frontend: Check if user has enough credits (if paid)
   ↓
3. Frontend: Send POST /api/v1/marketplace/themes/:id/install
   ↓
4. Backend: Validate user authentication
   ↓
5. Backend: Check credits balance
   ↓
6. Backend: Deduct credits from buyer
   ↓
7. Backend: Credit seller (70%)
   ↓
8. Backend: Create transaction record
   ↓
9. Backend: Copy theme to user's installed themes
   ↓
10. Backend: Set as active theme
   ↓
11. Frontend: Reload page with new theme
   ↓
12. Success!
```

### My Themes

**Installed Themes Tab:**
- All themes user has installed (free + purchased)
- Grid view with thumbnails
- Active theme highlighted
- Quick switch between themes
- Uninstall button
- Update available indicator

**My Creations Tab:**
- All themes user has published
- Edit, update, unpublish options
- View statistics (installs, revenue, ratings)
- Respond to reviews

**Purchased Themes Tab:**
- Themes user paid for
- Download receipt
- Request refund (if eligible)

### Theme Updates

**Creator Updates Theme:**
1. Creator edits published theme
2. Clicks "Update Theme"
3. Users who installed see "Update Available" badge
4. Users can view changelog
5. Click "Update" to apply changes

**Auto-Update Option:**
- Users can enable auto-updates for themes
- Theme updates automatically when creator publishes
- Notification sent after update

---

## Creator Dashboard

### Overview Page

**Key Metrics:**
- Total installs
- Total earnings (credits)
- Average rating
- Active themes (published and live)

**Charts:**
- Installs over time (last 30 days)
- Revenue over time
- Ratings distribution

**Recent Activity:**
- New reviews
- New installs
- Earnings transactions

### My Themes

**Theme List:**
Each theme card shows:
- Thumbnail
- Name
- Status (published, pending review, rejected)
- Installs count
- Rating (avg stars + count)
- Revenue
- Last updated date

**Actions:**
- Edit theme
- Update theme
- View analytics
- Unpublish
- Delete (if no installs)

### Analytics (Per Theme)

**Installation Stats:**
- Total installs
- Installs this week/month
- Install trend chart
- Geographic distribution (if available)

**Revenue Stats:**
- Total earnings (credits)
- Earnings this week/month
- Revenue trend chart
- Average sale price

**Rating & Reviews:**
- Average rating
- Rating distribution (5★, 4★, 3★, 2★, 1★)
- Recent reviews
- Respond to reviews

**Refund Rate:**
- Total refunds
- Refund percentage
- Reasons for refunds (if provided)

### Earnings

**Balance:**
- Available credits
- Pending credits (from recent sales, 7-day hold)
- Total lifetime earnings

**Withdrawal:**
- Minimum: 2,500 credits ($25)
- Request payout button
- Payout history

**Transaction History:**
- Date, theme, buyer, amount, status
- Filter by theme, date range
- Export to CSV

---

## Payment Processing

### Credit Purchase

**Supported Payment Methods:**
- Credit/Debit Cards (Stripe)
- PayPal
- Apple Pay (mobile)
- Google Pay (mobile)

**Purchase Flow:**
1. User clicks "Buy Credits"
2. Select package
3. Enter payment information
4. Confirm purchase
5. Credits added to account instantly
6. Email receipt sent

**Security:**
- PCI DSS compliant (via Stripe)
- No credit card data stored on our servers
- SSL/TLS encryption
- 3D Secure authentication for high-value transactions

### Creator Payouts

**Payout Schedule:**
- Monthly payouts on the 1st
- Minimum balance: 2,500 credits ($25)
- 7-day hold on new earnings (fraud prevention)

**Payout Methods:**
- PayPal (preferred, instant transfer)
- Bank transfer (ACH/SEPA, 3-5 business days)
- Stripe Connect (future)

**Tax Reporting:**
- Form 1099-K for US creators earning $600+/year
- VAT compliance for EU creators
- Creators responsible for their own taxes

**Payout Flow:**
```
1. 1st of month: Payout batch job runs
   ↓
2. For each creator with balance ≥ 2,500 credits:
   ↓
3. Calculate net earnings (credits - refunds - holds)
   ↓
4. Convert credits to USD (balance / 100)
   ↓
5. Deduct 5% processing fee
   ↓
6. Initiate payment via chosen method
   ↓
7. Send payout notification email
   ↓
8. Update creator balance
   ↓
9. Record transaction
```

---

## Database Schema

### marketplace_items

Stores all marketplace listings (themes, future: plugins, media, etc.)

```sql
CREATE TABLE marketplace_items (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type VARCHAR(50) NOT NULL DEFAULT 'theme', -- 'theme', 'plugin', 'widget', etc.

    -- Basic Info
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE, -- URL-friendly name
    short_description VARCHAR(200),
    long_description TEXT,

    -- Content
    css_content TEXT, -- For themes
    css_variables JSONB, -- Extracted CSS variables

    -- Media
    thumbnail_url VARCHAR(500),
    screenshot_urls TEXT[], -- Array of URLs
    preview_video_url VARCHAR(500),

    -- Categorization
    category VARCHAR(50),
    tags TEXT[], -- Array of tags

    -- Pricing
    price_credits INTEGER NOT NULL DEFAULT 0, -- 0 = free

    -- Stats
    install_count INTEGER NOT NULL DEFAULT 0,
    active_install_count INTEGER NOT NULL DEFAULT 0, -- Currently active
    view_count INTEGER NOT NULL DEFAULT 0,

    -- Ratings
    average_rating DECIMAL(3,2) DEFAULT 0, -- 0.00 to 5.00
    rating_count INTEGER NOT NULL DEFAULT 0,

    -- Moderation
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected, suspended
    rejection_reason TEXT,
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,

    -- Publishing
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMP,
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    featured_at TIMESTAMP,

    -- Versioning
    version VARCHAR(20) DEFAULT '1.0.0',
    changelog TEXT,

    -- Legal
    license VARCHAR(50) DEFAULT 'All Rights Reserved',

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Indexes
    INDEX idx_creator (creator_id),
    INDEX idx_status (status),
    INDEX idx_category (category),
    INDEX idx_published (is_published, published_at),
    INDEX idx_featured (featured, featured_at),
    INDEX idx_rating (average_rating DESC, rating_count DESC),
    INDEX idx_installs (install_count DESC),
    FULLTEXT INDEX idx_search (name, short_description, long_description, tags)
);
```

### user_installed_items

Tracks which users have installed which marketplace items

```sql
CREATE TABLE user_installed_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,

    -- Purchase Info
    purchased_at TIMESTAMP NOT NULL DEFAULT NOW(),
    price_paid INTEGER NOT NULL, -- Credits paid (0 if free)

    -- Installation
    is_active BOOLEAN NOT NULL DEFAULT TRUE, -- Currently using this theme
    installed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP,

    -- Updates
    installed_version VARCHAR(20),
    update_available BOOLEAN NOT NULL DEFAULT FALSE,
    auto_update_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    -- Engagement
    rating INTEGER, -- 1-5 stars (NULL if not rated)
    review TEXT,
    reviewed_at TIMESTAMP,

    UNIQUE(user_id, item_id),
    INDEX idx_user (user_id),
    INDEX idx_item (item_id),
    INDEX idx_active (user_id, is_active)
);
```

### marketplace_transactions

Records all marketplace financial transactions

```sql
CREATE TABLE marketplace_transactions (
    id SERIAL PRIMARY KEY,

    -- Parties
    buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    item_id INTEGER NOT NULL REFERENCES marketplace_items(id) ON DELETE SET NULL,

    -- Transaction Details
    transaction_type VARCHAR(20) NOT NULL, -- 'purchase', 'refund', 'payout'
    credits_amount INTEGER NOT NULL, -- Total credits
    platform_fee INTEGER NOT NULL, -- Platform's cut
    creator_earnings INTEGER NOT NULL, -- Creator's cut

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'completed', -- completed, pending, failed, refunded

    -- Metadata
    payment_method VARCHAR(50), -- 'credits', 'card', 'paypal'
    refund_reason TEXT,
    refunded_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    INDEX idx_buyer (buyer_id),
    INDEX idx_seller (seller_id),
    INDEX idx_item (item_id),
    INDEX idx_created (created_at DESC)
);
```

### marketplace_reports

User reports on marketplace items

```sql
CREATE TABLE marketplace_reports (
    id SERIAL PRIMARY KEY,

    -- Report Details
    item_id INTEGER NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,

    reason VARCHAR(50) NOT NULL, -- 'malicious', 'broken', 'copyright', 'spam', 'nsfw'
    details TEXT,

    -- Moderation
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, reviewed, resolved, dismissed
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    resolution_notes TEXT,

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    INDEX idx_item (item_id),
    INDEX idx_status (status),
    INDEX idx_created (created_at DESC)
);
```

### credit_balances

User credit balances and transactions

```sql
CREATE TABLE credit_balances (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    balance INTEGER NOT NULL DEFAULT 0,
    pending_balance INTEGER NOT NULL DEFAULT 0, -- Credits on hold
    lifetime_earned INTEGER NOT NULL DEFAULT 0,
    lifetime_spent INTEGER NOT NULL DEFAULT 0,

    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE credit_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    transaction_type VARCHAR(20) NOT  NULL, -- 'purchase', 'sale', 'refund', 'payout', 'bonus'
    amount INTEGER NOT NULL, -- Positive = credit, Negative = debit

    balance_after INTEGER NOT NULL,

    description TEXT,
    metadata JSONB, -- Related IDs, payment info, etc.

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    INDEX idx_user (user_id),
    INDEX idx_created (created_at DESC)
);
```

---

## API Endpoints

### Marketplace Browsing

```
GET /api/v1/marketplace/themes
```
**Description:** Browse marketplace themes
**Query Params:**
- `category`: Filter by category
- `sort`: `trending`, `new`, `top-rated`, `most-popular`, `price-low`, `price-high`
- `min_price`: Minimum price (credits)
- `max_price`: Maximum price
- `min_rating`: Minimum rating (1-5)
- `free_only`: Boolean
- `limit`: Results per page (default: 20)
- `offset`: Pagination offset

**Response:**
```json
{
  "themes": [
    {
      "id": 123,
      "name": "Midnight Purple",
      "slug": "midnight-purple",
      "creator": {
        "id": 45,
        "username": "designer_pro",
        "avatar_url": "..."
      },
      "short_description": "Dark theme with purple accents",
      "thumbnail_url": "...",
      "price_credits": 250,
      "average_rating": 4.7,
      "rating_count": 142,
      "install_count": 1523,
      "category": "dark",
      "tags": ["dark", "purple", "modern"],
      "published_at": "2025-11-15T10:00:00Z"
    }
  ],
  "total": 456,
  "limit": 20,
  "offset": 0
}
```

---

```
GET /api/v1/marketplace/themes/:id
```
**Description:** Get theme details
**Response:**
```json
{
  "id": 123,
  "name": "Midnight Purple",
  "slug": "midnight-purple",
  "creator": {
    "id": 45,
    "username": "designer_pro",
    "avatar_url": "...",
    "total_themes": 12,
    "total_installs": 15234
  },
  "short_description": "Dark theme with purple accents",
  "long_description": "A beautiful dark theme...",
  "thumbnail_url": "...",
  "screenshot_urls": ["...", "...", "..."],
  "preview_video_url": "...",
  "price_credits": 250,
  "average_rating": 4.7,
  "rating_count": 142,
  "install_count": 1523,
  "active_install_count": 892,
  "category": "dark",
  "tags": ["dark", "purple", "modern"],
  "version": "1.2.0",
  "changelog": "Added support for new message bubbles",
  "license": "CC BY 4.0",
  "published_at": "2025-11-15T10:00:00Z",
  "updated_at": "2025-11-20T14:30:00Z",
  "user_has_installed": true,
  "user_rating": 5
}
```

---

```
GET /api/v1/marketplace/themes/search
```
**Description:** Search themes
**Query Params:**
- `q`: Search query (required)
- `category`, `sort`, `min_price`, etc. (same as browse)

**Response:** Same as browse endpoint

---

### Installation & Management

```
POST /api/v1/marketplace/themes/:id/install
```
**Description:** Install a theme
**Auth:** Required
**Request Body:**
```json
{
  "set_as_active": true
}
```
**Response:**
```json
{
  "success": true,
  "message": "Theme installed successfully",
  "credits_spent": 250,
  "new_balance": 750,
  "installed_item_id": 567
}
```
**Errors:**
- 400: Already installed
- 402: Insufficient credits
- 404: Theme not found

---

```
DELETE /api/v1/marketplace/themes/:id/uninstall
```
**Description:** Uninstall a theme (no refund unless within 7 days)
**Auth:** Required
**Response:**
```json
{
  "success": true,
  "refund_issued": false
}
```

---

```
POST /api/v1/marketplace/themes/:id/refund
```
**Description:** Request refund (within 7 days of purchase)
**Auth:** Required
**Request Body:**
```json
{
  "reason": "optional text"
}
```
**Response:**
```json
{
  "success": true,
  "credits_refunded": 250,
  "new_balance": 1000
}
```

---

### Theme Creation & Publishing

```
POST /api/v1/marketplace/themes
```
**Description:** Submit new theme to marketplace
**Auth:** Required
**Request Body:**
```json
{
  "name": "Midnight Purple",
  "short_description": "Dark theme with purple accents",
  "long_description": "A beautiful dark theme...",
  "category": "dark",
  "tags": ["dark", "purple", "modern"],
  "price_credits": 250,
  "css_content": "/* CSS here */",
  "thumbnail_url": "...",
  "screenshot_urls": ["...", "..."],
  "license": "CC BY 4.0"
}
```
**Response:**
```json
{
  "id": 123,
  "status": "pending",
  "message": "Theme submitted for review"
}
```

---

```
PUT /api/v1/marketplace/themes/:id
```
**Description:** Update published theme
**Auth:** Required (creator only)
**Request Body:** Same as create
**Response:**
```json
{
  "success": true,
  "message": "Theme updated successfully",
  "notify_users": 892
}
```

---

### Ratings & Reviews

```
POST /api/v1/marketplace/themes/:id/rate
```
**Description:** Rate and review a theme
**Auth:** Required (must have installed)
**Request Body:**
```json
{
  "rating": 5,
  "review": "Amazing theme! Love the purple colors."
}
```

---

```
GET /api/v1/marketplace/themes/:id/reviews
```
**Description:** Get reviews for a theme
**Query Params:**
- `sort`: `recent`, `helpful`, `rating-high`, `rating-low`
- `limit`, `offset`

---

### Creator Dashboard

```
GET /api/v1/marketplace/my-themes
```
**Description:** Get current user's published themes
**Auth:** Required

---

```
GET /api/v1/marketplace/my-themes/:id/analytics
```
**Description:** Get analytics for a specific theme
**Auth:** Required (creator only)
**Response:**
```json
{
  "total_installs": 1523,
  "total_revenue": 35250,
  "average_rating": 4.7,
  "installs_this_week": 42,
  "revenue_this_week": 950,
  "refund_rate": 0.03,
  "install_chart": [...],
  "revenue_chart": [...],
  "rating_distribution": {
    "5": 98,
    "4": 32,
    "3": 8,
    "2": 3,
    "1": 1
  }
}
```

---

### Credits & Payments

```
GET /api/v1/credits/balance
```
**Description:** Get current user's credit balance
**Auth:** Required

---

```
POST /api/v1/credits/purchase
```
**Description:** Purchase credits
**Auth:** Required
**Request Body:**
```json
{
  "package": "standard",
  "payment_method": "stripe",
  "payment_token": "tok_..."
}
```

---

```
POST /api/v1/credits/request-payout
```
**Description:** Request creator payout
**Auth:** Required
**Request Body:**
```json
{
  "amount": 5000,
  "payout_method": "paypal",
  "paypal_email": "creator@example.com"
}
```

---

## Frontend Components

### ThemeCard Component

```typescript
interface ThemeCardProps {
  theme: MarketplaceTheme;
  onInstall: (themeId: number) => void;
  onPreview: (themeId: number) => void;
}

// Displays:
// - Thumbnail
// - Name
// - Creator
// - Rating + install count
// - Price
// - Install/Preview buttons
```

### ThemeDetailModal Component

```typescript
// Full-screen modal showing:
// - Large screenshots
// - Full description
// - Creator info
// - Reviews
// - "Install" CTA button
```

### ThemePreview Component

```typescript
// Live preview of theme applied to current page
// Allows users to see theme before installing
// "Install" and "Cancel" buttons
```

### CreatorDashboard Component

```typescript
// Multi-tab dashboard:
// - Overview (metrics, charts)
// - My Themes (list with stats)
// - Analytics (per-theme deep dive)
// - Earnings (balance, payout, history)
```

---

## Future Expansions

### Phase 4+

**Marketplace Items:**
- Plugins (JavaScript widgets, Phase 4)
- Profile backgrounds
- Cursor themes
- Sound packs
- Emoji packs
- Sticker packs

**Social Features:**
- Follow favorite creators
- Creator profiles
- Theme collections (curated by users)
- "Staff Picks" editorial content
- Theme contests with prizes

**Creator Tools:**
- Theme editor with live preview
- Color palette generator
- Template marketplace (starter themes)
- A/B testing for themes
- Analytics API

**Monetization:**
- Subscriptions (monthly themes)
- Theme bundles
- Exclusive themes for premium members
- Sponsored themes

---

**This specification provides a complete blueprint for implementing the OmniNudge Theme Marketplace in Phase 3 and beyond.**

**Last Updated:** 2025-11-29
**Version:** 1.0
**Status:** Planning
