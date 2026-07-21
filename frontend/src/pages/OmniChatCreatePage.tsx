import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Film,
  Image as ImageIcon,
  ImagePlus,
  Images,
  Loader2,
  Send,
} from 'lucide-react';
import OmniChatShell from '../components/omnichat/OmniChatShell';
import OmniChatMediaAssetView from '../components/omnichat/OmniChatMediaAssetView';
import PersonaAvatar from '../components/omnichat/PersonaAvatar';
import type { SidebarTab } from '../components/omnichat/OmniChatSidebar';
import { omnichatQueryKeys, omnichatService } from '../services/omnichatService';
import type {
  OmniChatGenerationJob,
  OmniChatMediaAsset,
  OmniChatMediaKind,
} from '../types/omnichat';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
const GALLERY_PAGE_SIZE = 24;

export function OmniChatCreateWorkspace() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<OmniChatMediaKind>('image');
  const [selectedPersonaId, setSelectedPersonaId] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('4:5');
  const [duration, setDuration] = useState(5);
  const [sourceAssetId, setSourceAssetId] = useState('');
  const [activeJob, setActiveJob] = useState<OmniChatGenerationJob | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<'generate' | 'gallery'>('generate');

  const personasQuery = useQuery({
    queryKey: omnichatQueryKeys.personas(),
    queryFn: () => omnichatService.listPersonas(),
  });
  const galleryQuery = useInfiniteQuery({
    queryKey: omnichatQueryKeys.gallery(),
    initialPageParam: undefined as { before: string; beforeId: string } | undefined,
    queryFn: ({ pageParam }) =>
      omnichatService.listGallery(
        undefined,
        pageParam?.before,
        pageParam?.beforeId,
        GALLERY_PAGE_SIZE
      ),
    getNextPageParam: (lastPage) => {
      if (lastPage.length < GALLERY_PAGE_SIZE) return undefined;
      const last = lastPage[lastPage.length - 1];
      return { before: last.created_at, beforeId: last.id };
    },
  });
  const personas = useMemo(() => personasQuery.data ?? [], [personasQuery.data]);
  const gallery = useMemo(() => galleryQuery.data?.pages.flat() ?? [], [galleryQuery.data]);
  const selectedPersona =
    personas.find((persona) => persona.id === selectedPersonaId) ?? personas[0];
  const characterImages = useMemo(
    () =>
      gallery.filter((asset) => asset.kind === 'image' && asset.persona_id === selectedPersona?.id),
    [gallery, selectedPersona?.id]
  );

  useEffect(() => {
    if (selectedPersonaId === 0 && personas[0]) setSelectedPersonaId(personas[0].id);
  }, [personas, selectedPersonaId]);

  const createMutation = useMutation({
    mutationFn: (request: Parameters<typeof omnichatService.createGeneration>[0]) =>
      omnichatService.createGeneration(request),
    onSuccess: (job) => setActiveJob(job),
  });
  const cancelMutation = useMutation({
    mutationFn: (jobId: string) => omnichatService.cancelGeneration(jobId),
    onSuccess: async (_result, jobId) => {
      await queryClient.cancelQueries({ queryKey: omnichatQueryKeys.generation(jobId) });
      setActiveJob((current) =>
        current?.id === jobId ? { ...current, status: 'cancelled' } : current
      );
      queryClient.setQueryData<OmniChatGenerationJob | undefined>(
        omnichatQueryKeys.generation(jobId),
        (current) => (current ? { ...current, status: 'cancelled' } : current)
      );
    },
  });
  const activeJobQuery = useQuery({
    queryKey: omnichatQueryKeys.generation(activeJob?.id ?? 'none'),
    queryFn: () => omnichatService.getGeneration(activeJob!.id),
    enabled: Boolean(activeJob?.id && !TERMINAL_STATUSES.has(activeJob.status)),
    refetchInterval: 2000,
  });

  useEffect(() => {
    const job = activeJobQuery.data;
    if (!job) return;
    setActiveJob(job);
    if (job.status === 'succeeded') {
      void queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.gallery() });
    }
  }, [activeJobQuery.data, queryClient]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPersona || !prompt.trim()) return;
    const animateExisting = kind === 'video' && Boolean(sourceAssetId);
    createMutation.mutate({
      kind,
      mode: animateExisting ? 'image_to_video' : 'create',
      persona_id: selectedPersona.id,
      prompt: prompt.trim(),
      negative_prompt: negativePrompt.trim() || undefined,
      aspect_ratio: aspectRatio as '1:1' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9',
      duration_seconds: kind === 'video' ? duration : undefined,
      source_asset_id: animateExisting ? sourceAssetId : undefined,
    });
  };

  return (
    <div className="min-h-[calc(100dvh-var(--omnichat-header-offset))] bg-[radial-gradient(circle_at_20%_0%,rgba(48,94,180,0.18),transparent_38%),var(--color-background)] px-4 py-6 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-blue-300/65">
              Character media lab
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Create with your characters
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/50">
              Generate character-consistent images and videos. Every result is saved privately to
              your gallery.
            </p>
          </div>
          <div className="flex rounded-2xl border border-white/10 bg-white/[0.04] p-1">
            {(['generate', 'gallery'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setWorkspaceTab(tab)}
                className={`rounded-xl px-4 py-2 text-sm font-medium capitalize ${workspaceTab === tab ? 'bg-blue-500 text-white' : 'text-white/55 hover:text-white'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </header>

        {workspaceTab === 'generate' ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.78fr),minmax(420px,1.22fr)]">
            <form
              onSubmit={submit}
              className="space-y-5 rounded-[30px] border border-white/10 bg-[#15161d]/85 p-5 shadow-2xl shadow-black/20 sm:p-7"
            >
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-black/20 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setKind('image');
                    setAspectRatio('4:5');
                  }}
                  className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold ${kind === 'image' ? 'bg-white/10 text-white' : 'text-white/45'}`}
                >
                  <ImageIcon size={17} /> Image
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKind('video');
                    setAspectRatio('16:9');
                  }}
                  className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold ${kind === 'video' ? 'bg-white/10 text-white' : 'text-white/45'}`}
                >
                  <Film size={17} /> Video
                </button>
              </div>

              <label className="block text-sm font-medium text-white/75">
                Character
                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/15 p-3">
                  {selectedPersona && (
                    <PersonaAvatar persona={selectedPersona} className="h-11 w-11 rounded-xl" />
                  )}
                  <select
                    aria-label="Character"
                    value={selectedPersona?.id ?? ''}
                    onChange={(event) => {
                      setSelectedPersonaId(Number(event.target.value));
                      setSourceAssetId('');
                    }}
                    className="min-w-0 flex-1 bg-transparent text-white outline-none"
                  >
                    {personas.map((persona) => (
                      <option key={persona.id} value={persona.id} className="bg-[#181920]">
                        {persona.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              {kind === 'video' && characterImages.length > 0 && (
                <label className="block text-sm font-medium text-white/75">
                  Starting image <span className="font-normal text-white/35">(optional)</span>
                  <select
                    aria-label="Starting image"
                    value={sourceAssetId}
                    onChange={(event) => setSourceAssetId(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  >
                    <option value="">Generate directly from the prompt</option>
                    {characterImages.map((asset, index) => (
                      <option key={asset.id} value={asset.id}>
                        Gallery image {index + 1}: {asset.prompt.slice(0, 48)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block text-sm font-medium text-white/75">
                Prompt
                <textarea
                  aria-label="Prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  maxLength={2000}
                  placeholder={
                    kind === 'image'
                      ? 'Describe the character, scene, outfit, mood, and camera…'
                      : 'Describe the scene and how the character or camera should move…'
                  }
                  className="mt-2 min-h-36 w-full resize-y rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-blue-400/60"
                />
              </label>
              <label className="block text-sm font-medium text-white/75">
                Avoid <span className="font-normal text-white/35">(optional)</span>
                <input
                  value={negativePrompt}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                  maxLength={1000}
                  placeholder="Blur, distorted hands, text…"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-blue-400/60"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-white/75">
                  Aspect ratio
                  <select
                    aria-label="Aspect ratio"
                    value={aspectRatio}
                    onChange={(event) => setAspectRatio(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  >
                    {['1:1', '4:5', '3:4', '16:9', '9:16', '4:3', '5:4'].map((ratio) => (
                      <option key={ratio} value={ratio} className="bg-[#181920]">
                        {ratio}
                      </option>
                    ))}
                  </select>
                </label>
                {kind === 'video' && (
                  <label className="text-sm font-medium text-white/75">
                    Duration
                    <select
                      aria-label="Duration"
                      value={duration}
                      onChange={(event) => setDuration(Number(event.target.value))}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                    >
                      {[3, 4, 5, 6, 7, 8, 9, 10].map((seconds) => (
                        <option key={seconds} value={seconds} className="bg-[#181920]">
                          {seconds} seconds
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <button
                type="submit"
                disabled={
                  !selectedPersona ||
                  !prompt.trim() ||
                  createMutation.isPending ||
                  Boolean(activeJob && !TERMINAL_STATUSES.has(activeJob.status))
                }
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {createMutation.isPending ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : kind === 'image' ? (
                  <ImagePlus size={18} />
                ) : (
                  <Film size={18} />
                )}
                Generate {kind}
              </button>
              {createMutation.isError && (
                <p className="text-sm text-rose-300">
                  {createMutation.error instanceof Error
                    ? createMutation.error.message
                    : 'Generation could not be started.'}
                </p>
              )}
            </form>

            <section className="flex min-h-[520px] flex-col items-center justify-center overflow-hidden rounded-[30px] border border-white/10 bg-[#101117]/80 p-6">
              {activeJob ? (
                <div className="w-full max-w-xl text-center">
                  {activeJob.status === 'succeeded' && activeJob.output_asset_id ? (
                    <GeneratedResult assetId={activeJob.output_asset_id} />
                  ) : activeJob.status === 'failed' ? (
                    <div className="rounded-3xl border border-rose-400/20 bg-rose-500/10 p-8 text-rose-100">
                      <p className="font-semibold">Generation failed</p>
                      <p className="mt-2 text-sm text-rose-100/65">
                        {activeJob.error_code?.replaceAll('_', ' ') ||
                          'Please try a different prompt.'}
                      </p>
                    </div>
                  ) : activeJob.status === 'cancelled' ? (
                    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-white/70">
                      <p className="font-semibold text-white">Generation cancelled</p>
                      <p className="mt-2 text-sm text-white/45">
                        No result was added to your gallery.
                      </p>
                    </div>
                  ) : (
                    <div className="mx-auto max-w-md">
                      <Loader2 size={42} className="mx-auto animate-spin text-blue-300" />
                      <p className="mt-5 text-lg font-semibold text-white">
                        Creating your {activeJob.kind}
                      </p>
                      <p className="mt-2 text-sm text-white/45">
                        You can leave this page. The result will still be saved to your gallery.
                      </p>
                      <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-400 transition-all"
                          style={{ width: `${Math.max(4, activeJob.progress)}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-white/35">
                        {activeJob.progress}% · {activeJob.status}
                      </p>
                      <button
                        type="button"
                        aria-label="Cancel generation"
                        onClick={() => cancelMutation.mutate(activeJob.id)}
                        disabled={cancelMutation.isPending}
                        className="mt-5 rounded-full border border-white/15 px-4 py-2 text-sm text-white/60 hover:border-white/25 hover:text-white disabled:opacity-40"
                      >
                        {cancelMutation.isPending ? 'Cancelling…' : 'Cancel'}
                      </button>
                      {cancelMutation.isError && (
                        <p className="mt-2 text-xs text-rose-300">
                          Generation could not be cancelled.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-w-md text-center text-white/45">
                  <Images size={48} className="mx-auto text-blue-300/55" />
                  <p className="mt-5 text-xl font-semibold text-white/80">
                    Your next scene starts here
                  </p>
                  <p className="mt-2 text-sm leading-relaxed">
                    Choose a character and describe exactly what you want to see. Character
                    references are applied automatically.
                  </p>
                </div>
              )}
            </section>
          </div>
        ) : (
          <GalleryGrid
            assets={gallery}
            isLoading={galleryQuery.isLoading}
            isError={galleryQuery.isError}
            hasNextPage={galleryQuery.hasNextPage}
            isFetchingNextPage={galleryQuery.isFetchingNextPage}
            loadMore={() => void galleryQuery.fetchNextPage()}
          />
        )}
      </div>
    </div>
  );
}

