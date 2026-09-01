import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import OmniChatShell from '../components/omnichat/OmniChatShell';
import CreationFlow from '../components/omnichat/omniai/CreationFlow';
import { translate } from '../components/omnichat/omniai/labels';
import type { CreationRefusal } from '../components/omnichat/omniai/refusals';
import { useOmniChatNavigation } from '../components/omnichat/useOmniChatNavigation';
import { useAuth } from '../contexts/AuthContext';
import { omnichatQueryKeys, omnichatService } from '../services/omnichatService';
import type { BotPersona, OmniAIOptions } from '../types/omnichat';

/**
 * Making an OmniAI (§34).
 *
 * Its own route rather than a modal: nine screens deserve a back button and a
 * link somebody can return to, and a browser back out of a modal loses the lot.
 */
export default function OmniChatNewOmniAIPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const onTabChange = useOmniChatNavigation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [refusal, setRefusal] = useState<CreationRefusal>(null);
  const optionsQueryKey = omnichatQueryKeys.omniAIOptions(user?.id ?? 0);

  /**
   * Asked before the questions start, not after them.
   *
   * Somebody already keeping one was answering ten screens and being refused on
   * the last, which is a form that wastes your time and then tells you it was
   * never going to work. The flow receives this response rather than owning a
   * second query, so one request supplies both the gate and all nine screens.
   *
   * The server still refuses at creation. This decides what somebody is shown;
   * it does not enforce anything. It is caller-specific and refetched whenever
   * the page opens, because a plan or owned count can change between visits.
   */
  const {
    data: options,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: optionsQueryKey,
    queryFn: () => omnichatService.getOmniAIOptions(),
    enabled: Boolean(user?.id),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const atTheLimit = Boolean(options && options.omniai_owned >= options.omniai_limit);
  const needsUpgrade = Boolean(options && !options.omniai_allowed);
  const blockedBy = refusal ?? (needsUpgrade ? 'needs_upgrade' : atTheLimit ? 'already_has_one' : null);

  /**
   * Straight into the conversation. The flow ends by meeting her, and a
   * confirmation screen would put a page between somebody and the character
   * they just spent nine screens on.
   *
   * A conversation has to exist first. An earlier version navigated to
   * /omnichat/c/new?persona=<id>, which is not a route this app has -- "new"
   * would have been read as a conversation id and looked up.
   */
  const openChat = useMutation({
    mutationFn: (persona: BotPersona) => omnichatService.createConversation(persona.id),
    onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
      navigate(`/omnichat/c/${conversation.id}`);
    },
    onError: () => {
      // She exists either way. Dropping somebody back into an empty flow would
      // suggest the creation failed, so send them where she is listed.
      navigate('/omnichat/studio');
    },
  });

  const handleMade = (persona: BotPersona) => {
    // Creation succeeded, so the cached preflight count is already obsolete.
    // Update it synchronously: returning to this route must not reopen a form
    // the creator will now refuse at the end.
    queryClient.setQueryData<OmniAIOptions>(optionsQueryKey, (current) =>
      current ? { ...current, omniai_owned: current.omniai_owned + 1 } : current
    );
    openChat.mutate(persona);
  };

  return (
    <OmniChatShell activeTab="newOmniAI" onTabChange={onTabChange}>
      <div className="flex min-h-full items-center justify-center p-6">
        {isLoading || isFetching || !user ? (
          <Loader2 className="animate-spin text-white/40" size={22} />
        ) : isError || !options ? (
          <OptionsUnavailable
            onRetry={() => void refetch()}
            onOpenCharacters={() => navigate('/omnichat/studio')}
          />
        ) : blockedBy ? (
          <RefusalPanel
            refusal={blockedBy}
            canDismiss={refusal !== null}
            onDismiss={() => setRefusal(null)}
            onSeePlans={() => navigate('/omnichat?upgrade=1')}
            onOpenCharacters={() => navigate('/omnichat/studio')}
          />
        ) : (
          <CreationFlow options={options} onMade={handleMade} onRefused={setRefusal} />
        )}
      </div>
      <span className="sr-only">
        {translate(t, 'omnichat.omniai.pageTitle', 'New OmniAI')}
      </span>
    </OmniChatShell>
  );
}

