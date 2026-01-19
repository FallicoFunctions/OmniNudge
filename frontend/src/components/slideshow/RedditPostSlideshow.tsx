import { useMemo, useState, useEffect } from 'react';
import { BaseSlideshow } from './BaseSlideshow';
import type { SlideshowItem } from './BaseSlideshow';
import { SlideshowControls } from './SlideshowControls';
import { redditService } from '../../services/redditService';

interface RedditPost {
  id: string;
  title: string;
  subreddit?: string;
  selftext?: string;
  url?: string;
  is_video?: boolean;
  post_hint?: string;
  media?: {
    reddit_video?: {
      fallback_url?: string;
    };
  };
  preview?: {
    images?: Array<{
      source?: {
        url?: string;
      };
    }>;
  };
  permalink: string;
}

interface LocalPlatformPost {
  id: number;
  title: string;
  body?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  thumbnail_url?: string | null;
  hub_name?: string | null;
  hub?: {
    name?: string | null;
  } | null;
  target_subreddit?: string | null;
}

type PostType = RedditPost | LocalPlatformPost;

interface RedditPostSlideshowProps {
  posts: PostType[];
  onClose: () => void;
  includeTextPosts?: boolean;
}

interface SlideshowPost {
  id: string;
  title: string;
  mediaUrl?: string;
  mediaType: 'image' | 'video' | 'text';
  selftext?: string;
  postUrl: string;
}

export function RedditPostSlideshow({
  posts,
  onClose,
  includeTextPosts = true,
}: RedditPostSlideshowProps) {
  const [galleryData, setGalleryData] = useState<Record<string, string[]>>({});
  const [loadingGalleries, setLoadingGalleries] = useState(true);

  // Fetch gallery images for all gallery posts
  useEffect(() => {
    const fetchGalleries = async () => {
      const galleryPosts = posts.filter((post) => {
        if (typeof post.id === 'number') return false;
        const redditPost = post as RedditPost;
        return redditPost.url?.includes('/gallery/');
      });

      if (galleryPosts.length === 0) {
        setLoadingGalleries(false);
        return;
      }

      const fetchedData: Record<string, string[]> = {};
      await Promise.all(
        galleryPosts.map(async (post) => {
          const redditPost = post as RedditPost;
          if (!redditPost.subreddit) return;

          try {
            const images = await redditService.getPostGalleryImages(
              redditPost.subreddit,
              redditPost.id
            );
            if (images.length > 0) {
              fetchedData[redditPost.id] = images;
            }
          } catch (error) {
            console.error(`Failed to fetch gallery for post ${redditPost.id}:`, error);
          }
        })
      );

      setGalleryData(fetchedData);
      setLoadingGalleries(false);
    };

    fetchGalleries();
  }, [posts]);

  const slideshowPosts = useMemo(() => {
    const processedPosts: SlideshowPost[] = [];

    posts.forEach((post) => {
        // Check if this is a local platform post (has numeric id)
        const isLocalPost = typeof post.id === 'number';

        if (isLocalPost) {
          const localPost = post as LocalPlatformPost;
          const hubName = localPost.hub_name || localPost.hub?.name;
          const postUrl = hubName
            ? `${window.location.origin}/h/${hubName}/comments/${localPost.id}`
            : `${window.location.origin}/posts/${localPost.id}`;

          // Check if it has media
          if (localPost.media_url && localPost.media_type) {
            const mediaType = localPost.media_type.startsWith('video') ? 'video' : 'image';
            processedPosts.push({
              id: String(localPost.id),
              title: localPost.title,
              mediaUrl: localPost.media_url,
              mediaType: mediaType as 'image' | 'video',
              postUrl,
            });
            return;
          }

          // Text post
          if (includeTextPosts && localPost.body) {
            processedPosts.push({
              id: String(localPost.id),
              title: localPost.title,
              selftext: localPost.body,
              mediaType: 'text' as const,
              postUrl,
            });
            return;
          }

          return;
        }

        // Reddit post processing
        const redditPost = post as RedditPost;
        const postUrl = `https://www.reddit.com${redditPost.permalink}`;

        // Check if it's a gallery post
        const isGallery = redditPost.url?.includes('/gallery/');
        if (isGallery && galleryData[redditPost.id]) {
          // Create a separate slide for each image in the gallery
          galleryData[redditPost.id].forEach((imageUrl, index) => {
            processedPosts.push({
              id: `${redditPost.id}-gallery-${index}`,
              title: `${redditPost.title} (${index + 1}/${galleryData[redditPost.id].length})`,
              mediaUrl: imageUrl,
              mediaType: 'image' as const,
              postUrl,
            });
          });
          return;
        }

        // Check if it's a video post
        if (redditPost.is_video && redditPost.media?.reddit_video?.fallback_url) {
          processedPosts.push({
            id: redditPost.id,
            title: redditPost.title,
            mediaUrl: redditPost.media.reddit_video.fallback_url,
            mediaType: 'video' as const,
            postUrl,
          });
          return;
        }

        // Check if it's an image post
        if (redditPost.post_hint === 'image' && redditPost.url) {
          processedPosts.push({
            id: redditPost.id,
            title: redditPost.title,
            mediaUrl: redditPost.url,
            mediaType: 'image' as const,
            postUrl,
          });
          return;
        }

        // Text post (if includeTextPosts is true)
        if (includeTextPosts && redditPost.selftext) {
          processedPosts.push({
            id: redditPost.id,
            title: redditPost.title,
            selftext: redditPost.selftext,
            mediaType: 'text' as const,
            postUrl,
          });
          return;
        }
      });

    return processedPosts;
  }, [posts, includeTextPosts, galleryData]);

  const slideshowItems: SlideshowItem[] = useMemo(() => {
    return slideshowPosts.map((post) => ({
      id: post.id,
      content: (
        <div className="flex flex-col items-center gap-4 w-full h-full max-w-6xl mx-auto">
          {/* Post title */}
          <div className="text-white text-xl font-semibold text-center px-8">
            {post.title}
          </div>

          {/* Media or text content */}
          <div className="flex-1 flex items-center justify-center w-full overflow-auto">
            {post.mediaType === 'image' && post.mediaUrl && (
              <img
                src={post.mediaUrl}
                alt={post.title}
                className="cursor-pointer object-contain"
                style={{ maxWidth: '90vw', maxHeight: '70vh' }}
                onClick={() => window.open(post.postUrl, '_blank', 'noopener,noreferrer')}
              />
            )}

            {post.mediaType === 'video' && post.mediaUrl && (
              <video
                src={post.mediaUrl}
                controls
                autoPlay
                className="object-contain"
                style={{ maxWidth: '90vw', maxHeight: '70vh' }}
              />
            )}

            {post.mediaType === 'text' && post.selftext && (
              <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-3xl max-h-[70vh] overflow-auto">
                <p className="text-[var(--color-text)] whitespace-pre-wrap">
                  {post.selftext}
                </p>
              </div>
            )}
          </div>
        </div>
      ),
    }));
  }, [slideshowPosts]);

  if (loadingGalleries) {
    return (
      <div className="fixed inset-0 z-50 bg-black bg-opacity-95 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">Loading gallery images...</div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-md hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (slideshowItems.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black bg-opacity-95 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">No media posts found</div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-md hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <BaseSlideshow
      items={slideshowItems}
      initialIndex={0}
      onClose={onClose}
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
  );
}