function GeneratedResult({ assetId }: { assetId: string }) {
  const assetQuery = useQuery({
    queryKey: ['omnichat', 'media', assetId],
    queryFn: () => omnichatService.getMediaAsset(assetId),
  });
  if (!assetQuery.data) return <Loader2 size={36} className="mx-auto animate-spin text-blue-300" />;
  return (
    <>
      <OmniChatMediaAssetView
        asset={assetQuery.data}
        className="mx-auto max-h-[620px] min-h-80 w-full"
      />
      <p className="mt-4 text-sm text-emerald-300">Saved to your private gallery</p>
    </>
  );
}

function GalleryGrid({
  assets,
  isLoading,
  isError,
  hasNextPage,
  isFetchingNextPage,
  loadMore,
}: {
  assets: OmniChatMediaAsset[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  loadMore: () => void;
}) {
  const queryClient = useQueryClient();
  const [publishedAssetId, setPublishedAssetId] = useState('');
  const publishMutation = useMutation({
    mutationFn: (assetId: string) => omnichatService.publishMedia(assetId),
    onSuccess: (publication, assetId) => {
      setPublishedAssetId(assetId);
      void queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.gallery() });
      void queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.explore() });
      return publication;
    },
  });
  if (isLoading)
    return (
      <div className="flex min-h-80 items-center justify-center">
        <Loader2 className="animate-spin text-blue-300" />
      </div>
    );
  if (isError)
    return (
      <div
        role="alert"
        className="rounded-3xl border border-rose-400/20 bg-rose-500/10 p-8 text-center text-rose-100"
      >
        Your gallery could not be loaded.
      </div>
    );
  if (assets.length === 0)
    return (
      <div className="flex min-h-80 flex-col items-center justify-center rounded-[30px] border border-dashed border-white/10 text-white/40">
        <Images size={42} />
        <p className="mt-4 font-medium text-white/70">Your gallery is waiting</p>
        <p className="mt-1 text-sm">Generated images and videos appear here automatically.</p>
      </div>
    );
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {assets.map((asset) => (
          <article
            key={asset.id}
            className="overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.04] p-3"
          >
            <OmniChatMediaAssetView asset={asset} className="aspect-[4/5] min-h-60 w-full" />
            <p className="mt-3 line-clamp-2 text-sm text-white/65">{asset.prompt}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs capitalize text-white/30">
                {asset.kind} · {asset.visibility}
              </p>
              {asset.visibility === 'public' || publishedAssetId === asset.id ? (
                <span className="text-xs font-medium text-emerald-300">Published</span>
              ) : (
                <button
                  type="button"
                  onClick={() => publishMutation.mutate(asset.id)}
                  disabled={publishMutation.isPending}
                  className="flex items-center gap-1 rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs font-medium text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-40"
                >
                  {publishMutation.isPending && publishMutation.variables === asset.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Send size={12} />
                  )}{' '}
                  Publish
                </button>
              )}
            </div>
            {publishMutation.isError && publishMutation.variables === asset.id && (
              <p className="mt-2 text-xs text-rose-300">Could not publish this creation.</p>
            )}
          </article>
        ))}
      </div>
      {hasNextPage && (
        <div className="mt-7 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={isFetchingNextPage}
            className="rounded-full border border-white/15 px-6 py-3 text-sm text-white/70 disabled:opacity-40"
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </>
  );
}

export default function OmniChatCreatePage() {
  const navigate = useNavigate();
  const navigateSidebar = (tab: SidebarTab) => {
    if (tab === 'discover') navigate('/omnichat');
    if (tab === 'chat') navigate('/omnichat/chat');
    if (tab === 'groups') navigate('/omnichat/groups');
    if (tab === 'create') navigate('/omnichat/create');
    if (tab === 'explore') navigate('/omnichat/explore');
    if (tab === 'characters') navigate('/omnichat/studio');
    if (tab === 'search') navigate('/omnichat?search=open');
  };
  return (
    <OmniChatShell activeTab="create" onTabChange={navigateSidebar}>
      <OmniChatCreateWorkspace />
    </OmniChatShell>
  );
}
