import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../../hooks/useFormat', () => ({
  useFormat: () => ({
    formatNumber: (value: unknown) => String(value),
    formatDate: (value: unknown) => String(value),
    formatRelativeTime: () => 'just now',
  }),
}));

vi.mock('../../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    blockNsfwThumbnails: false,
  }),
}));

vi.mock('../../../components/common/PinnedBadge', () => ({
  PinnedBadge: () => <div data-testid="pinned-badge" />,
}));

vi.mock('../FlairBadge', () => ({
  FlairBadge: () => null,
}));

vi.mock('../../posts/PostBodyMarkdown', () => ({
  PostBodyMarkdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

import { RedditPostCard } from '../RedditPostCard';

describe('RedditPostCard', () => {
  it('prefers the direct reddit gif URL over the static preview image when expanding media', () => {
    render(
      <MemoryRouter>
        <RedditPostCard
          post={{
            id: 'abc123',
            title: 'Animated GIF',
            author: 'alice',
            subreddit: 'funny',
            score: 42,
            num_comments: 7,
            created_utc: 1_717_000_000,
            url: 'https://i.redd.it/7xy6oyiw9p3h1.gif',
            thumbnail: 'https://b.thumbs.redditmedia.com/static-thumb.jpg',
            preview: {
              images: [
                {
                  source: {
                    url: 'https://preview.redd.it/static-preview.jpg?width=640&crop=smart&auto=webp&s=123',
                  },
                },
              ],
            },
            is_self: false,
            post_hint: 'image',
          }}
          useRelativeTime
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'posts.aria.showPreview' }));

    const previewImage = screen.getByRole('img', { name: 'Animated GIF' });
    expect(previewImage).toHaveAttribute('src', 'https://i.redd.it/7xy6oyiw9p3h1.gif');
  });
});
