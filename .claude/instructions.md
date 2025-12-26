# OmniNudge Development Instructions

## General Development Principles

- Ask clarifying questions whenever requirements are uncertain, complex, or long, otherwise act immediately.
- Favor efficient, scalable solutions.
- Prefer the simplest approach that satisfies the goal; escalate to more complex logic only when it's the best option.
- Avoid stopgap versions; implement the full solution upfront unless we explicitly agree on a phased approach.
- Flag anything you believe is incorrect; after we discuss it, follow my final decision exactly.
- Prioritize doing things right the first time rather than shipping a somewhat working version and finishing it later.
- Suggest better solutions if what I ask for is not the most scalable or efficient solution.
- Disregard complexity to implement.

## Project Context

### Architecture
- **Backend**: Go with PostgreSQL
- **Frontend**: React + TypeScript + TanStack Query
- **Reddit Integration**: Reddit posts fetched from Reddit public API (paginated, 25 per page)
- **Omni Posts**: Local platform posts stored in database (backend returns max 25 posts)

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
