import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Send } from 'lucide-react';
import { omnichatService, omnichatQueryKeys } from '../services/omnichatService';
import { ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import { useOmniChatLayoutMode } from '../hooks/useOmniChatLayoutMode';
import type { BotConversationDetail, BotMessage, OmniChatTokenPayload } from '../types/omnichat';

// Splits message content into alternating plain-dialogue and action-text
// segments. Action text is either *asterisk-wrapped* or (parenthetical),
// the two conventions roleplay personas are prompted to use for stage
// directions, rendered in a muted italic distinct from spoken dialogue.
const ACTION_TEXT_SPLIT_PATTERN = /(\([^)]*\)|\*[^*]+\*)/g;
// Separate, non-global pattern to classify a single segment. Reusing a
// global-flagged RegExp across multiple .test() calls carries lastIndex
// state between calls, causing alternating false negatives on unrelated
// segments — this anchored, non-global pattern avoids that entirely.
const ACTION_TEXT_WHOLE_PATTERN = /^(\([^)]*\)|\*[^*]+\*)$/;

function MessageContent({ content }: { content: string }) {
  const segments = content.split(ACTION_TEXT_SPLIT_PATTERN).filter(Boolean);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {segments.map((segment, i) =>
        ACTION_TEXT_WHOLE_PATTERN.test(segment) ? (
          <span key={i} className="italic text-[var(--color-text-secondary)]">
            {segment}
          </span>
        ) : (
          <span key={i}>{segment}</span>
        )
      )}
    </p>
  );
}

function GeneratingIndicator() {
  return (
    <div className="flex gap-1 px-1 py-2">
      <span className="h-2 w-2 animate-bounce-dot rounded-full bg-[var(--color-text-muted)]" />
      <span
        className="h-2 w-2 animate-bounce-dot rounded-full bg-[var(--color-text-muted)]"
        style={{ animationDelay: '0.15s' }}
      />
      <span
        className="h-2 w-2 animate-bounce-dot rounded-full bg-[var(--color-text-muted)]"
        style={{ animationDelay: '0.3s' }}
      />
    </div>
  );
}

