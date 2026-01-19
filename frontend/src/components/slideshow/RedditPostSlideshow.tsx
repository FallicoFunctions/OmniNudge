import { useMemo, useState, useEffect } from 'react';
import { BaseSlideshow } from './BaseSlideshow';
import type { SlideshowItem } from './BaseSlideshow';
import { SlideshowControls } from './SlideshowControls';
import { redditService } from '../../services/redditService';
import { PostBodyMarkdown } from '../posts/PostBodyMarkdown';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { getRedditDashAudioUrl } from '../../utils/redditVideoAudio';

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

interface GalleryImage {
  url: string;
  width?: number;
  height?: number;
}

interface LocalPlatformPost {
  id: number;
  title: string;
  body?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  thumbnail_url?: string | null;
  gallery_images?: GalleryImage[];
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
  audioUrl?: string;
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
  const getOrCreateAudioEl = (postId: string, audioSrc: string) => {
    const audioId = `audio-${postId}`;
    let audioEl = document.getElementById(audioId) as HTMLAudioElement | null;
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = audioId;
      audioEl.src = audioSrc;
      audioEl.preload = 'metadata';
      audioEl.loop = true;
      audioEl.crossOrigin = 'anonymous';
      document.body.appendChild(audioEl);
    } else if (audioEl.src !== audioSrc) {
      audioEl.src = audioSrc;
    }
    return audioEl;
  };

  const syncAudioWithVideo = (videoEl: HTMLVideoElement, audioEl: HTMLAudioElement) => {
    audioEl.currentTime = videoEl.currentTime;
    audioEl.volume = videoEl.volume;
    audioEl.muted = false; // Always keep audio unmuted - let video control overall sound
    audioEl.playbackRate = videoEl.playbackRate;
  };

  const tryPlayAudio = (videoEl: HTMLVideoElement, audioEl: HTMLAudioElement) => {
    syncAudioWithVideo(videoEl, audioEl);
    const playPromise = audioEl.play();
    if (playPromise) {
      playPromise.catch((error) => {
        if (error?.name === 'NotAllowedError') {
          videoEl.dataset.audioBlocked = 'true';
        }
      });
    }
  };

  // Handle slide change - unmute video and play audio when navigating
  const handleSlideChange = () => {
    requestAnimationFrame(() => {
      const videoElement = document.querySelector('video[data-active="true"]') as HTMLVideoElement;
      if (videoElement) {
        const audioSrc = videoElement.getAttribute('data-audio-src');

        // Video should already be playing (autoPlay attribute), just unmute it
        videoElement.muted = false;
        videoElement.volume = 1.0;

        // If there's a separate audio track, play it synchronized with video
        if (audioSrc) {
          const audioEl = getOrCreateAudioEl(videoElement.dataset.postId || '', audioSrc);
          // Small delay to let video start first
          setTimeout(() => {
            if (!videoElement.paused) {
              tryPlayAudio(videoElement, audioEl);
            }
          }, 100);
        }
      }
    });
  };

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

          // Check if it's a gallery post (hub gallery)
          if (localPost.gallery_images && localPost.gallery_images.length > 0) {
            // Create a separate slide for each image in the gallery
            localPost.gallery_images.forEach((image, index) => {
              processedPosts.push({
                id: `${localPost.id}-gallery-${index}`,
                title: `${localPost.title} (${index + 1}/${localPost.gallery_images!.length})`,
                mediaUrl: resolveMediaUrl(image.url),
                mediaType: 'image' as const,
                postUrl,
              });
            });
            return;
          }

          // Check if it has media
          if (localPost.media_url && localPost.media_type) {
            const mediaType = localPost.media_type.startsWith('video') ? 'video' : 'image';
            processedPosts.push({
              id: String(localPost.id),
              title: localPost.title,
              mediaUrl: resolveMediaUrl(localPost.media_url),
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
          // Reddit videos have separate audio and video streams
          const videoUrl = redditPost.media.reddit_video.fallback_url;
          const audioUrl = getRedditDashAudioUrl(videoUrl);

          processedPosts.push({
            id: redditPost.id,
            title: redditPost.title,
            mediaUrl: videoUrl,
            audioUrl: audioUrl, // Add audio URL
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
              <div className="relative">
                <video
                  key={`video-${post.id}`}
                  src={post.mediaUrl}
                  controls
                  playsInline
                  loop
                  autoPlay
                  muted
                  data-active="true"
                  data-post-id={post.id}
                  data-audio-src={post.audioUrl}
                  className="object-contain"
                  style={{ maxWidth: '90vw', maxHeight: '70vh' }}
                  onPlay={(e) => {
                    // When video plays, also play the audio element
                    const audioSrc = e.currentTarget.getAttribute('data-audio-src');
                    if (audioSrc) {
                      const audioEl = getOrCreateAudioEl(post.id, audioSrc);
                      tryPlayAudio(e.currentTarget, audioEl);
                    }
                  }}
                  onPointerDown={(e) => {
                    const videoEl = e.currentTarget;
                    if (videoEl.dataset.audioBlocked !== 'true') return;
                    const audioSrc = videoEl.getAttribute('data-audio-src');
                    if (!audioSrc) return;
                    const audioEl = getOrCreateAudioEl(post.id, audioSrc);
                    delete videoEl.dataset.audioBlocked;
                    tryPlayAudio(videoEl, audioEl);
                  }}
                  onPause={() => {
                    // When video pauses, also pause the audio
                    const audioId = `audio-${post.id}`;
                    const audioEl = document.getElementById(audioId) as HTMLAudioElement;
                    if (audioEl) {
                      audioEl.pause();
                    }
                  }}
                  onSeeking={(e) => {
                    // Sync audio when seeking
                    const audioId = `audio-${post.id}`;
                    const audioEl = document.getElementById(audioId) as HTMLAudioElement;
                    if (audioEl) {
                      audioEl.currentTime = e.currentTarget.currentTime;
                    }
                  }}
                  onVolumeChange={(e) => {
                    const audioId = `audio-${post.id}`;
                    const audioEl = document.getElementById(audioId) as HTMLAudioElement;
                    if (!audioEl) return;
                    // Only sync if audio element exists and is different
                    if (Math.abs(audioEl.volume - e.currentTarget.volume) > 0.01) {
                      audioEl.volume = e.currentTarget.volume;
                    }
                    if (audioEl.muted !== e.currentTarget.muted) {
                      audioEl.muted = e.currentTarget.muted;
                    }
                  }}
                  onRateChange={(e) => {
                    const audioId = `audio-${post.id}`;
                    const audioEl = document.getElementById(audioId) as HTMLAudioElement;
                    if (!audioEl) return;
                    audioEl.playbackRate = e.currentTarget.playbackRate;
                  }}
                  onEnded={() => {
                    const audioId = `audio-${post.id}`;
                    const audioEl = document.getElementById(audioId) as HTMLAudioElement;
                    if (!audioEl) return;
                    audioEl.pause();
                    audioEl.currentTime = 0;
                  }}
                />
              </div>
            )}

            {post.mediaType === 'text' && post.selftext && (
              <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-3xl max-h-[70vh] overflow-auto">
                <PostBodyMarkdown content={post.selftext} />
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
      onSlideChange={handleSlideChange}
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
