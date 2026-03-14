import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../PostDetailPage', () => ({
  default: () => <div>MockPostDetailPage</div>,
}));

vi.mock('../RedditPostPage', () => ({
  default: () => <div>MockRedditPostPage</div>,
}));

// Import after mocks are set up
import RedditPostWrapper from '../RedditPostWrapper';

const renderWithRoute = (path: string, routePath = '/post/:postId') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath} element={<RedditPostWrapper />} />
        <Route path="/post/" element={<RedditPostWrapper />} />
      </Routes>
    </MemoryRouter>,
  );

describe('RedditPostWrapper', () => {
  it('renders PostDetailPage for numeric postId', () => {
    renderWithRoute('/post/123');
    expect(screen.getByText('MockPostDetailPage')).toBeInTheDocument();
  });

  it('renders RedditPostPage for alphanumeric postId', () => {
    renderWithRoute('/post/abc123');
    expect(screen.getByText('MockRedditPostPage')).toBeInTheDocument();
  });

  it('renders RedditPostPage when no postId', () => {
    render(
      <MemoryRouter initialEntries={['/post/']}>
        <Routes>
          <Route path="/post/" element={<RedditPostWrapper />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('MockRedditPostPage')).toBeInTheDocument();
  });
});
