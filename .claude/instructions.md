# OmniNudge Development Instructions

## General Development Principles

- Ask clarifying questions whenever requirements are uncertain, complex, or long, otherwise act immediately.
- **Favor efficient, scalable solutions that provide the best user experience.**
- **All code must be written with maximum efficiency and scalability in mind.**
- **User experience is paramount - optimize for speed, responsiveness, and reliability.**
- Prefer the simplest approach that satisfies the goal; escalate to more complex logic only when it's the best option.
- Avoid stopgap versions; implement the full solution upfront unless we explicitly agree on a phased approach.
- Flag anything you believe is incorrect; after we discuss it, follow my final decision exactly.
- Prioritize doing things right the first time rather than shipping a somewhat working version and finishing it later.
- Suggest better solutions if what I ask for is not the most scalable or efficient solution.
- Disregard complexity to implement.
- Avoid redundent code where possible--create and use centralized methods where logic can be reusable

## Core Requirements - CRITICAL

### Efficiency & Scalability
**Every piece of code must be optimized for efficiency, scalability, and user experience.**

- **Think at scale**: Always consider how code will perform with:
  - 100+ subscriptions instead of 5
  - 1000+ saved items instead of 10
  - 100+ concurrent conversations instead of 5
  - 10,000+ users instead of 10

- **Optimize for real-world usage**:
  - Users will have large datasets (hundreds of subscriptions, thousands of saved posts)
  - Operations that work for 10 items may be unusable for 100+ items
  - Sequential operations create exponentially worse UX as data scales
  - Always benchmark mentally: "What if this number was 100x larger?"

- **User experience first**:
  - Fast load times are critical (aim for <2 seconds for any operation)
  - Avoid blocking the UI thread
  - Show loading states immediately
  - Provide instant feedback for user actions
  - Gracefully handle errors without crashing

- **Technical efficiency**:
  - Use concurrent operations wherever possible (see Performance Requirements)
  - Implement proper caching and memoization
  - Minimize database queries (batch when possible)
  - Avoid N+1 query patterns
  - Use database indexes appropriately
  - Implement pagination for large datasets

## Server Management

- **Default: NEVER start background servers** - Let the user run their own server so they can see output in real-time
- After making code changes:
  1. Tell the user you've made the changes
  2. Instruct them to restart their server
  3. Wait for them to test and report results
- **Exception 1**: You may start a server temporarily to test something yourself, but you MUST:
  1. Kill it immediately after testing
  2. Tell the user to restart their own server
- **Exception 2**: Only if user explicitly requests you to run the server for them

## Production Deployment - CRITICAL

- **NEVER deploy to production** - The user will ALWAYS handle production deployments themselves
- **NEVER run deployment scripts** (deploy-on, safe-deploy.sh, etc.) - Only the user runs these
- **NEVER modify the production .env file** - The user manages production environment variables manually
- After making code changes:
  1. Build and test locally if needed
  2. Tell the user the changes are ready
  3. Let the user deploy when they're ready
- **Production .env protection**:
  - The deployment script excludes `.env` to prevent overwriting production credentials
  - Production `.env` file location: `/var/www/omninudge/backend/.env`
  - The user manually manages production environment variables
  - Never suggest or attempt to sync local .env to production

## Project Context

### Architecture
- **Backend**: Go with PostgreSQL
- **Frontend**: React + TypeScript + TanStack Query
- **Reddit Integration**: Reddit posts fetched via Cloudflare Worker proxy (paginated, 25 per page)
- **Omni Posts**: Local platform posts stored in database (backend returns max 25 posts)

### Reddit API Integration
- **Reddit Proxy**: Uses Cloudflare Worker to bypass Reddit API rate limits
  - Proxy URL: `https://reddit-proxy.nickf2632.workers.dev`
  - Configured via `REDDIT_PROXY_URL` environment variable
  - Must include `https://` prefix in the URL
  - Fetches data from Reddit's public JSON API (e.g., `/r/subreddit/hot.json`)
  - No Reddit OAuth required - uses public API endpoints only
- **Important**: All Reddit API calls in the backend MUST use `r.redditBaseURL()` method, never hardcoded URLs
- **No full Reddit integration**:
  - No Reddit authentication/login
  - No posting to Reddit
  - No Reddit chat/messaging
  - Read-only public post/comment viewing only

### Key Technical Decisions

#### Infinite Scroll vs Pagination
- The app supports both infinite scroll and pagination modes
- Users toggle between modes via `useInfiniteScroll` setting in SettingsContext
- **Default behavior**: Fetch all available posts (Reddit + Omni), sort them together, display in sorted order
- **When `showOmniOnly` filter is enabled**: Show ONLY Omni posts
- **Important**: Omni posts only appear on a page if their score/timestamp puts them there in the sorted order

