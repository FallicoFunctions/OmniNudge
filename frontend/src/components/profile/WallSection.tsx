import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { wallService } from '../../services/wallService';
import { mediaService, type MediaFile } from '../../services/mediaService';
import { normalizeUploadedMediaUrl } from '../../utils/uploadedMediaUrl';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { UserAvatar } from '../common/UserAvatar';
import { MediaLightbox } from '../common/MediaLightbox';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useFormat } from '../../hooks/useFormat';
import { useToast } from '../../hooks/useToast';
import type { WallPost, WallPostComment, WallPostMedia, WallReactionType } from '../../types/users';

const MAX_BODY_LENGTH = 2000;
const MAX_MEDIA_ITEMS = 10;

interface Props {
  username: string;
  isOwnProfile: boolean;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 20 20"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
    >
      <path d="M10 17.25l-1.45-1.32C3.4 11.36 1 9.18 1 6.5 1 4.42 2.62 2.75 4.75 2.75c1.18 0 2.31.55 3.05 1.42L10 6.5l2.2-2.33a4.06 4.06 0 0 1 3.05-1.42C17.38 2.75 19 4.42 19 6.5c0 2.68-2.4 4.86-7.55 9.43L10 17.25z" />
    </svg>
  );
}

function BrokenHeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 20 20"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
    >
      <path d="M10 17.25l-1.45-1.32C3.4 11.36 1 9.18 1 6.5 1 4.42 2.62 2.75 4.75 2.75c1.18 0 2.31.55 3.05 1.42L10 6.5l2.2-2.33a4.06 4.06 0 0 1 3.05-1.42C17.38 2.75 19 4.42 19 6.5c0 2.68-2.4 4.86-7.55 9.43L10 17.25z" />
      <path
        d="M10.5 4.25l-1.75 3.25 2 2.25-2.5 2.5 1.75 3"
        fill="none"
        stroke={filled ? 'var(--color-surface)' : 'currentColor'}
        strokeWidth={filled ? 1.6 : 1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MediaItemPreview({ item }: { item: WallPostMedia }) {
  return (
    <>
      {item.media_type === 'video' && !item.thumbnail_url ? (
        <video
          src={resolveMediaUrl(item.url)}
          className="h-full w-full object-contain"
          muted
          preload="metadata"
        />
      ) : (
        <img
          src={resolveMediaUrl(item.thumbnail_url || item.url)}
          alt=""
          className="h-full w-full object-contain"
          loading="lazy"
        />
      )}
      {item.media_type === 'video' && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white">
            ▶
          </span>
        </span>
      )}
    </>
  );
}

function AttachMediaIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <rect x="2" y="4" width="16" height="12" rx="1.5" />
      <circle cx="7" cy="9" r="1.5" />
      <path d="M3 14l4-4 3 3 3-2 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WallComposer({
  onSubmit,
  isSubmitting,
  placeholder,
  submitLabel,
  pendingLabel,
  allowMedia = false,
}: {
  onSubmit: (body: string, media?: WallPostMedia[]) => void;
  isSubmitting: boolean;
  placeholder: string;
  submitLabel: string;
  pendingLabel: string;
  allowMedia?: boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [value, setValue] = useState('');
  const [mediaItems, setMediaItems] = useState<WallPostMedia[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      mediaPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [mediaPreviews]);

  const handleMediaFiles = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    if (mediaItems.length + files.length > MAX_MEDIA_ITEMS) {
      toast.error(t('userProfilePage.wall.tooManyMedia', { max: MAX_MEDIA_ITEMS }));
      return;
    }

    setIsUploadingMedia(true);
    const pendingPreviews = files.map((file) => URL.createObjectURL(file));

    try {
      if (files.length === 1) {
        const response = await mediaService.uploadMedia(files[0]);
        const newItem: WallPostMedia = {
          url: normalizeUploadedMediaUrl(response.storage_url || response.storage_path),
          media_type: files[0].type.startsWith('video/') ? 'video' : 'image',
          thumbnail_url: response.thumbnail_url,
          width: response.width,
          height: response.height,
          duration: response.duration,
        };
        setMediaItems((prev) => [...prev, newItem]);
        setMediaPreviews((prev) => [...prev, pendingPreviews[0]]);
      } else {
        const response = await mediaService.batchUploadMedia(files);
        const successful = response.uploads
          .map((upload, idx) => (upload ? { upload, idx } : null))
          .filter((item): item is { upload: MediaFile; idx: number } => Boolean(item));
        const newItems: WallPostMedia[] = successful.map(({ upload, idx }) => ({
          url: normalizeUploadedMediaUrl(upload.storage_url || upload.storage_path),
          media_type: files[idx].type.startsWith('video/') ? 'video' : 'image',
          thumbnail_url: upload.thumbnail_url,
          width: upload.width,
          height: upload.height,
          duration: upload.duration,
        }));
        setMediaItems((prev) => [...prev, ...newItems]);
        setMediaPreviews((prev) => [...prev, ...successful.map(({ idx }) => pendingPreviews[idx])]);
        pendingPreviews.forEach((url, idx) => {
          if (!successful.some((s) => s.idx === idx)) URL.revokeObjectURL(url);
        });
      }
    } catch (error) {
      console.error('Failed to upload media:', error);
      toast.error(t('userProfilePage.wall.mediaUploadFailed'));
      pendingPreviews.forEach((url) => URL.revokeObjectURL(url));
    } finally {
      setIsUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeMediaItem = (index: number) => {
    URL.revokeObjectURL(mediaPreviews[index]);
    setMediaItems((prev) => prev.filter((_, i) => i !== index));
    setMediaPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    const trimmed = value.trim();
    if ((!trimmed && mediaItems.length === 0) || isSubmitting || isUploadingMedia) return;
    onSubmit(trimmed, mediaItems.length > 0 ? mediaItems : undefined);
    setValue('');
    mediaPreviews.forEach((url) => URL.revokeObjectURL(url));
    setMediaItems([]);
    setMediaPreviews([]);
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        maxLength={MAX_BODY_LENGTH}
        rows={2}
        className="w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      />

      {allowMedia && mediaPreviews.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {mediaPreviews.map((preview, index) => (
            <div
              key={index}
              className="relative aspect-square overflow-hidden rounded-md bg-[var(--color-surface-elevated)]"
            >
              {mediaItems[index]?.media_type === 'video' ? (
                <video src={preview} className="h-full w-full object-cover" muted />
              ) : (
                <img src={preview} alt="" className="h-full w-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => removeMediaItem(index)}
                aria-label={t('userProfilePage.wall.removeMedia')}
                className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {allowMedia ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={(e) => e.target.files && handleMediaFiles(e.target.files)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingMedia || mediaItems.length >= MAX_MEDIA_ITEMS}
              className="flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] disabled:opacity-50 transition"
            >
              <AttachMediaIcon />
              {t('userProfilePage.wall.attachMedia')}
            </button>
          </>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={(!value.trim() && mediaItems.length === 0) || isSubmitting || isUploadingMedia}
          className="rounded-md bg-[var(--color-primary)] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {isUploadingMedia
            ? t('userProfilePage.wall.uploadingMedia')
            : isSubmitting
              ? pendingLabel
              : submitLabel}
        </button>
      </div>
    </div>
  );
}

function WallCommentRow({
  comment,
  postId,
  canReact,
  canDelete,
  onDelete,
  formatTimestamp,
}: {
  comment: WallPostComment;
  postId: number;
  canReact: boolean;
  canDelete: boolean;
  onDelete: () => void;
  formatTimestamp: (timestamp: string) => string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const reactionMutation = useMutation({
    mutationFn: (reaction: WallReactionType) =>
      wallService.setCommentReaction(postId, comment.id, reaction),
    onSuccess: (result) => {
      queryClient.setQueryData<{ comments: WallPostComment[] } | undefined>(
        ['wall-post-comments', postId],
        (data) => {
          if (!data) return data;
          return {
            ...data,
            comments: data.comments.map((c) =>
              c.id === comment.id
                ? {
                    ...c,
                    liked_by_viewer: result.liked,
                    disliked_by_viewer: result.disliked,
                    like_count: result.like_count,
                    dislike_count: result.dislike_count,
                  }
                : c
            ),
          };
        }
      );
    },
    onError: () => {
      toast.error(t('userProfilePage.wall.likeFailed'));
    },
  });

  return (
    <div className="flex gap-2">
      <Link to={`/users/${comment.author_username}`} className="flex-shrink-0">
        <UserAvatar username={comment.author_username} avatarUrl={comment.author_avatar_url} />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="rounded-md bg-[var(--color-surface-elevated)] px-3 py-1.5">
          <div className="flex items-baseline gap-2">
            <Link
              to={`/users/${comment.author_username}`}
              className="text-sm font-semibold text-[var(--color-text-primary)] hover:underline"
            >
              {comment.author_username}
            </Link>
            <span className="text-xs text-[var(--color-text-muted)]">
              {formatTimestamp(comment.created_at)}
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap break-words">
            {comment.body}
          </p>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => reactionMutation.mutate('like')}
            disabled={!canReact || reactionMutation.isPending}
            className={`flex items-center gap-1 font-medium transition disabled:cursor-default ${
              comment.liked_by_viewer
                ? 'text-[var(--color-error)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-error)]'
            } ${!canReact ? 'opacity-50' : ''}`}
          >
            <HeartIcon filled={comment.liked_by_viewer} />
            {comment.like_count > 0 ? comment.like_count : ''}
          </button>
          <button
            type="button"
            onClick={() => reactionMutation.mutate('dislike')}
            disabled={!canReact || reactionMutation.isPending}
            className={`flex items-center gap-1 font-medium transition disabled:cursor-default ${
              comment.disliked_by_viewer
                ? 'text-[var(--color-error)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-error)]'
            } ${!canReact ? 'opacity-50' : ''}`}
          >
            <BrokenHeartIcon filled={comment.disliked_by_viewer} />
            {comment.dislike_count > 0 ? comment.dislike_count : ''}
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="font-medium text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
            >
              {t('userProfilePage.wall.delete')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WallPostCard({
  post,
  username,
  canPost,
  isOwnProfile,
  currentUsername,
  formatTimestamp,
}: {
  post: WallPost;
  username: string;
  canPost: boolean;
  isOwnProfile: boolean;
  currentUsername?: string;
  formatTimestamp: (timestamp: string) => string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);

  const commentsQuery = useQuery({
    queryKey: ['wall-post-comments', post.id],
    queryFn: () => wallService.getComments(post.id),
    enabled: showComments,
  });

  const reactionMutation = useMutation({
    mutationFn: (reaction: WallReactionType) => wallService.setPostReaction(post.id, reaction),
    onSuccess: (result) => {
      queryClient.setQueryData<{ posts: WallPost[]; can_post: boolean } | undefined>(
        ['wall-posts', username],
        (data) => {
          if (!data) return data;
          return {
            ...data,
            posts: data.posts.map((p) =>
              p.id === post.id
                ? {
                    ...p,
                    liked_by_viewer: result.liked,
                    disliked_by_viewer: result.disliked,
                    like_count: result.like_count,
                    dislike_count: result.dislike_count,
                  }
                : p
            ),
          };
        }
      );
    },
    onError: () => {
      toast.error(t('userProfilePage.wall.likeFailed'));
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: () => wallService.deleteWallPost(post.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wall-posts', username] });
    },
    onError: () => {
      toast.error(t('userProfilePage.wall.deleteFailed'));
    },
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) => wallService.createComment(post.id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wall-post-comments', post.id] });
      queryClient.setQueryData<{ posts: WallPost[]; can_post: boolean } | undefined>(
        ['wall-posts', username],
        (data) => {
          if (!data) return data;
          return {
            ...data,
            posts: data.posts.map((p) =>
              p.id === post.id ? { ...p, comment_count: p.comment_count + 1 } : p
            ),
          };
        }
      );
    },
    onError: () => {
      toast.error(t('userProfilePage.wall.commentFailed'));
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: number) => wallService.deleteComment(post.id, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wall-post-comments', post.id] });
      queryClient.setQueryData<{ posts: WallPost[]; can_post: boolean } | undefined>(
        ['wall-posts', username],
        (data) => {
          if (!data) return data;
          return {
            ...data,
            posts: data.posts.map((p) =>
              p.id === post.id ? { ...p, comment_count: Math.max(p.comment_count - 1, 0) } : p
            ),
          };
        }
      );
    },
    onError: () => {
      toast.error(t('userProfilePage.wall.deleteFailed'));
    },
  });

  const canDeletePost = isOwnProfile || currentUsername === post.author_username;
  const comments = commentsQuery.data?.comments ?? [];

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex gap-2">
        <Link to={`/users/${post.author_username}`} className="flex-shrink-0">
          <UserAvatar username={post.author_username} avatarUrl={post.author_avatar_url} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <Link
              to={`/users/${post.author_username}`}
              className="text-sm font-semibold text-[var(--color-text-primary)] hover:underline"
            >
              {post.author_username}
            </Link>
            <span className="text-xs text-[var(--color-text-muted)]">
              {formatTimestamp(post.created_at)}
            </span>
          </div>
          {post.body && (
            <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap break-words mt-0.5">
              {post.body}
            </p>
          )}

          {post.media && post.media.length > 0 && (
            <div className="group relative mt-2">
              <button
                type="button"
                onClick={() => setLightboxIndex(mediaIndex)}
                className="relative block w-full max-h-96 overflow-hidden rounded-md bg-[var(--color-surface-elevated)]"
              >
                <MediaItemPreview item={post.media[mediaIndex]} />
              </button>

              {post.media.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMediaIndex((i) => (i - 1 + post.media!.length) % post.media!.length);
                    }}
                    aria-label={t('userProfilePage.wall.previousMedia')}
                    className="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/70"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMediaIndex((i) => (i + 1) % post.media!.length);
                    }}
                    aria-label={t('userProfilePage.wall.nextMedia')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/70"
                  >
                    ›
                  </button>
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
                    {mediaIndex + 1} / {post.media.length}
                  </span>
                </>
              )}
            </div>
          )}

          {lightboxIndex !== null && post.media && (
            <MediaLightbox
              items={post.media}
              index={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
              onIndexChange={(idx) => {
                setLightboxIndex(idx);
                setMediaIndex(idx);
              }}
            />
          )}

          <div className="mt-2 flex items-center gap-4 text-xs">
            <button
              type="button"
              onClick={() => reactionMutation.mutate('like')}
              disabled={!canPost || reactionMutation.isPending}
              className={`flex items-center gap-1 font-medium transition disabled:cursor-default ${
                post.liked_by_viewer
                  ? 'text-[var(--color-error)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-error)]'
              } ${!canPost ? 'opacity-50' : ''}`}
            >
              <HeartIcon filled={post.liked_by_viewer} />
              {post.like_count > 0 ? post.like_count : ''}
            </button>
            <button
              type="button"
              onClick={() => reactionMutation.mutate('dislike')}
              disabled={!canPost || reactionMutation.isPending}
              className={`flex items-center gap-1 font-medium transition disabled:cursor-default ${
                post.disliked_by_viewer
                  ? 'text-[var(--color-error)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-error)]'
              } ${!canPost ? 'opacity-50' : ''}`}
            >
              <BrokenHeartIcon filled={post.disliked_by_viewer} />
              {post.dislike_count > 0 ? post.dislike_count : ''}
            </button>
            <button
              type="button"
              onClick={() => setShowComments((v) => !v)}
              className="font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition"
            >
              {t('userProfilePage.wall.comments')}
              {post.comment_count > 0 ? ` (${post.comment_count})` : ''}
            </button>
            {canDeletePost && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(t('userProfilePage.wall.deletePostConfirm'))) {
                    deletePostMutation.mutate();
                  }
                }}
                className="font-medium text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition"
              >
                {t('userProfilePage.wall.delete')}
              </button>
            )}
          </div>

          {showComments && (
            <div className="mt-3 space-y-2 border-t border-[var(--color-border)] pt-3">
              {commentsQuery.isLoading ? (
                <p className="text-xs text-[var(--color-text-muted)]">{t('common.loading')}</p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t('userProfilePage.wall.noComments')}
                </p>
              ) : (
                comments.map((comment) => (
                  <WallCommentRow
                    key={comment.id}
                    comment={comment}
                    postId={post.id}
                    canReact={canPost}
                    canDelete={isOwnProfile || currentUsername === comment.author_username}
                    onDelete={() => {
                      if (window.confirm(t('userProfilePage.wall.deleteCommentConfirm'))) {
                        deleteCommentMutation.mutate(comment.id);
                      }
                    }}
                    formatTimestamp={formatTimestamp}
                  />
                ))
              )}

              {canPost && (
                <WallComposer
                  onSubmit={(body) => commentMutation.mutate(body)}
                  isSubmitting={commentMutation.isPending}
                  placeholder={t('userProfilePage.wall.commentPlaceholder')}
                  submitLabel={t('userProfilePage.wall.comment')}
                  pendingLabel={t('userProfilePage.wall.commenting')}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WallSection({ username, isOwnProfile }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { useRelativeTime } = useSettings();
  const { formatDate, formatRelativeTime } = useFormat();

  const formatTimestamp = (timestamp: string) => {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return '';
    return useRelativeTime
      ? formatRelativeTime(d)
      : formatDate(d, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
  };

  const wallQuery = useQuery({
    queryKey: ['wall-posts', username],
    queryFn: () => wallService.getWallPosts(username),
    staleTime: 1000 * 30,
  });

  const pendingPostsQuery = useQuery({
    queryKey: ['wall-pending-posts', username],
    queryFn: () => wallService.getPendingWallPosts(),
    enabled: isOwnProfile,
  });

  const createPostMutation = useMutation({
    mutationFn: ({ body, media }: { body: string; media?: WallPostMedia[] }) =>
      wallService.createWallPost(username, body, media),
    onSuccess: (post) => {
      queryClient.invalidateQueries({ queryKey: ['wall-posts', username] });
      if (post.status === 'pending') {
        queryClient.invalidateQueries({ queryKey: ['wall-pending-posts', username] });
        toast.info(t('userProfilePage.wall.postPendingApproval'));
      }
    },
    onError: () => {
      toast.error(t('userProfilePage.wall.postFailed'));
    },
  });

  const approvePostMutation = useMutation({
    mutationFn: (id: number) => wallService.approveWallPost(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wall-pending-posts', username] });
      queryClient.invalidateQueries({ queryKey: ['wall-posts', username] });
    },
    onError: () => {
      toast.error(t('userProfilePage.wall.pending.approveFailed'));
    },
  });

  const rejectPostMutation = useMutation({
    mutationFn: (id: number) => wallService.deleteWallPost(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wall-pending-posts', username] });
    },
    onError: () => {
      toast.error(t('userProfilePage.wall.pending.rejectFailed'));
    },
  });

  if (wallQuery.isLoading) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
          {t('userProfilePage.wall.heading')}
        </h3>
        <div className="space-y-2 animate-pulse">
          <div className="h-16 rounded-md bg-[var(--color-surface-elevated)]" />
          <div className="h-16 rounded-md bg-[var(--color-surface-elevated)]" />
        </div>
      </div>
    );
  }

  if (wallQuery.isError) {
    const isPrivate = (wallQuery.error as { status?: number } | null)?.status === 403;
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
          {t('userProfilePage.wall.heading')}
        </h3>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t(isPrivate ? 'userProfilePage.wall.private' : 'userProfilePage.wall.loadFailed')}
        </p>
      </div>
    );
  }

  const data = wallQuery.data;
  const posts = data?.posts ?? [];
  const canPost = data?.can_post ?? false;
  const pendingPosts = pendingPostsQuery.data?.posts ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {t('userProfilePage.wall.heading')}
        </h3>
      </div>

      {isOwnProfile && pendingPosts.length > 0 && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2">
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {t('userProfilePage.wall.pending.heading')}
          </h4>
          {pendingPosts.map((post) => (
            <div key={post.id} className="rounded-md border border-[var(--color-border)] p-2">
              <div className="flex gap-2">
                <Link to={`/users/${post.author_username}`} className="flex-shrink-0">
                  <UserAvatar username={post.author_username} avatarUrl={post.author_avatar_url} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/users/${post.author_username}`}
                    className="text-sm font-semibold text-[var(--color-text-primary)] hover:underline"
                  >
                    {post.author_username}
                  </Link>
                  <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap break-words">
                    {post.body}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => approvePostMutation.mutate(post.id)}
                  disabled={approvePostMutation.isPending}
                  className="rounded-md bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {t('userProfilePage.wall.pending.approve')}
                </button>
                <button
                  type="button"
                  onClick={() => rejectPostMutation.mutate(post.id)}
                  disabled={rejectPostMutation.isPending}
                  className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-error)] disabled:opacity-50"
                >
                  {t('userProfilePage.wall.pending.reject')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {canPost && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="flex gap-2">
            <UserAvatar username={user?.username ?? ''} avatarUrl={user?.avatar_url} />
            <div className="flex-1">
              <WallComposer
                onSubmit={(body, media) => createPostMutation.mutate({ body, media })}
                isSubmitting={createPostMutation.isPending}
                placeholder={t('userProfilePage.wall.composerPlaceholder')}
                submitLabel={t('userProfilePage.wall.post')}
                pendingLabel={t('userProfilePage.wall.posting')}
                allowMedia
              />
            </div>
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-sm text-[var(--color-text-secondary)]">
            {isOwnProfile ? t('userProfilePage.wall.emptyOwner') : t('userProfilePage.wall.empty')}
          </p>
        </div>
      ) : (
        posts.map((post) => (
          <WallPostCard
            key={post.id}
            post={post}
            username={username}
            canPost={canPost}
            isOwnProfile={isOwnProfile}
            currentUsername={user?.username}
            formatTimestamp={formatTimestamp}
          />
        ))
      )}
    </div>
  );
}
