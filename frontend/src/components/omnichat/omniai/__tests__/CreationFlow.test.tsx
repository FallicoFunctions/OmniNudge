import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CreationFlow from '../CreationFlow';
import { STEP } from '../useCreationFlow';
import { omnichatService } from '../../../../services/omnichatService';
import type { OmniAIOptions } from '../../../../types/omnichat';

vi.mock('../../../../services/omnichatService', async () => {
  const actual = await vi.importActual<typeof import('../../../../services/omnichatService')>(
    '../../../../services/omnichatService'
  );
  return {
    ...actual,
    omnichatService: {
      getOmniAINames: vi.fn(),
      createOmniAI: vi.fn(),
    },
  };
});

const options: OmniAIOptions = {
  temperaments: ['warm', 'guarded', 'quiet'],
  temperament_picks: 3,
  feelings: ['guarded', 'neutral', 'fond'],
  relationships: ['friend', 'situationship', 'partner', 'spouse'],
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
  omniai_limit: 1,
  omniai_owned: 0,
  omniai_allowed: true,
  omniai_required_plan: 'premium',
  roleplay_limits: { free: 0, plus: 5, premium: 10 },
};

function renderFlow() {
  const onMade = vi.fn();
  const onRefused = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CreationFlow options={options} onMade={onMade} onRefused={onRefused} />
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

/**
 * Render, and step past the intro onto the first question.
 *
 * The intro screen states what an OmniAI is and asks nothing, so
 * every test that is about a question starts on the other side of it. The two
 * tests that are about the intro itself do not use this.
 */
async function renderAtBasics() {
  const handles = renderFlow();
  await screen.findByText('An OmniAI');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('Who are we making');
  return handles;
}

beforeEach(() => {
  vi.mocked(omnichatService.getOmniAINames).mockResolvedValue(['Camila', 'Anna', 'Sofia']);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the creation flow, rendered', () => {
  it('says nothing about her until it has asked', async () => {
    await renderAtBasics();
    // Screen one is the only screen that renders before gender is answered.
    expect(screen.queryByText(/\bshe\b/i)).toBeNull();
    expect(screen.queryByText(/\bhe\b/i)).toBeNull();
  });

  it('refuses to advance until the screen is answered', async () => {
    await renderAtBasics();
    const advance = screen.getByRole('button', { name: 'Continue' });
    expect(advance).toBeDisabled();

    await clickText('A woman');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('takes its pronouns from the answer', async () => {
    // The look page used to carry the sentence this asserted. The headings do
    // the same job and outlive copy changes: "His face", not "Her face".
    await renderAtBasics();
    await clickText('A man');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Pick a look');
    await clickText('Realistic');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('His face')).toBeInTheDocument();
    expect(screen.queryByText('Her face')).toBeNull();
  });

  it('offers a hair shape by texture, and clears it when the style changes', async () => {
    await renderAtBasics();
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
    await renderAtBasics();
    expect(screen.getByRole('button', { name: /Traits/ })).toBeDisabled();
  });
});

/** Walk to a given step, answering only what each screen insists on. */
// Keyed by name rather than by number. This was a map of bare step numbers and
// every one of them moved when the intro screen went in front.
async function walkTo(target: number) {
  const answers: Record<number, string> = {
    [STEP.basics]: 'A woman',
    [STEP.look]: 'Realistic',
    [STEP.traits]: 'Warm',
    [STEP.you]: 'Fond',
  };
  for (let step = STEP.basics; step < target; step += 1) {
    if (answers[step]) await clickText(answers[step]);
    await user.click(screen.getByRole('button', { name: /Continue|Make/ }));
  }
}

describe('the intro screen', () => {
  it('says what they are making before it asks anything', async () => {
    renderFlow();
    await screen.findByText('An OmniAI');

    // The facts that used to be spread through the later screens as asides.
    expect(screen.getByText(/not playing a part/i)).toBeInTheDocument();
    expect(screen.getByText(/where they start, not a rule/i)).toBeInTheDocument();
    expect(screen.getByText(/can stop talking to you/i)).toBeInTheDocument();
    expect(screen.getByText(/You can keep one/i)).toBeInTheDocument();
  });

  it('asks nothing, so it never blocks the way forward', async () => {
    renderFlow();
    await screen.findByText('An OmniAI');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('says "they", because gender is the next question', async () => {
    renderFlow();
    await screen.findByText('An OmniAI');
    expect(screen.queryByText(/\bshe\b/i)).toBeNull();
    expect(screen.queryByText(/\bhe\b/i)).toBeNull();
  });
});

describe('what the two of them are', () => {
  it('asks the relationship instead of how drawn to you she is', async () => {
    await renderAtBasics();
    await walkTo(STEP.you);

    expect(screen.getByText('What you are to each other')).toBeInTheDocument();
    // The question that made somebody building a friend answer about attraction.
    expect(screen.queryByText('Drawn to you')).toBeNull();
  });

  it('does not explain the relationship back at somebody', async () => {
    await renderAtBasics();
    await walkTo(STEP.you);

    // The screen used to say "Where his side of things begins. It moves with
    // what happens between you, and everyone else he meets starts from zero."
    // Three claims, none of them a question, and the reader has to work out
    // which one they are being asked about.
    expect(screen.queryByText(/side of things begins/)).toBeNull();
    expect(screen.queryByText(/starts from zero/)).toBeNull();
    expect(
      screen.getByText(/feels about you on the first day, and what the two of you are/)
    ).toBeInTheDocument();
  });

  it('speaks the gendered words for the character being made', async () => {
    await renderAtBasics();
    await walkTo(STEP.you);

    // A woman was picked in the walk, so these are her words.
    expect(screen.getByRole('button', { name: 'Girlfriend' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wife' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Husband' })).toBeNull();
  });
});

describe('the last two screens', () => {
  it('shows the review before anything is made', async () => {
    await renderAtBasics();
    await walkTo(STEP.review);

    // Every answer, one last time, above the sentence about what deleting her
    // costs. Committing before showing it would be asking somebody to confirm a
    // thing they were never shown.
    await screen.findByText('Meet her');
    expect(screen.getByText('What you are')).toBeInTheDocument();
    expect(omnichatService.createOmniAI).not.toHaveBeenCalled();
  });

  it('makes her from the review screen', async () => {
    vi.mocked(omnichatService.createOmniAI).mockResolvedValue({ id: 7 } as never);
    const { onMade } = await renderAtBasics();
    await walkTo(STEP.review);

    await user.click(screen.getByRole('button', { name: /Make her/ }));
    await waitFor(() => expect(onMade).toHaveBeenCalled());
  });

  it('lets somebody clear the suggested name and type their own', async () => {
    await renderAtBasics();
    await walkTo(STEP.name);

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
