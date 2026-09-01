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

/**
 * Whether anyone other than the creator can reach this character, which is what
 * makes the notice's shared-identity and shared-memory lines true. An OmniAI
 * kept private is still free -- she can cool on you and leave -- but she is not
 * one-of-them-for-everyone, and must not claim to be.
 *
 * Unknown visibility counts as shared on purpose. Over-warning that a
 * conversation may be repeated costs a reader nothing; under-warning lets
 * someone confide on a promise the product cannot keep.
 */
export function personaIsSharedWithOthers(persona: Pick<BotPersona, 'visibility'> | null) {
  return persona?.visibility !== 'private';
}
