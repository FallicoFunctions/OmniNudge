import type { ReactNode } from 'react';
import {
  Inbox,
  Search,
  AlertCircle,
  Lock,
  MessageSquare,
  Users,
  FileText,
  Image,
  Bell,
  type LucideIcon,
} from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  children?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className = '',
  children,
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-4 ${className}`}>
      {Icon && (
        <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mb-4">
          <Icon size={32} className="text-secondary" />
        </div>
      )}

      <h3 className="text-xl font-semibold mb-2">{title}</h3>

      {description && (
        <p className="text-secondary max-w-md mb-6">{description}</p>
      )}

      {children}

      {(action || secondaryAction) && (
        <div className="flex gap-3 mt-6">
          {action && (
            <button
              onClick={action.onClick}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="px-4 py-2 border border-border rounded hover:bg-secondary/10"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Pre-configured empty state variants
export function EmptyInbox({ onCompose }: { onCompose?: () => void }) {
  return (
    <EmptyState
      icon={Inbox}
      title="No messages yet"
      description="Start a conversation to see your messages here."
      action={onCompose ? { label: 'New Message', onClick: onCompose } : undefined}
    />
  );
}

export function EmptySearchResults({ query }: { query?: string }) {
  return (
    <EmptyState
      icon={Search}
      title="No results found"
      description={
        query
          ? `We couldn't find anything matching "${query}". Try different keywords.`
          : 'Try adjusting your search to find what you\'re looking for.'
      }
    />
  );
}

export function EmptyNotifications() {
  return (
    <EmptyState
      icon={Bell}
      title="No notifications"
      description="You're all caught up! We'll notify you when something new happens."
    />
  );
}

export function EmptyConversations({ onCreate }: { onCreate?: () => void }) {
  return (
    <EmptyState
      icon={MessageSquare}
      title="No conversations"
      description="Start chatting with friends and communities."
      action={onCreate ? { label: 'Start Conversation', onClick: onCreate } : undefined}
    />
  );
}

export function EmptyPosts({ onCreate }: { onCreate?: () => void }) {
  return (
    <EmptyState
      icon={FileText}
      title="No posts yet"
      description="Be the first to share something with the community."
      action={onCreate ? { label: 'Create Post', onClick: onCreate } : undefined}
    />
  );
}

export function EmptyGallery({ onUpload }: { onUpload?: () => void }) {
  return (
    <EmptyState
      icon={Image}
      title="No images yet"
      description="Upload your first image to get started."
      action={onUpload ? { label: 'Upload Image', onClick: onUpload } : undefined}
    />
  );
}

export function EmptyMembers({ onInvite }: { onInvite?: () => void }) {
  return (
    <EmptyState
      icon={Users}
      title="No members yet"
      description="Invite people to join your community."
      action={onInvite ? { label: 'Invite Members', onClick: onInvite } : undefined}
    />
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'We encountered an error. Please try again.',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      icon={AlertCircle}
      title={title}
      description={description}
      action={onRetry ? { label: 'Try Again', onClick: onRetry } : undefined}
    />
  );
}

export function PermissionDenied({
  resource = 'this content',
  onRequestAccess,
}: {
  resource?: string;
  onRequestAccess?: () => void;
}) {
  return (
    <EmptyState
      icon={Lock}
      title="Access Denied"
      description={`You don't have permission to view ${resource}.`}
      action={
        onRequestAccess
          ? { label: 'Request Access', onClick: onRequestAccess }
          : undefined
      }
    />
  );
}