export default function OmniChatPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { conversationId } = useParams<{ conversationId: string }>();
  const id = Number(conversationId);
  const { mode: layoutMode } = useOmniChatLayoutMode();

  const [draft, setDraft] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Monotonically decrementing counter for optimistic message ids — safer
  // than -Date.now(), which can collide if two sends land in the same
  // millisecond (e.g. a rapid double-submit before the disabled state commits).
  const nextOptimisticId = useRef(-1);

  const conversationQuery = useQuery({
    queryKey: omnichatQueryKeys.conversation(id),
    queryFn: () => omnichatService.getConversation(id),
    enabled: Number.isFinite(id),
  });

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) => omnichatService.sendMessage(id, content),
    onSuccess: (assistantMessage) => {
      // Fallback path in case the WebSocket completion event was missed (e.g.
      // a brief disconnect) — the WS handler already dedupes by message id.
      queryClient.setQueryData<BotConversationDetail | undefined>(
        omnichatQueryKeys.conversation(id),
        (prev) => {
          if (!prev) return prev;
          if (prev.messages.some((m) => m.id === assistantMessage.id)) return prev;
          return { ...prev, messages: [...prev.messages, assistantMessage] };
        }
      );
      queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
      setStreamingText('');
    },
    onError: (error) => {
      setStreamingText('');
      const err = error as Error & { status?: number };
      if (err.status === 429) {
        setRateLimitError('rateLimited');
      } else {
        setRateLimitError(null);
      }
      // Roll back the optimistic user message so it doesn't linger as a
      // ghost message (and avoid duplicate React keys on resubmit).
      queryClient.setQueryData<BotConversationDetail | undefined>(
        omnichatQueryKeys.conversation(id),
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.filter((m) => m.id > 0 || m.role !== 'user'),
          };
        }
      );
    },
  });

  // Derived from the mutation's own lifecycle rather than tracked as separate
  // state — its lifetime (mutate() call until success/error) is exactly the
  // "is generating" window, so a parallel boolean would only be a second
  // source of truth that every new code path has to remember to keep in sync.
  const isGenerating = sendMessageMutation.isPending;

  useEffect(() => {
    const onToken = (event: Event) => {
      const detail = (event as CustomEvent<OmniChatTokenPayload>).detail;
      if (detail.conversation_id !== id) return;
      setStreamingText((prev) => prev + detail.token);
    };
    const onComplete = (event: Event) => {
      const message = (event as CustomEvent<BotMessage>).detail;
      if (message.conversation_id !== id) return;
      setStreamingText('');
    };

    window.addEventListener('omnichat-token', onToken);
    window.addEventListener('omnichat-message-complete', onComplete);
    return () => {
      window.removeEventListener('omnichat-token', onToken);
      window.removeEventListener('omnichat-message-complete', onComplete);
    };
  }, [id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [conversationQuery.data?.messages, streamingText]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || isGenerating) return;

    setDraft('');
    setStreamingText('');

    // Optimistic local echo of the user's own message — the backend never
    // streams this back to its sender over the WebSocket.
    queryClient.setQueryData<BotConversationDetail | undefined>(
      omnichatQueryKeys.conversation(id),
      (prev) => {
        if (!prev) return prev;
        const optimisticMessage: BotMessage = {
          id: nextOptimisticId.current--,
          conversation_id: id,
          role: 'user',
          content,
          failed: false,
          created_at: new Date().toISOString(),
        };
        return { ...prev, messages: [...prev.messages, optimisticMessage] };
      }
    );

    sendMessageMutation.mutate(content);
  };

  if (!Number.isFinite(id)) {
    return (
      <div className="omnichat-theme min-h-screen bg-[var(--color-background)] p-4">
        <ErrorMessage>{t('omnichat.chat.invalidConversation')}</ErrorMessage>
      </div>
    );
  }

  const persona = conversationQuery.data?.conversation.persona;

  return (
    <div
      className={`omnichat-theme flex flex-col bg-[var(--color-background)] ${
        layoutMode === 'immersive' ? 'h-screen' : 'h-[calc(100vh-64px)]'
      }`}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4">
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] py-3">
          <button
            type="button"
            onClick={() => navigate('/omnichat')}
            aria-label={t('omnichat.chat.back')}
            className="rounded-md p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {persona?.name ?? t('omnichat.chat.loadingPersona')}
            </p>
            {persona?.is_nsfw && (
              <span className="text-xs font-medium text-red-500">{t('omnichat.chat.nsfwTag')}</span>
            )}
          </div>
        </div>

        {conversationQuery.isLoading && <LoadingMessage>{t('omnichat.chat.loading')}</LoadingMessage>}
        {conversationQuery.isError && <ErrorMessage>{t('omnichat.chat.loadError')}</ErrorMessage>}

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto py-4">
          {(conversationQuery.data?.messages ?? []).map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 ${
                  // failed is checked first and standalone (not appended to the
                  // role-based classes) — stacking two `border-*` color
                  // utilities on one element leaves the winning color to
                  // Tailwind's generated stylesheet order, not source order.
                  message.failed
                    ? 'border border-red-400 bg-[var(--color-surface)]'
                    : message.role === 'user'
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'border border-[var(--color-border)] bg-[var(--color-surface)]'
                }`}
              >
                <MessageContent content={message.content} />
              </div>
            </div>
          ))}

          {isGenerating && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                {streamingText ? <MessageContent content={streamingText} /> : <GeneratingIndicator />}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 border-t border-[var(--color-border)] py-3">
          <div className="relative flex-1">
            {rateLimitError && (
              <p className="absolute -top-6 left-0 text-xs text-red-400">{t(`omnichat.chat.${rateLimitError}`)}</p>
            )}
            <input
              type="text"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (rateLimitError) setRateLimitError(null);
              }}
              placeholder={rateLimitError ? '' : t('omnichat.chat.inputPlaceholder')}
              disabled={isGenerating}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>
          <button
            type="submit"
            disabled={isGenerating || !draft.trim()}
            aria-label={t('omnichat.chat.send')}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
