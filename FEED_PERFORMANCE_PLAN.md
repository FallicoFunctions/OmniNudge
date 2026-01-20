# Feed Performance Optimization Plan

## Current Status: PAUSED FOR SIDE QUEST

## Problem Summary

The home feed pagination works correctly (no duplicates, proper cursor progression), but performance is unacceptable:
- **Current load time**: 3-6 seconds per page
- **User requirement**: "3-6 seconds for a feed to load is not acceptable"
- **Bottleneck**: Sequential fetching from 9-10 subreddits at ~0.5-1s each = 5-10 seconds total

## Critical User Requirements

1. **Pagination must work** ✅ DONE - working correctly now
2. **Must scale to unlimited subscriptions** ✅ DONE - interleaved fetching
3. **Posts sorted by score/date across ALL sources** ❌ NOT DONE - currently sorting by raw score
4. **Load time must be fast** ❌ NOT DONE - current bottleneck
5. **Diversity across all subscriptions**: User wants to see posts from ALL subscribed subreddits, not just high-traffic ones

### Key User Clarification on Sorting

> "Subscriptions have no order. Posts need to be sorted by score if they are using the hot filter, by date if the new filter, etc. So if they have 100 subscriptions and are sorting by hot then whichever 50 posts across all subscriptions should appear on the first page. This includes hubs subscriptions and posts as well."

### User's Vision for "Hot" Sort

> "If I have 100+ subscriptions to subreddits and I'm sorted by hot then in a perfect world the way it would work is the code would get the hot posts in order from the subreddits (some of the posts may have a score of 1000000 or 10 but they are hot relative to their subreddit) and then show those on my main feed. I could see the 1000000 post next to the 10 point post because of their relative hotness to their own subreddit."

**Key insight**: User wants to see posts that are "hot" **relative to their subreddit**, not just high raw scores. A post with 10 upvotes that's hot in r/obscureHobby should appear alongside a post with 1000000 upvotes that's hot in r/technology.

## Critical Discovery: Current "Hot" Sort is Wrong

