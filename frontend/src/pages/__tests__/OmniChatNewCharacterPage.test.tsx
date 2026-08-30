import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import OmniChatNewCharacterPage from '../OmniChatNewCharacterPage';
import { omnichatService } from '../../services/omnichatService';
import type { IAIOptions } from '../../types/omnichat';

vi.mock('../../services/omnichatService', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  omnichatService: {
    getIAIOptions: vi.fn(),
    getIAINames: vi.fn(),
    createIAI: vi.fn(),
    createConversation: vi.fn(),
  },
}));

vi.mock('../../components/omnichat/OmniChatShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/omnichat/useOmniChatNavigation', () => ({
  useOmniChatNavigation: () => vi.fn(),
}));

const options = {
  temperaments: ['warm'],
  temperament_picks: 3,
  feelings: ['fond'],
  relationships: ['friend'],
  interests: ['music'],
  interest_picks: 3,
  appearance: {
    style: ['realistic'],
    gender: ['woman', 'man'],
    ethnicity: ['white'],
    hair_length: ['short'],
    hair_texture: ['straight'],
    hair_colour: ['black'],
  },
  eyes: { realistic: ['brown'] },
  builds: { woman: ['slim'], man: ['lean'] },
  hair_styles: { realistic: { woman: { straight: ['loose'] }, man: { straight: ['loose'] } } },
  minimum_age: 18,
  maximum_age: 99,
  minimum_height_inches: 58,
  maximum_height_inches: 84,
  iai_limit: 1,
  iai_owned: 0,
  iai_required_plan: 'premium',
  roleplay_limits: { free: 0, plus: 5, premium: 10 },
} as unknown as IAIOptions;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OmniChatNewCharacterPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(omnichatService.getIAINames).mockResolvedValue(['Camila']);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('somebody who already keeps one', () => {
  it('is told before the questions start, not after them', async () => {
    vi.mocked(omnichatService.getIAIOptions).mockResolvedValue({ ...options, iai_owned: 1 });
    renderPage();

    // The refusal existed already, but only fired on the error from submitting
    // the last screen -- so somebody at their limit answered every question and
    // was then told it was never going to work.
    expect(await screen.findByText('You already have one')).toBeInTheDocument();
    expect(screen.queryByText('An independent character')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });

  it('is pointed at the characters they have', async () => {
    vi.mocked(omnichatService.getIAIOptions).mockResolvedValue({ ...options, iai_owned: 1 });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Open your characters' })).toBeInTheDocument();
  });
});

describe('somebody with a free slot', () => {
  it('gets the questions', async () => {
    vi.mocked(omnichatService.getIAIOptions).mockResolvedValue(options);
    renderPage();

    expect(await screen.findByText('An independent character')).toBeInTheDocument();
    expect(screen.queryByText('You already have one')).toBeNull();
  });

  it('is not locked out when the count cannot be read', async () => {
    // iai_owned is what somebody is shown, not what enforces anything. The
    // server refuses again at creation, so a count that came back zero because
    // it failed must not close a page they are entitled to.
    vi.mocked(omnichatService.getIAIOptions).mockResolvedValue({ ...options, iai_owned: 0 });
    renderPage();

    expect(await screen.findByText('An independent character')).toBeInTheDocument();
  });
});
