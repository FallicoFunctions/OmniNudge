import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import ModerationReportsPage from '../ModerationReportsPage';

const useAuthMock = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../../components/moderation/ModerationDashboard', () => ({
  ModerationDashboard: () => <div data-testid="moderation-dashboard">Dashboard</div>,
}));

describe('ModerationReportsPage', () => {
  beforeEach(() => {
    useAuthMock.mockReset();
  });

  it('redirects non-moderators to home', () => {
    useAuthMock.mockReturnValue({
      user: { id: 1, username: 'user', role: 'user' },
    });

    render(
      <MemoryRouter initialEntries={['/mod/reports']}>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/mod/reports" element={<ModerationReportsPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('renders moderation dashboard for moderators', () => {
    useAuthMock.mockReturnValue({
      user: { id: 2, username: 'mod', role: 'moderator' },
    });

    render(
      <MemoryRouter initialEntries={['/mod/reports']}>
        <Routes>
          <Route path="/mod/reports" element={<ModerationReportsPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('moderation-dashboard')).toBeInTheDocument();
    expect(screen.getByText('Moderation Dashboard')).toBeInTheDocument();
  });
});
