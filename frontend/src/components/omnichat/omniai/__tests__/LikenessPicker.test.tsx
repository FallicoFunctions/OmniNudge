import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import LikenessPicker from '../LikenessPicker';
import { omnichatService } from '../../../../services/omnichatService';
import type { OmniAILikenessChoice } from '../../../../types/omnichat';

vi.mock('../../../../services/omnichatService', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  omnichatService: {
    getLikenessCandidates: vi.fn(),
    pickLikeness: vi.fn(),
    rerollLikeness: vi.fn(),
    getBillingUsage: vi.fn(),
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

const choice = (over: Partial<OmniAILikenessChoice> = {}): OmniAILikenessChoice => ({
  candidates: [
    { id: 11, content_url: '/api/v1/omnichat/omniai/31/likeness/11/content', ready: true },
    { id: 12, content_url: '/api/v1/omnichat/omniai/31/likeness/12/content', ready: true },
  ],
  pending: 0,
  ...over,
});

beforeEach(() => {
  vi.mocked(omnichatService.pickLikeness).mockResolvedValue({ asset_id: 'a1' });
  vi.mocked(omnichatService.rerollLikeness).mockResolvedValue({ started: 4 });
  vi.mocked(omnichatService.getBillingUsage).mockResolvedValue({
    usage: [],
    costs: { voice: 2, image: 10, video: 40 },
    limit: 1,
  });
});

afterEach(() => vi.clearAllMocks());

/**
 * The pictures, and only the pictures.
 *
 * These used to be counted as "every button on the panel", which stopped
 * meaning the same thing the moment the panel grew a second kind of button.
 * The candidates are the ones that say which picture they are.
 */
function pictureButtons() {
  return screen.getAllByRole('button', { name: /^(Choose|Picture) / });
}

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
    expect(pictureButtons()).toHaveLength(2);
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
    const buttons = pictureButtons();
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toBeEnabled();
    expect(buttons[1]).toBeDisabled();
  });

  it('keeps the one that is pressed', async () => {
    const user = userEvent.setup();
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice());
    renderPicker();

    await screen.findByText('Choose how she looks');
    await user.click(pictureButtons()[1]);

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
        /^\/api\/v1\/omnichat\/omniai\/31\/likeness\/\d+\/content$/
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
    await user.click(pictureButtons()[0]);
    await waitFor(() => expect(omnichatService.pickLikeness).toHaveBeenCalledTimes(1));

    for (const button of pictureButtons()) {
      expect(button).toBeDisabled();
    }
    await user.click(pictureButtons()[1]);
    expect(omnichatService.pickLikeness).toHaveBeenCalledTimes(1);
  });

  it('does not claim the picture failed after it was kept', async () => {
    // A stale error from an earlier press must not outlive a pick that worked.
    const user = userEvent.setup();
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice());
    renderPicker();

    await screen.findByText('Choose how she looks');
    await user.click(pictureButtons()[0]);
    await waitFor(() => expect(omnichatService.pickLikeness).toHaveBeenCalled());

    expect(screen.queryByText(/could not be kept/)).toBeNull();
  });

  it('names every picture, because a screen reader has nothing else to go on', async () => {
    // The picture is the only content in each button and it cannot be
    // described -- nothing here knows what a render came back as. Without a
    // name the whole choice was four buttons called "button", on a decision
    // that cannot be undone.
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue({
      candidates: [
        { id: 11, content_url: '/c/11', ready: true },
        { id: 12, content_url: '/c/12', ready: false },
      ],
      pending: 0,
    });
    renderPicker();

    await screen.findByText('Choose how she looks');
    expect(screen.getByRole('button', { name: 'Choose picture 1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Picture 2, still arriving' })).toBeDisabled();
  });
});

