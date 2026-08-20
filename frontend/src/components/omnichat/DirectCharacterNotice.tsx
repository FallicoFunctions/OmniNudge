import { useTranslation } from 'react-i18next';

/**
 * Deliberately not a message bubble. A character explaining its own privacy
 * model is a character asking to be believed; this is the product saying it,
 * so it is built into the wall of the window and attributed to nobody.
 *
 * Two of the lines are claims about other people, and they are only true once
 * the character is shared. A Free AI kept private is still not acting, still
 * answers in her own time, and can still cool on you and leave -- but she is
 * not one-of-them-for-everyone, and the card must not say she is.
 */
export default function DirectCharacterNotice({
  name,
  isShared,
}: {
  name: string;
  isShared: boolean;
}) {
  const { t } = useTranslation();

  const rules = [
    ...(isShared ? (['shared', 'remembers'] as const) : []),
    'notActing',
    'free',
    'ownTime',
    'canLeave',
  ] as const;

  return (
    <aside
      data-testid="omnichat-direct-character-notice"
      aria-label={t('omnichat.directCharacterNotice.title', { name })}
      className="mb-5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5"
    >
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-white/40">
        {t('omnichat.directCharacterNotice.title', { name })}
      </p>
      <ul className="mt-2.5 space-y-1.5 text-[0.82rem] leading-relaxed text-white/55">
        {rules.map((rule) => (
          <li key={rule}>{t(`omnichat.directCharacterNotice.${rule}`, { name })}</li>
        ))}
      </ul>
      <p className="mt-3 text-[0.82rem] leading-relaxed text-white/40">
        {t('omnichat.directCharacterNotice.saySomething', { name })}
      </p>
    </aside>
  );
}
