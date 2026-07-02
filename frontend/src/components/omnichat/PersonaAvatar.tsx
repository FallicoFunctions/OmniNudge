import { getPersonaGradient } from '../../utils/personaGradients';
import type { BotPersona } from '../../types/omnichat';

export default function PersonaAvatar({
  persona,
  className = 'aspect-square w-full',
}: {
  persona: BotPersona;
  className?: string;
}) {
  const gradient = getPersonaGradient(persona);

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      {persona.avatar_url ? (
        <img
          src={persona.avatar_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: gradient }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
    </div>
  );
}
