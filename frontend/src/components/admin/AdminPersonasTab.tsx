import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/adminService';
import { mediaService } from '../../services/mediaService';
import { omnichatService } from '../../services/omnichatService';
import type { AdminOmniChatPersona } from '../../types/admin';
import type { OmniChatPersonaVoice } from '../../types/omnichat';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { normalizeUploadedMediaUrl } from '../../utils/uploadedMediaUrl';
import MediaUploadField from '../common/MediaUploadField';
import PersonaAvatar from '../omnichat/PersonaAvatar';
import { LoadingMessage } from '../common/StatusMessage';

type PersonaDraft = {
  avatar_url?: string;
  preview_video_url?: string;
  gallery_urls: string[];
};

export default function AdminPersonasTab() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<number, PersonaDraft>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [saveSuccesses, setSaveSuccesses] = useState<Record<number, string>>({});
  const [voiceSelections, setVoiceSelections] = useState<Record<number, string>>({});
  const [voiceSuccesses, setVoiceSuccesses] = useState<Record<number, string>>({});
  const [voicePreviewErrors, setVoicePreviewErrors] = useState<Record<number, string>>({});
  const [previewingPersonaId, setPreviewingPersonaId] = useState<number | null>(null);
  const [hoveredPersonaId, setHoveredPersonaId] = useState<number | null>(null);
  const activeVoicePreview = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);
  const voicePreviewAbortRef = useRef<AbortController | null>(null);

  const releaseVoicePreview = useCallback(
    (preview: { audio: HTMLAudioElement; url: string } | null = activeVoicePreview.current) => {
      if (!preview) return;
      preview.audio.pause();
      URL.revokeObjectURL(preview.url);
      if (activeVoicePreview.current === preview) activeVoicePreview.current = null;
    },
    []
  );

  const personasQuery = useQuery({
    queryKey: ['adminOmniChatPersonas'],
    queryFn: () => adminService.listOmniChatPersonas(),
  });

  const voicesQuery = useQuery({
    queryKey: ['adminOmniChatPersonaVoices'],
    queryFn: () => adminService.listOmniChatPersonaVoices(),
  });

  const voiceCatalogQuery = useQuery({
    queryKey: ['omnichat', 'voice-presets'],
    queryFn: () => omnichatService.listVoicePresets(),
  });

  const voiceByPersonaId = useMemo(
    () => new Map((voicesQuery.data ?? []).map((voice) => [voice.persona_id, voice])),
    [voicesQuery.data]
  );

  const presetByVoiceId = useMemo(
    () =>
      new Map((voiceCatalogQuery.data?.presets ?? []).map((preset) => [preset.voice_id, preset])),
    [voiceCatalogQuery.data]
  );

  const femaleVoicePresets = useMemo(
    () => (voiceCatalogQuery.data?.presets ?? []).filter((preset) => preset.gender === 'female'),
    [voiceCatalogQuery.data]
  );
  const maleVoicePresets = useMemo(
    () => (voiceCatalogQuery.data?.presets ?? []).filter((preset) => preset.gender === 'male'),
    [voiceCatalogQuery.data]
  );

  useEffect(() => {
    if (!personasQuery.data) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const persona of personasQuery.data) {
        if (!next[persona.id]) {
          next[persona.id] = {
            avatar_url: persona.avatar_url,
            preview_video_url: persona.preview_video_url,
            gallery_urls: persona.gallery_urls ?? [],
          };
        }
      }
      return next;
    });
  }, [personasQuery.data]);

  useEffect(() => {
    if (!voicesQuery.data || !voiceCatalogQuery.data) return;
    setVoiceSelections((current) => {
      const next = { ...current };
      for (const voice of voicesQuery.data) {
        if (next[voice.persona_id] !== undefined) continue;
        if (voice.provider === 'browser') {
          next[voice.persona_id] = '';
        } else if (presetByVoiceId.has(voice.voice_id)) {
          next[voice.persona_id] = voice.voice_id;
        } else {
          next[voice.persona_id] = '__current_custom__';
        }
      }
      return next;
    });
  }, [presetByVoiceId, voiceCatalogQuery.data, voicesQuery.data]);

  useEffect(
    () => () => {
      voicePreviewAbortRef.current?.abort(
        new DOMException('The voice preview page was closed', 'AbortError')
      );
      voicePreviewAbortRef.current = null;
      releaseVoicePreview();
    },
    [releaseVoicePreview]
  );

  const saveMutation = useMutation({
    mutationFn: ({ personaId, draft }: { personaId: number; draft: PersonaDraft }) =>
      adminService.updateOmniChatPersonaMedia(personaId, draft),
    onSuccess: (updatedPersona) => {
      queryClient.setQueryData<AdminOmniChatPersona[]>(['adminOmniChatPersonas'], (current = []) =>
        current.map((persona) => (persona.id === updatedPersona.id ? updatedPersona : persona))
      );
      setDrafts((current) => ({
        ...current,
        [updatedPersona.id]: {
          avatar_url: updatedPersona.avatar_url,
          preview_video_url: updatedPersona.preview_video_url,
          gallery_urls: updatedPersona.gallery_urls ?? [],
        },
      }));
      setSaveSuccesses((current) => ({
        ...current,
        [updatedPersona.id]: 'Media saved.',
      }));
    },
  });

  const saveVoiceMutation = useMutation({
    mutationFn: ({ personaId, presetId }: { personaId: number; presetId: string }) =>
      adminService.updateOmniChatPersonaVoice(personaId, presetId),
    onSuccess: (voice) => {
      queryClient.setQueryData<OmniChatPersonaVoice[]>(
        ['adminOmniChatPersonaVoices'],
        (current = []) => {
          const exists = current.some((candidate) => candidate.persona_id === voice.persona_id);
          return exists
            ? current.map((candidate) =>
                candidate.persona_id === voice.persona_id ? voice : candidate
              )
            : [...current, voice];
        }
      );
      setVoiceSelections((current) => ({
        ...current,
        [voice.persona_id]: voice.provider === 'browser' ? '' : voice.voice_id,
      }));
      setVoiceSuccesses((current) => ({ ...current, [voice.persona_id]: 'Voice saved.' }));
    },
  });

  const sortedPersonas = useMemo(
    () => [...(personasQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [personasQuery.data]
  );

  const updateDraft = (personaId: number, patch: Partial<PersonaDraft>) => {
    setSaveSuccesses((current) => {
      if (!current[personaId]) return current;
      const next = { ...current };
      delete next[personaId];
      return next;
    });
    setDrafts((current) => ({
      ...current,
      [personaId]: {
        ...(current[personaId] ?? {}),
        ...patch,
      },
    }));
  };

  const normalizeUploadDraftUrl = (storageUrl?: string, storagePath?: string) =>
    normalizeUploadedMediaUrl(undefined, storagePath) || normalizeUploadedMediaUrl(storageUrl);

  const handleUpload = async (
    personaId: number,
    file: File | undefined,
    field: 'avatar_url' | 'preview_video_url'
  ) => {
    if (!file) return;
    const uploadKey = `${personaId}:${field}`;
    setUploading((current) => ({ ...current, [uploadKey]: true }));
    setUploadErrors((current) => ({ ...current, [uploadKey]: '' }));
    try {
      const uploaded = await mediaService.uploadMedia(file);
      updateDraft(personaId, {
        [field]: normalizeUploadDraftUrl(uploaded.storage_url, uploaded.storage_path),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setUploadErrors((current) => ({ ...current, [uploadKey]: message }));
    } finally {
      setUploading((current) => ({ ...current, [uploadKey]: false }));
    }
  };

  const handleGalleryUpload = async (personaId: number, file: File | undefined) => {
    if (!file) return;
    const uploadKey = `${personaId}:gallery_urls`;
    setUploading((current) => ({ ...current, [uploadKey]: true }));
    setUploadErrors((current) => ({ ...current, [uploadKey]: '' }));
    try {
      const uploaded = await mediaService.uploadMedia(file);
      const currentGallery = drafts[personaId]?.gallery_urls ?? [];
      updateDraft(personaId, {
        gallery_urls: [
          ...currentGallery,
          normalizeUploadDraftUrl(uploaded.storage_url, uploaded.storage_path),
        ],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setUploadErrors((current) => ({ ...current, [uploadKey]: message }));
    } finally {
      setUploading((current) => ({ ...current, [uploadKey]: false }));
    }
  };

  const removeGalleryURL = (personaId: number, index: number) => {
    const currentGallery = drafts[personaId]?.gallery_urls ?? [];
    updateDraft(personaId, {
      gallery_urls: currentGallery.filter((_, currentIndex) => currentIndex !== index),
    });
  };

  const updateVoiceSelection = (personaId: number, presetId: string) => {
    setVoiceSelections((current) => ({ ...current, [personaId]: presetId }));
    setVoiceSuccesses((current) => {
      if (!current[personaId]) return current;
      const next = { ...current };
      delete next[personaId];
      return next;
    });
    setVoicePreviewErrors((current) => {
      if (!current[personaId]) return current;
      const next = { ...current };
      delete next[personaId];
      return next;
    });
  };

  const previewVoice = async (personaId: number, presetId: string) => {
    if (!presetId || presetId === '__current_custom__') return;
    voicePreviewAbortRef.current?.abort(
      new DOMException('A newer voice preview was requested', 'AbortError')
    );
    const controller = new AbortController();
    voicePreviewAbortRef.current = controller;
    let createdPreview: { audio: HTMLAudioElement; url: string } | null = null;
    setPreviewingPersonaId(personaId);
    setVoicePreviewErrors((current) => ({ ...current, [personaId]: '' }));
    try {
      const blob = await omnichatService.previewVoicePreset(presetId, controller.signal);
      if (controller.signal.aborted) return;
      releaseVoicePreview();
      if (typeof URL.createObjectURL !== 'function') return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      createdPreview = { audio, url };
      activeVoicePreview.current = createdPreview;
      audio.addEventListener('ended', () => releaseVoicePreview(createdPreview), { once: true });
      await audio.play();
    } catch (error) {
      releaseVoicePreview(createdPreview);
      if ((error as Error).name === 'AbortError' || voicePreviewAbortRef.current !== controller)
        return;
      setVoicePreviewErrors((current) => ({
        ...current,
        [personaId]: error instanceof Error ? error.message : 'Voice preview failed',
      }));
    } finally {
      if (voicePreviewAbortRef.current === controller) {
        voicePreviewAbortRef.current = null;
        setPreviewingPersonaId((current) => (current === personaId ? null : current));
      }
    }
  };

  if (personasQuery.isLoading || voicesQuery.isLoading || voiceCatalogQuery.isLoading) {
    return <LoadingMessage>Loading OmniChat personas...</LoadingMessage>;
  }

  if (personasQuery.isError || voicesQuery.isError || voiceCatalogQuery.isError) {
    return <p className="text-sm text-red-400">Failed to load OmniChat persona management.</p>;
  }

  if (!sortedPersonas.length) {
    return <p className="text-sm text-[var(--color-text-secondary)]">No personas found.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
          OmniChat personas
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Upload avatar stills and short preview videos. Featured tiles autoplay on mobile; all
          tiles preview on desktop hover.
        </p>
      </div>

      <div className="grid gap-4">
        {sortedPersonas.map((persona) => {
          const draft = drafts[persona.id] ?? {
            avatar_url: persona.avatar_url,
            preview_video_url: persona.preview_video_url,
            gallery_urls: persona.gallery_urls ?? [],
          };
          const isSaving =
            saveMutation.isPending && saveMutation.variables?.personaId === persona.id;
          const avatarUploading = uploading[`${persona.id}:avatar_url`] === true;
          const videoUploading = uploading[`${persona.id}:preview_video_url`] === true;
          const galleryUploading = uploading[`${persona.id}:gallery_urls`] === true;
          const voice = voiceByPersonaId.get(persona.id);
          const voiceSelection = voiceSelections[persona.id] ?? '';
          const isVoiceSaving =
            saveVoiceMutation.isPending && saveVoiceMutation.variables?.personaId === persona.id;
          const isVoicePreviewing = previewingPersonaId === persona.id;
          const currentVoiceIsCustom = Boolean(
            voice && voice.provider !== 'browser' && !presetByVoiceId.has(voice.voice_id)
          );

          return (
            <section
              key={persona.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4"
            >
              <div className="grid gap-4 lg:grid-cols-[160px,1fr]">
                <div className="space-y-3">
                  <div
                    className="w-40 max-w-full"
                    onMouseEnter={() => setHoveredPersonaId(persona.id)}
                    onMouseLeave={() =>
                      setHoveredPersonaId((current) => (current === persona.id ? null : current))
                    }
                  >
                    <PersonaAvatar
                      persona={{ ...persona, ...draft }}
                      className="aspect-[3/4] w-full"
                      previewEnabled={Boolean(draft.preview_video_url)}
                      previewActive={hoveredPersonaId === persona.id}
                      loopPreview
                    />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {persona.name}
                    </div>
                    <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                      {persona.category.replace('_', ' ')}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <MediaUploadField
                      id={`admin-persona-${persona.id}-avatar`}
                      label="Avatar Image"
                      value={draft.avatar_url}
                      previewSrc={resolveMediaUrl(draft.avatar_url, persona.updated_at)}
                      accept="image/*"
                      mediaType="image"
                      uploadButtonLabel="Select avatar image"
                      uploadingLabel="Uploading avatar..."
                      clearLabel="Clear image"
                      isUploading={avatarUploading}
                      previewFrameClassName="aspect-[3/4]"
                      imageClassName="h-full w-full bg-black/10 object-cover"
                      onFileChange={(event) =>
                        handleUpload(persona.id, event.target.files?.[0], 'avatar_url')
                      }
                      onClear={() => updateDraft(persona.id, { avatar_url: '' })}
                    />
                    {avatarUploading && (
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        Uploading avatar...
                      </p>
                    )}
                    {uploadErrors[`${persona.id}:avatar_url`] && (
                      <p className="text-xs text-red-400">
                        {uploadErrors[`${persona.id}:avatar_url`]}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <MediaUploadField
                      id={`admin-persona-${persona.id}-preview-video`}
                      label="Preview Video"
                      value={draft.preview_video_url}
                      previewSrc={resolveMediaUrl(draft.preview_video_url, persona.updated_at)}
                      accept="video/mp4,video/webm,video/quicktime"
                      mediaType="video"
                      uploadButtonLabel="Select preview video"
                      uploadingLabel="Uploading preview video..."
                      clearLabel="Clear video"
                      isUploading={videoUploading}
                      onFileChange={(event) =>
                        handleUpload(persona.id, event.target.files?.[0], 'preview_video_url')
                      }
                      onClear={() => updateDraft(persona.id, { preview_video_url: '' })}
                    />
                    {videoUploading && (
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        Uploading preview video...
                      </p>
                    )}
                    {uploadErrors[`${persona.id}:preview_video_url`] && (
                      <p className="text-xs text-red-400">
                        {uploadErrors[`${persona.id}:preview_video_url`]}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Character Voice
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Assign one of the six female or six male server voices. Browser fallback keeps
                    speech on the user's device.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),auto,auto] md:items-end">
                  <label className="space-y-1 text-sm text-[var(--color-text-primary)]">
                    <span className="block text-xs font-medium text-[var(--color-text-secondary)]">
                      Voice for {persona.name}
                    </span>
                    <select
                      aria-label={`${persona.name} voice`}
                      value={voiceSelection}
                      onChange={(event) => updateVoiceSelection(persona.id, event.target.value)}
                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2"
                    >
                      <option value="">Browser fallback</option>
                      {currentVoiceIsCustom && (
                        <option value="__current_custom__">
                          Current custom voice ({voice?.voice_name})
                        </option>
                      )}
                      <optgroup label="Female voices">
                        {femaleVoicePresets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Male voices">
                        {maleVoicePresets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                  <button
                    type="button"
                    aria-label={`Preview ${persona.name} voice`}
                    onClick={() => previewVoice(persona.id, voiceSelection)}
                    disabled={
                      !voiceSelection ||
                      voiceSelection === '__current_custom__' ||
                      !voiceCatalogQuery.data?.voicebox_available ||
                      previewingPersonaId !== null
                    }
                    className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {isVoicePreviewing ? 'Previewing...' : 'Preview'}
                  </button>
                  <button
                    type="button"
                    aria-label={`Save ${persona.name} voice`}
                    onClick={() =>
                      saveVoiceMutation.mutate({
                        personaId: persona.id,
                        presetId: voiceSelection,
                      })
                    }
                    disabled={
                      saveVoiceMutation.isPending ||
                      voiceSelection === '__current_custom__' ||
                      (Boolean(voiceSelection) && !voiceCatalogQuery.data?.voicebox_available)
                    }
                    className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {isVoiceSaving ? 'Saving...' : 'Save voice'}
                  </button>
                </div>
                {!voiceCatalogQuery.data?.voicebox_available && (
                  <p role="status" className="text-xs text-amber-400">
                    Voicebox is offline. Existing assignments remain intact; start Voicebox to
                    preview or assign a server voice.
                  </p>
                )}
                {voicePreviewErrors[persona.id] && (
                  <p role="alert" className="text-xs text-red-400">
                    {voicePreviewErrors[persona.id]}
                  </p>
                )}
                {saveVoiceMutation.isError &&
                  saveVoiceMutation.variables?.personaId === persona.id && (
                    <p role="alert" className="text-xs text-red-400">
                      {saveVoiceMutation.error instanceof Error
                        ? saveVoiceMutation.error.message
                        : 'Voice save failed'}
                    </p>
                  )}
                {voiceSuccesses[persona.id] && !isVoiceSaving && (
                  <p role="status" className="text-xs text-emerald-400">
                    {voiceSuccesses[persona.id]}
                  </p>
                )}
              </div>

              <div className="mt-4 space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Gallery Images
                    </h3>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Optional images shown in the persona gallery.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateDraft(persona.id, { gallery_urls: [] })}
                      className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm"
                    >
                      Clear gallery
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor={`admin-persona-${persona.id}-gallery-file`}
                    className="inline-flex cursor-pointer items-center rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                  >
                    {galleryUploading ? 'Uploading gallery image...' : 'Add gallery image'}
                  </label>
                  <input
                    id={`admin-persona-${persona.id}-gallery-file`}
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleGalleryUpload(persona.id, event.target.files?.[0])}
                    className="hidden"
                    disabled={galleryUploading}
                  />
                </div>

                {galleryUploading && (
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Uploading gallery image...
                  </p>
                )}
                {uploadErrors[`${persona.id}:gallery_urls`] && (
                  <p className="text-xs text-red-400">
                    {uploadErrors[`${persona.id}:gallery_urls`]}
                  </p>
                )}

                {(draft.gallery_urls ?? []).length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {(draft.gallery_urls ?? []).map((url, index) => (
                      <div
                        key={`${persona.id}-gallery-${url}-${index}`}
                        className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]"
                      >
                        <img
                          src={resolveMediaUrl(url)}
                          alt={`${persona.name} gallery image ${index + 1}`}
                          className="h-40 w-full bg-black/10 object-cover"
                        />
                        <div className="space-y-2 p-2">
                          <p className="break-all rounded-lg bg-[var(--color-surface)] px-2 py-1 font-mono text-[11px] text-[var(--color-text-secondary)]">
                            {url}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeGalleryURL(persona.id, index)}
                            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    No gallery images set.
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    saveMutation.mutate({
                      personaId: persona.id,
                      draft: {
                        avatar_url: draft.avatar_url?.trim() || undefined,
                        preview_video_url: draft.preview_video_url?.trim() || undefined,
                        gallery_urls: (draft.gallery_urls ?? [])
                          .map((url) => url.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                  disabled={
                    saveMutation.isPending || avatarUploading || videoUploading || galleryUploading
                  }
                  className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {isSaving ? 'Saving...' : 'Save media'}
                </button>
                {(draft.preview_video_url || persona.preview_video_url) && (
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    Video preview enabled
                  </span>
                )}
                {saveMutation.isError && saveMutation.variables?.personaId === persona.id && (
                  <span className="text-xs text-red-400">
                    {saveMutation.error instanceof Error
                      ? saveMutation.error.message
                      : 'Save failed'}
                  </span>
                )}
                {saveSuccesses[persona.id] && !isSaving && (
                  <span className="text-xs text-emerald-400">{saveSuccesses[persona.id]}</span>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
