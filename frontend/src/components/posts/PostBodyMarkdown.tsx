import { MarkdownRenderer } from '../common/MarkdownRenderer';

interface PostBodyMarkdownProps {
  content: string;
  className?: string;
}

export function PostBodyMarkdown({ content, className = '' }: PostBodyMarkdownProps) {
  if (!content) {
    return null;
  }

  return (
    <MarkdownRenderer
      content={content}
      className={`text-sm text-[var(--color-text-primary)] leading-normal ${className}`.trim()}
    />
  );
}
