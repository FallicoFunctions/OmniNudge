import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import OmniChatNewOmniAIPage from '../OmniChatNewOmniAIPage';
import { useAuth } from '../../contexts/AuthContext';
import { omnichatQueryKeys, omnichatService } from '../../services/omnichatService';
import type { OmniAIOptions } from '../../types/omnichat';

vi.mock('../../services/omnichatService', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  omnichatService: {
    getOmniAIOptions: vi.fn(),
    getOmniAINames: vi.fn(),
    createOmniAI: vi.fn(),
    createConversation: vi.fn(),
  },
}));

vi.mock('../../components/omnichat/OmniChatShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/omnichat/useOmniChatNavigation', () => ({
  useOmniChatNavigation: () => vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../components/omnichat/omniai/CreationFlow', () => ({
  default: ({ onMade }: { onMade: (persona: { id: number }) => void }) => (
    <div>
      An OmniAI
      <button type="button" onClick={() => onMade({ id: 12 })}>
        Finish creation
      </button>
    </div>
  ),
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
  omniai_limit: 1,
  omniai_owned: 0,
  omniai_allowed: true,
  omniai_required_plan: 'premium',
  roleplay_limits: { free: 0, plus: 5, premium: 10 },
} as unknown as OmniAIOptions;

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage(client = newClient()) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OmniChatNewOmniAIPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return client;
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ user: { id: 9 } } as ReturnType<typeof useAuth>);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('somebody who already keeps one', () => {
  it('is told before the questions start, not after them', async () => {
    vi.mocked(omnichatService.getOmniAIOptions).mockResolvedValue({ ...options, omniai_owned: 1 });
    renderPage();

    // The refusal existed already, but only fired on the error from submitting
    // the last screen -- so somebody at their limit answered every question and
    // was then told it was never going to work.
    expect(await screen.findByText('You already have one')).toBeInTheDocument();
    expect(screen.queryByText('An OmniAI')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });

  it('is pointed at the characters they have', async () => {
    vi.mocked(omnichatService.getOmniAIOptions).mockResolvedValue({ ...options, omniai_owned: 1 });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Open your characters' })).toBeInTheDocument();
  });
});

describe('somebody with a free slot', () => {
  it('gets the questions', async () => {
    vi.mocked(omnichatService.getOmniAIOptions).mockResolvedValue(options);
    renderPage();

    expect(await screen.findByText('An OmniAI')).toBeInTheDocument();
    expect(screen.queryByText('You already have one')).toBeNull();
  });

  it('does not reuse another account\'s cached entitlement', async () => {
    const client = newClient();
    client.setQueryData(omnichatQueryKeys.omniAIOptions(8), {
      ...options,
      omniai_allowed: false,
    });
    vi.mocked(omnichatService.getOmniAIOptions).mockResolvedValue(options);

    renderPage(client);

    expect(await screen.findByText('An OmniAI')).toBeInTheDocument();
    expect(omnichatService.getOmniAIOptions).toHaveBeenCalledOnce();
  });

  it('updates the owned count as soon as creation succeeds', async () => {
    vi.mocked(omnichatService.getOmniAIOptions).mockResolvedValue(options);
    vi.mocked(omnichatService.createConversation).mockImplementation(
      () => new Promise(() => undefined)
    );
    const client = renderPage();
    await screen.findByText('An OmniAI');

    fireEvent.click(screen.getByRole('button', { name: 'Finish creation' }));

    await waitFor(() => {
      const cached = client.getQueryData<OmniAIOptions>(omnichatQueryKeys.omniAIOptions(9));
      expect(cached?.omniai_owned).toBe(1);
    });
  });

  it('is not locked out when the count cannot be read', async () => {
    // omniai_owned is what somebody is shown, not what enforces anything. The
    // server refuses again at creation, so a count that came back zero because
    // it failed must not close a page they are entitled to.
    vi.mocked(omnichatService.getOmniAIOptions).mockResolvedValue({ ...options, omniai_owned: 0 });
    renderPage();

    expect(await screen.findByText('An OmniAI')).toBeInTheDocument();
  });
});

describe('when the options cannot be loaded', () => {
  it('offers a retry instead of spinning forever', async () => {
    vi.mocked(omnichatService.getOmniAIOptions).mockRejectedValueOnce(new Error('offline'));
    renderPage();

    expect(await screen.findByText('The creation options did not load')).toBeInTheDocument();
    vi.mocked(omnichatService.getOmniAIOptions).mockResolvedValue(options);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('An OmniAI')).toBeInTheDocument();
  });
});

describe('somebody whose plan does not include an OmniAI', () => {
  it('is told before the questions start', async () => {
    vi.mocked(omnichatService.getOmniAIOptions).mockResolvedValue({
      ...options,
      omniai_allowed: false,
    });
    renderPage();

    expect(await screen.findByText('This one comes with Premium')).toBeInTheDocument();
    expect(screen.queryByText('An OmniAI')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(screen.getByRole('button', { name: 'See the plans' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });
});
