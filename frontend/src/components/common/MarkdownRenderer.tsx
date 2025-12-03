import { useMemo } from 'react';

interface MarkdownRendererProps {
  content?: string | null;
  className?: string;
}

const linkRegex = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g;
const boldRegex = /\*\*(.+?)\*\*/g;
const italicsRegex = /\*(.+?)\*/g;
const strikeRegex = /~~(.+?)~~/g;
const superscriptRegex = /(\S+)\^(\S+)/g;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  try {
    const url = new URL(value);
    return escapeHtml(url.toString());
  } catch {
    return '#';
  }
}

function formatInline(text: string): string {
  let result = escapeHtml(text);
  result = result.replace(boldRegex, '<strong>$1</strong>');
  result = result.replace(italicsRegex, '<em>$1</em>');
  result = result.replace(strikeRegex, '<del>$1</del>');
  result = result.replace(superscriptRegex, '$1<sup>$2</sup>');
  result = result.replace(
    linkRegex,
    (_, label, url) =>
      `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        label
      )}</a>`
  );
  return result;
}

function convertMarkdown(markdown?: string | null): string {
  if (!markdown) return '';
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const html: string[] = [];

  let inList = false;
  let inBlockquote = false;
  let inCode = false;

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  const closeBlockquote = () => {
    if (inBlockquote) {
      html.push('</blockquote>');
      inBlockquote = false;
    }
  };

  const closeCode = () => {
    if (inCode) {
      html.push('</code></pre>');
      inCode = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      closeBlockquote();
      if (inCode) {
        html.push('\n');
      }
      continue;
    }

    const codeMatch = line.match(/^ {4}(.*)/);
    if (codeMatch) {
      closeList();
      closeBlockquote();
      if (!inCode) {
        html.push('<pre><code>');
        inCode = true;
      }
      html.push(`${escapeHtml(codeMatch[1])}\n`);
      continue;
    } else {
      closeCode();
    }

    if (line.startsWith('>')) {
      closeCode();
      closeList();
      if (!inBlockquote) {
        html.push('<blockquote>');
        inBlockquote = true;
      }
      html.push(`${formatInline(line.replace(/^>\s?/, ''))}<br />`);
      continue;
    } else {
      closeBlockquote();
    }

    const listMatch = line.match(/^\*\s+(.*)/);
    if (listMatch) {
      closeCode();
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${formatInline(listMatch[1])}</li>`);
      continue;
    } else {
      closeList();
    }

    closeCode();
    html.push(`<p>${formatInline(trimmed)}</p>`);
  }

  closeList();
  closeBlockquote();
  closeCode();

  return html.join('');
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const renderedHtml = useMemo(() => convertMarkdown(content), [content]);

  if (!renderedHtml) {
    return null;
  }

  return (
    <div
      className={`markdown-content text-left text-sm text-[var(--color-text-primary)] ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
