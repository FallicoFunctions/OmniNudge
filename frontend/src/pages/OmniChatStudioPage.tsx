import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Download, FileUp, Plus, Trash2, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import OmniChatShell from '../components/omnichat/OmniChatShell';
import type { SidebarTab } from '../components/omnichat/OmniChatSidebar';
import MediaUploadField from '../components/common/MediaUploadField';
import { Modal } from '../components/common/Modal';
import { ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import { useAuth } from '../contexts/AuthContext';
import { omnichatQueryKeys, omnichatService } from '../services/omnichatService';
import type {
  BotPersona,
  BotPersonaDefinition,
  PersonaCategory,
  PersonaDefinitionPayload,
  ResponseStyleProfile,
  OmniChatVoicePreset,
} from '../types/omnichat';
import { mediaService } from '../services/mediaService';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { normalizeUploadedMediaUrl } from '../utils/uploadedMediaUrl';

const CATEGORIES: PersonaCategory[] = [
  'original',
  'roleplay',
  'helper',
  'romance',
  'anime_game',
  'fiction_media',
];

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

function normalizePersonaMediaUploadUrl(storageUrl?: string, storagePath?: string): string {
  if (storagePath) {
    return normalizeUploadedMediaUrl(undefined, storagePath);
  }
  if (storageUrl?.startsWith('http://') || storageUrl?.startsWith('https://')) {
    try {
      const url = new URL(storageUrl);
      return url.pathname;
    } catch {
      return storageUrl;
    }
  }
  return normalizeUploadedMediaUrl(storageUrl);
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
  | { type: 'reset' }
  | { type: 'select'; personaId: number }
  | { type: 'openChat'; personaId: number }
  | { type: 'navigate'; path: string; sidebarTab?: SidebarTab };

type StudioLocalPreviews = {
  avatar_url?: string;
  preview_video_url?: string;
  gallery_urls: Array<string | undefined>;
};

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
  const { isAuthenticated, isLoading: authIsLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('characters');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [draft, setDraft] = useState<PersonaDefinitionPayload>(BLANK_DRAFT);
  const [alternateGreetingsText, setAlternateGreetingsText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [characterBookText, setCharacterBookText] = useState('{}');
  const [extensionsText, setExtensionsText] = useState('{}');
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [localPreviews, setLocalPreviews] = useState<StudioLocalPreviews>({ gallery_urls: [] });
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

  const clearLocalPreviews = () => {
    setLocalPreviews((current) => {
      if (current.avatar_url) URL.revokeObjectURL(current.avatar_url);
      if (current.preview_video_url) URL.revokeObjectURL(current.preview_video_url);
      current.gallery_urls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      return { gallery_urls: [] };
    });
  };

  useEffect(() => clearLocalPreviews, []);

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
      voiceCatalogQuery.data?.presets.some(
        (preset) => preset.voice_id === selectedVoiceQuery.data.voice_id
      )
        ? selectedVoiceQuery.data.voice_id
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
    if (!isCreatingNew && selectedId === null && personas.length > 0) {
      setSelectedId(personas[0].id);
    }
  }, [isCreatingNew, personasQuery.data, selectedId]);

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
    setSaveError(null);
    setIsDeleteModalOpen(false);
    setIsDiscardModalOpen(false);
    setPendingAction(null);
    clearLocalPreviews();
  }, [selectedPersonaQuery.data]);

  const createMutation = useMutation({
    mutationFn: (payload: PersonaDefinitionPayload) => omnichatService.createPersona(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['omnichat', 'my-personas'] });
      await queryClient.invalidateQueries({ queryKey: ['omnichat', 'personas'] });
      await queryClient.invalidateQueries({ queryKey: ['omnichat', 'conversations'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      personaId,
      payload,
    }: {
      personaId: number;
      payload: PersonaDefinitionPayload;
    }) => omnichatService.updatePersona(personaId, payload),
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
      setIsCreatingNew(remaining.length === 0);
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

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      let avatarUrl: string | undefined;
      let avatarUploadFailed = false;
      if (file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.png')) {
        try {
          const uploaded = await mediaService.uploadMedia(file);
          avatarUrl = normalizePersonaMediaUploadUrl(uploaded.storage_url, uploaded.storage_path);
        } catch (error) {
          avatarUploadFailed = true;
          console.warn(
            'OmniChat PNG avatar upload failed; continuing import without avatar.',
            error
          );
        }
      }
      const persona = await omnichatService.importPersona(file, { avatarUrl });
      return { persona, avatarUploadFailed };
    },
    onSuccess: async ({ persona, avatarUploadFailed }) => {
      await queryClient.invalidateQueries({ queryKey: ['omnichat', 'my-personas'] });
      await queryClient.invalidateQueries({ queryKey: ['omnichat', 'personas'] });
      setIsCreatingNew(false);
      setSelectedId(persona.id);
      setImportError(null);
      setImportWarning(
        avatarUploadFailed
          ? 'Character imported, but the PNG avatar could not be uploaded automatically.'
          : null
      );
    },
    onError: (error) => {
      setImportWarning(null);
      setImportError(error instanceof Error ? error.message : 'Import failed');
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

  const isSaving = createMutation.isPending || updateMutation.isPending;
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
    if (action.type === 'reset') {
      setIsCreatingNew(true);
      setSelectedId(null);
      setDraft(BLANK_DRAFT);
      setBaselineEditorState(stringifyEditorState(BLANK_DRAFT, '', '', '{}', '{}'));
      setAlternateGreetingsText('');
      setTagsText('');
      setCharacterBookText('{}');
      setExtensionsText('{}');
      const defaultVoiceId = voiceCatalogQuery.data?.voicebox_available
        ? (voiceCatalogQuery.data.presets[0]?.id ?? '')
        : '';
      setSelectedVoicePresetId(defaultVoiceId);
      setBaselineVoicePresetId(defaultVoiceId);
      setVoiceSelectionInitialized(true);
      setSaveError(null);
      setSaveSuccess(null);
      setIsDeleteModalOpen(false);
      clearLocalPreviews();
      return;
    }

    if (action.type === 'select') {
      setIsCreatingNew(false);
      setSelectedId(action.personaId);
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
  };

  const resetToBlank = () => {
    requestAction({ type: 'reset' });
  };

  const handleFileUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    field: 'avatar_url' | 'preview_video_url' | 'gallery_urls'
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const localPreviewUrl = URL.createObjectURL(file);
    setLocalPreviews((current) => {
      if (field === 'gallery_urls') {
        const existingPlaceholders = Array.from({
          length: Math.max(0, draft.gallery_urls.length - current.gallery_urls.length),
        }).map(() => undefined);
        return {
          ...current,
          gallery_urls: [...current.gallery_urls, ...existingPlaceholders, localPreviewUrl],
        };
      }
      const previous = current[field];
      if (previous) URL.revokeObjectURL(previous);
      return { ...current, [field]: localPreviewUrl };
    });
    setUploadingField(field);
    setSaveSuccess(null);
    try {
      const uploaded = await mediaService.uploadMedia(file);
      setDraft((current) => {
        const normalizedUrl = normalizePersonaMediaUploadUrl(
          uploaded.storage_url,
          uploaded.storage_path
        );
        if (field === 'gallery_urls') {
          return { ...current, gallery_urls: [...current.gallery_urls, normalizedUrl] };
        }
        return { ...current, [field]: normalizedUrl };
      });
    } catch (error) {
      setLocalPreviews((current) => {
        if (field === 'gallery_urls') {
          URL.revokeObjectURL(localPreviewUrl);
          return {
            ...current,
            gallery_urls: current.gallery_urls.filter((url) => url !== localPreviewUrl),
          };
        }
        if (current[field] === localPreviewUrl) {
          URL.revokeObjectURL(localPreviewUrl);
          const next = { ...current };
          delete next[field];
          return next;
        }
        URL.revokeObjectURL(localPreviewUrl);
        return current;
      });
      setSaveError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploadingField(null);
      event.target.value = '';
    }
  };

  const removeGalleryImage = (index: number) => {
    setLocalPreviews((current) => {
      const previewUrl = current.gallery_urls[index];
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      return {
        ...current,
        gallery_urls: current.gallery_urls.filter((_, currentIndex) => currentIndex !== index),
      };
    });
    setDraft((current) => ({
      ...current,
      gallery_urls: current.gallery_urls.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const handleSubmit = async () => {
    setSaveError(null);

    if (!draft.first_message.trim() && parseLineList(alternateGreetingsText).length === 0) {
      setSaveError(t('omnichat.studio.openingMessageRequired'));
      document.getElementById('omnichat-opening-message')?.focus();
      return;
    }

    let characterBookJSON: Record<string, unknown> | undefined;
    let extensionsJSON: Record<string, unknown> | undefined;

    try {
      characterBookJSON = JSON.parse(characterBookText || '{}') as Record<string, unknown>;
      extensionsJSON = JSON.parse(extensionsText || '{}') as Record<string, unknown>;
    } catch {
      setSaveError('Character book and extensions must be valid JSON objects.');
      return;
    }

    const payload: PersonaDefinitionPayload = {
      ...draft,
      alternate_greetings: parseLineList(alternateGreetingsText),
      tags: parseTagList(tagsText),
      character_book_json: characterBookJSON,
      extensions_json: extensionsJSON,
      avatar_url: draft.avatar_url || undefined,
      preview_video_url: draft.preview_video_url || undefined,
    };

    let createdPersonaId: number | null = null;
    try {
      let savedPersonaId = selectedId;
      if (selectedId === null) {
        setIsCreatingNew(true);
        const created = await createMutation.mutateAsync(payload);
        savedPersonaId = created.id;
        createdPersonaId = created.id;
      } else {
        await updateMutation.mutateAsync({ personaId: selectedId, payload });
      }
      const selectedVoice = voiceCatalogQuery.data?.presets.find(
        (preset) => preset.id === selectedVoicePresetId
      );
      if (savedPersonaId !== null) {
        const voicePayload =
          selectedVoice && voiceCatalogQuery.data?.voicebox_available
            ? voicePayloadFromPreset(selectedVoice)
            : browserVoicePayload(savedPersonaId);
        const savedVoice = await omnichatService.updatePersonaVoice(savedPersonaId, voicePayload);
        if (savedVoice) {
          queryClient.setQueryData(omnichatQueryKeys.personaVoice(savedPersonaId), savedVoice);
        }
        queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.personaVoice(savedPersonaId) });
      }
      setBaselineEditorState(
        stringifyEditorState(
          payload,
          alternateGreetingsText,
          tagsText,
          characterBookText,
          extensionsText
        )
      );
      setSaveSuccess(selectedId === null ? 'Character created.' : 'Changes saved.');
      setBaselineVoicePresetId(selectedVoicePresetId);
      if (createdPersonaId !== null) {
        setIsCreatingNew(false);
        setSelectedId(createdPersonaId);
      }
    } catch (error) {
      if (createdPersonaId !== null) {
        // The persona exists even when voice persistence fails. Select it so a
        // retry updates the same record instead of creating a duplicate.
        setIsCreatingNew(false);
        setSelectedId(createdPersonaId);
      }
      setSaveSuccess(null);
      setSaveError(error instanceof Error ? error.message : 'Save failed');
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
                <button
                  type="button"
                  onClick={resetToBlank}
                  className="rounded-2xl border border-[var(--color-border)] px-3 py-2 text-sm"
                >
                  <Plus size={16} />
                </button>
              </div>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                {t('omnichat.studio.description')}
              </p>
            </div>

            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {t('omnichat.studio.import.title')}
                </h2>
                <span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-secondary)]">
                  {t('omnichat.studio.creatorOnly')}
                </span>
              </div>
              <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6 text-sm text-[var(--color-text-secondary)]">
                <FileUp size={18} />
                <span>
                  {importMutation.isPending
                    ? t('omnichat.studio.import.importing')
                    : t('omnichat.studio.import.uploadCta')}
                </span>
                <input
                  type="file"
                  accept=".png,.json,application/json,image/png"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      importMutation.mutate(file);
                    }
                    event.target.value = '';
                  }}
                />
              </label>
              {importError && <ErrorMessage>{importError}</ErrorMessage>}
              {importWarning && (
                <p className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                  {importWarning}
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
              {personasQuery.isLoading && (
                <LoadingMessage>{t('omnichat.studio.loadingPersonas')}</LoadingMessage>
              )}
              {personasQuery.isError && (
                <ErrorMessage>{t('omnichat.studio.loadPersonasError')}</ErrorMessage>
              )}
              <div className="space-y-2">
                {(personasQuery.data ?? []).map((persona) => (
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
                        {persona.avatar_url ? (
                          <img
                            src={resolveMediaUrl(persona.avatar_url, persona.updated_at)}
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
                ))}
              </div>
            </div>
          </aside>

          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                  Persona Editor
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

            {selectedPersonaQuery.isLoading && selectedId !== null && (
              <LoadingMessage>{t('omnichat.studio.loadingDefinition')}</LoadingMessage>
            )}

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
                  {CATEGORIES.map((category) => (
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
                      voiceCatalogQuery.isLoading || !voiceCatalogQuery.data?.voicebox_available
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
                          <option key={preset.id} value={preset.id}>
                            {preset.name}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label={t('omnichat.studio.voice.maleGroup')}>
                      {(voiceCatalogQuery.data?.presets ?? [])
                        .filter((preset) => preset.gender === 'male')
                        .map((preset) => (
                          <option key={preset.id} value={preset.id}>
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
              {!voiceCatalogQuery.data?.voicebox_available && !voiceCatalogQuery.isLoading && (
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
                    setDraft((current) => ({ ...current, first_message: event.target.value }))
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
                <span
                  id="omnichat-response-style-description"
                  className="block text-xs leading-5 text-[var(--color-text-secondary)]"
                >
                  {t(`omnichat.studio.responseStyles.${draft.response_style_profile}.description`)}
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
                    setDraft((current) => ({ ...current, example_dialogue: event.target.value }))
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
                    setDraft((current) => ({ ...current, system_prompt: event.target.value }))
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
                    setDraft((current) => ({ ...current, creator_name: event.target.value }))
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
                    setDraft((current) => ({ ...current, character_version: event.target.value }))
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
                    setDraft((current) => ({ ...current, creator_notes: event.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <MediaUploadField
                id="omnichat-studio-avatar"
                label={t('omnichat.studio.fields.avatarUrl')}
                value={draft.avatar_url}
                previewSrc={localPreviews.avatar_url}
                accept="image/*"
                mediaType="image"
                uploadButtonLabel="Select avatar image"
                uploadingLabel="Uploading avatar..."
                clearLabel="Remove image"
                isUploading={uploadingField === 'avatar_url'}
                previewFrameClassName="aspect-[3/4]"
                imageClassName="h-full w-full bg-black/10 object-cover"
                onFileChange={(event) => void handleFileUpload(event, 'avatar_url')}
                onClear={() => {
                  setLocalPreviews((current) => {
                    if (current.avatar_url) URL.revokeObjectURL(current.avatar_url);
                    const next = { ...current };
                    delete next.avatar_url;
                    return next;
                  });
                  setDraft((current) => ({ ...current, avatar_url: '' }));
                }}
              />
              <MediaUploadField
                id="omnichat-studio-preview-video"
                label={t('omnichat.studio.fields.previewVideoUrl')}
                value={draft.preview_video_url}
                previewSrc={localPreviews.preview_video_url}
                accept="video/mp4,video/webm,video/quicktime"
                mediaType="video"
                uploadButtonLabel="Select preview video"
                uploadingLabel="Uploading preview video..."
                clearLabel="Remove video"
                isUploading={uploadingField === 'preview_video_url'}
                onFileChange={(event) => void handleFileUpload(event, 'preview_video_url')}
                onClear={() => {
                  setLocalPreviews((current) => {
                    if (current.preview_video_url) URL.revokeObjectURL(current.preview_video_url);
                    const next = { ...current };
                    delete next.preview_video_url;
                    return next;
                  });
                  setDraft((current) => ({ ...current, preview_video_url: '' }));
                }}
              />
              <div className="space-y-2 md:col-span-2">
                <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                  {t('omnichat.studio.fields.galleryUrls')}
                </span>
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  {draft.gallery_urls.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {draft.gallery_urls.map((url, index) => (
                        <div
                          key={`${url}-${index}`}
                          className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]"
                        >
                          <img
                            src={localPreviews.gallery_urls[index] || resolveMediaUrl(url)}
                            alt={`Gallery image ${index + 1}`}
                            className="h-40 w-full bg-black/10 object-cover"
                          />
                          <div className="p-2">
                            <button
                              type="button"
                              onClick={() => removeGalleryImage(index)}
                              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]"
                            >
                              Remove image
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-6 text-center text-sm text-[var(--color-text-secondary)]">
                      No gallery images selected.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label
                      htmlFor="omnichat-studio-gallery-file"
                      className="inline-flex cursor-pointer items-center rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                    >
                      {uploadingField === 'gallery_urls'
                        ? 'Uploading gallery image...'
                        : 'Add gallery image'}
                    </label>
                    <input
                      id="omnichat-studio-gallery-file"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingField === 'gallery_urls'}
                      onChange={(event) => void handleFileUpload(event, 'gallery_urls')}
                    />
                  </div>
                </div>
              </div>
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
              <label className="space-y-2">
                <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                  {t('omnichat.studio.fields.extensionsJson')}
                </span>
                <textarea
                  value={extensionsText}
                  onChange={(event) => setExtensionsText(event.target.value)}
                  rows={8}
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs"
                />
              </label>
            </div>

            {uploadingField && (
              <LoadingMessage>
                {t('omnichat.studio.uploadingField', { field: uploadingField.replace('_', ' ') })}
              </LoadingMessage>
            )}
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
                  : selectedId === null
                    ? t('omnichat.studio.actions.createCharacter')
                    : t('omnichat.studio.actions.saveChanges')}
              </button>
              <button
                type="button"
                onClick={() =>
                  requestAction({ type: 'navigate', path: '/omnichat', sidebarTab: 'discover' })
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
