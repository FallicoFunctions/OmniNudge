import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../components/loading', () => ({
  CircularProgress: () => <div data-testid="circular-progress">CircularProgress</div>,
  LoadingSpinner: () => <div data-testid="loading-spinner">LoadingSpinner</div>,
  ProgressBar: ({ value }: { value?: number }) => (
    <div data-testid="progress-bar" data-value={value}>
      ProgressBar
    </div>
  ),
  ShimmerEffect: () => <div data-testid="shimmer-effect">ShimmerEffect</div>,
  SkeletonCard: () => <div data-testid="skeleton-card">SkeletonCard</div>,
  SkeletonList: () => <div data-testid="skeleton-list">SkeletonList</div>,
  SkeletonPost: () => <div data-testid="skeleton-post">SkeletonPost</div>,
  selectLoadingPattern: () => 'skeleton',
}));

import LoadingStatesShowcasePage from '../LoadingStatesShowcasePage';

describe('LoadingStatesShowcasePage', () => {
  it('renders without crashing', () => {
    render(<LoadingStatesShowcasePage />);
    expect(screen.getByText('loadingShowcase.title')).toBeInTheDocument();
  });

  it('displays loading component variants', () => {
    render(<LoadingStatesShowcasePage />);
    expect(screen.getAllByTestId('loading-spinner').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('circular-progress').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('progress-bar').length).toBeGreaterThan(0);
  });

  it('all loading state sections are present', () => {
    render(<LoadingStatesShowcasePage />);
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('skeleton-list').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('skeleton-post').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('shimmer-effect').length).toBeGreaterThan(0);
  });
});
