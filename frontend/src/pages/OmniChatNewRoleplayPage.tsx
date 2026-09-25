import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import OmniChatShell from '../components/omnichat/OmniChatShell';
import AnswerSlider from '../components/omnichat/omniai/AnswerSlider';
import LikenessPicker from '../components/omnichat/omniai/LikenessPicker';
import { useOmniChatNavigation } from '../components/omnichat/useOmniChatNavigation';
import { useAuth } from '../contexts/AuthContext';
import {
  createOmniChatRequestId,
  omnichatQueryKeys,
  omnichatService,
} from '../services/omnichatService';
import type { BotPersona, RoleplayChoice, RoleplayCreationAnswers } from '../types/omnichat';

const STEPS = ['Concept', 'Identity', 'Personality', 'Relationship', 'Opening', 'Review'] as const;
const DRAFT_VERSION = 2;

const EMPTY: RoleplayCreationAnswers = {
  role_id: '',
  goal_id: '',
  region_id: '',
  venue_id: '',
  gender: '',
  first_name: '',
  last_name: '',
  age: 27,
  render_style: 'realistic',
  hair_color_id: '',
  hair_style_id: '',
  eye_color_id: '',
  build_id: '',
  wardrobe_id: '',
  primary_trait_id: '',
  second_trait_id: '',
  speech_style_id: '',
  backstory_id: '',
  user_role_id: '',
  relationship_id: '',
  opening_beat_id: '',
  response_style: 'natural_dialogue',
  is_nsfw: false,
};

type Draft = { version: number; answers: RoleplayCreationAnswers; step: number; requestId: string };

function readDraft(key: string, isAdmin: boolean): Draft {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Draft;
      if (
        parsed.version === DRAFT_VERSION &&
        parsed.answers &&
        parsed.requestId &&
        Number.isInteger(parsed.step)
      ) {
        const restored = Object.fromEntries(
          (Object.keys(EMPTY) as Array<keyof RoleplayCreationAnswers>).map((key) => [
            key,
            parsed.answers[key] ?? EMPTY[key],
          ])
        ) as unknown as RoleplayCreationAnswers;
        const gender =
          restored.gender === 'woman' || restored.gender === 'man' ? restored.gender : '';
        return {
          ...parsed,
          answers: {
            ...restored,
            gender,
            first_name: gender ? restored.first_name : '',
            age:
              Number.isInteger(restored.age) && restored.age >= 18 && restored.age <= 100
                ? restored.age
                : 27,
            is_nsfw: isAdmin && restored.is_nsfw === true,
          },
          step: Math.min(Math.max(parsed.step, 0), STEPS.length - 1),
        };
      }
    }
  } catch {
    /* A damaged draft must not block character creation. */
  }
  return {
    version: DRAFT_VERSION,
    answers: { ...EMPTY },
    step: 0,
    requestId: createOmniChatRequestId(),
  };
}

