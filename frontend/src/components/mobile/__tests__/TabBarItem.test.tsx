import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MessageCircle } from 'lucide-react';
import { TabBarItem } from '../TabBarItem';

const renderTab = (badge?: number) =>
  render(
    <TabBarItem
      icon={MessageCircle}
      translationKey="nav.messages"
      active={false}
      onClick={() => {}}
      badge={badge}
      testId="tab"
    />
  );

describe('TabBarItem badge', () => {
  // `{badge && ...}` rendered the 0 itself: the Messages tab read "0" whenever
  // nothing was unread.
  it.each([
    ['no unread messages', 0],
    ['no count at all', undefined],
  ])('shows nothing for %s', (_name, badge) => {
    renderTab(badge);
    expect(screen.getByTestId('tab').textContent).not.toMatch(/\d/);
  });

  it('shows the count when something is unread', () => {
    renderTab(3);
    expect(screen.getByTestId('tab')).toHaveTextContent('3');
  });
});
