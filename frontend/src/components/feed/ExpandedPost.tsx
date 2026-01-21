import { useState, useEffect } from 'react';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { HlsVideo } from '../common/HlsVideo';
import { ImageCarousel } from './ImageCarousel';
import { CommentEntry } from './CommentEntry';
import { CommentThread } from './CommentThread';
import { api } from '../../lib/api';
import { postsService } from '../../services/postsService';

interface ExpandedPostProps {
  post: any; // Can be RedditPost or PlatformPost
  feedType: 'home' | 'subreddit' | 'hub';
  onCollapse: () => void;
}

export function ExpandedPost({ post, feedType, onCollapse }: ExpandedPostProps) {
  const [comments, setComments] = useState<any[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [commentCursor, setCommentCursor] = useState<string | null>(null);

  const isRedditPost = 'subreddit' in post;
  const postType: 'reddit' | 'hub' = isRedditPost ? 'reddit' : 'hub';

  // Extract media info
  const galleryImages = post.gallery_images;
  const isGallery = post.is_gallery || (galleryImages && galleryImages.length > 0);

  const redditVideo = post.secure_media?.reddit_video || post.media?.reddit_video;
  const redditHlsUrl = redditVideo?.hls_url;
  const isRedditVideo = Boolean(redditHlsUrl);

  let mediaUrl = post.media_url || post.url;
  let thumbnail = post.thumbnail_url || post.thumbnail;

  if (thumbnail === 'self' || thumbnail === 'default' || thumbnail === 'nsfw' || thumbnail === 'spoiler') {
    thumbnail = null;
  }

  const isVideo = post.is_video ||
    isRedditVideo ||
    mediaUrl?.includes('.mp4') ||
    mediaUrl?.includes('.webm') ||
    mediaUrl?.includes('v.redd.it');

  const isImage = !isVideo && !isGallery && (
    mediaUrl?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
    mediaUrl?.includes('i.redd.it') ||
    mediaUrl?.includes('preview.redd.it')
  );

  let displayMedia = null;
  if (isGallery && galleryImages) {
    // Will use ImageCarousel
  } else if (isVideo) {
    displayMedia = isRedditVideo && redditHlsUrl ? redditHlsUrl : mediaUrl;
  } else if (isImage) {
    displayMedia = mediaUrl;
  }

  const videoPoster = isVideo && thumbnail ? (thumbnail.startsWith('http') ? thumbnail : resolveMediaUrl(thumbnail)) : undefined;

  // Gallery state for carousel
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [isGalleryHovered, setIsGalleryHovered] = useState(false);

  const handleGalleryNavigate = (direction: 'prev' | 'next') => {
    if (!galleryImages || galleryImages.length <= 1) return;
    if (direction === 'prev') {
      setGalleryIndex((prev) => (prev === 0 ? galleryImages.length - 1 : prev - 1));
    } else {
      setGalleryIndex((prev) => (prev === galleryImages.length - 1 ? 0 : prev + 1));
    }
  };

  // Fetch comments
  useEffect(() => {
    const fetchComments = async () => {
      setIsLoadingComments(true);
      setCommentError(null);

      try {
        if (postType === 'reddit') {
          // Fetch from Reddit API (same endpoint as normal post page)
          const response = await api.get(`/reddit/r/${post.subreddit}/comments/${post.id}`);
          console.log('Reddit API response:', response);

          // Reddit API returns [postListing, commentsListing]
          const commentsListing = response[1];
          const redditComments = commentsListing?.data?.children || [];

          console.log('Reddit comments received:', redditComments);

          // Flatten and normalize Reddit API comments
          const flattenComments = (comments: any[]): any[] => {
            const flattened: any[] = [];

            const traverse = (comment: any, depth = 0) => {
              if (comment.kind === 'more') return;
              if (!comment.data || !comment.data.body) return;

              const replies = comment.data.replies && typeof comment.data.replies !== 'string'
                ? comment.data.replies.data?.children || []
                : [];

              flattened.push({
                id: comment.data.id,
                username: comment.data.author,
                content: comment.data.body,
                created_at: new Date(comment.data.created_utc * 1000).toISOString(),
                score: comment.data.score || 0,
                user_vote: null,
                parent_comment_id: null,
                replies: replies.length > 0 ? flattenComments(replies) : [],
                reply_count: replies.length,
              });
            };

            comments.forEach(c => traverse(c, 0));
            return flattened;
          };

          const normalizedComments = flattenComments(redditComments);
          setComments(normalizedComments);
          setHasMoreComments(false);
        } else {
          const data = await postsService.getComments(post.id);
          console.log('Hub comments received:', data);

          const normalizedComments = Array.isArray(data) ? data.map((c: any) => ({
            ...c,
            score: c.score || 0,
            content: c.content || c.body || '',
          })) : [];

          setComments(normalizedComments);
          setHasMoreComments(false);
        }
      } catch (err) {
        console.error('Error fetching comments:', err);
        setCommentError(err instanceof Error ? err.message : 'Failed to load comments');
      } finally {
        setIsLoadingComments(false);
      }
    };

    fetchComments();
  }, [post.id, postType]);

  const handleVote = async (commentId: number | string, vote: number) => {
    // Optimistic update first
    setComments(prevComments => {
      const updateComment = (comments: any[]): any[] => {
        return comments.map(comment => {
          if (comment.id === commentId) {
            const oldVote = comment.user_vote || 0;
            const scoreDelta = vote - oldVote;
            return {
              ...comment,
              user_vote: vote,
              score: comment.score + scoreDelta
            };
          }
          if (comment.replies) {
            return {
              ...comment,
              replies: updateComment(comment.replies)
            };
          }
          return comment;
        });
      };
      return updateComment(prevComments);
    });

    // Then make API call
    try {
      if (postType === 'hub') {
        await postsService.voteComment(commentId as number, vote as 1 | -1 | 0);
      }
      // Reddit comment voting would need to be implemented in redditService
    } catch (err) {
      console.error('Failed to vote on comment:', err);
      // Revert optimistic update on error
      setComments(prevComments => {
        const revertComment = (comments: any[]): any[] => {
          return comments.map(comment => {
            if (comment.id === commentId) {
              const scoreDelta = -(vote - (comment.user_vote || 0));
              return {
                ...comment,
                user_vote: comment.user_vote === vote ? 0 : comment.user_vote,
                score: comment.score + scoreDelta
              };
            }
            if (comment.replies) {
              return {
                ...comment,
                replies: revertComment(comment.replies)
              };
            }
            return comment;
          });
        };
        return revertComment(prevComments);
      });
    }
  };

  const handleCommentPosted = (parentId: number | string | null, newComment: any) => {
    if (parentId === null) {
      // Top-level comment
      setComments(prev => [newComment, ...prev]);
    } else {
      // Reply to existing comment
      setComments(prevComments => {
        const addReply = (comments: any[]): any[] => {
          return comments.map(comment => {
            if (comment.id === parentId) {
              return {
                ...comment,
                replies: [newComment, ...(comment.replies || [])],
                reply_count: (comment.reply_count || 0) + 1
              };
            }
            if (comment.replies) {
              return {
                ...comment,
                replies: addReply(comment.replies)
              };
            }
            return comment;
          });
        };
        return addReply(prevComments);
      });
    }
  };

  const loadMoreComments = () => {
    // TODO: Implement pagination
    console.log('Load more comments');
  };

  return (
    <div className="expanded-post bg-[var(--color-surface)]">
      {/* Sticky back button */}
      <div className="sticky top-0 z-10 bg-black/70 backdrop-blur-sm p-1 border-b border-cyan-500">
        <button
          onClick={onCollapse}
          className="text-cyan-500 hover:text-cyan-400 text-xs flex items-center gap-1 transition-colors"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>

      {/* Post media */}
      {isGallery && galleryImages && galleryImages.length > 0 ? (
        <ImageCarousel
          images={galleryImages}
          title={post.title || 'Gallery'}
          className="w-full"
          currentIndex={galleryIndex}
          onNavigate={handleGalleryNavigate}
          onHoverChange={setIsGalleryHovered}
        />
      ) : displayMedia ? (
        <div className="w-full">
          {isVideo ? (
            <HlsVideo
              src={displayMedia.startsWith('http') ? displayMedia : resolveMediaUrl(displayMedia)}
              poster={videoPoster}
              className="w-full h-auto"
              style={{ display: 'block', maxHeight: 'calc(100vh - 200px)', objectFit: 'contain' }}
              controls
              loop
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={displayMedia.startsWith('http') ? displayMedia : resolveMediaUrl(displayMedia)}
              alt={post.title || 'Post image'}
              className="w-full h-auto"
              style={{ display: 'block', maxHeight: 'calc(100vh - 200px)', objectFit: 'contain' }}
              loading="lazy"
            />
          )}
        </div>
      ) : null}

      {/* Post body */}
      {(post.selftext || post.body || post.content) && (
        <div className="p-2 text-xs text-[var(--color-text)] border-b border-[var(--color-border)]">
          {post.selftext || post.body || post.content}
        </div>
      )}

      {/* Comment entry */}
      <CommentEntry
        postId={post.id}
        postType={postType}
        subreddit={isRedditPost ? post.subreddit : undefined}
        onCommentPosted={(comment) => handleCommentPosted(null, comment)}
        placeholder="Add a comment..."
      />

      {/* Comments */}
      <div className="mt-1">
        {isLoadingComments && (
          <div className="p-2 text-center text-xs text-[var(--color-text-muted)]">
            Loading comments...
          </div>
        )}

        {commentError && (
          <div className="p-2 text-center">
            <div className="text-xs text-red-500 mb-2">{commentError}</div>
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-cyan-500 hover:text-cyan-400"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoadingComments && !commentError && comments.length === 0 && (
          <div className="p-2 text-center text-xs text-[var(--color-text-muted)]">
            {postType === 'reddit'
              ? 'No comments yet on this post.'
              : 'No comments yet. Be the first to comment!'}
          </div>
        )}

        {comments.length > 0 && (
          <CommentThread
            comments={comments.slice(0, 25)}
            postId={post.id}
            postType={postType}
            subreddit={isRedditPost ? post.subreddit : undefined}
            postTitle={post.title}
            postAuthor={post.author || post.author_username}
            depth={0}
            maxDepth={1}
            onVote={handleVote}
            onCommentPosted={handleCommentPosted}
          />
        )}

        {hasMoreComments && (
          <button
            onClick={loadMoreComments}
            className="w-full p-2 text-xs text-cyan-500 hover:text-cyan-400 border-t border-[var(--color-border)] transition-colors"
          >
            Load 25 more comments
          </button>
        )}
      </div>
    </div>
  );
}
