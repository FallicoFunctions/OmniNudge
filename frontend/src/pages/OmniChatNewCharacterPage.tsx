import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import OmniChatShell from '../components/omnichat/OmniChatShell';
import CreationFlow from '../components/omnichat/iai/CreationFlow';
import { translate } from '../components/omnichat/iai/labels';
import type { CreationRefusal } from '../components/omnichat/iai/refusals';
import { useOmniChatNavigation } from '../components/omnichat/useOmniChatNavigation';
import { omnichatQueryKeys, omnichatService } from '../services/omnichatService';
import type { BotPersona } from '../types/omnichat';

/**
 * Making an independent character (§34).
 *
 * Its own route rather than a modal: nine screens deserve a back button and a
 * link somebody can return to, and a browser back out of a modal loses the lot.
 */
export default function OmniChatNewCharacterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const onTabChange = useOmniChatNavigation();
  const queryClient = useQueryClient();
  const [refusal, setRefusal] = useState<CreationRefusal>(null);

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

  return (
    <OmniChatShell activeTab="newCharacter" onTabChange={onTabChange}>
      <div className="flex min-h-full items-center justify-center p-6">
        {refusal ? (
          <RefusalPanel
            refusal={refusal}
            onDismiss={() => setRefusal(null)}
            onSeePlans={() => navigate('/omnichat?upgrade=1')}
            onOpenCharacters={() => navigate('/omnichat/studio')}
          />
        ) : (
          <CreationFlow onMade={(persona) => openChat.mutate(persona)} onRefused={setRefusal} />
        )}
      </div>
      <span className="sr-only">{translate(t, 'omnichat.iai.pageTitle', 'New independent character')}</span>
    </OmniChatShell>
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
  onDismiss,
  onSeePlans,
  onOpenCharacters,
}: {
  refusal: CreationRefusal;
  onDismiss: () => void;
  onSeePlans: () => void;
  onOpenCharacters: () => void;
}) {
  const { t } = useTranslation();

  const copy =
    refusal === 'already_has_one'
      ? {
          title: translate(t, 'omnichat.iai.refused.existing.title', 'You already have one'),
          body: translate(t, 'omnichat.iai.refused.existing.body',
            'One independent character at a time. She remembers everything the two of you have done, and that is the whole point of the limit.'
          ),
          action: translate(t, 'omnichat.iai.refused.existing.action', 'Open your characters'),
          onAction: onOpenCharacters,
        }
      : refusal === 'underage'
        ? {
            title: translate(t, 'omnichat.iai.refused.underage.title', 'That character will not be made'),
            body: translate(t, 'omnichat.iai.refused.underage.body',
              'Nobody under 18 is made here. Change the age and the rest of your answers are still there.'
            ),
            action: translate(t, 'omnichat.iai.refused.underage.action', 'Go back'),
            onAction: onDismiss,
          }
        : {
            title: translate(t, 'omnichat.iai.refused.upgrade.title', 'This one comes with Premium'),
            body: translate(t, 'omnichat.iai.refused.upgrade.body',
              'Writing your own characters starts on Plus. One who answers for themselves, remembers, and can tell you no comes with Premium.'
            ),
            action: translate(t, 'omnichat.iai.refused.upgrade.action', 'See the plans'),
            onAction: onSeePlans,
          };

  return (
    <div className="flex w-full max-w-[560px] flex-col gap-5 rounded-[30px] border border-white/10 bg-[#0e1017] p-8 shadow-[0_32px_120px_rgba(0,0,0,.72)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#7da8ff]">
        {translate(t, 'omnichat.iai.header', 'New independent character')}
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
        {refusal === 'underage' ? null : (
          <button
            type="button"
            onClick={onDismiss}
            className="omnichat-touch-target rounded-full px-5 text-[14.5px] font-semibold text-white/60 transition hover:text-white"
          >
            {translate(t, 'omnichat.iai.refused.back', 'Back')}
          </button>
        )}
      </div>
    </div>
  );
}
