import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Download, Plus, Trash2, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import OmniChatShell from '../components/omnichat/OmniChatShell';
import type { SidebarTab } from '../components/omnichat/OmniChatSidebar';
import { OMNICHAT_TAB_ROUTES } from '../components/omnichat/useOmniChatNavigation';
import { Modal } from '../components/common/Modal';
import { ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import { useAuth } from '../contexts/AuthContext';
import { omnichatQueryKeys, omnichatService } from '../services/omnichatService';
import type {
  BotPersona,
  BotPersonaDefinition,
  PersonaCategory,
  PersonaDefinitionPayload,
  PersonaEditPayload,
  ResponseStyleProfile,
  OmniChatVoicePreset,
} from '../types/omnichat';
import { resolveMediaUrl } from '../utils/mediaUrl';

const CATEGORIES: PersonaCategory[] = [
  'original',
  'roleplay',
  'helper',
  'romance',
  'anime_game',
  'fiction_media',
];

// 'direct_message' is deliberately absent. Everything created here is private
// to its creator, and that profile's opening notice tells the reader there is
// exactly one of the character and that everyone talks to it. The server
// rejects it on this path and a CHECK constraint refuses to store it.
const RESPONSE_STYLE_PROFILES: ResponseStyleProfile[] = [
  'inherit',
  'natural_dialogue',
  'lean_narrative',
  'professional',
  'character_only',
];

const BLANK_DRAFT: PersonaDefinitionPayload = {
  name: '',
  description: '',
  category: 'original',
  visibility: 'private',
  system_prompt: '',
  personality: '',
  scenario: '',
  first_message: '',
  example_dialogue: '',
  response_style_profile: 'natural_dialogue',
  post_history_instructions: '',
  alternate_greetings: [],
  creator_notes: '',
  tags: [],
  creator_name: '',
  character_version: '',
  avatar_url: '',
  preview_video_url: '',
  gallery_urls: [],
  is_nsfw: false,
  character_book_json: {},
  extensions_json: {},
};

function draftFromPersona(persona: BotPersonaDefinition): PersonaDefinitionPayload {
  return {
    name: persona.name,
    description: persona.description || '',
    category: persona.category,
    visibility: persona.visibility || 'private',
    system_prompt: persona.system_prompt || '',
    personality: persona.personality || '',
    scenario: persona.scenario || '',
    first_message: persona.first_message || '',
    example_dialogue: persona.example_dialogue || '',
    response_style_profile: persona.response_style_profile || 'inherit',
    post_history_instructions: persona.post_history_instructions || '',
    alternate_greetings: persona.alternate_greetings || [],
    creator_notes: persona.creator_notes || '',
    tags: persona.tags || [],
    creator_name: persona.creator_name || '',
    character_version: persona.character_version || '',
    avatar_url: persona.avatar_url || '',
    preview_video_url: persona.preview_video_url || '',
    gallery_urls: persona.gallery_urls || [],
    is_nsfw: persona.is_nsfw,
    character_book_json: persona.character_book_json || {},
    extensions_json: persona.extensions_json || {},
  };
}

function parseLineList(value: string): string[] {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseTagList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function stringifyJSON(value: Record<string, unknown> | undefined): string {
  return JSON.stringify(value || {}, null, 2);
}

function personaSummaryLabel(persona: BotPersona) {
  return `${persona.name} · private`;
}

function voicePayloadFromPreset(preset: OmniChatVoicePreset) {
  return {
    provider: preset.provider,
    voice_id: preset.voice_id,
    voice_name: preset.name,
    model_id: preset.model_id,
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0,
    speed: 1,
    pitch: 1,
    language_code: preset.language_code,
  };
}

function browserVoicePayload(personaId: number) {
  return {
    provider: 'browser' as const,
    voice_id: `browser-${personaId}`,
    voice_name: 'Character voice',
    model_id: 'browser-native',
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0,
    speed: 1,
    pitch: 1,
  };
}

type PendingStudioAction =
  | { type: 'select'; personaId: number }
  | { type: 'openChat'; personaId: number }
  | { type: 'navigate'; path: string; sidebarTab?: SidebarTab };

function stringifyEditorState(
  payload: PersonaDefinitionPayload,
  alternateGreetingsText: string,
  tagsText: string,
  characterBookText: string,
  extensionsText: string
): string {
  return JSON.stringify({
    payload,
    alternateGreetingsText,
    tagsText,
    characterBookText,
    extensionsText,
  });
}

export default function OmniChatStudioPage() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading: authIsLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('characters');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<PersonaDefinitionPayload>(BLANK_DRAFT);
  const [alternateGreetingsText, setAlternateGreetingsText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [characterBookText, setCharacterBookText] = useState('{}');
  const [extensionsText, setExtensionsText] = useState('{}');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [baselineEditorState, setBaselineEditorState] = useState(
    stringifyEditorState(BLANK_DRAFT, '', '', '{}', '{}')
  );
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingStudioAction | null>(null);
  const [selectedVoicePresetId, setSelectedVoicePresetId] = useState('');
  const [baselineVoicePresetId, setBaselineVoicePresetId] = useState('');
  const [voiceSelectionInitialized, setVoiceSelectionInitialized] = useState(false);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const previewAudioRef = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);

  useEffect(
    () => () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.audio.pause();
        URL.revokeObjectURL(previewAudioRef.current.url);
      }
    },
    []
  );

  const personasQuery = useQuery({
    queryKey: ['omnichat', 'my-personas'],
    queryFn: () => omnichatService.listMyPersonas(),
    enabled: isAuthenticated,
  });

  const selectedPersonaQuery = useQuery({
    queryKey: ['omnichat', 'persona-definition', selectedId],
    queryFn: () => omnichatService.getPersonaDefinition(selectedId as number),
    enabled: selectedId !== null,
  });

  const voiceCatalogQuery = useQuery({
    queryKey: omnichatQueryKeys.voicePresets,
    queryFn: () => omnichatService.listVoicePresets(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const selectedVoiceQuery = useQuery({
    queryKey: omnichatQueryKeys.personaVoice(selectedId ?? 0),
    queryFn: () => omnichatService.getPersonaVoice(selectedId as number),
    enabled: selectedId !== null,
  });

  useEffect(() => {
    if (
      selectedId !== null ||
      voiceSelectionInitialized ||
      !voiceCatalogQuery.data?.voicebox_available
    ) {
      return;
    }
    const firstPresetId = voiceCatalogQuery.data.presets[0]?.id ?? '';
    setSelectedVoicePresetId(firstPresetId);
    setBaselineVoicePresetId(firstPresetId);
    setVoiceSelectionInitialized(true);
  }, [selectedId, voiceCatalogQuery.data, voiceSelectionInitialized]);

  useEffect(() => {
    if (selectedId === null || !selectedVoiceQuery.data) return;
    const presetId =
      selectedVoiceQuery.data.provider === 'voicebox' &&
      voiceCatalogQuery.data?.presets.find(
        (preset) => preset.voice_id === selectedVoiceQuery.data.voice_id
      )
        ? (voiceCatalogQuery.data.presets.find(
            (preset) => preset.voice_id === selectedVoiceQuery.data?.voice_id
          )?.id ?? '')
        : '';
    setSelectedVoicePresetId(presetId);
    setBaselineVoicePresetId(presetId);
    setVoiceSelectionInitialized(true);
  }, [selectedId, selectedVoiceQuery.data, voiceCatalogQuery.data]);

  useEffect(() => {
    if (authIsLoading || isAuthenticated) {
      return;
    }
    window.dispatchEvent(
      new CustomEvent('open-auth-modal', {
        detail: { mode: 'login', redirectTo: '/omnichat/studio' },
      })
    );
    navigate('/omnichat', { replace: true });
  }, [authIsLoading, isAuthenticated, navigate]);

  useEffect(() => {
    const personas = personasQuery.data ?? [];
    if (selectedId === null && personas.length > 0) {
      setSelectedId(personas[0].id);
    }
  }, [personasQuery.data, selectedId]);

  useEffect(() => {
    if (!selectedPersonaQuery.data) {
      return;
    }
    const persona = selectedPersonaQuery.data;
    const nextDraft = draftFromPersona(persona);
    setDraft(nextDraft);
    const nextAlternateGreetingsText = (persona.alternate_greetings || []).join('\n');
    const nextTagsText = (persona.tags || []).join(', ');
    const nextCharacterBookText = stringifyJSON(persona.character_book_json);
    const nextExtensionsText = stringifyJSON(persona.extensions_json);
    setAlternateGreetingsText(nextAlternateGreetingsText);
    setTagsText(nextTagsText);
    setCharacterBookText(nextCharacterBookText);
    setExtensionsText(nextExtensionsText);
    setBaselineEditorState(
      stringifyEditorState(
        nextDraft,
        nextAlternateGreetingsText,
        nextTagsText,
        nextCharacterBookText,
        nextExtensionsText
      )
    );
    setIsDeleteModalOpen(false);
    setIsDiscardModalOpen(false);
    setPendingAction(null);
  }, [selectedPersonaQuery.data]);

  const updateMutation = useMutation({
    mutationFn: ({ personaId, payload }: { personaId: number; payload: PersonaEditPayload }) =>
      omnichatService.updatePersona(personaId, payload),
    onSuccess: async (persona) => {
      await queryClient.invalidateQueries({ queryKey: ['omnichat', 'my-personas'] });
      await queryClient.invalidateQueries({ queryKey: ['omnichat', 'personas'] });
      await queryClient.invalidateQueries({ queryKey: ['omnichat', 'conversations'] });
      queryClient.setQueryData(['omnichat', 'persona-definition', persona.id], persona);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (personaId: number) => omnichatService.deletePersona(personaId),
    onSuccess: async (_, personaId) => {
      await queryClient.invalidateQueries({ queryKey: ['omnichat', 'my-personas'] });
      await queryClient.invalidateQueries({ queryKey: ['omnichat', 'personas'] });
      await queryClient.invalidateQueries({ queryKey: ['omnichat', 'conversations'] });
      queryClient.removeQueries({ queryKey: ['omnichat', 'persona-definition', personaId] });
      setIsDeleteModalOpen(false);
      const remaining = (personasQuery.data ?? []).filter((persona) => persona.id !== personaId);
      setSelectedId(remaining[0]?.id ?? null);
      if (remaining.length === 0) {
        setDraft(BLANK_DRAFT);
        setAlternateGreetingsText('');
        setTagsText('');
        setCharacterBookText('{}');
        setExtensionsText('{}');
        setBaselineEditorState(stringifyEditorState(BLANK_DRAFT, '', '', '{}', '{}'));
      }
    },
  });

  const startChatMutation = useMutation({
    mutationFn: (personaId: number) =>
      omnichatService.createConversation(personaId, undefined, true),
    onSuccess: (conversation) => {
      navigate(`/omnichat/c/${conversation.id}`);
    },
  });

  const selectedPersona = useMemo(
    () => (personasQuery.data ?? []).find((persona) => persona.id === selectedId) ?? null,
    [personasQuery.data, selectedId]
  );

  const isDirty = useMemo(
    () =>
      stringifyEditorState(
        draft,
        alternateGreetingsText,
        tagsText,
        characterBookText,
        extensionsText
      ) !== baselineEditorState || selectedVoicePresetId !== baselineVoicePresetId,
    [
      alternateGreetingsText,
      baselineEditorState,
      baselineVoicePresetId,
      characterBookText,
      draft,
      extensionsText,
      selectedVoicePresetId,
      tagsText,
    ]
  );

  const isSaving = updateMutation.isPending;
  const isEditorLoading = selectedId !== null && selectedPersonaQuery.isLoading;

  useEffect(() => {
    if (!isDirty) {
      return undefined;
    }
    setSaveSuccess(null);

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const performAction = (action: PendingStudioAction) => {
    if (action.type === 'select') {
      setSelectedId(action.personaId);
      setSaveError(null);
      setSaveSuccess(null);
      return;
    }

    if (action.type === 'openChat') {
      startChatMutation.mutate(action.personaId);
      return;
    }

    if (action.sidebarTab) {
      setSidebarTab(action.sidebarTab);
    }
    navigate(action.path);
  };

  const requestAction = (action: PendingStudioAction) => {
    if (!isDirty) {
      performAction(action);
      return;
    }
    setPendingAction(action);
    setIsDiscardModalOpen(true);
  };

  const handleSidebarTabChange = (tab: SidebarTab) => {
    if (tab === 'search') {
      requestAction({ type: 'navigate', path: '/omnichat?search=1', sidebarTab: 'discover' });
      return;
    }
    if (tab === 'discover')
      requestAction({ type: 'navigate', path: '/omnichat', sidebarTab: 'discover' });
    if (tab === 'chat')
      requestAction({ type: 'navigate', path: '/omnichat/chat', sidebarTab: 'chat' });
    if (tab === 'groups')
      requestAction({ type: 'navigate', path: '/omnichat/groups', sidebarTab: 'groups' });
    if (tab === 'characters') setSidebarTab('characters');
    if (tab === 'create') navigate('/omnichat/create');
    if (tab === 'explore') navigate('/omnichat/explore');
    if (tab === 'newOmniAI') navigate(OMNICHAT_TAB_ROUTES.newOmniAI);
  };

  const handleSubmit = async () => {
    setSaveError(null);
    if (selectedId === null) return;

    if (!draft.first_message.trim() && parseLineList(alternateGreetingsText).length === 0) {
      setSaveError(t('omnichat.studio.openingMessageRequired'));
      document.getElementById('omnichat-opening-message')?.focus();
      return;
    }

    let characterBookJSON: Record<string, unknown> | undefined;
    try {
      characterBookJSON = JSON.parse(characterBookText || '{}') as Record<string, unknown>;
    } catch {
      setSaveError('Character book must be a valid JSON object.');
      return;
    }

    const payload: PersonaEditPayload = {
      name: draft.name,
      description: draft.description,
      category: draft.category,
      visibility: draft.visibility,
      system_prompt: draft.system_prompt,
      personality: draft.personality,
      scenario: draft.scenario,
      first_message: draft.first_message,
      example_dialogue: draft.example_dialogue,
      response_style_profile: draft.response_style_profile,
      post_history_instructions: draft.post_history_instructions,
      alternate_greetings: parseLineList(alternateGreetingsText),
      creator_notes: draft.creator_notes,
      tags: parseTagList(tagsText),
      creator_name: draft.creator_name,
      character_version: draft.character_version,
      is_nsfw: user?.role === 'admin' && draft.is_nsfw,
      character_book_json: characterBookJSON,
    };

    try {
      await updateMutation.mutateAsync({ personaId: selectedId, payload });
      const selectedVoice = voiceCatalogQuery.data?.presets.find(
        (preset) => preset.id === selectedVoicePresetId
      );
      const voicePayload =
        selectedVoice && voiceCatalogQuery.data?.voicebox_available
          ? voicePayloadFromPreset(selectedVoice)
          : browserVoicePayload(selectedId);
      const savedVoice = await omnichatService.updatePersonaVoice(selectedId, voicePayload);
      if (savedVoice) {
        queryClient.setQueryData(omnichatQueryKeys.personaVoice(selectedId), savedVoice);
      }
      queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.personaVoice(selectedId) });
      setBaselineEditorState(
        stringifyEditorState(
          { ...draft, ...payload },
          alternateGreetingsText,
          tagsText,
          characterBookText,
          extensionsText
        )
      );
      setSaveSuccess('Changes saved.');
      setBaselineVoicePresetId(selectedVoicePresetId);
    } catch (error) {
      setSaveSuccess(null);
      setSaveError(error instanceof Error ? error.message : 'Save failed');
    }
  };

  const handleSaveVoiceOnly = async () => {
    if (selectedId === null) return;
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const selectedVoice = voiceCatalogQuery.data?.presets.find(
        (preset) => preset.id === selectedVoicePresetId
      );
      const payload =
        selectedVoice && voiceCatalogQuery.data?.voicebox_available
          ? voicePayloadFromPreset(selectedVoice)
          : browserVoicePayload(selectedId);
      const savedVoice = await omnichatService.updatePersonaVoice(selectedId, payload);
      if (savedVoice)
        queryClient.setQueryData(omnichatQueryKeys.personaVoice(selectedId), savedVoice);
      void queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.personaVoice(selectedId) });
      setBaselineVoicePresetId(selectedVoicePresetId);
      setSaveSuccess('Voice saved.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the voice.');
    }
  };

  const handlePreviewVoice = async () => {
    if (!selectedVoicePresetId) return;
    setPreviewingVoiceId(selectedVoicePresetId);
    setSaveError(null);
    try {
      const blob = await omnichatService.previewVoicePreset(selectedVoicePresetId);
      if (previewAudioRef.current) {
        previewAudioRef.current.audio.pause();
        URL.revokeObjectURL(previewAudioRef.current.url);
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = { audio, url };
      audio.addEventListener(
        'ended',
        () => {
          URL.revokeObjectURL(url);
          if (previewAudioRef.current?.url === url) previewAudioRef.current = null;
        },
        { once: true }
      );
      try {
        await audio.play();
      } catch (error) {
        audio.pause();
        URL.revokeObjectURL(url);
        if (previewAudioRef.current?.url === url) previewAudioRef.current = null;
        throw error;
      }
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : t('omnichat.studio.voice.previewError')
      );
    } finally {
      setPreviewingVoiceId(null);
    }
  };

  const handleExport = async () => {
    if (selectedId === null) return;
    try {
      const blob = await omnichatService.exportPersona(selectedId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedPersona?.slug || 'persona'}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Export failed');
    }
  };

  return authIsLoading ? (
    <OmniChatShell activeTab={sidebarTab} onTabChange={handleSidebarTabChange}>
      <div className="min-h-[calc(100dvh-72px)] bg-[var(--color-background)] px-6 py-8">
        <LoadingMessage>{t('omnichat.studio.loadingStudio')}</LoadingMessage>
      </div>
    </OmniChatShell>
  ) : !isAuthenticated ? null : (
    <OmniChatShell activeTab={sidebarTab} onTabChange={handleSidebarTabChange}>
      <div className="min-h-[calc(100dvh-72px)] bg-[var(--color-background)]">
        <div className="mx-auto grid max-w-[1600px] gap-6 px-6 py-8 lg:grid-cols-[320px,1fr] lg:px-10">
          <aside className="space-y-4">
            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                    {t('omnichat.studio.eyebrow')}
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold text-[var(--color-text-primary)]">
                    {t('omnichat.studio.title')}
                  </h1>
                </div>
              </div>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                {t('omnichat.studio.description')}
              </p>
              <button
                type="button"
                onClick={() => requestAction({ type: 'navigate', path: '/omnichat/new-roleplay' })}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white"
              >
                <Plus size={16} /> Create roleplay AI
              </button>
            </div>

            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
              {personasQuery.isLoading && (
                <LoadingMessage>{t('omnichat.studio.loadingPersonas')}</LoadingMessage>
              )}
              {personasQuery.isError && (
                <ErrorMessage>{t('omnichat.studio.loadPersonasError')}</ErrorMessage>
              )}
              <div className="space-y-2">
                {(personasQuery.data ?? []).map((persona) => {
                  const personaAvatarSrc = resolveMediaUrl(persona.avatar_url, persona.updated_at);
                  return (
                    <button
                      key={persona.id}
                      type="button"
                      onClick={() => {
                        requestAction({ type: 'select', personaId: persona.id });
                      }}
                      className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                        selectedId === persona.id
                          ? 'border-[var(--color-primary)] bg-[var(--color-surface)]'
                          : 'border-transparent bg-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-surface)]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 overflow-hidden rounded-2xl bg-[var(--color-surface)]">
                          {personaAvatarSrc ? (
                            <img
                              src={personaAvatarSrc}
                              alt={persona.name}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                            {persona.name}
                          </div>
                          <div className="truncate text-xs text-[var(--color-text-secondary)]">
                            {personaSummaryLabel(persona)}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                  {user?.role === 'admin' ? 'Persona Editor' : 'Your Character'}
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-[var(--color-text-primary)]">
                  {selectedId === null
                    ? t('omnichat.studio.editor.newCharacter')
                    : selectedPersona?.name || t('omnichat.studio.editor.editCharacter')}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedId !== null && (
                  <>
                    <button
                      type="button"
                      onClick={() => requestAction({ type: 'openChat', personaId: selectedId })}
                      className="rounded-2xl border border-[var(--color-border)] px-4 py-2 text-sm"
                    >
                      {t('omnichat.studio.actions.openChat')}
                    </button>
                    <button
                      type="button"
                      onClick={handleExport}
                      className="rounded-2xl border border-[var(--color-border)] px-4 py-2 text-sm"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Download size={16} />
                        {t('omnichat.studio.actions.exportJson')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsDeleteModalOpen(true)}
                      className="rounded-2xl border border-red-500/30 px-4 py-2 text-sm text-red-300"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Trash2 size={16} />
                        {t('omnichat.studio.actions.delete')}
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {selectedId === null ? (
              <div className="mt-8 rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center">
                <p className="text-[var(--color-text-secondary)]">
                  You have no roleplay characters yet.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/omnichat/new-roleplay')}
                  className="mt-4 rounded-xl bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-white"
                >
                  Create Roleplay AI
                </button>
              </div>
            ) : (
              <>
                {selectedPersonaQuery.isLoading && (
                  <LoadingMessage>{t('omnichat.studio.loadingDefinition')}</LoadingMessage>
                )}

                {user?.role !== 'admin' ? (
                  <div className="mt-6 space-y-5">
                    <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
                      Characters are built from guided choices. Free-text character editing is
                      unavailable for member accounts.
                    </p>
                    {selectedPersona?.description && (
                      <p className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm leading-6 text-[var(--color-text-primary)]">
                        {selectedPersona.description}
                      </p>
                    )}
                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">
                          Character voice
                        </span>
                        <select
                          value={selectedVoicePresetId}
                          disabled={
                            voiceCatalogQuery.isLoading ||
                            !voiceCatalogQuery.data?.voicebox_available
                          }
                          onChange={(event) => setSelectedVoicePresetId(event.target.value)}
                          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-3 text-sm disabled:opacity-60"
                        >
                          <option value="">Browser/device voice</option>
                          {(voiceCatalogQuery.data?.presets ?? []).map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => void handlePreviewVoice()}
                          disabled={!selectedVoicePresetId || previewingVoiceId !== null}
                          className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm disabled:opacity-50"
                        >
                          Preview voice
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSaveVoiceOnly()}
                          disabled={selectedVoicePresetId === baselineVoicePresetId}
                          className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          Save voice
                        </button>
                      </div>
                    </div>
                    {saveError && <ErrorMessage>{saveError}</ErrorMessage>}
                    {saveSuccess && <p className="text-sm text-emerald-300">{saveSuccess}</p>}
                  </div>
                ) : (
                  <>
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('omnichat.studio.fields.name')}
                        </span>
                        <input
                          type="text"
                          value={draft.name}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, name: event.target.value }))
                          }
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('omnichat.studio.fields.category')}
                        </span>
                        <select
                          value={draft.category}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              category: event.target.value as PersonaCategory,
                            }))
                          }
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                        >
                          {CATEGORIES.filter(
                            (category) =>
                              category !== 'romance' ||
                              user?.role === 'admin' ||
                              draft.category === 'romance'
                          ).map((category) => (
                            <option key={category} value={category}>
                              {category.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-2 md:col-span-2">
                        <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('omnichat.studio.fields.description')}
                        </span>
                        <textarea
                          value={draft.description}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, description: event.target.value }))
                          }
                          rows={3}
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                        />
                      </label>
                      <div className="space-y-2">
                        <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('omnichat.studio.fields.visibility')}
                        </span>
                        <div className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                          {t('omnichat.studio.fields.visibilityPrivate')}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                            {t('omnichat.studio.voice.title')}
                          </h3>
                          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                            {t('omnichat.studio.voice.description')}
                          </p>
                        </div>
                        <span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-secondary)]">
                          {t('omnichat.studio.voice.localBadge')}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                        <label className="min-w-0 flex-1 space-y-2">
                          <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {t('omnichat.studio.voice.label')}
                          </span>
                          <select
                            value={selectedVoicePresetId}
                            disabled={
                              voiceCatalogQuery.isLoading ||
                              !voiceCatalogQuery.data?.voicebox_available
                            }
                            onChange={(event) => {
                              setSelectedVoicePresetId(event.target.value);
                              setVoiceSelectionInitialized(true);
                            }}
                            className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm disabled:opacity-60"
                          >
                            <option value="">{t('omnichat.studio.voice.browserFallback')}</option>
                            <optgroup label={t('omnichat.studio.voice.femaleGroup')}>
                              {(voiceCatalogQuery.data?.presets ?? [])
                                .filter((preset) => preset.gender === 'female')
                                .map((preset) => (
                                  <option
                                    key={preset.id}
                                    value={preset.id}
                                    disabled={!voiceCatalogQuery.data?.voicebox_available}
                                  >
                                    {preset.name}
                                  </option>
                                ))}
                            </optgroup>
                            <optgroup label={t('omnichat.studio.voice.maleGroup')}>
                              {(voiceCatalogQuery.data?.presets ?? [])
                                .filter((preset) => preset.gender === 'male')
                                .map((preset) => (
                                  <option
                                    key={preset.id}
                                    value={preset.id}
                                    disabled={!voiceCatalogQuery.data?.voicebox_available}
                                  >
                                    {preset.name}
                                  </option>
                                ))}
                            </optgroup>
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => void handlePreviewVoice()}
                          disabled={
                            !selectedVoicePresetId ||
                            previewingVoiceId !== null ||
                            !voiceCatalogQuery.data?.voicebox_available
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] px-4 py-2 text-sm disabled:opacity-60"
                        >
                          <Volume2 size={16} />
                          {previewingVoiceId
                            ? t('omnichat.studio.voice.previewing')
                            : t('omnichat.studio.voice.preview')}
                        </button>
                      </div>
                      {!voiceCatalogQuery.data?.voicebox_available &&
                        !voiceCatalogQuery.isLoading && (
                          <p className="mt-3 text-sm text-amber-300">
                            {t('omnichat.studio.voice.unavailable')}
                          </p>
                        )}
                      <div className="mt-4 rounded-2xl border border-dashed border-[var(--color-border)] px-4 py-3">
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">
                          {voiceCatalogQuery.data?.voice_cloning_enabled
                            ? t('omnichat.studio.voice.cloningEnabled')
                            : t('omnichat.studio.voice.cloningDisabled')}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          {t('omnichat.studio.voice.cloningSafety')}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('omnichat.studio.fields.personality')}
                        </span>
                        <textarea
                          value={draft.personality}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, personality: event.target.value }))
                          }
                          rows={5}
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('omnichat.studio.fields.scenario')}
                        </span>
                        <textarea
                          value={draft.scenario}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, scenario: event.target.value }))
                          }
                          rows={5}
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                        />
                      </label>
                      <div className="space-y-2 md:col-span-2">
                        <label
                          htmlFor="omnichat-opening-message"
                          className="block text-sm font-medium text-[var(--color-text-primary)]"
                        >
                          {t('omnichat.studio.fields.openingMessage')}
                        </label>
                        <textarea
                          id="omnichat-opening-message"
                          aria-describedby="omnichat-opening-message-help"
                          aria-required="true"
                          value={draft.first_message}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              first_message: event.target.value,
                            }))
                          }
                          rows={4}
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                        />
                        <span
                          id="omnichat-opening-message-help"
                          className="block text-xs leading-5 text-[var(--color-text-secondary)]"
                        >
                          {t('omnichat.studio.fields.openingMessageHelp')}
                        </span>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label
                          htmlFor="omnichat-response-style"
                          className="block text-sm font-medium text-[var(--color-text-primary)]"
                        >
                          {t('omnichat.studio.fields.responseStyle')}
                        </label>
                        {draft.response_style_profile === 'direct_message' ? (
                          <p
                            id="omnichat-response-style"
                            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                          >
                            {t('omnichat.studio.responseStyles.direct_message.label')}
                            <span className="ml-2 text-xs text-[var(--color-text-secondary)]">
                              {t('omnichat.studio.fields.responseStyleFixed')}
                            </span>
                          </p>
                        ) : (
                          <select
                            id="omnichat-response-style"
                            aria-describedby="omnichat-response-style-description"
                            value={draft.response_style_profile}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                response_style_profile: event.target.value as ResponseStyleProfile,
                              }))
                            }
                            className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                          >
                            {RESPONSE_STYLE_PROFILES.map((profile) => (
                              <option key={profile} value={profile}>
                                {t(`omnichat.studio.responseStyles.${profile}.label`)}
                              </option>
                            ))}
                          </select>
                        )}
                        <span
                          id="omnichat-response-style-description"
                          className="block text-xs leading-5 text-[var(--color-text-secondary)]"
                        >
                          {t(
                            `omnichat.studio.responseStyles.${draft.response_style_profile}.description`
                          )}
                        </span>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label
                          htmlFor="omnichat-example-dialogue"
                          className="block text-sm font-medium text-[var(--color-text-primary)]"
                        >
                          {t('omnichat.studio.fields.exampleDialogue')}
                        </label>
                        <textarea
                          id="omnichat-example-dialogue"
                          aria-describedby="omnichat-example-dialogue-help"
                          value={draft.example_dialogue}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              example_dialogue: event.target.value,
                            }))
                          }
                          rows={5}
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                          placeholder={t('omnichat.studio.fields.exampleDialoguePlaceholder', {
                            userMarker: '{{User}}',
                            charMarker: '{{Char}}',
                          })}
                        />
                        <span
                          id="omnichat-example-dialogue-help"
                          className="block text-xs leading-5 text-[var(--color-text-secondary)]"
                        >
                          {t('omnichat.studio.fields.exampleDialogueHelp', {
                            userMarker: '{{User}}',
                            charMarker: '{{Char}}',
                          })}
                        </span>
                      </div>
                      <label className="space-y-2 md:col-span-2">
                        <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('omnichat.studio.fields.systemPrompt')}
                        </span>
                        <textarea
                          value={draft.system_prompt}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              system_prompt: event.target.value,
                            }))
                          }
                          rows={4}
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                          placeholder={t('omnichat.studio.fields.systemPromptPlaceholder')}
                        />
                      </label>
                      <label className="space-y-2 md:col-span-2">
                        <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('omnichat.studio.fields.postHistoryInstructions')}
                        </span>
                        <textarea
                          value={draft.post_history_instructions}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              post_history_instructions: event.target.value,
                            }))
                          }
                          rows={4}
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                        />
                      </label>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('omnichat.studio.fields.alternateGreetings')}
                        </span>
                        <textarea
                          value={alternateGreetingsText}
                          onChange={(event) => setAlternateGreetingsText(event.target.value)}
                          rows={4}
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                          placeholder={t('omnichat.studio.fields.alternateGreetingsPlaceholder')}
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('omnichat.studio.fields.tags')}
                        </span>
                        <textarea
                          value={tagsText}
                          onChange={(event) => setTagsText(event.target.value)}
                          rows={4}
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                          placeholder={t('omnichat.studio.fields.tagsPlaceholder')}
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('omnichat.studio.fields.creatorName')}
                        </span>
                        <input
                          type="text"
                          value={draft.creator_name}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              creator_name: event.target.value,
                            }))
                          }
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('omnichat.studio.fields.characterVersion')}
                        </span>
                        <input
                          type="text"
                          value={draft.character_version}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              character_version: event.target.value,
                            }))
                          }
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-2 md:col-span-2">
                        <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('omnichat.studio.fields.creatorNotes')}
                        </span>
                        <textarea
                          value={draft.creator_notes}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              creator_notes: event.target.value,
                            }))
                          }
                          rows={4}
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                        />
                      </label>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        Character images and preview videos are generated by OmniChat. Existing
                        character media remains available, but uploads are disabled.
                      </p>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('omnichat.studio.fields.characterBookJson')}
                        </span>
                        <textarea
                          value={characterBookText}
                          onChange={(event) => setCharacterBookText(event.target.value)}
                          rows={8}
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs"
                        />
                      </label>
                    </div>

                    {saveError && <ErrorMessage>{saveError}</ErrorMessage>}
                    {saveSuccess && (
                      <p className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200">
                        {saveSuccess}
                      </p>
                    )}

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={isSaving || isEditorLoading}
                        className="rounded-2xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {isSaving
                          ? t('omnichat.studio.actions.saving')
                          : t('omnichat.studio.actions.saveChanges')}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          requestAction({
                            type: 'navigate',
                            path: '/omnichat',
                            sidebarTab: 'discover',
                          })
                        }
                        className="text-sm text-[var(--color-text-secondary)] underline-offset-2 hover:underline"
                      >
                        {t('omnichat.studio.actions.backToDiscover')}
                      </button>
                    </div>

                    {selectedId !== null && (
                      <div className="mt-8 rounded-3xl border border-red-500/25 bg-red-500/10 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-red-200">
                              {t('omnichat.studio.dangerZone.title')}
                            </h3>
                            <p className="mt-1 text-sm text-red-200/80">
                              {t('omnichat.studio.dangerZone.description')}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsDeleteModalOpen(true)}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-400/40 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/10"
                          >
                            <Trash2 size={16} />
                            {t('omnichat.studio.dangerZone.delete')}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        </div>
      </div>
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        closeOnOverlayClick={!deleteMutation.isPending}
        className="w-full max-w-md rounded-3xl bg-[var(--color-background)] p-0 shadow-2xl"
        overlayClassName="bg-black/60 flex items-center justify-center"
      >
        <div className="space-y-4 p-6">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {t('omnichat.studio.deleteModal.title')}
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {selectedPersona?.name
                ? t('omnichat.studio.deleteModal.descriptionNamed', { name: selectedPersona.name })
                : t('omnichat.studio.deleteModal.description')}
            </p>
          </div>
          {deleteMutation.isError && (
            <ErrorMessage>
              {deleteMutation.error instanceof Error
                ? deleteMutation.error.message
                : 'Delete failed.'}
            </ErrorMessage>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={deleteMutation.isPending}
              className="rounded-2xl border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-primary)] disabled:opacity-60"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedId !== null) {
                  deleteMutation.mutate(selectedId);
                }
              }}
              disabled={deleteMutation.isPending || selectedId === null}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deleteMutation.isPending ? <Trash2 size={16} /> : <Trash2 size={16} />}
              {t('omnichat.studio.deleteModal.confirm')}
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={isDiscardModalOpen}
        onClose={() => {
          setIsDiscardModalOpen(false);
          setPendingAction(null);
        }}
        closeOnOverlayClick
        className="w-full max-w-md rounded-3xl bg-[var(--color-background)] p-0 shadow-2xl"
        overlayClassName="bg-black/60 flex items-center justify-center"
      >
        <div className="space-y-4 p-6">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {t('omnichat.studio.discardModal.title')}
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {t('omnichat.studio.discardModal.description')}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsDiscardModalOpen(false);
                setPendingAction(null);
              }}
              className="rounded-2xl border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-primary)]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                const action = pendingAction;
                setIsDiscardModalOpen(false);
                setPendingAction(null);
                if (action) {
                  performAction(action);
                }
              }}
              className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {t('omnichat.studio.discardModal.confirm')}
            </button>
          </div>
        </div>
      </Modal>
    </OmniChatShell>
  );
}
