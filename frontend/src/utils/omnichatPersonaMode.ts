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
