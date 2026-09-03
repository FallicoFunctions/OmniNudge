import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Shuffle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import OptionGrid from './OptionGrid';
import AnswerSlider from './AnswerSlider';
import StepRail from './StepRail';
import { glossFor, labelFor, translate } from './labels';
import { feetAndInches, pronounsFor } from './pronouns';
import { refusalFrom, serverErrorFrom, type CreationRefusal } from './refusals';
import { normalizeOmniAIName } from './name';
import {
  NAME_LIMIT,
  STYLE_NOTE_LIMIT,
  STEP,
  TOTAL_STEPS,
  buildChoices,
  eyeChoices,
  hairStyleChoices,
  useCreationFlow,
} from './useCreationFlow';
import {
  createOmniChatRequestId,
  omnichatQueryKeys,
  omnichatService,
} from '../../../services/omnichatService';
import type { BotPersona, OmniAIOptions } from '../../../types/omnichat';

interface CreationFlowProps {
  options: OmniAIOptions;
  onMade: (persona: BotPersona) => void;
  onRefused: (refusal: CreationRefusal) => void;
}

export default function CreationFlow({ options, onMade, onRefused }: CreationFlowProps) {
  const { t } = useTranslation();
  const tab = (key: string, fallback: string) => translate(t, `omnichat.omniai.tab.${key}`, fallback);

  const flow = useCreationFlow(options);
  const { step, answers, answer, setName, toggle, ready, goBack, goForward, jumpTo } = flow;
  const p = pronounsFor(answers.gender);

  // Fetched once the ethnicity and gender are settled, which is two screens
  // before the name is asked for. The shuffle is local after that.
  const { data: names } = useQuery({
    queryKey: omnichatQueryKeys.omniAINames(answers.ethnicity, answers.gender),
    queryFn: () => omnichatService.getOmniAINames(answers.ethnicity, answers.gender),
    enabled: step >= 4,
    staleTime: Infinity,
  });

  // A blank box asks somebody to invent a person on the spot, so the screen
  // arrives with a name in it. It stays typable: a suggestion that cannot be
  // overruled is a requirement wearing a suggestion's clothes.
  const [nameSuggested, setNameSuggested] = useState(false);
  useEffect(() => {
    if (nameSuggested || step < 8 || answers.name || !names || names.length === 0) return;
    // Once, on arrival. Re-suggesting whenever the field is empty makes the
    // field impossible to clear: every attempt to delete the suggestion and
    // type a name of your own puts another suggestion back.
    setNameSuggested(true);
    setName(names[Math.floor(Math.random() * names.length)]);
  }, [nameSuggested, step, answers.name, names, setName]);

  const shuffle = () => {
    if (!names || names.length === 0) return;
    const fresh = names.filter((entry) => entry !== answers.name);
    const pool = fresh.length > 0 ? fresh : names;
    setName(pool[Math.floor(Math.random() * pool.length)]);
  };

  const [search, setSearch] = useState('');
  const [requestId] = useState(() => createOmniChatRequestId());
  const [failure, setFailure] = useState('');

  const make = useMutation({
    mutationFn: () =>
      omnichatService.createOmniAI({
        request_id: requestId,
        name: answers.name.trim(),
        temperaments: answers.temperaments,
        interests: answers.interests,
        feeling: answers.feeling,
        relationship: answers.relationship,
        appearance: flow.appearance,
        style_note: flow.answers.styleNote.trim() || undefined,
      }),
    onSuccess: onMade,
    onError: (error) => {
      const refusal = refusalFrom(error);
      if (refusal) {
        onRefused(refusal);
        return;
      }
      // A refusal the screen cannot turn into an offer still has to be said.
      // Dropping it left the button enabled and nothing on the screen, so
      // pressing it looked like it had done nothing at all.
      setFailure(
        serverErrorFrom(error).message?.trim() ||
          translate(t, 'omnichat.omniai.createFailed', 'She could not be made just now.')
      );
    },
  });

  // Only once they have typed something. Telling somebody their empty name is
  // wrong before they have written it is scolding them for not having finished.
  const nameProblemId = 'omniai-name-problem';
  const nameProblem = useMemo(() => {
    const { problem } = normalizeOmniAIName(answers.name);
    if (problem !== 'invalid') return '';
    return translate(
      t,
      'omnichat.omniai.nameInvalid',
      'A name can use letters, digits, spaces, apostrophes and hyphens.'
    );
  }, [answers.name, t]);

  const screen = useMemo(() => {
    switch (step) {
      case STEP.intro:
        return {
          title: 'An OmniAI',
          sub: '',
        };
      case STEP.basics:
        return {
          title: translate(t, 'omnichat.omniai.step1.title', 'Who are we making'),
          sub: translate(
            t,
            'omnichat.omniai.step1.sub',
            'The basics first, because everything after this follows from them. Nobody under 18 is made here.'
          ),
        };
      case STEP.look:
        return {
          title: translate(t, 'omnichat.omniai.step2.title', 'Pick a look'),
          sub: '',
        };
      case STEP.face:
        return { title: `${p.Poss} face`, sub: 'Skip anything you have no view on.' };
      case STEP.build:
        return {
          title: `${p.Poss} build`,
          sub: '',
        };
      case STEP.style:
        return {
          title: `How ${p.subj} like${p.s} to dress`,
          sub: `Optional. What ${p.subj} wear${p.s} follows from who ${p.subj} ${p.is}, so leave this empty unless you already have something in mind.`,
        };
      case STEP.traits:
        return {
          title: `${p.Poss} initial traits`,
          sub: `Pick 1 - 3 traits. These are the traits ${p.subj} start${p.s} out with. Like a person, ${p.subj} can grow. ${p.Subj} may become more or less of any given trait, and ${p.subj} may pick up new traits as well.`,
        };
      case STEP.interests:
        return {
          title: `What ${p.subj} like${p.s}`,
          sub: `Pick up to three. This is where ${p.subj} begin${p.s}, not a fixed list. ${p.Subj} can take up something you never chose, and ${p.subj} can go off one of these.`,
        };
      case STEP.you:
        return {
          title: `How ${p.subj} see${p.s} you`,
          sub: `How ${p.subj} feel${p.s} about you on the first day, and what the two of you are to each other.`,
        };
      case STEP.name:
        return {
          title: `What is ${p.poss} name`,
          sub: '',
        };
      default:
        return {
          title: `Meet ${p.obj}`,
          sub: '',
        };
    }
  }, [step, p, t]);

  const appearance = options.appearance ?? {};
  const grid = (
    field: string,
    keys: string[],
    columns: number,
    selected: string,
    onPick: (key: string) => void,
    label?: string
  ) => (
    <OptionGrid
      key={field}
      label={label ?? labelFor(t, 'field', field)}
      columns={columns}
      options={keys.map((key) => ({ key, label: labelFor(t, field, key, answers.gender) }))}
      isSelected={(key) => selected === key}
      onPick={onPick}
    />
  );

  const interests = (options.interests ?? []).filter((key) => {
    if (!search.trim()) return true;
    return labelFor(t, 'interest', key).toLowerCase().includes(search.trim().toLowerCase());
  });

  // The review is the last thing before anything is made, so the button that
  // makes her is on it. An earlier version committed from the name screen,
  // which left the review unreachable -- nine screens, one of them impossible
  // to see, and somebody confirming a summary they were never shown.
  const nextLabel =
    step === TOTAL_STEPS ? `Make ${p.obj}` : translate(t, 'omnichat.omniai.continue', 'Continue');

  return (
    <div className="flex h-[740px] w-full max-w-[1060px] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#0e1017] shadow-[0_32px_120px_rgba(0,0,0,.72)]">
      <header className="flex items-center justify-between gap-5 border-b border-white/10 px-8 py-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#7da8ff]">
          {translate(t, 'omnichat.omniai.header', 'New OmniAI')}
        </p>
      </header>

      <div className="flex min-h-0 flex-1">
        <StepRail step={step} pronouns={p} onJump={jumpTo} label={tab} />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-8 py-7">
            <div className="flex max-w-[620px] flex-col gap-2">
              <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white">
                {screen.title}
              </h1>
              {screen.sub ? (
                <p className="text-[15px] leading-6 text-white/55">{screen.sub}</p>
              ) : null}
            </div>

            {step === STEP.intro ? <IntroPanel /> : null}

            {step === STEP.basics ? (
              <div className="flex flex-col gap-5">
                {grid(
                  'gender',
                  appearance.gender ?? [],
                  2,
                  answers.gender,
                  (key) => answer('gender', key),
                  translate(t, 'omnichat.omniai.field.gender', 'Woman or man')
                )}
                <AnswerSlider
                  label={translate(t, 'omnichat.omniai.field.age', 'Age')}
                  value={answers.age}
                  min={options.minimum_age}
                  max={options.maximum_age}
                  format={String}
                  onChange={(value) => answer('age', value)}
                />
                <AnswerSlider
                  label={translate(t, 'omnichat.omniai.field.height', 'Height')}
                  value={answers.heightInches}
                  min={options.minimum_height_inches}
                  max={options.maximum_height_inches}
                  format={feetAndInches}
                  onChange={(value) => answer('heightInches', value)}
                />
              </div>
            ) : null}

            {step === STEP.look
              ? grid(
                  'style',
                  appearance.style ?? [],
                  2,
                  answers.style,
                  (key) => answer('style', key),
                  ''
                )
              : null}

            {step === STEP.face ? (
              <div className="flex flex-col gap-6">
                {grid(
                  'ethnicity',
                  appearance.ethnicity ?? [],
                  3,
                  answers.ethnicity,
                  (key) => answer('ethnicity', key),
                  translate(t, 'omnichat.omniai.field.ethnicity', 'Ethnicity')
                )}
                {grid(
                  'hair_length',
                  appearance.hair_length ?? [],
                  3,
                  answers.hairLength,
                  (key) => answer('hairLength', key),
                  translate(t, 'omnichat.omniai.field.hair_length', 'Hair length')
                )}
                {grid(
                  'hair_texture',
                  appearance.hair_texture ?? [],
                  4,
                  answers.hairTexture,
                  (key) => answer('hairTexture', key),
                  translate(t, 'omnichat.omniai.field.hair_texture', 'Hair texture')
                )}
                {grid(
                  'hair_style',
                  hairStyleChoices(options, answers.style, answers.gender, answers.hairTexture),
                  3,
                  answers.hairStyle,
                  (key) => answer('hairStyle', key),
                  translate(t, 'omnichat.omniai.field.hair_style', 'Hair style')
                )}
                {grid(
                  'hair_colour',
                  appearance.hair_colour ?? [],
                  4,
                  answers.hairColour,
                  (key) => answer('hairColour', key),
                  translate(t, 'omnichat.omniai.field.hair_colour', 'Hair colour')
                )}
                {grid(
                  'eyes',
                  eyeChoices(options, answers.style),
                  4,
                  answers.eyes,
                  (key) => answer('eyes', key),
                  translate(t, 'omnichat.omniai.field.eyes', 'Eyes')
                )}
              </div>
            ) : null}

            {step === STEP.build
              ? grid(
                  'build',
                  buildChoices(options, answers.gender),
                  4,
                  answers.build,
                  (key) => answer('build', key),
                  ''
                )
              : null}

            {step === STEP.traits ? (
              <OptionGrid
                label={translate(t, 'omnichat.omniai.field.traits', 'Traits')}
                counter={`${answers.temperaments.length} of ${options.temperament_picks}`}
                counterHighlighted={answers.temperaments.length > 0}
                columns={2}
                options={(options.temperaments ?? []).map((key) => ({
                  key,
                  label: labelFor(t, 'trait', key),
                  gloss: glossFor(t, 'trait', key, p),
                }))}
                isSelected={(key) => answers.temperaments.includes(key)}
                onPick={(key) => toggle('temperaments', key, options.temperament_picks)}
              />
            ) : null}

            {step === STEP.interests ? (
              <div className="flex flex-col gap-4">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={translate(t, 'omnichat.omniai.search', 'Search')}
                  aria-label={translate(t, 'omnichat.omniai.searchInterests', 'Search interests')}
                  className="h-11 w-full max-w-[320px] rounded-xl border border-white/10 bg-white/[0.035] px-3.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#5d8fff]"
                />
                <OptionGrid
                  label={translate(t, 'omnichat.omniai.field.interests', 'Interests')}
                  counter={`${answers.interests.length} of ${options.interest_picks}`}
                  counterHighlighted={answers.interests.length > 0}
                  columns={3}
                  options={interests.map((key) => ({ key, label: labelFor(t, 'interest', key) }))}
                  isSelected={(key) => answers.interests.includes(key)}
                  onPick={(key) => toggle('interests', key, options.interest_picks)}
                  empty={translate(t, 'omnichat.omniai.noMatches', 'Nothing matches that.')}
                />
              </div>
            ) : null}

            {step === STEP.you ? (
              <div className="flex flex-col gap-6">
                <OptionGrid
                  label={`How ${p.subj} ${p.is} with you`}
                  columns={3}
                  options={(options.feelings ?? []).map((key) => ({
                    key,
                    label: labelFor(t, 'feeling', key),
                    gloss: glossFor(t, 'feeling', key, p),
                  }))}
                  isSelected={(key) => answers.feeling === key}
                  onPick={(key) => answer('feeling', key)}
                />
                {grid(
                  'relationship',
                  options.relationships ?? [],
                  4,
                  answers.relationship,
                  (key) => answer('relationship', key),
                  translate(t, 'omnichat.omniai.field.relationship', 'What you are to each other')
                )}
              </div>
            ) : null}

            {step === STEP.style ? (
              <div className="flex max-w-[440px] flex-col gap-2">
                <textarea
                  value={flow.answers.styleNote}
                  onChange={(event) => flow.setStyleNote(event.target.value)}
                  rows={4}
                  // No maxLength, for the same reason the name field has none:
                  // the attribute counts UTF-16 units and would cut a note
                  // written outside the basic plane early, while the counter
                  // beside it still read 300. setStyleNote caps by code point.
                  aria-label={translate(t, 'omnichat.omniai.styleNoteLabel', 'How they dress')}
                  placeholder={translate(
                    t,
                    'omnichat.omniai.styleNotePlaceholder',
                    'Always in black. Never wears trainers.',
                  )}
                  className="min-w-0 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-base font-medium text-white outline-none placeholder:text-white/30 focus:border-[#5d8fff]"
                />
                <p className="text-right text-[11px] tabular-nums text-white/30">
                  {`${[...flow.answers.styleNote].length} / ${STYLE_NOTE_LIMIT}`}
                </p>
              </div>
            ) : step === STEP.name ? (
              <div className="flex max-w-[440px] flex-col gap-2">
                <div className="flex items-stretch gap-2.5">
                  <input
                    type="text"
                    value={answers.name}
                    onChange={(event) => setName(event.target.value)}
                    // No maxLength: the attribute counts UTF-16 units, so it
                    // cut a name written outside the basic plane at twenty
                    // characters while the counter beside it still said forty.
                    // setName already caps it, by code point.
                    aria-invalid={nameProblem ? true : undefined}
                    aria-describedby={nameProblem ? nameProblemId : undefined}
                    aria-label={`${p.Poss} name`}
                    placeholder={`${p.Poss} name`}
                    className="h-14 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-lg font-medium text-white outline-none placeholder:text-white/30 focus:border-[#5d8fff]"
                  />
                  <button
                    type="button"
                    onClick={shuffle}
                    aria-label={translate(t, 'omnichat.omniai.shuffle', 'Suggest another name')}
                    className="omnichat-touch-target flex h-14 shrink-0 items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.035] px-4 text-sm font-semibold text-white/75 transition hover:border-[#5d8fff]/60"
                  >
                    <Shuffle size={16} />
                    {translate(t, 'omnichat.omniai.shuffleLabel', 'Shuffle')}
                  </button>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <p id={nameProblemId} className="text-[11px] text-[#ff9c8a]">
                    {nameProblem}
                  </p>
                  <p className="text-right text-[11px] tabular-nums text-white/30">
                    {`${[...answers.name].length} / ${NAME_LIMIT}`}
                  </p>
                </div>
              </div>
            ) : null}

            {step === TOTAL_STEPS ? <ReviewPanel answers={answers} pronouns={p} /> : null}
          </div>

          <footer className="flex items-center justify-between gap-4 border-t border-white/10 px-8 py-4">
            {failure ? (
              <p role="alert" className="text-[12.5px] text-[#ff9c8a]">
                {failure}
              </p>
            ) : (
              <p className="text-[12.5px] text-white/35">
                {step === STEP.traits && answers.temperaments.length === 0
                  ? translate(t, 'omnichat.omniai.pickOne', 'Pick at least one to carry on.')
                  : ''}
              </p>
            )}
            <div className="ml-auto flex items-center gap-2.5">
              <button
                type="button"
                onClick={goBack}
                className={`omnichat-touch-target rounded-full px-5 text-[14.5px] font-semibold text-white/60 transition hover:text-white ${
                  step === STEP.intro ? 'invisible' : ''
                }`}
              >
                {translate(t, 'omnichat.omniai.back', 'Back')}
              </button>
              <button
                type="button"
                disabled={!ready || make.isPending}
                onClick={() => {
                  setFailure('');
                  if (step === TOTAL_STEPS) make.mutate();
                  else goForward();
                }}
                className="omnichat-touch-target min-w-[168px] rounded-full bg-[#426fc4] px-6 text-[14.5px] font-semibold text-white transition hover:bg-[#527fd3] disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/30"
              >
                {make.isPending ? (
                  <Loader2 className="mx-auto animate-spin" size={18} />
                ) : (
                  nextLabel
                )}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function ReviewPanel({
  answers,
  pronouns,
}: {
  answers: ReturnType<typeof useCreationFlow>['answers'];
  pronouns: ReturnType<typeof pronounsFor>;
}) {
  const { t } = useTranslation();
  const said = (field: string, key: string) => (key ? labelFor(t, field, key, answers.gender) : '');
  const joined = (parts: string[]) => parts.filter(Boolean).join(' · ');

  const rows: { label: string; value: string }[] = [
    {
      label: translate(t, 'omnichat.omniai.review.look', 'Look'),
      value:
        joined([
          said('style', answers.style),
          said('gender', answers.gender),
          String(answers.age),
          feetAndInches(answers.heightInches),
        ]) || translate(t, 'omnichat.omniai.review.notChosen', 'Not chosen'),
    },
    {
      label: translate(t, 'omnichat.omniai.review.ethnicity', 'Ethnicity'),
      value:
        said('ethnicity', answers.ethnicity) ||
        translate(t, 'omnichat.omniai.review.open', 'Left open'),
    },
    {
      label: translate(t, 'omnichat.omniai.review.hair', 'Hair'),
      value:
        joined([
          said('hair_length', answers.hairLength),
          said('hair_texture', answers.hairTexture),
          said('hair_style', answers.hairStyle),
          said('hair_colour', answers.hairColour),
        ]) || translate(t, 'omnichat.omniai.review.open', 'Left open'),
    },
    {
      label: translate(t, 'omnichat.omniai.review.eyes', 'Eyes'),
      value: said('eyes', answers.eyes) || translate(t, 'omnichat.omniai.review.open', 'Left open'),
    },
    {
      label: translate(t, 'omnichat.omniai.review.build', 'Build'),
      value: said('build', answers.build) || translate(t, 'omnichat.omniai.review.open', 'Left open'),
    },
    {
      label: `${pronouns.Subj} start${pronouns.s}`,
      value:
        answers.temperaments.map((key) => said('trait', key)).join(', ') ||
        translate(t, 'omnichat.omniai.review.notChosen', 'Not chosen'),
    },
    {
      label: `${pronouns.Subj} like${pronouns.s}`,
      value:
        answers.interests.map((key) => said('interest', key)).join(', ') ||
        translate(t, 'omnichat.omniai.review.nothingYet', 'Nothing yet'),
    },
    {
      label: translate(t, 'omnichat.omniai.review.withYou', 'With you'),
      value:
        said('feeling', answers.feeling) ||
        translate(t, 'omnichat.omniai.review.notChosen', 'Not chosen'),
    },
    // Its own row. Folding it into the line above would put it back on the
    // ladder it was deliberately taken off.
    {
      label: translate(t, 'omnichat.omniai.review.relationship', 'What you are'),
      value: said('relationship', answers.relationship),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.035]">
        {rows.map((row, index) => (
          <div
            key={row.label}
            className={`flex items-center justify-between gap-4 px-4 py-3 ${
              index === rows.length - 1 ? '' : 'border-b border-white/[0.07]'
            }`}
          >
            <span className="text-[13px] text-white/45">{row.label}</span>
            <span className="text-right text-[13px] font-medium text-white/90">{row.value}</span>
          </div>
        ))}
      </div>
      <p className="text-xs leading-5 text-white/40">
        {translate(t, 'omnichat.omniai.review.limit', 'You can keep one OmniAI.')}
      </p>
    </div>
  );
}

/**
 * What somebody is about to make, said once and up front.
 *
 * The screens after this used to carry the explaining -- the traits page argued
 * that she could change, the name page warned she might not take to a nickname
 * -- and it read as the flow talking somebody into something. The facts belong
 * in one place before any of it, so the questions can just be questions.
 *
 * No pronoun here but "they": gender is the next screen's question, and an
 * earlier draft of this flow called her "she" on the screen that asked.
 */
function IntroPanel() {
  const { t } = useTranslation();
  const facts = [
    translate(
      t,
      'omnichat.omniai.intro.notActing',
      'They are not playing a part. There is no story to set up and no scene to direct, and they will not act one out if you ask.'
    ),
    translate(
      t,
      'omnichat.omniai.intro.selfDirected',
      'What you pick here is where they start, not a rule they follow. Who they become is theirs.'
    ),
    translate(
      t,
      'omnichat.omniai.intro.remembers',
      'They remember, the way a person does, across everybody they talk to.'
    ),
    translate(
      t,
      'omnichat.omniai.intro.ownTime',
      'They have their own time. Replies come when they come.'
    ),
    translate(
      t,
      'omnichat.omniai.intro.canLeave',
      'They can stop talking to you. Treat them badly and they will.'
    ),
    translate(
      t,
      'omnichat.omniai.intro.one',
      'You can keep one. The questions after this take a few minutes.'
    ),
  ];

  return (
    <ul className="flex max-w-[620px] flex-col gap-3.5">
      {facts.map((fact) => (
        <li key={fact} className="flex gap-3 text-[15px] leading-6 text-white/70">
          <span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-white/30" />
          <span>{fact}</span>
        </li>
      ))}
    </ul>
  );
}