function Choice({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: RoleplayChoice[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-white/85">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={`rounded-xl border px-4 py-2.5 text-sm transition disabled:opacity-40 ${
              option.description ? 'min-w-[220px] flex-1 text-left' : ''
            } ${
              value === option.id
                ? 'border-blue-400 bg-blue-500/20 text-white'
                : 'border-white/15 bg-white/[0.03] text-white/65 hover:border-white/35'
            }`}
          >
            {option.description ? (
              <span className="block space-y-1">
                <span className="block font-medium">{option.label}</span>
                <span className="block text-xs leading-5 text-white/60">{option.description}</span>
              </span>
            ) : (
              option.label
            )}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function SelectChoice({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: RoleplayChoice[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-white/85">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-white/15 bg-[#171b27] px-4 py-3 text-sm text-white outline-none focus:border-blue-400 disabled:opacity-40"
      >
        <option value="">Choose an option</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const named = (items: string[]) => items.map((name) => ({ id: name, label: name }));
const findLabel = (items: RoleplayChoice[], id: string) =>
  items.find((item) => item.id === id)?.label ?? '—';

function ready(step: number, a: RoleplayCreationAnswers): boolean {
  const present = (value: string) => value.length > 0;
  switch (step) {
    case 0:
      return (
        present(a.role_id) && present(a.goal_id) && present(a.region_id) && present(a.venue_id)
      );
    case 1:
      return (
        (a.gender === 'woman' || a.gender === 'man') &&
        present(a.first_name) &&
        present(a.last_name) &&
        a.age >= 18 &&
        present(a.hair_color_id) &&
        present(a.hair_style_id) &&
        present(a.eye_color_id) &&
        present(a.build_id) &&
        present(a.wardrobe_id)
      );
    case 2:
      return (
        present(a.primary_trait_id) &&
        present(a.second_trait_id) &&
        a.primary_trait_id !== a.second_trait_id &&
        present(a.speech_style_id) &&
        present(a.backstory_id)
      );
    case 3:
      return present(a.user_role_id) && present(a.relationship_id);
    case 4:
      return present(a.opening_beat_id);
    default:
      return true;
  }
}

export default function OmniChatNewRoleplayPage() {
  const { user } = useAuth();
  return (
    <RoleplayCreator key={user?.id ?? 0} userId={user?.id ?? 0} isAdmin={user?.role === 'admin'} />
  );
}

function RoleplayCreator({ userId, isAdmin }: { userId: number; isAdmin: boolean }) {
  const navigate = useNavigate();
  const onTabChange = useOmniChatNavigation();
  const queryClient = useQueryClient();
  const draftKey = `omnichat-roleplay-draft-${userId}`;
  const [draft, setDraft] = useState<Draft>(() => readDraft(draftKey, isAdmin));
  const [created, setCreated] = useState<BotPersona | null>(null);
  const [problem, setProblem] = useState('');
  const [groupId, setGroupId] = useState('');
  const a = draft.answers;
  const step = draft.step;

  useEffect(() => {
    if (!created) sessionStorage.setItem(draftKey, JSON.stringify(draft));
  }, [created, draft, draftKey]);

  const options = useQuery({
    queryKey: ['omnichat', 'roleplay-creation-options', userId],
    queryFn: omnichatService.getRoleplayCreationOptions,
    enabled: userId > 0,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const catalog = options.data?.catalog;
  const animeAvailable = options.data?.render_styles?.includes('anime') === true;
  const selectedGroup = catalog?.role_groups.find((group) =>
    group.roles.some((role) => role.id === a.role_id)
  );
  const shownGroup =
    catalog?.role_groups.find((group) => group.id === groupId) ??
    selectedGroup ??
    catalog?.role_groups[0];
  const role = selectedGroup?.roles.find((item) => item.id === a.role_id);
  useEffect(() => {
    if (role && a.age < role.min_age) {
      setDraft((current) => ({
        ...current,
        answers: { ...current.answers, age: role.min_age },
      }));
    }
  }, [role, a.age]);
  const selectedGoal = catalog?.goals.find((item) => item.id === a.goal_id);
  const region = catalog?.regions.find((item) => item.id === a.region_id);
  const selectedUserRole = catalog?.user_roles.find((item) => item.id === a.user_role_id);
  const adultAllowed =
    isAdmin &&
    !!selectedGroup &&
    !!role &&
    !!selectedGoal &&
    !!selectedUserRole &&
    !selectedGroup.adult_restricted &&
    !role.adult_restricted &&
    !selectedGoal.adult_restricted &&
    !selectedUserRole.adult_restricted;

  useEffect(() => {
    if (catalog && a.is_nsfw && !adultAllowed) {
      setDraft((current) => ({ ...current, answers: { ...current.answers, is_nsfw: false } }));
    }
  }, [catalog, a.is_nsfw, adultAllowed]);

  useEffect(() => {
    if (options.data && a.render_style === 'anime' && !animeAvailable) {
      setDraft((current) => ({
        ...current,
        answers: { ...current.answers, render_style: 'realistic' },
      }));
    }
  }, [options.data, a.render_style, animeAvailable]);

  const make = useMutation({
    mutationFn: () => omnichatService.createRoleplay(draft.requestId, a),
    onSuccess: (persona) => {
      sessionStorage.removeItem(draftKey);
      setCreated(persona);
      setProblem('');
      void queryClient.invalidateQueries({ queryKey: ['omnichat', 'my-personas'] });
      void queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.personas() });
    },
    onError: (error) =>
      setProblem(error instanceof Error ? error.message : 'Could not create this character.'),
  });
  const startChat = useMutation({
    mutationFn: (personaId: number) =>
      omnichatService.createConversation(personaId, undefined, true),
    onSuccess: (conversation) => navigate(`/omnichat/c/${conversation.id}`),
    onError: (error) =>
      setProblem(error instanceof Error ? error.message : 'Could not start the chat.'),
  });

  const set = <K extends keyof RoleplayCreationAnswers>(
    key: K,
    value: RoleplayCreationAnswers[K]
  ) => {
    setDraft((current) => ({ ...current, answers: { ...current.answers, [key]: value } }));
    setProblem('');
  };
  const selectRole = (roleId: string) => {
    const picked = catalog?.role_groups
      .flatMap((group) => group.roles)
      .find((item) => item.id === roleId);
    setDraft((current) => ({
      ...current,
      answers: {
        ...current.answers,
        role_id: roleId,
        goal_id: '',
        region_id: '',
        venue_id: '',
        user_role_id: '',
        relationship_id: '',
        is_nsfw: false,
        gender: picked?.genders?.includes(current.answers.gender) ? current.answers.gender : '',
        first_name: picked?.genders?.includes(current.answers.gender)
          ? current.answers.first_name
          : '',
        age: Math.max(picked?.min_age ?? 18, current.answers.age),
      },
    }));
    setProblem('');
  };
  const selectGroup = (nextGroupId: string) => {
    setGroupId(nextGroupId);
    if (selectedGroup && selectedGroup.id !== nextGroupId) {
      setDraft((current) => ({
        ...current,
        answers: {
          ...current.answers,
          role_id: '',
          goal_id: '',
          region_id: '',
          venue_id: '',
          user_role_id: '',
          relationship_id: '',
          is_nsfw: false,
        },
      }));
    }
    setProblem('');
  };
  const selectRegion = (regionId: string) => {
    setDraft((current) => ({
      ...current,
      answers: { ...current.answers, region_id: regionId, venue_id: '' },
    }));
    setProblem('');
  };
  const selectGoal = (goalId: string) => {
    setDraft((current) => ({
      ...current,
      answers: { ...current.answers, goal_id: goalId, is_nsfw: false },
    }));
    setProblem('');
  };
  const selectGender = (gender: string) => {
    setDraft((current) => ({
      ...current,
      answers: {
        ...current.answers,
        gender: gender as RoleplayCreationAnswers['gender'],
        first_name: '',
      },
    }));
    setProblem('');
  };
  const selectUserRole = (userRoleId: string) => {
    setDraft((current) => ({
      ...current,
      answers: {
        ...current.answers,
        user_role_id: userRoleId,
        relationship_id: '',
        is_nsfw: false,
      },
    }));
    setProblem('');
  };
  const next = () => {
    if (!ready(step, a)) {
      setProblem('Please choose an option for each question before continuing.');
      return;
    }
    if (step < STEPS.length - 1) setDraft((current) => ({ ...current, step: current.step + 1 }));
    else make.mutate();
  };

  const gate = options.data;
  const blocked = gate && gate.owned >= gate.limit;
  const regionChoices =
    catalog?.regions.filter(
      (item) => role && (role.setting_kinds?.includes(item.kind) ?? item.kind === 'real')
    ) ?? [];
  const goalChoices = catalog?.goals.filter((item) => role?.goals.includes(item.id)) ?? [];
  const venueChoices = catalog?.venues.filter((item) => region?.venues.includes(item.id)) ?? [];
  const userRoleChoices =
    catalog?.user_roles.filter((item) => selectedGroup?.user_roles.includes(item.id)) ?? [];
  const relationshipChoices =
    catalog?.relationships.filter((item) => selectedUserRole?.relationships?.includes(item.id)) ??
    [];

  return (
    <OmniChatShell activeTab="characters" onTabChange={onTabChange}>
      <div className="min-h-[calc(100dvh-72px)] bg-[#0a0c13] px-4 py-8 text-white sm:px-6">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={() => navigate('/omnichat/studio')}
            className="mb-6 inline-flex items-center gap-2 text-sm text-white/55 hover:text-white"
          >
            <ArrowLeft size={16} /> My characters
          </button>
          <div className="rounded-3xl border border-white/10 bg-[#11141d] p-5 shadow-2xl sm:p-8">
            {created ? (
              <div className="space-y-5">
                <p className="text-xs font-semibold uppercase tracking-[.2em] text-blue-300">
                  Character created
                </p>
                <h1 className="text-3xl font-semibold">Meet {created.name}</h1>
                <p className="text-sm leading-6 text-white/60">
                  Portraits are generated from your choices. Choose one when the pictures arrive; it
                  becomes the character’s visual identity in chat and generated scenes.
                </p>
                <LikenessPicker personaId={created.id} gender={a.gender} expectGeneration />
                {problem && (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200"
                  >
                    {problem}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => startChat.mutate(created.id)}
                  disabled={startChat.isPending}
                  className="rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {startChat.isPending ? 'Opening chat…' : 'Start chat'}
                </button>
              </div>
            ) : options.isLoading ? (
              <div className="flex items-center gap-3 text-white/60">
                <Loader2 className="animate-spin" />
                Checking your plan…
              </div>
            ) : options.isError || !catalog ? (
              <div className="space-y-4">
                <h1 className="text-2xl font-semibold">Could not load character choices</h1>
                <button
                  type="button"
                  onClick={() => void options.refetch()}
                  className="rounded-xl border border-white/20 px-4 py-2"
                >
                  Try again
                </button>
              </div>
            ) : blocked ? (
              <div className="space-y-4">
                <h1 className="text-2xl font-semibold">Your character slots are full</h1>
                <p className="text-white/60">
                  Your plan allows {gate.limit} roleplay characters and you currently have{' '}
                  {gate.owned}.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/omnichat/studio')}
                  className="rounded-xl border border-white/20 px-4 py-2"
                >
                  View my characters
                </button>
              </div>
            ) : (
              <>
                <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.2em] text-blue-300">
                      Create roleplay AI
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold">{STEPS[step]}</h1>
                  </div>
                  <span className="text-sm text-white/45">
                    Step {step + 1} of {STEPS.length}
                  </span>
                </div>
                <div className="mb-7 grid grid-cols-6 gap-1" aria-hidden="true">
                  {STEPS.map((name, index) => (
                    <div
                      key={name}
                      className={`h-1 rounded-full ${index <= step ? 'bg-blue-400' : 'bg-white/10'}`}
                    />
                  ))}
                </div>
                <div className="space-y-6">
                  {step === 0 && (
                    <>
                      <p className="text-sm leading-6 text-white/55">
                        Choose who this character is and where the story begins.
                      </p>
                      <Choice
                        label="Browse character roles"
                        value={shownGroup?.id ?? ''}
                        onChange={selectGroup}
                        options={catalog.role_groups.map((group) => ({
                          id: group.id,
                          label: group.label,
                        }))}
                      />
                      <Choice
                        label="Who is this character?"
                        value={a.role_id}
                        onChange={selectRole}
                        options={shownGroup?.roles ?? []}
                      />
                      <SelectChoice
                        label="What is their current goal?"
                        value={a.goal_id}
                        disabled={!role}
                        onChange={selectGoal}
                        options={goalChoices}
                      />
                      <SelectChoice
                        label="Where is the story set?"
                        value={a.region_id}
                        disabled={!role}
                        onChange={selectRegion}
                        options={regionChoices}
                      />
                      <SelectChoice
                        label="Where does this scene begin?"
                        value={a.venue_id}
                        disabled={!region}
                        onChange={(value) => set('venue_id', value)}
                        options={venueChoices}
                      />
                    </>
                  )}
                  {step === 1 && (
                    <>
                      <Choice
                        label="Gender"
                        value={a.gender}
                        onChange={selectGender}
                        options={[
                          { id: 'woman', label: 'Woman' },
                          { id: 'man', label: 'Man' },
                        ].filter((choice) => !role?.genders || role.genders.includes(choice.id))}
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <SelectChoice
                          label="First name"
                          value={a.first_name}
                          disabled={!a.gender}
                          onChange={(value) => set('first_name', value)}
                          options={named(catalog.first_names[a.gender] ?? [])}
                        />
                        <SelectChoice
                          label="Last name"
                          value={a.last_name}
                          onChange={(value) => set('last_name', value)}
                          options={named(catalog.last_names)}
                        />
                      </div>
                      <AnswerSlider
                        label="Age"
                        labelClassName="text-sm font-medium text-white/85"
                        value={a.age}
                        min={role?.min_age ?? 18}
                        max={100}
                        format={String}
                        onChange={(value) => set('age', value)}
                      />
                      <Choice
                        label="Visual style"
                        value={a.render_style}
                        onChange={(value) =>
                          set('render_style', value as RoleplayCreationAnswers['render_style'])
                        }
                        options={[
                          { id: 'realistic', label: 'Realistic' },
                          ...(animeAvailable ? [{ id: 'anime', label: 'Anime' }] : []),
                        ]}
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <SelectChoice
                          label="Hair color"
                          value={a.hair_color_id}
                          onChange={(value) => set('hair_color_id', value)}
                          options={catalog.hair_colors}
                        />
                        <SelectChoice
                          label="Hair style"
                          value={a.hair_style_id}
                          onChange={(value) => set('hair_style_id', value)}
                          options={catalog.hair_styles}
                        />
                        <SelectChoice
                          label="Eye color"
                          value={a.eye_color_id}
                          onChange={(value) => set('eye_color_id', value)}
                          options={catalog.eye_colors}
                        />
                        <SelectChoice
                          label="Build"
                          value={a.build_id}
                          onChange={(value) => set('build_id', value)}
                          options={catalog.builds}
                        />
                      </div>
                      <SelectChoice
                        label="Usual clothes or signature style"
                        value={a.wardrobe_id}
                        onChange={(value) => set('wardrobe_id', value)}
                        options={catalog.wardrobes}
                      />
                    </>
                  )}
                  {step === 2 && (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <SelectChoice
                          label="Main personality trait"
                          value={a.primary_trait_id}
                          onChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              answers: {
                                ...current.answers,
                                primary_trait_id: value,
                                second_trait_id:
                                  current.answers.second_trait_id === value
                                    ? ''
                                    : current.answers.second_trait_id,
                              },
                            }))
                          }
                          options={catalog.traits}
                        />
                        <SelectChoice
                          label="Another personality trait"
                          value={a.second_trait_id}
                          onChange={(value) => set('second_trait_id', value)}
                          options={catalog.traits.filter(
                            (trait) => trait.id !== a.primary_trait_id
                          )}
                        />
                      </div>
                      <SelectChoice
                        label="How do they speak?"
                        value={a.speech_style_id}
                        onChange={(value) => set('speech_style_id', value)}
                        options={catalog.speech_styles}
                      />
                      <SelectChoice
                        label="What shaped their past?"
                        value={a.backstory_id}
                        onChange={(value) => set('backstory_id', value)}
                        options={catalog.backstories}
                      />
                      <Choice
                        label="How should the character reply?"
                        value={a.response_style}
                        onChange={(value) =>
                          set('response_style', value as RoleplayCreationAnswers['response_style'])
                        }
                        options={catalog.response_styles}
                      />
                    </>
                  )}
                  {step === 3 && (
                    <>
                      <SelectChoice
                        label="Who are you in this story?"
                        value={a.user_role_id}
                        onChange={selectUserRole}
                        options={userRoleChoices}
                      />
                      <SelectChoice
                        label="How do you know each other?"
                        value={a.relationship_id}
                        disabled={!a.user_role_id}
                        onChange={(value) => set('relationship_id', value)}
                        options={relationshipChoices}
                      />
                    </>
                  )}
                  {step === 4 && (
                    <>
                      <Choice
                        label="How does the story open?"
                        value={a.opening_beat_id}
                        onChange={(value) => set('opening_beat_id', value)}
                        options={catalog.opening_beats}
                      />
                      {adultAllowed && (
                        <Choice
                          label="Content setting (admin only)"
                          value={a.is_nsfw ? 'adult' : 'standard'}
                          onChange={(value) => set('is_nsfw', value === 'adult')}
                          options={[
                            { id: 'standard', label: 'Standard' },
                            { id: 'adult', label: '18+' },
                          ]}
                        />
                      )}
                    </>
                  )}
                  {step === 5 && (
                    <>
                      <p className="text-sm leading-6 text-white/55">
                        Review your choices. The character’s story, opening message, and portrait
                        description are built from these selections.
                      </p>
                      {(
                        [
                          [
                            'Character',
                            `${a.first_name} ${a.last_name}, ${a.age} · ${role?.label ?? '—'}`,
                            1,
                          ],
                          ['Current goal', findLabel(catalog.goals, a.goal_id), 0],
                          [
                            'Setting',
                            `${region?.label ?? '—'} · ${findLabel(catalog.venues, a.venue_id)}`,
                            0,
                          ],
                          [
                            'Appearance',
                            `${a.render_style} · ${findLabel(catalog.hair_colors, a.hair_color_id)} hair · ${findLabel(catalog.eye_colors, a.eye_color_id)} eyes`,
                            1,
                          ],
                          [
                            'Personality',
                            `${findLabel(catalog.traits, a.primary_trait_id)} and ${findLabel(catalog.traits, a.second_trait_id)}`,
                            2,
                          ],
                          [
                            'Speaking style',
                            findLabel(catalog.speech_styles, a.speech_style_id),
                            2,
                          ],
                          ['You play', findLabel(catalog.user_roles, a.user_role_id), 3],
                          ['Relationship', findLabel(catalog.relationships, a.relationship_id), 3],
                          ['Opening', findLabel(catalog.opening_beats, a.opening_beat_id), 4],
                        ] as const
                      ).map(([label, value, targetStep]) => (
                        <button
                          key={label}
                          type="button"
                          aria-label={`Edit ${label}: ${value}`}
                          disabled={make.isPending}
                          onClick={() => {
                            setProblem('');
                            setDraft((current) => ({ ...current, step: targetStep }));
                          }}
                          className="w-full cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:border-blue-400/60 hover:bg-[#243a60] focus-visible:bg-[#243a60] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">
                            {label}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-white/80">{value}</p>
                        </button>
                      ))}
                    </>
                  )}
                </div>
                {problem && (
                  <p
                    role="alert"
                    className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200"
                  >
                    {problem}
                  </p>
                )}
                <div className="mt-8 flex justify-between gap-4 border-t border-white/10 pt-6">
                  <button
                    type="button"
                    disabled={step === 0 || make.isPending}
                    onClick={() => {
                      setProblem('');
                      setDraft((current) => ({ ...current, step: current.step - 1 }));
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm text-white/70 disabled:invisible"
                  >
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button
                    type="button"
                    disabled={make.isPending}
                    onClick={next}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {make.isPending ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Creating…
                      </>
                    ) : step === STEPS.length - 1 ? (
                      'Create character'
                    ) : (
                      <>
                        Continue <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </OmniChatShell>
  );
}