#### Post Sorting Rules - CRITICAL
- **Combine ALL posts**: Merge all Reddit posts with all Omni posts (max 25 from backend)
- **Sort by actual criteria**: Sort the combined list by the current sort (Hot/New/Top/etc.)
- **Display natural results**: Show whatever posts end up on that page after sorting
- **NO artificial placement**: If all Omni posts have low scores on "Hot" sort, they won't appear on page 1
- **Example 1**: On "Hot" sort with Reddit posts scoring 1000+ points, Omni posts with 1-10 upvotes appear on page 50+, not page 1
- **Example 2**: On "New" sort with Reddit posts from last hour, 21-day-old Omni posts appear on page 500+, not page 1
- **Example 3**: If there are NO recent Omni posts, "New" sort pages may show only Reddit posts
- **Example 4**: If Omni posts ARE recent/high-scoring, they naturally appear mixed in at their proper sorted position

## Coding Standards

- Use TypeScript strict mode
- Prefer functional React components with hooks
- Use TanStack Query for data fetching
- Memoize expensive computations with `useMemo`
- Avoid array mutation (use spread operator for sorting)
- Always handle loading and error states
- Use proper TypeScript types (avoid `any`)

### Code Reusability - CRITICAL
**NO redundant code. Reuse code wherever possible.**

- **Frontend (React/TypeScript)**:
  - NEVER duplicate component logic across multiple pages
  - ALWAYS create reusable components for UI elements that appear in multiple places
  - **Examples that MUST be reusable components**:
    - Hub "About" section that appears on hub main page, hub post page, etc.
    - User profile cards that appear in different contexts
    - Post cards that appear in feeds, search results, saved items, etc.
    - Comment components that appear in post pages, mod mail, etc.
    - Modal dialogs with similar structure
    - Form inputs with validation
    - Loading states and error displays
  - **Pattern to follow**:
    ```typescript
    // ❌ BAD: Duplicating the same component logic
    // HubPage.tsx
    <div className="hub-about">
      <h3>{hub.name}</h3>
      <p>{hub.description}</p>
      <div>{hub.rules}</div>
    </div>

    // HubPostPage.tsx
    <div className="hub-about">
      <h3>{hub.name}</h3>
      <p>{hub.description}</p>
      <div>{hub.rules}</div>
    </div>

    // ✅ GOOD: Reusable component
    // components/HubAbout.tsx
    export const HubAbout = ({ hub }) => (
      <div className="hub-about">
        <h3>{hub.name}</h3>
        <p>{hub.description}</p>
        <div>{hub.rules}</div>
      </div>
    );

    // Then use <HubAbout hub={hub} /> in both pages
    ```
  - **Utility functions**: Extract common logic into utility files
  - **Custom hooks**: Create custom hooks for reusable stateful logic
  - **Types**: Define types once, import everywhere (no duplicate type definitions)

- **Backend (Go)**:
  - NEVER duplicate business logic across handlers
  - ALWAYS create shared functions for common operations
  - Extract repeated database queries into repository methods
  - Create utility functions for common transformations
  - Use middleware for cross-cutting concerns (auth, logging, etc.)

- **Benefits of code reuse**:
  - Reduces bugs (fix once, fixed everywhere)
  - Easier maintenance (update once, updated everywhere)
  - Smaller bundle size (less code to ship)
  - Consistent UI/UX (same component = same behavior)
  - Faster development (import existing component instead of rewriting)

## Performance Requirements

### Non-blocking Operations - CRITICAL
**All operations in this project MUST be non-blocking and concurrent where possible.**

- **Backend (Go)**:
  - NEVER use sequential loops for external API calls (Reddit API, etc.)
  - NEVER use sequential loops for database queries that can be parallelized
  - ALWAYS use goroutines + channels to fetch from multiple sources concurrently
  - Pattern to follow:
    ```go
    // Create result channel
    resultsChan := make(chan resultType, len(items))

    // Launch concurrent goroutines
    for _, item := range items {
        go func(data itemType) {
            result := fetchData(data)
            resultsChan <- result
        }(item)
    }

    // Collect results
    for i := 0; i < len(items); i++ {
        result := <-resultsChan
        // Process result
    }
    ```
  - **Examples that MUST be concurrent**:
    - Fetching posts from multiple subreddits
    - Validating multiple saved Reddit posts
    - Enriching multiple conversations/messages with user data
    - Any loop making external API calls or independent database queries

- **Frontend (React/TypeScript)**:
  - Use non-blocking async/await patterns
  - Initialize heavy operations (encryption keys, etc.) in background without blocking UI
  - Use TanStack Query for automatic request deduplication and caching

- **Why this matters**:
  - Users can subscribe to 100+ subreddits - sequential fetching would take 100+ seconds
  - Sequential operations don't scale and create terrible UX
  - Concurrent operations typically provide 10-50x performance improvements
