import { useMemo, useRef, useEffect } from 'react';

interface MarkdownRendererProps {
  content?: string | null;
  className?: string;
}

const imageRegex = /!\[([^\]]*)]\(([^)]+)\)/g;
const linkRegex = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g;
const boldRegex = /\*\*(.+?)\*\*/g;
const italicsRegex = /\*(.+?)\*/g;
const strikeRegex = /~~(.+?)~~/g;
const superscriptRegex = /(\S+)\^(\S+)/g;
const subredditRegex = /(?:^|\s)(r\/[A-Za-z0-9_]+)/g;
const userRegex = /(?:^|\s)(u\/[A-Za-z0-9_-]+)/g;
const IMAGE_URL_REGEX = /\.(jpe?g|png|gif|webp)(?:\?.*)?$/i;
const REDDIT_IMAGE_HOSTS = new Set(['preview.redd.it', 'i.redd.it', 'i.imgur.com']);

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

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

function sanitizeImageSource(value: string): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  const giphyMatch = trimmed.match(/^giphy\|([A-Za-z0-9_-]+)/i);
  if (giphyMatch) {
    const id = giphyMatch[1];
    return `https://i.giphy.com/media/${id}/giphy.gif`;
  }
  const normalized = trimmed.replace(/&amp;/g, '&');
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function isLikelyImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (IMAGE_URL_REGEX.test(url.pathname)) {
      return true;
    }
    return REDDIT_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function formatInline(text: string): string {
  let result = escapeHtml(text);
  result = result.replace(boldRegex, '<strong>$1</strong>');
  result = result.replace(italicsRegex, '<em>$1</em>');
  result = result.replace(strikeRegex, '<del>$1</del>');
  result = result.replace(superscriptRegex, '$1<sup>$2</sup>');
  result = result.replace(imageRegex, (_, altText, source) => {
    const sanitizedSource = sanitizeImageSource(source);
    if (!sanitizedSource) {
      return altText ? escapeHtml(altText) : '';
    }
    return `<img src="${escapeAttribute(sanitizedSource)}" alt="${escapeHtml(
      altText ?? ''
    )}" loading="lazy" />`;
  });
  result = result.replace(
    linkRegex,
    (_, label, url) =>
      `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        label
      )}</a>`
  );
  // Replace r/subreddit with links
  result = result.replace(subredditRegex, (match, subreddit) => {
    const prefix = match.startsWith(' ') ? ' ' : '';
    return `${prefix}<a href="/reddit/${subreddit}" class="text-[var(--color-primary)] hover:underline">${subreddit}</a>`;
  });
  // Replace u/username with links
  result = result.replace(userRegex, (match, username) => {
    const prefix = match.startsWith(' ') ? ' ' : '';
    return `${prefix}<a href="/reddit/${username}" class="text-[var(--color-primary)] hover:underline">${username}</a>`;
  });
  return result;
}

function convertMarkdown(markdown?: string | null): string {
  if (!markdown) return '';
  // Decode HTML entities first (Reddit comments often come with encoded entities)
  const decoded = decodeHtmlEntities(markdown);
  const lines = decoded.replaceAll('\r\n', '\n').split('\n');
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

    if (/^https?:\/\/\S+$/.test(trimmed) && isLikelyImageUrl(trimmed)) {
      closeCode();
      html.push(
        `<p><img src="${escapeAttribute(trimmed)}" alt="Image" loading="lazy" /></p>`
      );
      continue;
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleImageClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG') {
        target.classList.toggle('expanded');
      }
    };

    container.addEventListener('click', handleImageClick);
    return () => container.removeEventListener('click', handleImageClick);
  }, [renderedHtml]);

  if (!renderedHtml) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={`markdown-content text-left text-sm text-[var(--color-text-primary)] ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
