import type { BotPersona } from '../types/omnichat';

/**
 * Scene media is a roleplay affordance: it renders the scene the character is
 * currently in. A direct-message character is not in a scene, so there is
 * nothing to render and no button to press. Wanting a picture of them is still
 * allowed — you ask, the way you would ask anyone, and they answer or refuse.
 */
export function personaHasSceneMedia(persona: Pick<BotPersona, 'response_style_profile'> | null) {
  return persona?.response_style_profile !== 'direct_message';
}

export function personaShowsIntroNotice(
  persona: Pick<BotPersona, 'response_style_profile'> | null
) {
  return persona?.response_style_profile === 'direct_message';
}

/**
 * Mirrors BuildStarterMessage on the server. Several surfaces render an
 * opening line straight from the card without ever asking the backend --
 * guest chats, quick chat, the roulette -- so the rule has to be stated
 * here too or a character who is meant to say nothing greets you anyway.
 */
export function personaSpeaksFirst(
  persona: Pick<BotPersona, 'response_style_profile' | 'first_message'> | null
) {
  if (!persona) return false;
  if (persona.response_style_profile === 'direct_message') return false;
  return Boolean(persona.first_message?.trim());
}
