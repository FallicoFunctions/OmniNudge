/**
 * Permission utility functions to eliminate redundant permission checks
 */

export interface User {
  id: number;
  role?: string;
}

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
 * Check if user can delete content
 * Alias for canModerateContent for clarity
 */
export const canDeleteContent = canModerateContent;

/**
 * Check if user can edit content
 * Usually only the author can edit (not moderators)
 */
export function canEditContent(
  currentUserId: number | undefined,
  authorId: number,
  currentUserRole?: string
): boolean {
  if (!currentUserId) return false;

  // User is the author
  if (currentUserId === authorId) return true;

  // User is an admin
  if (currentUserRole === 'admin') return true;

  return false;
}

/**
 * Check if user is admin
 */
export function isAdmin(role?: string): boolean {
  return role === 'admin';
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(userId: number | undefined): boolean {
  return userId !== undefined && userId > 0;
}

/**
 * Check if action requires moderator status
 */
export function requiresModerator(currentUserRole?: string, isModerator?: boolean): boolean {
  return currentUserRole === 'admin' || isModerator === true;
}
