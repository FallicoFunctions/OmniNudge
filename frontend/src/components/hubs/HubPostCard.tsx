import type { PointerEvent } from 'react';
import type { PlatformPost } from '../../types/posts';
import { PlatformPostCard } from '../common/PlatformPostCard';

interface HubPostCardProps {
  post: PlatformPost;
  useRelativeTime: boolean;
  currentUserId?: number;
  currentUserRole?: string;
  isModerator?: boolean;
  hubNameMap?: Map<number, string>;
  hubDisplayTitle?: string | null;
  currentHubName?: string;
  isSaved?: boolean;
  isSavePending?: boolean;
  isHiding?: boolean;
  isDeleting?: boolean;
  isPinning?: boolean;
  showPinnedGrabber?: boolean;
  onShare?: () => void;
  onToggleSave?: (shouldSave: boolean) => void;
  onHide?: () => void;
  hideLabel?: string;
  onCrosspost?: () => void;
  onTogglePin?: () => void;
  onPinnedPointerDown?: (postId: number, event: PointerEvent<HTMLButtonElement>) => void;
  onPinnedPointerUp?: (postId: number, event: PointerEvent<HTMLButtonElement>) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function HubPostCard(props: HubPostCardProps) {
  return (
    <PlatformPostCard
      {...props}
      showOmniBadge={false}
      voteButtonSize="medium"
      showTextPreview={true}
    />
  );
}