describe('drawing another set', () => {
  it('prices the set from what the server charges, not from a constant', async () => {
    // Both facts belong on the button before it is pressed, and the number has
    // to be the one that will actually be charged. The image price is
    // configured on the server and published; four of them is the set.
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice());
    renderPicker();

    await screen.findByText('Choose how she looks');
    expect(
      await screen.findByRole('button', { name: /Draw four more \(40 credits\)/ })
    ).toBeEnabled();
    expect(screen.getByText('These four are replaced.')).toBeInTheDocument();
  });

  it('follows the server when the image price changes', async () => {
    // The number on the button is not a constant this file keeps. If it were,
    // it would go wrong silently the first time the rate moved.
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice());
    vi.mocked(omnichatService.getBillingUsage).mockResolvedValue({
      usage: [],
      costs: { voice: 2, image: 25, video: 40 },
      limit: 1,
    });
    renderPicker();

    await screen.findByText('Choose how she looks');
    expect(await screen.findByRole('button', { name: /Draw four more \(100 credits\)/ })).toBeEnabled();
  });

  it('names no price at all when it does not know one', async () => {
    // Better to say nothing about cost than to name one nobody promised to
    // charge. The button still works; it just does not claim a number.
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice());
    vi.mocked(omnichatService.getBillingUsage).mockRejectedValue(new Error('offline'));
    renderPicker();

    await screen.findByText('Choose how she looks');
    const button = await screen.findByRole('button', { name: /^Draw four more$/ });
    expect(button).toBeEnabled();
    expect(screen.queryByText(/credits\)/)).toBeNull();
  });

  it('waits for the renders already on their way', async () => {
    // Drawing again cancels what is in flight, so offering it mid-render is
    // offering to throw away pictures that are about to arrive.
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice({ pending: 2 }));
    renderPicker();

    await screen.findByText('Choose how she looks');
    expect(screen.getByRole('button', { name: /Draw four more/ })).toBeDisabled();
  });

  it('is gone once a face has been chosen', async () => {
    // After a pick the answer is not another set, it is that she already has a
    // face. Leaving the button there offers something the server will refuse.
    const user = userEvent.setup();
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice());
    renderPicker();

    await screen.findByText('Choose how she looks');
    await user.click(pictureButtons()[0]);
    await waitFor(() => expect(omnichatService.pickLikeness).toHaveBeenCalled());

    expect(screen.queryByRole('button', { name: /Draw four more/ })).toBeNull();
  });

  it('tells somebody short of credits that, and not something else', async () => {
    const user = userEvent.setup();
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice());
    vi.mocked(omnichatService.rerollLikeness).mockRejectedValue({
      response: { status: 402, data: { code: 'insufficient_credits', message: 'nope' } },
    });
    renderPicker();

    await screen.findByText('Choose how she looks');
    await user.click(screen.getByRole('button', { name: /Draw four more/ }));

    expect(await screen.findByText(/costs more credits than you have/)).toBeInTheDocument();
  });

  it('tells somebody whose character already has a face exactly that', async () => {
    // Not a money problem, and not a generic failure. Both would send them to
    // the wrong place.
    const user = userEvent.setup();
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice());
    vi.mocked(omnichatService.rerollLikeness).mockRejectedValue({
      response: { status: 409, data: { code: 'likeness_already_chosen', message: 'nope' } },
    });
    renderPicker();

    await screen.findByText('Choose how she looks');
    await user.click(screen.getByRole('button', { name: /Draw four more/ }));

    expect(await screen.findByText(/face is already chosen/)).toBeInTheDocument();
  });
});

describe('what the button tells somebody who cannot see it', () => {
  it('announces that these four are replaced, not just the price', async () => {
    // The note beside the button is the only thing that says the current four
    // go. A screen reader has no reason to read a neighbouring span, so the
    // button has to point at it.
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice());
    renderPicker();

    await screen.findByText('Choose how she looks');
    const button = await screen.findByRole('button', { name: /Draw four more/ });
    const described = button.getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    expect(document.getElementById(described as string)?.textContent).toMatch(/replaced/);
  });

  it('does not tell somebody to retry something that cannot work', async () => {
    // An unwired deployment will refuse every press. "Try again" sends them to
    // press a button forever.
    const user = userEvent.setup();
    vi.mocked(omnichatService.getLikenessCandidates).mockResolvedValue(choice());
    vi.mocked(omnichatService.rerollLikeness).mockRejectedValue({
      response: { status: 503, data: { code: 'reroll_unavailable', message: 'nope' } },
    });
    renderPicker();

    await screen.findByText('Choose how she looks');
    await user.click(await screen.findByRole('button', { name: /Draw four more/ }));

    expect(await screen.findByText(/unavailable right now/)).toBeInTheDocument();
    expect(screen.queryByText(/Try again/)).toBeNull();
  });
});
