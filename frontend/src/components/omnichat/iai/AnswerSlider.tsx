/**
 * One of the two numeric answers on the first screen.
 *
 * The reading above the track is the answer in the units the person thinks in.
 * Height is feet and inches with nothing beside it: centimetres were there and
 * were cumbersome, and a second unit nobody asked for is noise on a control
 * that already says what it means.
 */
export interface AnswerSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

export default function AnswerSlider({
  label,
  value,
  min,
  max,
  format,
  onChange,
}: AnswerSliderProps) {
  return (
    <div className="flex max-w-[620px] flex-col gap-3 rounded-[18px] border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">{label}</p>
        <p className="text-3xl font-semibold tracking-tight tabular-nums text-white">
          {format(value)}
        </p>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-6 w-full accent-[#5d8fff]"
      />
      <div className="flex justify-between text-[11px] text-white/35">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}