function OptionsUnavailable({
  onRetry,
  onOpenCharacters,
}: {
  onRetry: () => void;
  onOpenCharacters: () => void;
}) {
  return (
    <div className="w-full max-w-[520px] rounded-[28px] border border-white/10 bg-[#0e1017] p-8 text-center shadow-[0_32px_120px_rgba(0,0,0,.72)]">
      <h1 className="text-2xl font-semibold text-white">The creation options did not load</h1>
      <p className="mt-3 text-sm leading-6 text-white/55">
        Nothing has been started. Try loading the choices again, or return to your characters.
      </p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-xl bg-[#5d8fff] px-5 py-3 text-sm font-semibold text-white hover:bg-[#6f9cff]"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onOpenCharacters}
          className="rounded-xl border border-white/12 bg-white/[0.035] px-5 py-3 text-sm font-semibold text-white/75 hover:bg-white/[0.07]"
        >
          Open your characters
        </button>
      </div>
    </div>
  );
}

/**
 * The two refusals, which are different answers to different situations.
 *
 * A full shelf can be cleared and a plan cannot, so "delete one" is advice
 * somebody without the feature cannot take. The server codes them apart for
 * exactly this reason.
 */
function RefusalPanel({
  refusal,
  canDismiss,
  onDismiss,
  onSeePlans,
  onOpenCharacters,
}: {
  refusal: CreationRefusal;
  canDismiss: boolean;
  onDismiss: () => void;
  onSeePlans: () => void;
  onOpenCharacters: () => void;
}) {
  const { t } = useTranslation();

  const copy =
    refusal === 'already_has_one'
      ? {
          title: translate(t, 'omnichat.omniai.refused.existing.title', 'You already have one'),
          body: translate(
            t,
            'omnichat.omniai.refused.existing.body',
            'One OmniAI at a time. She remembers everything the two of you have done, and that is the whole point of the limit.'
          ),
          action: translate(t, 'omnichat.omniai.refused.existing.action', 'Open your characters'),
          onAction: onOpenCharacters,
        }
      : refusal === 'underage'
        ? {
            title: translate(
              t,
              'omnichat.omniai.refused.underage.title',
              'That character will not be made'
            ),
            body: translate(
              t,
              'omnichat.omniai.refused.underage.body',
              'Nobody under 18 is made here. Change the age and the rest of your answers are still there.'
            ),
            action: translate(t, 'omnichat.omniai.refused.underage.action', 'Go back'),
            onAction: onDismiss,
          }
        : {
            title: translate(
              t,
              'omnichat.omniai.refused.upgrade.title',
              'This one comes with Premium'
            ),
            body: translate(
              t,
              'omnichat.omniai.refused.upgrade.body',
              'Writing your own characters starts on Plus. One who answers for themselves, remembers, and can tell you no comes with Premium.'
            ),
            action: translate(t, 'omnichat.omniai.refused.upgrade.action', 'See the plans'),
            onAction: onSeePlans,
          };

  return (
    <div className="flex w-full max-w-[560px] flex-col gap-5 rounded-[30px] border border-white/10 bg-[#0e1017] p-8 shadow-[0_32px_120px_rgba(0,0,0,.72)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#7da8ff]">
        {translate(t, 'omnichat.omniai.header', 'New OmniAI')}
      </p>
      <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white">
        {copy.title}
      </h1>
      <p className="text-[15px] leading-6 text-white/55">{copy.body}</p>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={copy.onAction}
          className="omnichat-touch-target min-w-[168px] rounded-full bg-[#426fc4] px-6 text-[14.5px] font-semibold text-white transition hover:bg-[#527fd3]"
        >
          {copy.action}
        </button>
        {refusal === 'underage' || !canDismiss ? null : (
          <button
            type="button"
            onClick={onDismiss}
            className="omnichat-touch-target rounded-full px-5 text-[14.5px] font-semibold text-white/60 transition hover:text-white"
          >
            {translate(t, 'omnichat.omniai.refused.back', 'Back')}
          </button>
        )}
      </div>
    </div>
  );
}
