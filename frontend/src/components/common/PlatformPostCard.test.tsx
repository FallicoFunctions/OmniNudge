import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformPostCard } from './PlatformPostCard';
import type { PlatformPost } from '../../types/posts';

const mockGetPlatformExternalEmbed = vi.fn();

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    blockNsfwThumbnails: false,
  }),
}));

vi.mock('../VoteButtons', () => ({
  VoteButtons: () => <div data-testid="vote-buttons" />,
}));

vi.mock('../../utils/platformExternalEmbeds', () => ({
  getPlatformExternalEmbed: (...args: unknown[]) => mockGetPlatformExternalEmbed(...args),
}));

const basePost: PlatformPost = {
  id: 42,
  title: 'Test 2',
  author_id: 7,
  author_username: 'DERRF',
  hub_name: 'test-hub',
  score: 9,
  comment_count: 81,
  created_at: '2026-01-01T00:00:00Z',
};

describe('PlatformPostCard', () => {
  beforeEach(() => {
    mockGetPlatformExternalEmbed.mockReset();
  });

  it("renders the author's username as a profile link in feed metadata", () => {
    render(
      <MemoryRouter>
        <PlatformPostCard post={basePost} useRelativeTime={true} />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'DERRF' })).toHaveAttribute('href', '/users/DERRF');
  });

  it('uses the shared external embed helper for supported provider previews', async () => {
    const user = userEvent.setup();
    mockGetPlatformExternalEmbed.mockReturnValue({
      kind: 'iframe',
      src: 'https://example.com/embed/video-42',
    });

    const { container } = render(
      <MemoryRouter>
        <PlatformPostCard
          post={{ ...basePost, title: 'Video', media_url: 'https://provider.test/watch/video-42' }}
          useRelativeTime={true}
        />
      </MemoryRouter>
    );

    const previewToggle = container.querySelector('button[aria-pressed]');
    expect(previewToggle).not.toBeNull();

    await user.click(previewToggle!);

    expect(screen.getByTitle('Video')).toHaveAttribute(
      'src',
      expect.stringContaining('https://example.com/embed/video-42')
    );
  });

  it('hides broken preview thumbnails instead of leaving a broken image element behind', () => {
    render(
      <MemoryRouter>
        <PlatformPostCard
          post={{ ...basePost, title: 'Broken preview', thumbnail_url: '/uploads/broken.png' }}
          useRelativeTime={true}
        />
      </MemoryRouter>
    );

    const image = screen.getByRole('img', { name: 'Preview image for Broken preview' });
    fireEvent.error(image);

    expect(
      screen.queryByRole('img', { name: 'Preview image for Broken preview' })
    ).not.toBeInTheDocument();
  });
});
