export interface RedditCommentEmbedPayload {
  author: string;
  body: string;
  permalink: string;
  createdAt: string;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildRedditCommentEmbedHtml(
  data: RedditCommentEmbedPayload,
  t: Translate
): string {
  const body = escapeHtml(data.body);
  const authorPath = t('common.format.userPath', { name: data.author });
  const commentByText = escapeHtml(t('posts.embed.commentByUser', { author: authorPath }));
  const permalink = escapeHtmlAttribute(data.permalink);
  const timestamp = Math.floor(new Date(data.createdAt).getTime() / 1000);

  return `<blockquote class="reddit-card" data-card-created="${timestamp}"><p>${body}</p><a href="${permalink}">${commentByText}</a></blockquote><script async src="https://embed.redditmedia.com/widgets/platform.js" charset="UTF-8"></script>`;
}

