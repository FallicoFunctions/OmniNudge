import { describe, expect, it } from 'vitest';
import { buildRedditCommentEmbedHtml } from '../../src/utils/redditEmbed';

const messages = {
  en: {
    userPath: 'u/{{name}}',
    commentByUser: 'Comment by {{author}}',
  },
  es: {
    userPath: 'u/{{name}}',
    commentByUser: 'Comentario de {{author}}',
  },
  ar: {
    userPath: 'u/{{name}}',
    commentByUser: 'تعليق بواسطة {{author}}',
  },
} as const;

function tFactory(locale: keyof typeof messages) {
  return (key: string, options?: Record<string, unknown>) => {
    if (key === 'common.format.userPath') {
      return messages[locale].userPath.replace('{{name}}', String(options?.name ?? ''));
    }
    if (key === 'posts.embed.commentByUser') {
      return messages[locale].commentByUser.replace('{{author}}', String(options?.author ?? ''));
    }
    return key;
  };
}

describe('buildRedditCommentEmbedHtml', () => {
  const payload = {
    author: 'alice',
    body: '<b>Hello</b> & goodbye',
    permalink: 'https://reddit.example/r/test/comments/123',
    createdAt: '2026-02-18T12:00:00.000Z',
  };

  it('renders localized attribution in English', () => {
    const html = buildRedditCommentEmbedHtml(payload, tFactory('en'));
    expect(html).toContain('Comment by u/alice');
  });

  it('renders localized attribution in Spanish', () => {
    const html = buildRedditCommentEmbedHtml(payload, tFactory('es'));
    expect(html).toContain('Comentario de u/alice');
  });

  it('renders localized attribution in Arabic', () => {
    const html = buildRedditCommentEmbedHtml(payload, tFactory('ar'));
    expect(html).toContain('تعليق بواسطة u/alice');
  });

  it('escapes body and permalink safely', () => {
    const html = buildRedditCommentEmbedHtml(
      {
        ...payload,
        body: `<img src=x onerror=alert('xss')>`,
        permalink: 'https://reddit.example/r/test?x="onmouseover=alert(1)"',
      },
      tFactory('en')
    );

    expect(html).toContain('&lt;img src=x onerror=alert(\'xss\')&gt;');
    expect(html).toContain('href="https://reddit.example/r/test?x=&quot;onmouseover=alert(1)&quot;"');
    expect(html).not.toContain('<img src=x onerror');
  });
});

