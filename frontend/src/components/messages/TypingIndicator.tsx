import { useWebSocket } from '../../contexts/WebSocketContext';

interface TypingIndicatorProps {
  conversationId: number;
  participants?: Array<{ id: number; username: string }>;
}

export function TypingIndicator({ conversationId, participants = [] }: TypingIndicatorProps) {
  const { getTypingUsers } = useWebSocket();
  const typingUserIds = getTypingUsers(conversationId);

  if (typingUserIds.size === 0) return null;

  // Get usernames of typing users
  const typingNames = Array.from(typingUserIds)
    .map((id) => participants.find((p) => p.id === id)?.username || 'Someone')
    .filter(Boolean);

  if (typingNames.length === 0) return null;

  const displayText =
    typingNames.length === 1
      ? `${typingNames[0]} is typing`
      : typingNames.length === 2
        ? `${typingNames[0]} and ${typingNames[1]} are typing`
        : `${typingNames[0]} and ${typingNames.length - 1} others are typing`;

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--color-text-secondary)] italic">
      <span>{displayText}</span>
      <div className="flex gap-1">
        <span className="animate-bounce-dot animation-delay-0">.</span>
        <span className="animate-bounce-dot animation-delay-100">.</span>
        <span className="animate-bounce-dot animation-delay-200">.</span>
      </div>
    </div>
  );
}
