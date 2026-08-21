import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/adminService';
import type { AdminOmniChatPersonaBlock } from '../../types/admin';
import { OffsetPaginationControls } from '../common/OffsetPaginationControls';

const PAGE_SIZE = 25;

const TIER_LABELS: Record<number, string> = {
  1: '10 minutes',
  2: '2 hours',
  3: '1 day',
  4: 'Indefinite',
};

function BlockState({ block }: { block: AdminOmniChatPersonaBlock }) {
  if (block.overturned_at) {
    return (
      <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-900">
        Overturned
      </span>
    );
  }
  if (block.in_force) {
    return (
      <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-900">
        In force
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
      Lapsed
    </span>
  );
}

/**
 * The queue shows blocks in every state, not only those in force. A ten-minute
 * block is gone long before anyone looks at this screen, and short blocks are
 * the ones most likely to have been unfair -- a live-only view would hide
 * exactly the decisions worth reviewing.
 *
 * A lapsed block is still worth overturning, which is why the control stays on
 * one. It cannot let anybody back in, but it takes the block off the character's
 * ladder, so an unfair ten minutes does not silently make the next block two
 * hours.
 */
/**
 * The exchange she acted on, beside her account of it. Collapsed by default --
 * forty turns is a lot of card, and most rows are opened to check a name and a
 * date rather than to read an argument.
 */
function BlockTranscript({ block }: { block: AdminOmniChatPersonaBlock }) {
  const turns = block.transcript ?? [];
  if (turns.length === 0) {
    return (
      <p className="mt-3 text-xs italic text-[var(--color-text-secondary)]">
        No exchange was recorded with this block.
      </p>
    );
  }

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-medium text-[var(--color-text-secondary)]">
        What she was reacting to ({turns.length} messages)
      </summary>
      <ol className="mt-2 space-y-2 border-l-2 border-[var(--color-border)] pl-3">
        {turns.map((turn, index) => (
          <li key={`${block.id}-${index}`} className="text-sm">
            <span className="font-semibold">
              {turn.role === 'assistant' ? block.persona_name : `@${block.username}`}
            </span>
            <span className="ml-2 text-xs text-[var(--color-text-secondary)]">
              {new Date(turn.created_at).toLocaleString()}
            </span>
            <p className="mt-0.5 whitespace-pre-wrap text-[var(--color-text-secondary)]">
              {turn.content}
            </p>
          </li>
        ))}
      </ol>
    </details>
  );
}

export default function OmniChatPersonaBlocksTab() {
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const blocksQuery = useQuery({
    queryKey: ['adminOmniChatPersonaBlocks', offset],
    queryFn: () => adminService.listOmniChatPersonaBlocks(undefined, PAGE_SIZE, offset),
  });

  const overturnMutation = useMutation({
    mutationFn: ({ id, reviewNote }: { id: number; reviewNote: string }) =>
      adminService.overturnOmniChatPersonaBlock(id, reviewNote),
    onSuccess: () => {
      setNoteFor(null);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['adminOmniChatPersonaBlocks'] });
    },
  });

  const blocks = blocksQuery.data?.blocks ?? [];

  return (
    <section aria-labelledby="persona-blocks-heading" className="space-y-4">
      <div>
        <h2 id="persona-blocks-heading" className="text-2xl font-bold">
          Character blocks
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          People a character has stopped talking to, newest first. Lapsed and already-overturned
          blocks stay listed — a short block ends before anyone can look at it, and those are the
          ones most likely to have been unfair. Overturning lets the person back in immediately and
          takes the block off that character&rsquo;s escalation ladder, so the next one starts over.
          Each block carries the exchange she was reacting to, because the question being asked is
          whether her account of it was fair.
        </p>
      </div>

      {blocksQuery.isLoading && <p>Loading blocks…</p>}
      {blocksQuery.isError && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-red-800">
          Blocks could not be loaded.
        </p>
      )}
      {overturnMutation.isError && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-red-800">
          The block could not be overturned.
        </p>
      )}
      {!blocksQuery.isLoading && blocks.length === 0 && (
        <p className="rounded border border-[var(--color-border)] p-5 text-[var(--color-text-secondary)]">
          No character has blocked anyone.
        </p>
      )}

      <div className="space-y-3">
        {blocks.map((block) => (
          <article
            key={block.id}
            data-testid="admin-persona-block"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {block.persona_name} blocked @{block.username}
                </p>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {TIER_LABELS[block.tier] ?? `Tier ${block.tier}`}
                  {block.expires_at && ` · until ${new Date(block.expires_at).toLocaleString()}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <BlockState block={block} />
                <time className="text-xs text-[var(--color-text-secondary)]">
                  {new Date(block.created_at).toLocaleString()}
                </time>
              </div>
            </div>

            <p className="mt-3 rounded bg-[var(--color-surface)] p-3 text-sm">{block.reason}</p>

            <BlockTranscript block={block} />

            {block.overturn_note && (
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                Review note: {block.overturn_note}
              </p>
            )}

            {!block.overturned_at &&
              (noteFor === block.id ? (
                <div className="mt-4 space-y-2">
                  <label htmlFor={`overturn-note-${block.id}`} className="block text-sm font-medium">
                    Why was this unfair?
                  </label>
                  <textarea
                    id={`overturn-note-${block.id}`}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={2}
                    maxLength={1000}
                    className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={overturnMutation.isPending}
                      onClick={() =>
                        overturnMutation.mutate({ id: block.id, reviewNote: note.trim() })
                      }
                      className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Overturn
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNoteFor(null);
                        setNote('');
                      }}
                      className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setNoteFor(block.id);
                    setNote('');
                  }}
                  className="mt-4 rounded border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold"
                >
                  Overturn…
                </button>
              ))}
          </article>
        ))}
      </div>

      <OffsetPaginationControls
        hasPrev={offset > 0}
        hasMore={offset + blocks.length < (blocksQuery.data?.total ?? 0)}
        isFetching={blocksQuery.isFetching}
        onPrev={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
        onNext={() => setOffset((value) => value + PAGE_SIZE)}
      />
    </section>
  );
}
