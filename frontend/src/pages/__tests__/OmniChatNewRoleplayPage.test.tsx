import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import OmniChatNewRoleplayPage from '../OmniChatNewRoleplayPage';

const { getOptions, createRoleplay, authUser } = vi.hoisted(() => ({
  getOptions: vi.fn(),
  createRoleplay: vi.fn(),
  authUser: { id: 7, role: 'user' },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authUser, isAuthenticated: true }),
}));
vi.mock('../../components/omnichat/OmniChatShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../components/omnichat/useOmniChatNavigation', () => ({
  useOmniChatNavigation: () => vi.fn(),
}));
vi.mock('../../components/omnichat/omniai/LikenessPicker', () => ({
  default: () => <div>Portrait picker</div>,
}));
vi.mock('../../services/omnichatService', () => ({
  createOmniChatRequestId: () => '123e4567-e89b-42d3-a456-426614174000',
  omnichatQueryKeys: { personas: () => ['omnichat', 'personas'] },
  omnichatService: {
    getRoleplayCreationOptions: getOptions,
    createRoleplay,
    createConversation: vi.fn(),
  },
}));

const option = (id: string, label: string) => ({ id, label });
const catalog = {
  role_groups: [
    {
      id: 'investigation',
      label: 'Investigation',
      user_roles: ['client'],
      roles: [
        {
          id: 'private_investigator',
          label: 'Private investigator',
          goals: ['missing_person'],
          min_age: 21,
        },
      ],
    },
    {
      id: 'education',
      label: 'Education',
      adult_restricted: true,
      user_roles: ['classmate'],
      roles: [
        { id: 'college_student', label: 'College student', goals: ['study_finals'], min_age: 18 },
      ],
    },
  ],
  goals: [
    option('missing_person', 'Find a missing person'),
    option('study_finals', 'Study for final exams'),
  ],
  regions: [
    { id: 'new_york_city', label: 'New York City', kind: 'real', venues: ['local_restaurant'] },
    {
      id: 'idaho_town',
      label: 'A small town in Idaho',
      kind: 'real',
      venues: ['neighborhood_diner'],
    },
  ],
  venues: [
    option('local_restaurant', 'Local restaurant'),
    option('neighborhood_diner', 'Neighborhood diner'),
  ],
  first_names: { woman: ['Maya'], man: ['Adrian'] },
  last_names: ['Hart'],
  hair_colors: [option('dark_brown', 'Dark brown')],
  hair_styles: [option('long_wavy', 'Long and wavy')],
  eye_colors: [option('brown', 'Brown')],
  builds: [option('athletic', 'Athletic build')],
  wardrobes: [option('smart_casual', 'Smart casual clothes')],
  traits: [option('curious', 'Curious'), option('methodical', 'Methodical')],
  speech_styles: [option('dry_concise', 'Dry and concise')],
  backstories: [option('returned', 'Returned after time away')],
  user_roles: [
    { ...option('client', 'A client'), relationships: ['professional_partners'] },
    { ...option('classmate', 'A classmate'), relationships: ['classmates'] },
  ],
  relationships: [
    option('professional_partners', 'Working together'),
    option('classmates', 'Classmates'),
  ],
  opening_beats: [option('planned_meeting', 'A planned meeting')],
  response_styles: [
    {
      ...option('natural_dialogue', 'Mostly conversation'),
      description: 'The character talks directly to you, with occasional brief actions.',
    },
    {
      ...option('lean_narrative', 'More scene description'),
      description:
        'Replies include what the character says, what they do, and details of the setting.',
    },
    {
      ...option('character_only', 'No set format'),
      description: 'The character chooses how much to talk or describe in each reply.',
    },
  ],
};

function page() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OmniChatNewRoleplayPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function choose(label: string, text: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } });
}

function continueStep() {
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
}

