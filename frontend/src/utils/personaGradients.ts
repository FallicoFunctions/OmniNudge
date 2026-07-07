import type { BotPersona } from '../types/omnichat';

const SLUG_GRADIENTS: Record<string, string> = {
  'chat-buddy':
    'radial-gradient(ellipse at 40% 25%, #c0256e 0%, #7a1050 55%, #3a0830 100%)',
  'dungeon-master':
    'radial-gradient(ellipse at 35% 30%, #0f7a5a 0%, #074d3a 55%, #022820 100%)',
  narrator:
    'radial-gradient(ellipse at 40% 25%, #8a1a30 0%, #5a0f20 55%, #2e0510 100%)',
  companion:
    'radial-gradient(ellipse at 35% 30%, #3b2a7a 0%, #21184a 55%, #100c28 100%)',
};

const CATEGORY_GRADIENTS: Record<string, string[]> = {
  roleplay: [
    'radial-gradient(ellipse at 35% 30%, #3b2a7a 0%, #21184a 55%, #100c28 100%)',
    'radial-gradient(ellipse at 40% 25%, #1a3a6e 0%, #0e1f42 55%, #060f22 100%)',
  ],
  helper: [
    'radial-gradient(ellipse at 40% 25%, #0f5e6e 0%, #073845 55%, #031c24 100%)',
    'radial-gradient(ellipse at 35% 30%, #1a4a2e 0%, #0d2a1a 55%, #061510 100%)',
  ],
  romance: [
    'radial-gradient(ellipse at 40% 25%, #7a1040 0%, #4a0a28 55%, #240512 100%)',
    'radial-gradient(ellipse at 35% 30%, #8a1a30 0%, #5a0f20 55%, #2e0510 100%)',
  ],
  original: [
    'radial-gradient(ellipse at 35% 30%, #5a3a10 0%, #382408 55%, #1c1204 100%)',
    'radial-gradient(ellipse at 40% 25%, #3a1a5a 0%, #220e38 55%, #11071e 100%)',
  ],
  anime_game: [
    'radial-gradient(ellipse at 40% 25%, #1a5a2e 0%, #0e3a1c 55%, #071d0f 100%)',
    'radial-gradient(ellipse at 35% 30%, #4a1a6a 0%, #2c0e42 55%, #170721 100%)',
  ],
  fiction_media: [
    'radial-gradient(ellipse at 40% 25%, #1a3a6e 0%, #0e2244 55%, #061120 100%)',
    'radial-gradient(ellipse at 35% 30%, #5a2a10 0%, #381808 55%, #1c0c04 100%)',
  ],
};

const DEFAULT_GRADIENTS = [
  'radial-gradient(ellipse at 35% 30%, #2a2a5a 0%, #181830 55%, #0c0c18 100%)',
  'radial-gradient(ellipse at 40% 25%, #1a3a2e 0%, #0e2018 55%, #07100c 100%)',
];

export function getPersonaGradient(persona: BotPersona): string {
  if (SLUG_GRADIENTS[persona.slug]) {
    return SLUG_GRADIENTS[persona.slug];
  }
  const pool = CATEGORY_GRADIENTS[persona.category] ?? DEFAULT_GRADIENTS;
  return pool[persona.id % pool.length];
}
