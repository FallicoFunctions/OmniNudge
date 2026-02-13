import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { postsService } from '../../services/postsService';

interface CommentEntryProps {
  postId: string | number;
  postType: 'reddit' | 'hub';
  parentId?: number;
  onCommentPosted: (comment: CommentPayload) => void;
  onCancel?: () => void;
  placeholder?: string;
}

interface CommentPayloadBase {
  id: number | string;
  content: string;
  score: number;
  username: string;
  created_at: string;
  parent_comment_id?: number | null;
  user_vote?: number;
  ups?: number;
  downs?: number;
  reply_count?: number;
  replies?: CommentPayloadBase[];
}

type CommentPayload =
  | (CommentPayloadBase & { __replaceTempId?: string; __removeTempId?: string })
  | { __replaceTempId: string }
  | { __removeTempId: string };

export function CommentEntry({
  postId,
  postType,
  parentId,
  onCommentPosted,
  onCancel,
  placeholder,
}: CommentEntryProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [content]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const tempId = `temp-${Date.now()}`;
    const optimisticComment = {
      id: tempId,
      content: trimmedContent,
      score: 1,
      username: t('posts.you'),
      created_at: new Date().toISOString(),
      parent_comment_id: parentId ?? undefined,
      user_vote: 1,
      ups: 1,
      downs: 0,
    };

    // Show optimistically
    onCommentPosted(optimisticComment);
    setContent('');

    try {
      let newComment;
      if (postType === 'reddit') {
        // Reddit comment posting would need backend endpoint
        // For now, keep optimistic comment
        newComment = optimisticComment;
      } else {
        newComment = await postsService.createComment(postId as number, {
          body: trimmedContent,
          parent_comment_id: parentId ?? undefined,
        });
      }

      // Replace optimistic comment with real one
      if (newComment.id !== tempId) {
        onCommentPosted({ ...newComment, __replaceTempId: tempId });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('comments.errors.postFailed'));
      // Remove optimistic comment on error
      onCommentPosted({ __removeTempId: tempId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-b border-[var(--color-border)] p-1">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || t('comments.addComment')}
        className="w-full bg-[var(--color-background)] text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] border border-[var(--color-border)] rounded px-2 py-1 resize-none focus:outline-none focus:border-cyan-500 min-h-[24px]"
        rows={1}
        disabled={isSubmitting}
      />
      {error && (
        <div className="text-red-500 text-[10px] mt-1">{error}</div>
      )}
      <div className="flex gap-2 mt-1">
        <button
          type="submit"
          disabled={!content.trim() || isSubmitting}
          className="text-[10px] bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-2 py-0.5 rounded transition-colors"
        >
          {isSubmitting ? t('comments.status.posting') : t('comments.actions.post')}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            {t('common.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
