import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dices, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BotPersona } from '../../types/omnichat';
import PersonaAvatar from './PersonaAvatar';

const ROULETTE_REVEAL_MS = 900;

export function getRouletteEligiblePersonas(personas: BotPersona[]): BotPersona[] {
  return personas.filter(
    (persona) =>
      persona.is_active &&
      persona.owner_user_id == null &&
      persona.visibility === 'public' &&
      !persona.is_nsfw &&
      Boolean(persona.first_message?.trim())
  );
}

export function pickRoulettePersona(
  personas: BotPersona[],
  previousPersonaId?: number,
  random: () => number = Math.random
): BotPersona | undefined {
  if (personas.length === 0) return undefined;

  const candidates =
    personas.length > 1
      ? personas.filter((persona) => Number(persona.id) !== Number(previousPersonaId))
      : personas;
  const randomIndex = Math.min(
    candidates.length - 1,
    Math.floor(Math.max(0, random()) * candidates.length)
  );
  return candidates[randomIndex];
}

export default function CharacterRouletteButton({
  personas,
  onSelect,
  reduceMotion = false,
}: {
  personas: BotPersona[];
  onSelect: (persona: BotPersona, trigger?: HTMLElement, returnTarget?: HTMLElement) => void;
  reduceMotion?: boolean;
}) {
  const { t } = useTranslation();
  const eligiblePersonas = useMemo(() => getRouletteEligiblePersonas(personas), [personas]);
  const [revealPersona, setRevealPersona] = useState<BotPersona | null>(null);
  const previousPersonaIdRef = useRef<number | undefined>(undefined);
  const revealAvatarRef = useRef<HTMLDivElement | null>(null);
  const rouletteButtonRef = useRef<HTMLButtonElement | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const isShuffling = revealPersona !== null;

  useEffect(() => {
    return () => {
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
      }
    };
  }, []);

  const handleRoulette = () => {
    if (isShuffling) return;
    const selectedPersona = pickRoulettePersona(eligiblePersonas, previousPersonaIdRef.current);
    if (!selectedPersona) return;

    previousPersonaIdRef.current = selectedPersona.id;
    if (reduceMotion) {
      onSelect(selectedPersona);
      return;
    }

    setRevealPersona(selectedPersona);
    revealTimerRef.current = window.setTimeout(() => {
      const revealAvatar = revealAvatarRef.current;
      setRevealPersona(null);
      revealTimerRef.current = null;
      onSelect(selectedPersona, revealAvatar ?? undefined, rouletteButtonRef.current ?? undefined);
    }, ROULETTE_REVEAL_MS);
  };

  return (
    <>
      <button
        ref={rouletteButtonRef}
        type="button"
        onClick={handleRoulette}
        disabled={eligiblePersonas.length === 0}
        aria-disabled={isShuffling || eligiblePersonas.length === 0}
        aria-busy={isShuffling}
        className="group flex h-11 items-center gap-2 rounded-full border border-blue-300/30 bg-blue-500/15 px-5 text-sm font-bold text-blue-50 shadow-[0_10px_28px_rgba(37,99,235,0.13)] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-blue-200/55 hover:bg-blue-500/25 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed aria-disabled:cursor-wait aria-disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300 focus-visible:outline-offset-2"
      >
        <span className="grid h-4 w-4 place-items-center" aria-hidden="true">
          {isShuffling ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Dices
              size={16}
              className="transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110"
            />
          )}
        </span>
        {isShuffling ? t('omnichat.discover.rouletteShuffling') : t('omnichat.discover.roulette')}
      </button>

      {revealPersona &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-[#070912]/80 px-5 backdrop-blur-xl animate-fadeIn"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-testid="character-roulette-reveal"
          >
            <div className="relative flex max-w-sm flex-col items-center text-center">
              <div
                className="absolute top-10 h-40 w-40 rounded-full bg-blue-500/25 blur-3xl"
                aria-hidden="true"
              />
              <div className="relative mb-6">
                <div
                  className="absolute -inset-5 animate-pulse rounded-[34px] border border-blue-300/20"
                  aria-hidden="true"
                />
                <div
                  className="absolute -inset-10 rounded-[46px] border border-blue-300/10"
                  aria-hidden="true"
                />
                <PersonaAvatar
                  persona={revealPersona}
                  rootRef={revealAvatarRef}
                  hideOverlay
                  className="h-28 w-28 rounded-[28px] border border-white/15 shadow-[0_24px_70px_rgba(37,99,235,0.35)]"
                />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-200/70">
                {t('omnichat.discover.rouletteReveal')}
              </p>
              <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">
                {revealPersona.name}
              </p>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
