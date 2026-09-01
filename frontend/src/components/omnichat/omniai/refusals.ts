/**
 * Why a creation was refused, in a form the interface can act on.
 *
 * The server answers these with a code precisely so the screen can offer the
 * thing that would help. "Your plan does not include this" and "you already
 * have one" want completely different buttons, and a shared error banner offers
 * neither.
 */
export type CreationRefusal = 'already_has_one' | 'needs_upgrade' | 'underage' | null;

export function refusalFrom(error: unknown): CreationRefusal {
  const typed = error as { code?: string; status?: number } | undefined;
  switch (typed?.code) {
    case 'omniai_already_exists':
      return 'already_has_one';
    case 'omniai_requires_upgrade':
    case 'character_creation_requires_upgrade':
      return 'needs_upgrade';
    case 'omniai_underage':
      return 'underage';
    default:
      break;
  }
  // A server that answered before the codes existed, or a proxy that ate the
  // body. The status still separates the two refusals, which is the part the
  // screen needs; falling through to a bare message would lose that.
  if (typed?.status === 409) return 'already_has_one';
  if (typed?.status === 403) return 'needs_upgrade';
  return null;
}