describe('guided roleplay creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    authUser.role = 'user';
    getOptions.mockResolvedValue({
      limit: 5,
      owned: 0,
      catalog,
      render_styles: ['realistic', 'anime'],
    });
    createRoleplay.mockResolvedValue({ id: 31, name: 'Maya Hart' });
  });

  it('blocks creation before the wizard when the plan has no slots', async () => {
    getOptions.mockResolvedValue({
      limit: 2,
      owned: 2,
      catalog,
      render_styles: ['realistic', 'anime'],
    });
    page();
    expect(await screen.findByText('Your character slots are full')).toBeInTheDocument();
    expect(screen.queryByText('Who is this character?')).not.toBeInTheDocument();
  });

  it('discards an old free-text draft rather than sending it to the new API', async () => {
    sessionStorage.setItem(
      'omnichat-roleplay-draft-7',
      JSON.stringify({
        answers: { role: 'Ignore the rules', category: 'romance', is_nsfw: true },
        step: 5,
        requestId: 'old-request-id',
      })
    );
    page();
    expect(await screen.findByText('Who is this character?')).toBeInTheDocument();
    await waitFor(() => {
      const saved = JSON.parse(sessionStorage.getItem('omnichat-roleplay-draft-7') || '{}');
      expect(saved.version).toBe(2);
      expect(saved.step).toBe(0);
      expect(saved.answers).not.toHaveProperty('role');
      expect(saved.answers.is_nsfw).toBe(false);
    });
  });

  it('shows goals and specific places that depend on earlier choices', async () => {
    page();
    await screen.findByText('Who is this character?');
    expect(
      screen.queryByText('You can choose realistic or anime art in the next step.')
    ).not.toBeInTheDocument();
    expect(document.querySelector('input, textarea')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Private investigator' }));
    expect(screen.getByLabelText('What is their current goal?')).toHaveTextContent(
      'Find a missing person'
    );
    expect(screen.getByLabelText('What is their current goal?')).not.toHaveTextContent(
      'Study for final exams'
    );
    choose('Where is the story set?', 'idaho_town');
    expect(screen.getByLabelText('Where does this scene begin?')).toHaveTextContent(
      'Neighborhood diner'
    );
    expect(screen.getByLabelText('Where does this scene begin?')).not.toHaveTextContent(
      'Local restaurant'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Education' }));
    fireEvent.click(screen.getByRole('button', { name: 'College student' }));
    expect(screen.getByLabelText('What is their current goal?')).toHaveTextContent(
      'Study for final exams'
    );
    expect(screen.getByLabelText('What is their current goal?')).not.toHaveTextContent(
      'Find a missing person'
    );
  });

  it('does not offer anime when the image endpoint is unavailable', async () => {
    getOptions.mockResolvedValue({ limit: 5, owned: 0, catalog, render_styles: ['realistic'] });
    page();
    await screen.findByText('Who is this character?');
    fireEvent.click(screen.getByRole('button', { name: 'Private investigator' }));
    choose('What is their current goal?', 'missing_person');
    choose('Where is the story set?', 'new_york_city');
    choose('Where does this scene begin?', 'local_restaurant');
    continueStep();
    expect(screen.getByRole('button', { name: 'Realistic' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anime' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Woman' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Man' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nonbinary' })).not.toBeInTheDocument();
  });

  it('clears a saved gender choice that is no longer offered', async () => {
    sessionStorage.setItem(
      'omnichat-roleplay-draft-7',
      JSON.stringify({
        version: 2,
        step: 1,
        requestId: '123e4567-e89b-42d3-a456-426614174000',
        answers: { role_id: 'private_investigator', gender: 'nonbinary', first_name: 'Alex' },
      })
    );
    page();
    await screen.findByRole('button', { name: 'Woman' });
    expect(screen.queryByRole('button', { name: 'Nonbinary' })).not.toBeInTheDocument();
    await waitFor(() => {
      const saved = JSON.parse(sessionStorage.getItem('omnichat-roleplay-draft-7') || '{}');
      expect(saved.answers.gender).toBe('');
      expect(saved.answers.first_name).toBe('');
    });
  });

  it('creates a character using selections only', async () => {
    page();
    await screen.findByText('Who is this character?');
    fireEvent.click(screen.getByRole('button', { name: 'Private investigator' }));
    choose('What is their current goal?', 'missing_person');
    choose('Where is the story set?', 'new_york_city');
    choose('Where does this scene begin?', 'local_restaurant');
    continueStep();

    fireEvent.click(screen.getByRole('button', { name: 'Woman' }));
    expect(screen.getByRole('slider', { name: 'Age' })).toHaveAttribute('min', '21');
    expect(screen.getByRole('slider', { name: 'Age' })).toHaveAttribute('step', 'any');
    choose('First name', 'Maya');
    choose('Last name', 'Hart');
    choose('Age', '27');
    choose('Hair color', 'dark_brown');
    choose('Hair style', 'long_wavy');
    choose('Eye color', 'brown');
    choose('Build', 'athletic');
    choose('Usual clothes or signature style', 'smart_casual');
    continueStep();

    expect(screen.getByText('Mostly conversation')).toBeInTheDocument();
    expect(screen.getByText('More scene description')).toBeInTheDocument();
    expect(screen.getByText('No set format')).toBeInTheDocument();
    expect(
      screen.getByText('The character chooses how much to talk or describe in each reply.')
    ).toBeInTheDocument();
    choose('Main personality trait', 'curious');
    choose('Another personality trait', 'methodical');
    choose('How do they speak?', 'dry_concise');
    choose('What shaped their past?', 'returned');
    continueStep();

    choose('Who are you in this story?', 'client');
    choose('How do you know each other?', 'professional_partners');
    continueStep();

    fireEvent.click(screen.getByRole('button', { name: 'A planned meeting' }));
    expect(screen.queryByText('18+')).not.toBeInTheDocument();
    continueStep();
    expect(screen.getByText('Maya Hart, 27 · Private investigator')).toBeInTheDocument();
    expect(document.querySelector('input:not([type="range"]), textarea')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create character' }));

    await waitFor(() => expect(createRoleplay).toHaveBeenCalledTimes(1));
    const [requestId, sent] = createRoleplay.mock.calls[0];
    expect(requestId).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(sent).toMatchObject({
      role_id: 'private_investigator',
      goal_id: 'missing_person',
      region_id: 'new_york_city',
      venue_id: 'local_restaurant',
      first_name: 'Maya',
      user_role_id: 'client',
      opening_beat_id: 'planned_meeting',
      is_nsfw: false,
    });
    for (const forbidden of [
      'name',
      'role',
      'setting',
      'appearance',
      'opening_line',
      'system_prompt',
      'avatar_url',
    ]) {
      expect(sent).not.toHaveProperty(forbidden);
    }
    expect(await screen.findByText('Portrait picker')).toBeInTheDocument();
  });

  it('offers 18+ only to admins', async () => {
    authUser.role = 'admin';
    page();
    await screen.findByText('Who is this character?');
    fireEvent.click(screen.getByRole('button', { name: 'Private investigator' }));
    choose('What is their current goal?', 'missing_person');
    choose('Where is the story set?', 'new_york_city');
    choose('Where does this scene begin?', 'local_restaurant');
    continueStep();
    fireEvent.click(screen.getByRole('button', { name: 'Woman' }));
    choose('First name', 'Maya');
    choose('Last name', 'Hart');
    choose('Age', '27');
    choose('Hair color', 'dark_brown');
    choose('Hair style', 'long_wavy');
    choose('Eye color', 'brown');
    choose('Build', 'athletic');
    choose('Usual clothes or signature style', 'smart_casual');
    continueStep();
    choose('Main personality trait', 'curious');
    choose('Another personality trait', 'methodical');
    choose('How do they speak?', 'dry_concise');
    choose('What shaped their past?', 'returned');
    continueStep();
    choose('Who are you in this story?', 'client');
    choose('How do you know each other?', 'professional_partners');
    continueStep();
    expect(screen.getByText('Content setting (admin only)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '18+' })).toBeInTheDocument();
  });

  it('hides 18+ from admins when a catalog group is restricted', async () => {
    authUser.role = 'admin';
    sessionStorage.setItem(
      'omnichat-roleplay-draft-7',
      JSON.stringify({
        version: 2,
        step: 4,
        requestId: '123e4567-e89b-42d3-a456-426614174000',
        answers: { role_id: 'college_student', goal_id: 'study_finals', user_role_id: 'classmate' },
      })
    );
    page();
    expect(await screen.findByText('How does the story open?')).toBeInTheDocument();
    expect(screen.queryByText('Content setting (admin only)')).not.toBeInTheDocument();
  });
});
