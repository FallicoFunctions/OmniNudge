import { Check } from 'lucide-react';
import { TOTAL_STEPS } from './useCreationFlow';
import type { Pronouns } from './pronouns';

/**
 * Nine steps down the left, which is what the desktop width buys.
 *
 * It goes back and never forward. Jumping ahead would land somebody on a screen
 * whose options depend on answers they have not given, and the flow narrows as
 * it goes -- the hair shapes offered depend on the gender, the eyes on the
 * drawing style.
 */
export interface StepRailProps {
  step: number;
  pronouns: Pronouns;
  onJump: (step: number) => void;
  label: (key: string, fallback: string) => string;
}

export default function StepRail({ step, pronouns, onJump, label }: StepRailProps) {
  // One word each. The last is the character, so it follows the answer.
  const names = [
    label('basics', 'Basics'),
    label('look', 'Look'),
    label('face', 'Face'),
    label('build', 'Build'),
    label('traits', 'Traits'),
    label('interests', 'Interests'),
    label('you', 'You'),
    label('name', 'Name'),
    pronouns.Obj,
  ];

  return (
    <nav
      aria-label={label('steps', 'Steps')}
      className="flex w-[276px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-white/10 p-4"
    >
      {names.map((name, index) => {
        const number = index + 1;
        const done = number < step;
        const current = number === step;
        const reachable = number <= step;
        return (
          <button
            key={name + String(number)}
            type="button"
            disabled={!reachable}
            aria-current={current ? 'step' : undefined}
            onClick={() => onJump(number)}
            className={`omnichat-touch-target flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
              current ? 'bg-[#315ca8]/15' : 'bg-transparent'
            } ${reachable ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${
                done
                  ? 'bg-[#5d8fff]/20 text-[#7da8ff]'
                  : current
                    ? 'bg-[#426fc4] text-white'
                    : 'bg-white/[0.06] text-white/35'
              }`}
            >
              {done ? <Check size={13} strokeWidth={3} /> : number}
            </span>
            <span
              className={`text-[13.5px] ${
                current
                  ? 'font-semibold text-white'
                  : done
                    ? 'font-medium text-white/60'
                    : 'font-medium text-white/30'
              }`}
            >
              {name}
            </span>
          </button>
        );
      })}
      <span className="sr-only">{`${step} / ${TOTAL_STEPS}`}</span>
    </nav>
  );
}
