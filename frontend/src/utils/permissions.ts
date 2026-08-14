/**
 * Permission utility functions to eliminate redundant permission checks
 */

/**
 * Check if user can moderate content (delete, edit, etc.)
 * @param currentUserId - ID of current user
 * @param authorId - ID of content author
 * @param currentUserRole - Role of current user (optional)
 * @param isModerator - Whether user is a moderator of the hub (optional)
 */
export function canModerateContent(
  currentUserId: number | undefined,
  authorId: number,
  currentUserRole?: string,
  isModerator?: boolean
): boolean {
  if (!currentUserId) return false;

  // User is the author
  if (currentUserId === authorId) return true;

  // User is an admin
  if (currentUserRole === 'admin') return true;

  // User is a moderator
  if (isModerator) return true;

  return false;
}

/**
 * Check if user is admin
 */
export function isAdmin(role?: string): boolean {
  return role === 'admin';
}

/**
 * Check if action requires moderator status
 */
export function requiresModerator(currentUserRole?: string, isModerator?: boolean): boolean {
  return currentUserRole === 'admin' || isModerator === true;
}
