import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CreationFlow from '../CreationFlow';
import { omnichatService } from '../../../../services/omnichatService';
import type { IAIOptions } from '../../../../types/omnichat';

vi.mock('../../../../services/omnichatService', async () => {
  const actual = await vi.importActual<typeof import('../../../../services/omnichatService')>(
    '../../../../services/omnichatService'
  );
  return {
    ...actual,
    omnichatService: {
      getIAIOptions: vi.fn(),
      getIAINames: vi.fn(),
      createIAI: vi.fn(),
    },
  };
});

const options: IAIOptions = {
  temperaments: ['warm', 'guarded', 'quiet'],
  temperament_picks: 3,
  feelings: ['guarded', 'neutral', 'fond'],
  attractions: ['none', 'some', 'strong'],
  interests: ['games', 'cooking', 'coffee', 'space'],
  interest_picks: 3,
  appearance: {
    style: ['realistic', 'anime'],
    gender: ['woman', 'man'],
    ethnicity: ['latino', 'white'],
    hair_length: ['short', 'long'],
    hair_texture: ['straight', 'coily'],
    hair_colour: ['black', 'blonde'],
  },
  eyes: { realistic: ['brown', 'amber'], anime: ['brown', 'amber', 'violet'] },
  builds: { woman: ['slim', 'curvy'], man: ['slim', 'stocky'] },
  hair_styles: {
    realistic: {
      woman: { straight: ['bob'], coily: ['bob', 'afro'] },
      man: { straight: ['fade'], coily: ['fade', 'afro'] },
    },
    anime: {
      woman: { straight: ['bob', 'afro'], coily: ['bob', 'afro'] },
      man: { straight: ['fade', 'afro'], coily: ['fade', 'afro'] },
    },
  },
  minimum_age: 18,
  maximum_age: 99,
  minimum_height_inches: 58,
  maximum_height_inches: 84,
  iai_limit: 1,
  iai_required_plan: 'premium',
  roleplay_limits: { free: 0, plus: 5, premium: 10 },
};

function renderFlow() {
  const onMade = vi.fn();
  const onRefused = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CreationFlow onMade={onMade} onRefused={onRefused} />
    </QueryClientProvider>
  );
  return { onMade, onRefused };
}

// delay: null, because userEvent pauses between pointer events by default and
// this file walks nine screens several times over. With the default the walk
// alone took 21s against a 20s timeout, so the suite failed on timing rather
// than on anything being wrong.
const user = userEvent.setup({ delay: null });
const clickText = async (text: string | RegExp) => user.click(await screen.findByText(text));

beforeEach(() => {
  vi.mocked(omnichatService.getIAIOptions).mockResolvedValue(options);
  vi.mocked(omnichatService.getIAINames).mockResolvedValue(['Camila', 'Anna', 'Sofia']);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the creation flow, rendered', () => {
  it('says nothing about her until it has asked', async () => {
    renderFlow();
    await screen.findByText('Who are we making');
    // Screen one is the only screen that renders before gender is answered.
    expect(screen.queryByText(/\bshe\b/i)).toBeNull();
    expect(screen.queryByText(/\bhe\b/i)).toBeNull();
  });

  it('refuses to advance until the screen is answered', async () => {
    renderFlow();
    await screen.findByText('Who are we making');
    const advance = screen.getByRole('button', { name: 'Continue' });
    expect(advance).toBeDisabled();

    await clickText('A woman');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('takes its pronouns from the answer', async () => {
    // The look page used to carry the sentence this asserted. The headings do
    // the same job and outlive copy changes: "His face", not "Her face".
    renderFlow();
    await clickText('A man');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Pick a look');
    await clickText('Realistic');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('His face')).toBeInTheDocument();
    expect(screen.queryByText('Her face')).toBeNull();
  });

  it('offers a hair shape by texture, and clears it when the style changes', async () => {
    renderFlow();
    await clickText('A woman');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await clickText('Anime');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Anime does not apply the texture rule, so an afro is offered on straight.
    await screen.findByText('Her face');
    await clickText('Straight');
    await clickText('Afro');
    await clickText('Violet');
    expect(screen.getByRole('button', { name: 'Afro' })).toHaveAttribute('aria-pressed', 'true');

    // Going back to realistic drops both, because the server would drop them.
    await user.click(screen.getByRole('button', { name: 'Look' }));
    await clickText('Realistic');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Her face');
    expect(screen.queryByRole('button', { name: 'Afro' })).toBeNull();
    // queryByRole, because getByRole throws when the element is gone -- which is
    // exactly the thing being asserted.
    expect(screen.queryByRole('button', { name: 'Violet' })).toBeNull();
  });

  it('will not let the rail skip ahead', async () => {
    renderFlow();
    await screen.findByText('Who are we making');
    expect(screen.getByRole('button', { name: /Traits/ })).toBeDisabled();
  });
});

/** Walk to a given step, answering only what each screen insists on. */
async function walkTo(target: number) {
  const answers: Record<number, string> = {
    1: 'A woman',
    2: 'Realistic',
    5: 'Warm',
    7: 'Fond',
  };
  for (let step = 1; step < target; step += 1) {
    if (answers[step]) await clickText(answers[step]);
    await user.click(screen.getByRole('button', { name: /Continue|Make/ }));
  }
}

describe('the last two screens', () => {
  it('shows the review before anything is made', async () => {
    renderFlow();
    await screen.findByText('Who are we making');
    await walkTo(9);

    // Every answer, one last time, above the sentence about what deleting her
    // costs. Committing before showing it would be asking somebody to confirm a
    // thing they were never shown.
    await screen.findByText('Meet her');
    expect(screen.getByText('Drawn to you')).toBeInTheDocument();
    expect(omnichatService.createIAI).not.toHaveBeenCalled();
  });

  it('makes her from the review screen', async () => {
    vi.mocked(omnichatService.createIAI).mockResolvedValue({ id: 7 } as never);
    const { onMade } = renderFlow();
    await screen.findByText('Who are we making');
    await walkTo(9);

    await user.click(screen.getByRole('button', { name: /Make her/ }));
    await waitFor(() => expect(onMade).toHaveBeenCalled());
  });

  it('lets somebody clear the suggested name and type their own', async () => {
    renderFlow();
    await screen.findByText('Who are we making');
    await walkTo(8);

    const field = await screen.findByRole('textbox', { name: /name/i });
    // One of the three, not a particular one: the suggestion is picked at
    // random, so naming it here made this pass or fail by luck.
    await waitFor(() =>
      expect(['Camila', 'Anna', 'Sofia']).toContain((field as HTMLInputElement).value)
    );

    // The suggestion must not grow back. An effect that refills whenever the
    // field is empty makes the field impossible to clear.
    await user.clear(field);
    await user.type(field, 'Nadia');
    expect(field).toHaveValue('Nadia');
  });
});
