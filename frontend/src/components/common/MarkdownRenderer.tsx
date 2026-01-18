import { useMemo, useRef, useEffect } from 'react';

interface MarkdownRendererProps {
  content?: string | null;
  className?: string;
}

const imageRegex = /!\[([^\]]*)]\(([^)]+)\)/g;
const linkRegex = /\[([^\]]+)]\(([^\s)]+)\)/g;
const boldRegex = /\*\*(.+?)\*\*/g;
const italicsRegex = /\*(.+?)\*/g;
const strikeRegex = /~~(.+?)~~/g;
const superscriptRegex = /(\S+)\^(\S+)/g;
const subredditRegex = /(?:^|\s)(r\/[A-Za-z0-9_]+)/g;
const userRegex = /(?:^|\s)(u\/[A-Za-z0-9_-]+)/g;
const IMAGE_URL_REGEX = /\.(jpe?g|png|gif|webp)(?:\?.*)?$/i;
const REDDIT_IMAGE_HOSTS = new Set(['preview.redd.it', 'i.redd.it', 'i.imgur.com']);

function decodeHtmlEntities(value: string): string {
  const decodeOnce = (input: string): string =>
    input
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  const decodeDom = (input: string): string => {
    if (typeof window === 'undefined') {
      return decodeOnce(input);
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(input, 'text/html');
    return doc.documentElement.textContent ?? input;
  };
  let output = value;
  for (let i = 0; i < 3; i += 1) {
    const next = decodeDom(output);
    if (next === output) {
      break;
    }
    output = next;
  }
  return output;
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
  const codePlaceholders: string[] = [];
  result = result.replace(/`([^`]+)`/g, (_, code) => {
    const token = `__CODE_PLACEHOLDER_${codePlaceholders.length}__`;
    codePlaceholders.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });
  result = result.replace(boldRegex, '<strong>$1</strong>');
  result = result.replace(italicsRegex, '<em>$1</em>');
  result = result.replace(strikeRegex, '<del>$1</del>');
  result = result.replace(superscriptRegex, '$1<sup>$2</sup>');
  result = result.replace(imageRegex, (_, altText, source) => {
    const sanitizedSource = sanitizeImageSource(source);
    const normalizedAlt = altText ? decodeHtmlEntities(altText) : '';
    if (!sanitizedSource) {
      return normalizedAlt ? escapeHtml(normalizedAlt) : '';
    }
    return `<img src="${escapeAttribute(sanitizedSource)}" alt="${escapeHtml(
      normalizedAlt
    )}" loading="lazy" />`;
  });
  result = result.replace(
    linkRegex,
    (_, label, url) => {
      // Add https:// if the URL doesn't have a protocol
      const fullUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      return `<a href="${escapeAttribute(fullUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        decodeHtmlEntities(label)
      )}</a>`;
    }
  );
  // Replace r/subreddit with links
  result = result.replace(subredditRegex, (match, subreddit) => {
    const prefix = match.startsWith(' ') ? ' ' : '';
    return `${prefix}<a href="/${subreddit}" class="text-[var(--color-primary)] hover:underline">${subreddit}</a>`;
  });
  // Replace u/username with links
  result = result.replace(userRegex, (match, username) => {
    const prefix = match.startsWith(' ') ? ' ' : '';
    const normalized = username.replace(/^u\//i, '');
    return `${prefix}<a href="/user/${normalized}" class="text-[var(--color-primary)] hover:underline">${username}</a>`;
  });
  codePlaceholders.forEach((htmlSnippet, index) => {
    result = result.replace(`__CODE_PLACEHOLDER_${index}__`, htmlSnippet);
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
  let inFence = false;
  let fenceLanguage = '';

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

  const closeFence = () => {
    if (inFence) {
      html.push('</code></pre>');
      inFence = false;
      fenceLanguage = '';
    }
  };

  const isTableSeparator = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) {
      return false;
    }
    return /^(\|?\s*:?-{3,}:?\s*\|)+\s*$/.test(trimmed);
  };

  const parseTableRow = (line: string): string[] => {
    let trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      trimmed = trimmed.slice(1);
    }
    if (trimmed.endsWith('|')) {
      trimmed = trimmed.slice(0, -1);
    }
    return trimmed.split('|').map((cell) => cell.trim());
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      closeBlockquote();
      if (inCode || inFence) {
        html.push('\n');
      }
      continue;
    }

    if (trimmed.startsWith('```')) {
      closeList();
      closeBlockquote();
      if (!inFence) {
        fenceLanguage = trimmed.slice(3).trim();
        const languageClass = fenceLanguage ? ` class="language-${escapeHtml(fenceLanguage)}"` : '';
        html.push(`<pre><code${languageClass}>`);
        inFence = true;
      } else {
        closeFence();
      }
      continue;
    }

    if (inFence) {
      html.push(`${escapeHtml(line)}\n`);
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

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closeCode();
      closeList();
      closeBlockquote();
      html.push('<hr />');
      continue;
    }

    const nextLine = lines[index + 1];
    if (nextLine && trimmed.includes('|') && isTableSeparator(nextLine)) {
      closeCode();
      closeList();
      closeBlockquote();
      const headerCells = parseTableRow(trimmed);
      const bodyRows: string[][] = [];
      index += 1;
      for (let rowIndex = index + 1; rowIndex < lines.length; rowIndex += 1) {
        const rowLine = lines[rowIndex];
        if (!rowLine || !rowLine.includes('|')) {
          index = rowIndex - 1;
          break;
        }
        bodyRows.push(parseTableRow(rowLine));
        index = rowIndex;
      }
      html.push('<table><thead><tr>');
      headerCells.forEach((cell) => {
        html.push(`<th>${formatInline(cell)}</th>`);
      });
      html.push('</tr></thead><tbody>');
      bodyRows.forEach((row) => {
        html.push('<tr>');
        row.forEach((cell) => {
          html.push(`<td>${formatInline(cell)}</td>`);
        });
        html.push('</tr>');
      });
      html.push('</tbody></table>');
      continue;
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
  closeFence();

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
