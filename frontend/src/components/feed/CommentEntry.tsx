import { useState, useRef, useEffect } from 'react';
import { redditService } from '../../services/redditService';
import { postsService } from '../../services/postsService';

interface CommentEntryProps {
  postId: string | number;
  postType: 'reddit' | 'hub';
  subreddit?: string; // Required for Reddit posts
  parentId?: number;
  onCommentPosted: (comment: any) => void;
  onCancel?: () => void;
  placeholder?: string;
}

export function CommentEntry({
  postId,
  postType,
  subreddit,
  parentId,
  onCommentPosted,
  onCancel,
  placeholder = 'Add a comment...'
}: CommentEntryProps) {
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
    if (!content.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const tempId = `temp-${Date.now()}`;
    const optimisticComment = {
      id: tempId,
      content: content.trim(),
      score: 1,
      username: 'You',
      created_at: new Date().toISOString(),
      parent_comment_id: parentId || null,
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
          body: content.trim(),
          parent_comment_id: parentId || null,
        });
      }

      // Replace optimistic comment with real one
      if (newComment.id !== tempId) {
        onCommentPosted({ ...newComment, __replaceTempId: tempId });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment');
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
        placeholder={placeholder}
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
          {isSubmitting ? 'Posting...' : 'Post'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
