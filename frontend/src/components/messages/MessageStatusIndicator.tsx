import { Check, CheckCheck, Clock } from 'lucide-react';
import type { Message } from '../../types/messages';

interface MessageStatusIndicatorProps {
  message: Message;
  isSending?: boolean;
}

export function MessageStatusIndicator({ message, isSending }: MessageStatusIndicatorProps) {
  // Sending state (optimistic message with negative ID)
  if (isSending) {
    return (
      <span
        className="inline-flex items-center text-xs text-[var(--color-text-muted)]"
        title="Sending..."
      >
        <Clock className="h-3 w-3" />
      </span>
    );
  }

  // Message has been read
  if (message.read_at) {
    return (
      <span
        className="inline-flex items-center text-xs text-blue-500"
        title="Read"
      >
        <CheckCheck className="h-3 w-3" />
      </span>
    );
  }

  // Message has been delivered
  if (message.delivered_at) {
    return (
      <span
        className="inline-flex items-center text-xs text-[var(--color-text-muted)]"
        title="Delivered"
      >
        <CheckCheck className="h-3 w-3" />
      </span>
    );
  }

  // Message has been sent but not delivered
  return (
    <span
      className="inline-flex items-center text-xs text-[var(--color-text-muted)]"
      title="Sent"
    >
      <Check className="h-3 w-3" />
    </span>
  );
}
