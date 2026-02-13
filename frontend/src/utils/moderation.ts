import type { User } from '../types/auth';
import type { Hub } from '../services/hubsService';
import type { HubModerator } from '../types/hubSettings';
import type { TFunction } from 'i18next';

export const isUserHubModerator = (
  user: User | null | undefined,
  hubModerators: HubModerator[],
  hubDetails?: Hub | null
): boolean => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (hubModerators.length > 0) {
    return hubModerators.some((mod) => mod.user_id === user.id);
  }
  if (hubDetails?.moderators?.length) {
    return hubDetails.moderators.some((mod) => mod.id === user.id);
  }
  return false;
};

export const getHubModeratorRoleLabel = (role: HubModerator['role'], t: TFunction): string => {
  if (role === 'owner') return t('hubSettings.roles.owner');
  if (role === 'full_moderator') return t('hubSettings.roles.fullModerator');
  return t('hubSettings.roles.moderator');
};