Current implementation at [feed.go:752-762](backend/internal/handlers/feed.go#L752-L762):

```go
if sortBy == "new" {
    sort.Slice(combined, func(i, j int) bool {
        return getItemCreatedAt(combined[i]) > getItemCreatedAt(combined[j])
    })
} else {
    sort.Slice(combined, func(i, j int) bool {
        return combined[i].Score > combined[j].Score  // WRONG for "hot"!
    })
}
```

**Problem**: For "hot" sort, this sorts by **raw score**, not by Reddit's hot algorithm.

**Reddit's "hot" algorithm** is time-decay based:
```
Hot Score = log10(max(|score|, 1)) + (sign(score) * age_in_seconds) / 45000
```

- A 2-hour-old post with 100 upvotes can be "hotter" than a 2-day-old post with 10000 upvotes
- Sorting by raw score makes "hot" effectively the same as "top"
- This is why obscure subreddits never appear - they can't compete on raw score

## How Reddit Multi-Reddit Works

Reddit's `/r/subreddit1+subreddit2+subreddit3` feature:

1. Fetch top N "hot" posts from each subreddit (Reddit API returns them in hot order)
2. Merge-sort by hot score (not raw upvote score)
3. Display merged result

**Their approach:**
- Fetch top 25 "hot" posts from each subreddit
- Merge all results
- Sort by hot score (time-decay algorithm)
- Display top 25 of merged set

**Performance**: With 100 subreddits, 100 concurrent API calls, ~1 second

## The Solution: Concurrent Fetch + Round-Robin Merge for "Hot"

### Key Insights

1. **For "hot" sort**: Don't re-sort by score! Reddit API already returns posts in hot order. Use round-robin merge to maintain diversity.
2. **For "new" sort**: Sort all results by created_at timestamp
3. **For "top" sort**: Sort all results by raw score
4. **Concurrent fetching**: Fetch from ALL active sources concurrently (~1 second for 100 sources)

### Implementation Strategy

```go
func (h *FeedHandler) fetchInterleavedFeed(...) {
    // 1. Determine active sources (hub + all non-exhausted subscriptions)
    activeSources := []string{}
    if !newCursor.ExhaustedSources["hub"] {
        activeSources = append(activeSources, "hub")
    }
    if !omniOnly {
        for _, sub := range subscriptions {
            if !newCursor.ExhaustedSources[sub] {
                activeSources = append(activeSources, sub)
            }
        }
    }

    // 2. Fetch from ALL active sources CONCURRENTLY
    resultsChan := make(chan fetchResult, len(activeSources))
    fetchCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
    defer cancel()

    for _, source := range activeSources {
        go func(source string) {
            if source == "hub" {
                hubPosts, err := h.postRepo.GetPopularFeed(...)
                // Convert to CombinedFeedItem and send to channel
            } else {
                posts := h.fetchSubredditWithCache(...)
                // Convert to CombinedFeedItem and send to channel
            }
        }(source)
    }

    // 3. Collect all results
    results := make(map[string]fetchResult)
    for i := 0; i < len(activeSources); i++ {
        result := <-resultsChan
        results[result.source] = result
        // Update cursor state
    }

    // 4. Merge strategy depends on sort type
    if sortBy == "hot" {
        // ROUND-ROBIN MERGE: Take 1 from each source in rotation
        // This maintains diversity and respects each source's hot ranking
        for i := 0; i < maxItems && len(combined) < pageSize; i++ {
            for _, source := range activeSources {
                if result, ok := results[source]; ok && i < len(result.items) {
                    combined = append(combined, result.items[i])
                    if len(combined) >= pageSize {
                        break
                    }
                }
            }
        }
    } else if sortBy == "new" {
        // Collect all and sort by timestamp
        for _, result := range results {
            combined = append(combined, result.items...)
        }
        sort.Slice(combined, func(i, j int) bool {
            return getItemCreatedAt(combined[i]) > getItemCreatedAt(combined[j])
        })
        combined = combined[:pageSize]
    } else { // "top"
        // Collect all and sort by score
        for _, result := range results {
            combined = append(combined, result.items...)
        }
        sort.Slice(combined, func(i, j int) bool {
            return combined[i].Score > combined[j].Score
        })
        combined = combined[:pageSize]
    }

    return combined, newCursor, nil
}
```

### Expected Performance

- **Current**: 10 sources × 0.8s each = 8 seconds (sequential)
- **With concurrent fetch**: max(10 concurrent fetches) = ~1 second
- **Improvement**: 70-80% reduction in load time

### Why Round-Robin for "Hot" Sort

**Traditional approach (WRONG)**:
1. Fetch from all sources
2. Sort all posts by raw score
3. Return top 50

**Problem**: High-traffic subreddits dominate. A post with 10000 score from r/technology beats a post with 50 score from r/obscureHobby, even if the 50-score post is "hotter" relative to its subreddit.

**Round-robin approach (CORRECT)**:
1. Fetch "hot" posts from each source (Reddit API returns them in hot order)
2. Take 1st post from each source in rotation, then 2nd post from each source, etc.
3. Result: Diverse feed with hot posts from all sources

**Example with 3 sources, pageSize=9**:
- Hub hot posts: [H1, H2, H3, H4, H5]
- r/technology hot posts: [T1, T2, T3, T4, T5]
- r/gaming hot posts: [G1, G2, G3, G4, G5]

Round-robin result: [H1, T1, G1, H2, T2, G2, H3, T3, G3]

**Benefits**:
- ✅ Guaranteed diversity - all sources appear
- ✅ Respects each source's hot ranking
- ✅ Low-traffic subreddits appear alongside high-traffic ones
- ✅ Matches user's vision: "1000000 point post next to 10 point post because of their relative hotness"

## Open Questions

### 1. Hub Posts Integration

Hub posts are fetched via `h.postRepo.GetPopularFeed(ctx, []int{}, sortBy, limit, offset, startTime, endTime)`

**Question**: How does `GetPopularFeed` handle "hot" sorting?
- If it uses a time-decay algorithm like Reddit: Round-robin merge works perfectly
- If it sorts by raw score or created_at: Hub posts might not be comparable to Reddit's hot posts

**Question**: What ratio should hub posts have vs Reddit posts in the feed?
- Equal (1:1): [hub, reddit1, reddit2, hub, reddit3, reddit4, ...]
- Prioritize hub (2:1): [hub, hub, reddit1, hub, hub, reddit2, ...]
- Deprioritize hub (1:2): [hub, reddit1, reddit2, hub, reddit3, reddit4, ...]

Current implementation in round-robin treats hub as one source among many (1:1 ratio with each subreddit).

### 2. Items Per Source

Current: `itemsPerSource = 5`

With round-robin merge and 100 sources:
- Fetching 5 items from each = 500 total items
- Round-robin through all sources
- If pageSize=50, we'll use first item from 50 sources

**Question**: Should we fetch fewer items per source (e.g., 2-3) to reduce waste?
- Fewer items = less waste, but might need multiple rounds if sources are exhausted
- More items = more waste, but ensures we have enough for pagination

### 3. Cursor Tracking with Concurrent Fetching

Current cursor structure:
```go
type feedCursor struct {
    HubOffset        int               `json:"hub_offset"`
    SubredditCursors map[string]string `json:"subreddit_cursors"`
    ExhaustedSources map[string]bool   `json:"exhausted_sources"`
    Version          int               `json:"version"`
}
```

With concurrent fetching from all sources, cursor updates must be synchronized:
- Each goroutine fetches and gets a "next cursor" for its source
- All cursor updates collected and merged into new cursor
- Must handle sources that return fewer than requested items (mark as exhausted)

**Current plan handles this correctly** by collecting results via channel and updating cursor after all goroutines complete.

## Files to Modify

1. **[backend/internal/handlers/feed.go](backend/internal/handlers/feed.go)**
   - Modify `fetchInterleavedFeed` function (lines 639-763)
   - Change from sequential to concurrent fetching
   - Implement round-robin merge for "hot" sort
   - Keep sort-by-timestamp for "new" and sort-by-score for "top"

2. **[backend/internal/services/cache.go](backend/internal/services/cache.go)**
   - Already implemented `MemoryCache` ✅
   - No changes needed

3. **[frontend/src/pages/HomePage.tsx](frontend/src/pages/HomePage.tsx)**
   - Already removed `placeholderData: keepPreviousData` ✅
   - No changes needed

## Implementation Checklist

- [x] Rewrite `fetchInterleavedFeed` to use concurrent fetching from all active sources
- [x] Implement round-robin merge for `sortBy == "hot"`
- [x] Keep sort-by-timestamp for `sortBy == "new"`
- [x] Keep sort-by-score for `sortBy == "top"`
- [x] Add proper error handling for goroutines
- [x] Add context timeout (10 seconds) to prevent hangs
- [x] Add logging for cache hits/misses and fetch timing
- [ ] Test with 100+ subscriptions
- [ ] Verify diversity in results (posts from many sources)
- [ ] Measure performance improvement

## Implementation Complete

The fix has been implemented in [feed.go:598-792](backend/internal/handlers/feed.go#L598-L792).

### Key Changes:

1. **Concurrent fetching**: All active sources (hub + non-exhausted subscriptions) are fetched concurrently using goroutines
2. **Round-robin merge for "hot"**: Preserves diversity by interleaving posts from all sources instead of sorting by raw score
3. **Proper sorting for "new" and "top"**: Continues to sort by timestamp and score respectively
4. **10-second timeout**: Prevents hangs if Reddit API is slow
5. **Comprehensive logging**: Shows which sources are fetched, how many items returned, and which merge strategy is used

### Performance Expectations:

- **Before**: 10 sources × 0.8s each = 8 seconds (sequential)
- **After**: max(10 concurrent fetches) = ~1 second
- **Improvement**: 70-80% reduction in load time

### Next Steps:

Test the implementation with the frontend to verify:
- Load time improvement
- Posts from multiple sources appear (diversity)
- Pagination still works correctly
- No duplicates across pages

## Side Quest Context

**PAUSED HERE** - About to go on a side quest. User asked about something unrelated to feed performance.

When returning to this task:
1. Review this entire plan
2. Answer the open questions (hub post ratio, items per source)
3. Implement the concurrent fetching with round-robin merge
4. Test performance with large subscription counts
