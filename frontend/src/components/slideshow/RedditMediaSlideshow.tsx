import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BaseSlideshow } from './BaseSlideshow';
import type { SlideshowItem } from './BaseSlideshow';
import { SlideshowControls } from './SlideshowControls';
import { redditService } from '../../services/redditService';
import type { RedditApiPost } from '../../types/reddit';

interface RedditMediaItem {
  id: string;
  title: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  postUrl: string;
}

export function RedditMediaSlideshow() {
  const [subreddit, setSubreddit] = useState('pics');
  const [sort, setSort] = useState<'hot' | 'new' | 'top' | 'rising'>('hot');
  const [timeFilter, setTimeFilter] = useState<'hour' | 'day' | 'week' | 'month' | 'year' | 'all'>('day');
  const [isOpen, setIsOpen] = useState(false);
  const [mediaItems, setMediaItems] = useState<RedditMediaItem[]>([]);
  const [inputValue, setInputValue] = useState('pics');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reddit-slideshow', subreddit, sort, timeFilter],
    queryFn: async () => {
      const response = await redditService.getSubredditPosts(
        subreddit,
        sort,
        50,
        sort === 'top' ? timeFilter : undefined
      );
      return response;
    },
    enabled: false,
  });

  useEffect(() => {
    if (data?.posts) {
      const mediaOnly = extractMediaFromPosts(data.posts);
      setMediaItems(mediaOnly);
      if (mediaOnly.length > 0) {
        setIsOpen(true);
      }
    }
  }, [data]);

  const extractMediaFromPosts = (posts: RedditApiPost[]): RedditMediaItem[] => {
    return posts
      .filter((post) => {
        // Filter to only image and video posts
        return post.post_hint === 'image' || post.is_video;
      })
      .map((post) => {
        let mediaUrl = '';
        const mediaType: 'image' | 'video' = post.is_video ? 'video' : 'image';

        if (post.is_video && post.media?.reddit_video?.fallback_url) {
          mediaUrl = post.media.reddit_video.fallback_url;
        } else if (post.url) {
          mediaUrl = post.url;
        } else if (post.preview?.images?.[0]?.source?.url) {
          mediaUrl = post.preview.images[0].source.url.replace(/&amp;/g, '&');
        }

        return {
          id: post.id,
          title: post.title,
          mediaUrl,
          mediaType,
          postUrl: `https://www.reddit.com${post.permalink}`,
        };
      })
      .filter((item) => item.mediaUrl); // Remove items without media URLs
  };

  const handleLoadSlideshow = () => {
    setSubreddit(inputValue.trim());
    refetch();
  };

  const slideshowItems: SlideshowItem[] = mediaItems.map((item) => ({
    id: item.id,
    content: (
      <div className="flex flex-col items-center gap-4 w-full h-full">
        {/* Post title */}
        <div className="text-white text-xl font-semibold text-center px-8 max-w-4xl">
          {item.title}
        </div>

        {/* Media */}
        <div className="flex-1 flex items-center justify-center w-full">
          {item.mediaType === 'image' ? (
            <img
              src={item.mediaUrl}
              alt={item.title}
              className="max-w-full max-h-full object-contain cursor-pointer"
              style={{ maxWidth: '90vw', maxHeight: '70vh' }}
              onClick={() => window.open(item.postUrl, '_blank', 'noopener,noreferrer')}
            />
          ) : (
            <video
              src={item.mediaUrl}
              controls
              autoPlay
              className="max-w-full max-h-full object-contain"
              style={{ maxWidth: '90vw', maxHeight: '70vh' }}
            />
          )}
        </div>

        {/* Link to original post */}
        <a
          href={item.postUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--color-primary)] hover:underline text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          View on Reddit →
        </a>
      </div>
    ),
  }));

  return (
    <div className="min-h-screen bg-[var(--color-background)] p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-8">
          Reddit Media Slideshow
        </h1>

        <div className="bg-[var(--color-surface)] rounded-lg p-6 shadow-sm border border-[var(--color-border)]">
          {/* Subreddit input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Subreddit
            </label>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLoadSlideshow()}
              placeholder="Enter subreddit name (e.g., pics, aww, funny)"
              className="w-full px-4 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Sort options */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Sort
            </label>
            <div className="flex gap-2">
              {['hot', 'new', 'top', 'rising'].map((option) => (
                <button
                  key={option}
                  onClick={() => setSort(option as typeof sort)}
                  className={`px-4 py-2 rounded-md font-medium transition-colors ${
                    sort === option
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)]'
                  }`}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Time filter (for 'top' sort) */}
          {sort === 'top' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Time Range
              </label>
              <div className="flex gap-2 flex-wrap">
                {['hour', 'day', 'week', 'month', 'year', 'all'].map((option) => (
                  <button
                    key={option}
                    onClick={() => setTimeFilter(option as typeof timeFilter)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      timeFilter === option
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)]'
                    }`}
                  >
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Load button */}
          <button
            onClick={handleLoadSlideshow}
            disabled={isLoading || !inputValue.trim()}
            className="w-full px-6 py-3 bg-[var(--color-primary)] text-white rounded-md font-semibold hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Loading...' : 'Start Slideshow'}
          </button>

          {/* Error message */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
              Failed to load posts. Please check the subreddit name and try again.
            </div>
          )}

          {/* No media found */}
          {data && mediaItems.length === 0 && !isLoading && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-700 text-sm">
              No media posts found in r/{subreddit}. Try a different subreddit or sort option.
            </div>
          )}
        </div>
      </div>

      {/* Slideshow */}
      {isOpen && slideshowItems.length > 0 && (
        <BaseSlideshow
          items={slideshowItems}
          initialIndex={0}
          onClose={() => setIsOpen(false)}
          autoAdvance={false}
          autoAdvanceInterval={5000}
          showControls={true}
          renderControls={({
            autoAdvance,
            autoAdvanceInterval,
            onToggleAutoAdvance,
            onChangeInterval,
          }) => (
            <SlideshowControls
              autoAdvance={autoAdvance}
              autoAdvanceInterval={autoAdvanceInterval}
              onToggleAutoAdvance={onToggleAutoAdvance}
              onChangeInterval={onChangeInterval}
            />
          )}
        />
      )}
    </div>
  );
}
