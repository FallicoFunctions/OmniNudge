import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { HlsVideo } from '../common/HlsVideo';
import { ImageCarousel } from './ImageCarousel';
import { CommentEntry } from './CommentEntry';
import { CommentThread } from './CommentThread';
import { api } from '../../lib/api';
import { postsService } from '../../services/postsService';
import type { PlatformPost, PostComment } from '../../types/posts';

type ExpandedPostData = {
  id: number | string;
  title?: string;
  author?: string;
  author_username?: string;
  subreddit?: string;
  hub_name?: string | null;
  hub?: { name?: string | null } | null;
  gallery_images?: PlatformPost['gallery_images'];
  is_gallery?: boolean;
  secure_media?: {
    reddit_video?: { hls_url?: string };
  };
  media?: {
    reddit_video?: { hls_url?: string };
  };
  media_url?: string | null;
  url?: string | null;
  thumbnail_url?: string | null;
  thumbnail?: string | null;
  is_video?: boolean;
  selftext?: string | null;
  body?: string | null;
  content?: string | null;
};

interface ExpandedPostProps {
  post: ExpandedPostData;
  onCollapse: () => void;
}

interface ThreadComment {
  id: number | string;
  username: string;
  content: string;
  created_at: string;
  score: number;
  user_vote?: number | null;
  parent_comment_id?: number | null;
  replies?: ThreadComment[];
  reply_count?: number;
  __replaceTempId?: string;
  __removeTempId?: string;
}

type CommentUpdate = ThreadComment | { __removeTempId: string } | { __replaceTempId: string };

interface RedditCommentNode {
  kind?: string;
  data?: {
    id?: string;
    author?: string;
    body?: string;
    created_utc?: number;
    score?: number;
    replies?: unknown;
  };
}

interface RedditListing {
  data?: {
    children?: RedditCommentNode[];
  };
}

