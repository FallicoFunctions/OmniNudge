import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import LikenessPicker from '../LikenessPicker';
import { omnichatService } from '../../../../services/omnichatService';
import type { IAILikenessChoice } from '../../../../types/omnichat';

vi.mock('../../../../services/omnichatService', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  omnichatService: {
    getLikenessCandidates: vi.fn(),
    pickLikeness: vi.fn(),
  },
}));

function renderPicker() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LikenessPicker personaId={31} gender="woman" />
    </QueryClientProvider>
  );
}

const choice = (over: Partial<IAILikenessChoice> = {}): IAILikenessChoice => ({
  candidates: [
    { id: 11, content_url: '/api/v1/omnichat/iai/31/likeness/11/content', ready: true },
    { id: 12, content_url: '/api/v1/omnichat/iai/31/likeness/12/content', ready: true },
  ],
  pending: 0,
  ...over,
});

beforeEach(() => {
  vi.mocked(omnichatService.pickLikeness).mockResolvedValue({ asset_id: 'a1' });
});

afterEach(() => vi.clearAllMocks());

describe('choosing her face', () => {
  it('shows nothing when there is nothing to choose and nothing coming', async () => {
    // She was made before this existed, or every render failed. An empty panel
    // is worse than no panel.
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue({
      candidates: [],
      pending: 0,
    });
    renderPicker();

    // findByText retries until it times out, so this proves the panel never
    // appeared. queryByText ran before it could have appeared either way and
    // passed whether or not the guard was there.
    await expect(screen.findByText('Choose how she looks')).rejects.toThrow();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says what the choice decides, because it cannot be undone', async () => {
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice());
    renderPicker();

    expect(await screen.findByText('Choose how she looks')).toBeInTheDocument();
    expect(
      screen.getByText(/This is the one you keep. It becomes her picture everywhere she appears./)
    ).toBeInTheDocument();
  });

  it('holds a place for every render still on its way', async () => {
    // Four spaces from the start, rather than the row growing under somebody's
    // cursor while they are deciding.
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice({ pending: 2 }));
    renderPicker();

    await screen.findByText('Choose how she looks');
    // Two arrived and are choosable; two are still coming and are not.
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('does not offer a picture that has not been scanned yet', async () => {
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue({
      candidates: [
        { id: 11, content_url: '/c/11', ready: true },
        { id: 12, content_url: '/c/12', ready: false },
      ],
      pending: 0,
    });
    renderPicker();

    await screen.findByText('Choose how she looks');
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toBeEnabled();
    expect(buttons[1]).toBeDisabled();
  });

  it('keeps the one that is pressed', async () => {
    const user = userEvent.setup();
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice());
    renderPicker();

    await screen.findByText('Choose how she looks');
    await user.click(screen.getAllByRole('button')[1]);

    await waitFor(() => expect(omnichatService.pickLikeness).toHaveBeenCalledWith(31, 12));
  });

  it('loads each picture through its own route, never a storage path', async () => {
    // A picture nobody has chosen should not be linkable by anyone who learns
    // the address, which is why a candidate is not served like a gallery asset.
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice());
    renderPicker();

    await screen.findByText('Choose how she looks');
    const images = document.querySelectorAll('img');
    expect(images).toHaveLength(2);
    images.forEach((image) => {
      expect(image.getAttribute('src')).toMatch(
        /^\/api\/v1\/omnichat\/iai\/31\/likeness\/\d+\/content$/
      );
    });
  });

  it('cannot be pressed again once a choice is made', async () => {
    // The panel is still on screen after choosing, because the refetch that
    // removes it has not landed. Until this, the pictures were still pressable:
    // a second press reached the server, was refused because the choice was
    // already made, and told somebody their pick had failed when it had worked.
    const user = userEvent.setup();
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice());
    renderPicker();

    await screen.findByText('Choose how she looks');
    await user.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(omnichatService.pickLikeness).toHaveBeenCalledTimes(1));

    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    await user.click(screen.getAllByRole('button')[1]);
    expect(omnichatService.pickLikeness).toHaveBeenCalledTimes(1);
  });

  it('does not claim the picture failed after it was kept', async () => {
    // A stale error from an earlier press must not outlive a pick that worked.
    const user = userEvent.setup();
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice());
    renderPicker();

    await screen.findByText('Choose how she looks');
    await user.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(omnichatService.pickLikeness).toHaveBeenCalled());

    expect(screen.queryByText(/could not be kept/)).toBeNull();
  });
});
