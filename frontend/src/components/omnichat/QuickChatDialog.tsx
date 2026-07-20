import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Loader2, RotateCcw, Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import { omnichatService } from '../../services/omnichatService';
import type { BotConversation, BotMessage, BotPersona } from '../../types/omnichat';
import PersonaAvatar from './PersonaAvatar';
import OmniChatMessageContent from './OmniChatMessageContent';

type QuickChatDialogProps = {
  isOpen: boolean;
  persona: BotPersona | null;
  existingConversation?: BotConversation;
  onClose: () => void;
  onContinue: (messages: BotMessage[]) => Promise<void>;
  onResume?: (conversation: BotConversation) => void;
  reduceMotion?: boolean;
  sharedElementName?: string;
  restoreFocusTo?: HTMLElement | null;
};

function createPreviewMessage(id: number, role: BotMessage['role'], content: string): BotMessage {
  return {
    id,
    conversation_id: 0,
    role,
    content,
    failed: false,
    created_at: new Date().toISOString(),
  };
}

export default function QuickChatDialog({
  isOpen,
  persona,
  existingConversation,
  onClose,
  onContinue,
  onResume,
  reduceMotion = false,
  sharedElementName,
  restoreFocusTo,
}: QuickChatDialogProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [submittedContent, setSubmittedContent] = useState<string | null>(null);
  const [assistantReply, setAssistantReply] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [generationError, setGenerationError] = useState(false);
  const [continueError, setContinueError] = useState(false);
  const requestVersionRef = useRef(0);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const openingMessage = persona?.first_message?.trim() ?? '';

  useEffect(() => {
    requestVersionRef.current += 1;
    setDraft('');
    setSubmittedContent(null);
    setAssistantReply(null);
    setIsGenerating(false);
    setIsContinuing(false);
    setGenerationError(false);
    setContinueError(false);
  }, [isOpen, persona?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    const transcriptElement = transcriptRef.current;
    if (!transcriptElement || typeof transcriptElement.scrollTo !== 'function') return;
    transcriptElement.scrollTo({
      top: transcriptElement.scrollHeight,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [assistantReply, generationError, isGenerating, reduceMotion, submittedContent]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = '0px';
    composer.style.height = `${Math.min(Math.max(composer.scrollHeight, 44), 128)}px`;
  }, [draft]);

  const transcript = useMemo(() => {
    const messages: BotMessage[] = [];
    if (openingMessage) {
      messages.push(createPreviewMessage(-1, 'assistant', openingMessage));
    }
    if (submittedContent) {
      messages.push(createPreviewMessage(-2, 'user', submittedContent));
    }
    if (assistantReply) {
      messages.push(createPreviewMessage(-3, 'assistant', assistantReply));
    }
    return messages;
  }, [assistantReply, openingMessage, submittedContent]);

  const generateReply = async (content: string) => {
    if (!persona || !openingMessage) return;
    const requestVersion = ++requestVersionRef.current;
    setIsGenerating(true);
    setGenerationError(false);
    setContinueError(false);

    try {
      const response = await omnichatService.sendPreviewMessage({
        persona_id: persona.id,
        content,
        history: [{ role: 'assistant', content: openingMessage }],
      });
      if (requestVersion !== requestVersionRef.current) return;
      if (response.failed || !response.content.trim()) {
        setGenerationError(true);
        return;
      }
      setAssistantReply(response.content.trim());
    } catch {
      if (requestVersion === requestVersionRef.current) {
        setGenerationError(true);
      }
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setIsGenerating(false);
      }
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isGenerating || submittedContent || !openingMessage) return;
    setDraft('');
    setSubmittedContent(content);
    void generateReply(content);
  };

  const handleContinue = async () => {
    if (!assistantReply || isContinuing) return;
    setIsContinuing(true);
    setContinueError(false);
    try {
      await onContinue(transcript);
    } catch {
      setContinueError(true);
      setIsContinuing(false);
    }
  };

  const handleClose = () => {
    if (isContinuing) return;
    requestVersionRef.current += 1;
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen && Boolean(persona)}
      onClose={isContinuing ? undefined : handleClose}
      closeOnOverlayClick={!isContinuing}
      ariaLabelledBy="quick-chat-title"
      ariaDescribedBy="quick-chat-description"
      animation={reduceMotion ? 'none' : 'quick-chat'}
      restoreFocusTo={restoreFocusTo}
      overlayClassName="!z-[100] !items-end !justify-end !px-0 bg-black/70 backdrop-blur-sm sm:!items-center sm:!justify-center sm:!px-4"
      className="flex h-[min(calc(100dvh-env(safe-area-inset-top,0px)),760px)] w-full flex-col overflow-hidden rounded-t-[30px] border border-white/10 bg-[#11131c] shadow-[0_30px_100px_rgba(0,0,0,0.65)] sm:h-[min(92dvh,760px)] sm:max-w-xl sm:rounded-[30px]"
    >
      {persona && (
        <>
          <header className="relative shrink-0 overflow-hidden border-b border-white/[0.08] px-5 pb-5 pt-5 sm:px-6">
            <div className="absolute inset-0 opacity-20">
              <PersonaAvatar persona={persona} className="h-full w-full !rounded-none blur-2xl scale-110" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-[#11131c]/55 to-[#11131c]" />
            <div className="relative flex items-center gap-4">
              <div
                data-quick-chat-shared-avatar="true"
                className="h-14 w-14 shrink-0 rounded-2xl"
                style={sharedElementName ? { viewTransitionName: sharedElementName } : undefined}
              >
                <PersonaAvatar
                  persona={persona}
                  className="h-full w-full rounded-2xl border border-white/15 shadow-lg"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200/65">
                  {t('omnichat.quickChat.eyebrow')}
                </p>
                <h2 id="quick-chat-title" className="truncate text-xl font-black tracking-[-0.03em] text-white">
                  {t('omnichat.quickChat.title', { name: persona.name })}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isContinuing}
                aria-label={t('omnichat.quickChat.close')}
                className="omnichat-touch-target grid shrink-0 place-items-center rounded-full border border-white/10 bg-black/20 text-white/65 transition hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-95 disabled:cursor-wait disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                <X size={18} />
              </button>
            </div>
            <p id="quick-chat-description" className="relative mt-3 text-xs leading-relaxed text-white/45">
              {t('omnichat.quickChat.description')}
            </p>
          </header>

          <div
            ref={transcriptRef}
            className="min-h-0 flex-1 overscroll-y-contain overflow-y-auto px-4 py-5 sm:px-6"
            aria-live="polite"
          >
            {!openingMessage ? (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
                {t('omnichat.quickChat.openingUnavailable')}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-end gap-2.5">
                  <PersonaAvatar persona={persona} className="h-8 w-8 shrink-0 rounded-xl" />
                  <div className="max-w-[86%] rounded-[22px] rounded-bl-md border border-white/10 bg-white/[0.065] px-4 py-3 text-white/90 shadow-lg">
                    <OmniChatMessageContent content={openingMessage} />
                  </div>
                </div>

                {submittedContent && (
                  <div className="flex justify-end">
                    <div className="max-w-[86%] rounded-[22px] rounded-br-md bg-blue-600 px-4 py-3 text-white shadow-[0_12px_30px_rgba(37,99,235,0.22)]">
                      <OmniChatMessageContent content={submittedContent} />
                    </div>
                  </div>
                )}

                {isGenerating && (
                  <div className="flex items-center gap-2.5 text-xs text-white/45">
                    <PersonaAvatar persona={persona} className="h-8 w-8 shrink-0 rounded-xl" />
                    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-4 py-2.5">
                      <Loader2 size={14} className="animate-spin text-blue-300" />
                      {t('omnichat.quickChat.generating', { name: persona.name })}
                    </div>
                  </div>
                )}

                {generationError && submittedContent && !isGenerating && (
                  <div className="ml-10 rounded-2xl border border-red-300/15 bg-red-400/[0.08] p-4 text-sm text-red-100">
                    <p>{t('omnichat.quickChat.generationFailed')}</p>
                    <button
                      type="button"
                      onClick={() => void generateReply(submittedContent)}
                      className="omnichat-touch-target mt-3 flex items-center gap-2 rounded-full border border-red-200/20 px-3 text-xs font-bold transition hover:bg-red-200/10 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300"
                    >
                      <RotateCcw size={13} />
                      {t('omnichat.quickChat.retry')}
                    </button>
                  </div>
                )}

                {assistantReply && (
                  <div className="flex items-end gap-2.5">
                    <PersonaAvatar persona={persona} className="h-8 w-8 shrink-0 rounded-xl" />
                    <div className="max-w-[86%] rounded-[22px] rounded-bl-md border border-white/10 bg-white/[0.065] px-4 py-3 text-white/90 shadow-lg">
                      <OmniChatMessageContent content={assistantReply} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <footer className="omnichat-safe-bottom shrink-0 border-t border-white/[0.08] bg-black/15 px-4 pt-4 sm:p-5">
            {!submittedContent ? (
              <form onSubmit={handleSubmit} className="flex items-end gap-2.5">
                <label htmlFor="quick-chat-reply" className="sr-only">
                  {t('omnichat.quickChat.replyLabel', { name: persona.name })}
                </label>
                <textarea
                  ref={composerRef}
                  id="quick-chat-reply"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t('omnichat.quickChat.placeholder', { name: persona.name })}
                  rows={1}
                  enterKeyHint="send"
                  maxLength={4000}
                  disabled={!openingMessage}
                  className="min-h-11 max-h-32 flex-1 resize-none overflow-y-auto rounded-[20px] border border-white/10 bg-white/[0.055] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-blue-400/60 focus:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || !openingMessage}
                  aria-label={t('omnichat.quickChat.send')}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-600 text-white shadow-[0_10px_28px_rgba(37,99,235,0.3)] transition hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300 focus-visible:outline-offset-2"
                >
                  <Send size={17} />
                </button>
              </form>
            ) : assistantReply ? (
              <div>
                <button
                  type="button"
                  onClick={() => void handleContinue()}
                  disabled={isContinuing}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-5 text-sm font-black text-white shadow-[0_14px_34px_rgba(37,99,235,0.28)] transition hover:bg-blue-500 active:scale-[0.985] disabled:cursor-wait disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300 focus-visible:outline-offset-2"
                >
                  {isContinuing ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
                  {isContinuing ? t('omnichat.quickChat.openingChat') : t('omnichat.quickChat.continue')}
                </button>
                {continueError && (
                  <p className="mt-2 text-center text-xs text-red-200" role="alert">
                    {t('omnichat.quickChat.continueFailed')}
                  </p>
                )}
              </div>
            ) : (
              <p className="py-2 text-center text-xs text-white/40">{t('omnichat.quickChat.oneReplyHint')}</p>
            )}

            {existingConversation && onResume && !isGenerating && !isContinuing && (
              <button
                type="button"
                onClick={() => onResume(existingConversation)}
                className="omnichat-touch-target mt-3 flex w-full items-center justify-center text-center text-xs font-semibold text-white/50 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                {t('omnichat.quickChat.resumeExisting')}
              </button>
            )}
          </footer>
        </>
      )}
    </Modal>
  );
}
