/**
 * Why a creation was refused, in a form the interface can act on.
 *
 * The server answers these with a code precisely so the screen can offer the
 * thing that would help. "Your plan does not include this" and "you already
 * have one" want completely different buttons, and a shared error banner offers
 * neither.
 */
export type CreationRefusal = 'already_has_one' | 'needs_upgrade' | 'underage' | null;

/**
 * What the server actually said, out of what axios actually throws.
 *
 * The rejected value is a raw AxiosError: its own `code` is "ERR_BAD_REQUEST"
 * and its `message` is "Request failed with status code 400". Ours are in the
 * response body. Reading the top level found neither, so every coded refusal
 * fell through to the status fallback -- and two 400s, an underage character
 * and an unusable name, are indistinguishable there.
 *
 * A flat shape is still accepted, because a caller that has already unwrapped
 * the body should not have to wrap it again.
 */
export function serverErrorFrom(error: unknown): { code?: string; status?: number; message?: string } {
  const typed = error as
    | {
        code?: string;
        status?: number;
        message?: string;
        response?: { status?: number; data?: { code?: string; message?: string; error?: string } };
      }
    | undefined;
  const body = typed?.response?.data;
  return {
    code: body?.code ?? (typed?.response ? undefined : typed?.code),
    status: typed?.response?.status ?? typed?.status,
    message: body?.message ?? body?.error ?? (typed?.response ? undefined : typed?.message),
  };
}

export function refusalFrom(error: unknown): CreationRefusal {
  const typed = serverErrorFrom(error);
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