export function ExpandedPost({ post, onCollapse }: ExpandedPostProps) {
  const { t } = useTranslation();
  const [comments, setComments] = useState<ThreadComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [hasMoreComments, setHasMoreComments] = useState(false);

  const postData = post as ExpandedPostData;
  const isRedditPost = Boolean(postData.subreddit);
  const postType: 'reddit' | 'hub' = isRedditPost ? 'reddit' : 'hub';

  // Extract media info
  const galleryImages = postData.gallery_images;
  const isGallery = Boolean(postData.is_gallery || (galleryImages && galleryImages.length > 0));

  const redditVideo = postData.secure_media?.reddit_video || postData.media?.reddit_video;
  const redditHlsUrl = redditVideo?.hls_url;
  const isRedditVideo = Boolean(redditHlsUrl);

  const mediaUrl = postData.media_url || postData.url;
  let thumbnail = postData.thumbnail_url || postData.thumbnail;

  if (
    thumbnail === 'self' ||
    thumbnail === 'default' ||
    thumbnail === 'nsfw' ||
    thumbnail === 'spoiler'
  ) {
    thumbnail = null;
  }

  const isVideo =
    postData.is_video ||
    isRedditVideo ||
    mediaUrl?.includes('.mp4') ||
    mediaUrl?.includes('.webm') ||
    mediaUrl?.includes('v.redd.it');

  const isImage =
    !isVideo &&
    !isGallery &&
    (mediaUrl?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
      mediaUrl?.includes('i.redd.it') ||
      mediaUrl?.includes('preview.redd.it'));

  let displayMedia = null;
  if (isGallery && galleryImages) {
    // Will use ImageCarousel
  } else if (isVideo) {
    displayMedia = isRedditVideo && redditHlsUrl ? redditHlsUrl : mediaUrl;
  } else if (isImage) {
    displayMedia = mediaUrl;
  }

  const videoPoster =
    isVideo && thumbnail
      ? thumbnail.startsWith('http')
        ? thumbnail
        : resolveMediaUrl(thumbnail)
      : undefined;

  // Gallery state for carousel
  const [galleryIndex, setGalleryIndex] = useState(0);

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
          const response = await api.get<unknown>(
            `/reddit/r/${postData.subreddit}/comments/${postData.id}`
          );

          // Reddit API returns [postListing, commentsListing]
          const commentsListing = Array.isArray(response)
            ? (response[1] as RedditListing)
            : undefined;
          const redditComments = commentsListing?.data?.children || [];

          // Flatten and normalize Reddit API comments
          const flattenComments = (comments: RedditCommentNode[]): ThreadComment[] => {
            const flattened: ThreadComment[] = [];

            const traverse = (comment: RedditCommentNode) => {
              if (comment.kind === 'more') return;
              if (!comment.data || !comment.data.body) return;

              const repliesListing =
                comment.data.replies && typeof comment.data.replies !== 'string'
                  ? (comment.data.replies as RedditListing)
                  : undefined;
              const replies = repliesListing?.data?.children || [];

              flattened.push({
                id: comment.data.id ?? '',
                username: comment.data.author ?? t('posts.compact.unknownUser'),
                content: comment.data.body,
                created_at: comment.data.created_utc
                  ? new Date(comment.data.created_utc * 1000).toISOString()
                  : new Date().toISOString(),
                score: comment.data.score || 0,
                user_vote: null,
                parent_comment_id: null,
                replies: replies.length > 0 ? flattenComments(replies) : [],
                reply_count: replies.length,
              });
            };

            comments.forEach((c) => traverse(c));
            return flattened;
          };

          const normalizedComments = flattenComments(redditComments);
          setComments(normalizedComments);
          setHasMoreComments(false);
        } else {
          const data = await postsService.getComments(postData.id as number);

          const normalizedComments = (data as PostCommentWithBody[]).map((c) => ({
            ...c,
            score: c.score || 0,
            content: c.content || c.body || '',
          }));

          setComments(normalizedComments);
          setHasMoreComments(false);
        }
      } catch (err) {
        console.error('Error fetching comments:', err);
        setCommentError(err instanceof Error ? err.message : t('comments.errors.loadFailed'));
      } finally {
        setIsLoadingComments(false);
      }
    };

    fetchComments();
  }, [postData.id, postType, postData.subreddit, t]);

  const handleVote = async (commentId: number | string, vote: number) => {
    // Optimistic update first
    setComments((prevComments) => {
      const updateComment = (comments: ThreadComment[]): ThreadComment[] => {
        return comments.map((comment) => {
          if (comment.id === commentId) {
            const oldVote = comment.user_vote || 0;
            const scoreDelta = vote - oldVote;
            return {
              ...comment,
              user_vote: vote,
              score: comment.score + scoreDelta,
            };
          }
          if (comment.replies) {
            return {
              ...comment,
              replies: updateComment(comment.replies),
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
      setComments((prevComments) => {
        const revertComment = (comments: ThreadComment[]): ThreadComment[] => {
          return comments.map((comment) => {
            if (comment.id === commentId) {
              const scoreDelta = -(vote - (comment.user_vote || 0));
              return {
                ...comment,
                user_vote: comment.user_vote === vote ? 0 : comment.user_vote,
                score: comment.score + scoreDelta,
              };
            }
            if (comment.replies) {
              return {
                ...comment,
                replies: revertComment(comment.replies),
              };
            }
            return comment;
          });
        };
        return revertComment(prevComments);
      });
    }
  };

  const handleCommentPosted = (parentId: number | string | null, newComment: CommentUpdate) => {
    const removeById = (comments: ThreadComment[], targetId: string): ThreadComment[] => {
      return comments
        .filter((comment) => String(comment.id) !== targetId)
        .map((comment) => ({
          ...comment,
          replies: comment.replies ? removeById(comment.replies, targetId) : comment.replies,
        }));
    };

    const replaceById = (
      comments: ThreadComment[],
      targetId: string,
      replacement: ThreadComment
    ): ThreadComment[] => {
      return comments.map((comment) => {
        if (String(comment.id) === targetId) {
          return { ...replacement };
        }
        if (comment.replies) {
          return { ...comment, replies: replaceById(comment.replies, targetId, replacement) };
        }
        return comment;
      });
    };

    if ('__removeTempId' in newComment) {
      const removeId = newComment.__removeTempId;
      if (removeId) {
        setComments((prev) => removeById(prev, removeId));
        return;
      }
    }

    if ('__replaceTempId' in newComment) {
      const replaceId = newComment.__replaceTempId;
      if (replaceId) {
        const replacement = { ...(newComment as ThreadComment) };
        delete replacement.__replaceTempId;
        delete replacement.__removeTempId;
        setComments((prev) => replaceById(prev, replaceId, replacement));
        return;
      }
    }

    const comment = newComment as ThreadComment;
    if (parentId === null) {
      // Top-level comment
      setComments((prev) => [comment, ...prev]);
      return;
    }

    // Reply to existing comment
    const commentToAdd = comment;
    setComments((prevComments) => {
      const addReply = (comments: ThreadComment[]): ThreadComment[] => {
        return comments.map((comment) => {
          if (comment.id === parentId) {
            return {
              ...comment,
              replies: [commentToAdd, ...(comment.replies || [])],
              reply_count: (comment.reply_count || 0) + 1,
            };
          }
          if (comment.replies) {
            return {
              ...comment,
              replies: addReply(comment.replies),
            };
          }
          return comment;
        });
      };
      return addReply(prevComments);
    });
  };

  const loadMoreComments = () => {
    // TODO: Implement pagination
  };

  return (
    <div className="expanded-post bg-[var(--color-surface)]">
      {/* Sticky back button */}
      <div className="sticky top-0 z-10 bg-black/70 backdrop-blur-sm p-1 border-b border-cyan-500">
        <button
          onClick={onCollapse}
          className="text-cyan-500 hover:text-cyan-400 text-xs flex items-center gap-1 transition-colors"
        >
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {t('common.back')}
        </button>
      </div>

      {/* Post media */}
      {isGallery && galleryImages && galleryImages.length > 0 ? (
        <ImageCarousel
          images={galleryImages}
          title={postData.title || t('posts.media.galleryTitle')}
          className="w-full"
          currentIndex={galleryIndex}
          onNavigate={handleGalleryNavigate}
        />
      ) : displayMedia ? (
        <div className="w-full">
          {isVideo ? (
            <HlsVideo
              src={
                displayMedia.startsWith('http')
                  ? displayMedia
                  : (resolveMediaUrl(displayMedia) ?? '')
              }
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
              alt={t('posts.media.previewImageAlt', {
                title: postData.title || t('posts.compact.untitled'),
              })}
              className="w-full h-auto"
              style={{ display: 'block', maxHeight: 'calc(100vh - 200px)', objectFit: 'contain' }}
              loading="lazy"
            />
          )}
        </div>
      ) : null}

      {/* Post body */}
      {(postData.selftext || postData.body || postData.content) && (
        <div className="p-2 text-xs text-[var(--color-primary)] border-b border-[var(--color-border)]">
          {postData.selftext || postData.body || postData.content}
        </div>
      )}

      {/* Comment entry */}
      <CommentEntry
        postId={postData.id}
        postType={postType}
        onCommentPosted={(comment) => handleCommentPosted(null, comment)}
        placeholder={t('comments.addComment')}
      />

      {/* Comments */}
      <div className="mt-1">
        {isLoadingComments && (
          <div className="p-2 text-center text-xs text-[var(--color-text-muted)]">
            {t('comments.loading')}
          </div>
        )}

        {commentError && (
          <div className="p-2 text-center">
            <div className="text-xs text-red-500 mb-2">{commentError}</div>
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-cyan-500 hover:text-cyan-400"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {!isLoadingComments && !commentError && comments.length === 0 && (
          <div className="p-2 text-center text-xs text-[var(--color-text-muted)]">
            {t('comments.emptyBeFirstOnPost')}
          </div>
        )}

        {comments.length > 0 && (
          <CommentThread
            comments={comments.slice(0, 25)}
            postId={postData.id}
            postType={postType}
            subreddit={isRedditPost ? postData.subreddit : undefined}
            postTitle={postData.title}
            postAuthor={postData.author || postData.author_username}
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
            {t('comments.loadMore', { count: 25 })}
          </button>
        )}
      </div>
    </div>
  );
}
type PostCommentWithBody = PostComment & { body?: string | null };
