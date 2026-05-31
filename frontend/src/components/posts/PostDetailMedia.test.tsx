import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostDetailMedia } from './PostDetailMedia';

const mockGetPlatformExternalEmbed = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../utils/platformExternalEmbeds', () => ({
  getPlatformExternalEmbed: (...args: unknown[]) => mockGetPlatformExternalEmbed(...args),
}));

describe('PostDetailMedia', () => {
  beforeEach(() => {
    mockGetPlatformExternalEmbed.mockReset();
  });

  it('does not render an image for a plain external article URL without a thumbnail', () => {
    const { container } = render(
      <PostDetailMedia
        mediaUrl="https://thefootballromantic.blogspot.com/2026/05/the-anatomy-of-football-team.html"
        thumbnailUrl={null}
        decodedTitle="The anatomy of a football team"
        isVideoMedia={false}
        imageExpanded={false}
        onToggleExpanded={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the thumbnail instead of the article URL for plain external link posts', () => {
    render(
      <PostDetailMedia
        mediaUrl="https://thefootballromantic.blogspot.com/2026/05/the-anatomy-of-football-team.html"
        thumbnailUrl="/uploads/link-thumb.png"
        decodedTitle="The anatomy of a football team"
        isVideoMedia={false}
        imageExpanded={false}
        onToggleExpanded={vi.fn()}
      />
    );

    expect(screen.getByRole('img', { name: 'The anatomy of a football team' })).toHaveAttribute(
      'src',
      'http://localhost:8080/uploads/link-thumb.png'
    );
  });

  it('uses the shared external embed helper for supported providers', () => {
    mockGetPlatformExternalEmbed.mockReturnValue({
      kind: 'iframe',
      src: 'https://example.com/embed/video-99',
    });

    render(
      <PostDetailMedia
        mediaUrl="https://provider.test/watch/video-99"
        decodedTitle="Video"
        isVideoMedia={false}
        imageExpanded={false}
        onToggleExpanded={vi.fn()}
      />
    );

    expect(screen.getByTitle('Video')).toHaveAttribute('src', 'https://example.com/embed/video-99');
  });

  it('hides broken stored preview images instead of rendering a broken image icon', () => {
    render(
      <PostDetailMedia
        mediaUrl="https://thefootballromantic.blogspot.com/2026/05/the-anatomy-of-football-team.html"
        thumbnailUrl="/uploads/broken.png"
        decodedTitle="Broken preview"
        isVideoMedia={false}
        imageExpanded={false}
        onToggleExpanded={vi.fn()}
      />
    );

    const image = screen.getByRole('img', { name: 'Broken preview' });
    fireEvent.error(image);

    expect(screen.queryByRole('img', { name: 'Broken preview' })).not.toBeInTheDocument();
  });
});
