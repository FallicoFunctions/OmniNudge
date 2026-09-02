import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { omnichatQueryKeys, omnichatService } from '../../../services/omnichatService';
import { translate } from './labels';
import { serverErrorFrom } from './refusals';
import { pronounsFor } from './pronouns';

/**
 * How many faces a set is.
 *
 * The server's OmniChatOmniAILikenessCandidates is the source of truth. This
 * mirrors it only to price the button, and the copy either side of it says
 * "four" in words anyway -- so a change there is a copy change, not a silent
 * one. The per-image price is deliberately not mirrored: that is configured,
 * and the server publishes it.
 */
const LIKENESS_CANDIDATES = 4;

/**
 * Choosing which of the four she looks like.
 *
 * It appears in the conversation rather than at the end of the creation flow.
 * The renders take a while and nobody should wait on a screen for them, so the
 * flow ends by meeting her and this arrives when her pictures do.
 *
 * The choice is permanent in a way nothing else here is: the picked image
 * becomes her avatar, the reference every later render is conditioned on, and
 * the single forward-facing full body the 3D pipeline takes. So it is shown
 * large, and it says what it is deciding.
 */
export default function LikenessPicker({
  personaId,
  gender,
}: {
  personaId: number;
  gender: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const p = pronounsFor(gender);

  const choice = useQuery({
    queryKey: omnichatQueryKeys.omniAILikeness(personaId),
    queryFn: () => omnichatService.getLikenessCandidates(personaId),
    // Her pictures arrive from a render queue, so this polls until none are
    // outstanding. A candidate that has landed but is not scanned yet is also
    // worth another look, because it becomes loadable without anything else
    // changing.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 4000;
      const waiting = data.pending > 0 || data.candidates.some((one) => !one.ready);
      return waiting ? 4000 : false;
    },
  });

  const pick = useMutation({
    mutationFn: (candidateId: number) => omnichatService.pickLikeness(personaId, candidateId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.omniAILikeness(personaId) });
      void queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
    },
  });

  // What the server charges for an image, rather than what this file remembers.
  //
  // The price is configured on the server and already published for exactly
  // this reason. A button that says "40 credits" from a constant is telling
  // somebody a number nobody promised to charge, and it goes wrong silently the
  // first time the rate moves.
  const costs = useQuery({
    queryKey: omnichatQueryKeys.billingUsage(1),
    queryFn: () => omnichatService.getBillingUsage(1),
    staleTime: 5 * 60 * 1000,
  });
  const imageCost = costs.data?.costs.image;
  const setCost = typeof imageCost === 'number' ? imageCost * LIKENESS_CANDIDATES : undefined;

  const reroll = useMutation({
    mutationFn: () => omnichatService.rerollLikeness(personaId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.omniAILikeness(personaId) });
      void queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.billingWallet });
    },
  });

  // What the server actually said, not the status. "Her face is already chosen"
  // and "not enough credits" are both refusals and want completely different
  // sentences; a shared banner would offer neither.
  const rerollProblem = reroll.isError ? serverErrorFrom(reroll.error).code : undefined;

  // Choosing settles it, even though the panel is still on screen: the refetch
  // that removes it has not landed yet, and until it does the pictures were
  // still pressable. A second press reached the server, was refused because the
  // choice was already made, and told somebody their pick had failed when it
  // had in fact worked.
  const settled = pick.isPending || pick.isSuccess;

  const data = choice.data;
  // Nothing to choose and nothing coming: she was made before this existed, or
  // every render failed. Either way there is no choice to put in front of
  // somebody, and an empty panel would be worse than none.
  if (!data || (data.candidates.length === 0 && data.pending === 0)) {
    return null;
  }

  const waitingFor = data.pending;

  return (
    <section
      aria-labelledby="omnichat-likeness-title"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
    >
      <h3 id="omnichat-likeness-title" className="text-[15px] font-semibold text-white/90">
        {translate(t, 'omnichat.omniai.likeness.title', `Choose how ${p.subj} looks`)}
      </h3>
      <p className="mt-1 text-[13px] leading-5 text-white/50">
        {translate(
          t,
          'omnichat.omniai.likeness.subtitle',
          `This is the one you keep. It becomes ${p.poss} picture everywhere ${p.subj} appears.`
        )}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.candidates.map((candidate, index) => (
          <button
            key={candidate.id}
            type="button"
            disabled={!candidate.ready || settled}
            onClick={() => pick.mutate(candidate.id)}
            // Without this the whole choice is four buttons with no name: the
            // picture is the only content and it cannot be described, since
            // nothing here knows what a render came back as. Position is what
            // is honestly available, and it is enough to tell them apart.
            aria-label={
              candidate.ready
                ? translate(t, 'omnichat.omniai.likeness.choose', `Choose picture ${index + 1}`)
                : translate(
                    t,
                    'omnichat.omniai.likeness.arriving',
                    `Picture ${index + 1}, still arriving`
                  )
            }
            className="group relative aspect-[9/16] overflow-hidden rounded-xl border border-white/10 bg-black/30 disabled:cursor-not-allowed"
          >
            {candidate.ready ? (
              <img
                src={candidate.content_url}
                alt=""
                className="h-full w-full object-cover transition group-hover:scale-[1.03]"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <Loader2 className="animate-spin text-white/30" size={18} />
              </span>
            )}
          </button>
        ))}

        {/* A place for each render still on its way, so four spaces are shown
            from the start rather than the row growing under somebody's cursor
            while they are deciding. */}
        {Array.from({ length: waitingFor }).map((_, index) => (
          <div
            key={`pending-${index}`}
            className="flex aspect-[9/16] items-center justify-center rounded-xl border border-dashed border-white/10"
          >
            <Loader2 className="animate-spin text-white/25" size={18} />
          </div>
        ))}
      </div>

      {/* Drawing another set replaces these four rather than adding to them, and
          costs credits, so the button says both before it is pressed. It is gone
          the moment a choice is made: after that the answer is not another set,
          it is that she already has a face. */}
      {!settled ? (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => reroll.mutate()}
            disabled={reroll.isPending || waitingFor > 0}
            // Otherwise the button announces its price and not its consequence:
            // the note beside it is the only thing that says these four go, and
            // a screen reader has no reason to read a neighbouring span.
            aria-describedby="omniai-reroll-replaces"
            className="omnichat-touch-target rounded-xl border border-white/12 bg-white/[0.035] px-4 py-2 text-[13px] font-semibold text-white/75 transition hover:border-[#5d8fff]/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {reroll.isPending
              ? translate(t, 'omnichat.omniai.likeness.rerolling', 'Drawing four more...')
              : setCost === undefined
                ? // The price has not arrived. Better to say nothing about cost
                  // than to name one that may not be what is charged.
                  translate(t, 'omnichat.omniai.likeness.rerollPlain', 'Draw four more')
                : translate(
                    t,
                    'omnichat.omniai.likeness.reroll',
                    `Draw four more (${setCost} credits)`
                  )}
          </button>
          <span id="omniai-reroll-replaces" className="text-[12px] text-white/35">
            {translate(
              t,
              'omnichat.omniai.likeness.rerollReplaces',
              'These four are replaced.'
            )}
          </span>
        </div>
      ) : null}

      {rerollProblem ? (
        <p className="mt-3 text-[13px] text-red-300">
          {rerollProblem === 'insufficient_credits'
            ? translate(
                t,
                'omnichat.omniai.likeness.rerollCredits',
                'Another set costs more credits than you have.'
              )
            : rerollProblem === 'likeness_already_chosen'
              ? translate(
                  t,
                  'omnichat.omniai.likeness.rerollChosen',
                  `${p.poss[0].toUpperCase()}${p.poss.slice(1)} face is already chosen.`
                )
              : rerollProblem === 'reroll_unavailable'
                ? // Retrying cannot help: nothing is wired to draw one. Saying
                  // "try again" sends somebody to press a button forever.
                  translate(
                    t,
                    'omnichat.omniai.likeness.rerollOff',
                    'Drawing another set is unavailable right now.'
                  )
                : translate(
                    t,
                    'omnichat.omniai.likeness.rerollFailed',
                    'Another set could not be drawn. Try again.'
                  )}
        </p>
      ) : null}

      {pick.isError && !pick.isSuccess ? (
        <p className="mt-3 text-[13px] text-red-300">
          {translate(
            t,
            'omnichat.omniai.likeness.failed',
            'That picture could not be kept. Try another.'
          )}
        </p>
      ) : null}
    </section>
  );
}
