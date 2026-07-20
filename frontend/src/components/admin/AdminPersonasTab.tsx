import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/adminService';
import { mediaService } from '../../services/mediaService';
import type { AdminOmniChatPersona } from '../../types/admin';
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
  const [hoveredPersonaId, setHoveredPersonaId] = useState<number | null>(null);

  const personasQuery = useQuery({
    queryKey: ['adminOmniChatPersonas'],
    queryFn: () => adminService.listOmniChatPersonas(),
  });

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
      updateDraft(personaId, { [field]: normalizeUploadDraftUrl(uploaded.storage_url, uploaded.storage_path) });
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
        gallery_urls: [...currentGallery, normalizeUploadDraftUrl(uploaded.storage_url, uploaded.storage_path)],
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

  if (personasQuery.isLoading) {
    return <LoadingMessage>Loading OmniChat personas...</LoadingMessage>;
  }

  if (!sortedPersonas.length) {
    return <p className="text-sm text-[var(--color-text-secondary)]">No personas found.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">OmniChat personas</h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Upload avatar stills and short preview videos. Featured tiles autoplay on mobile; all tiles preview on desktop hover.
        </p>
      </div>

      <div className="grid gap-4">
        {sortedPersonas.map((persona) => {
          const draft = drafts[persona.id] ?? {
            avatar_url: persona.avatar_url,
            preview_video_url: persona.preview_video_url,
            gallery_urls: persona.gallery_urls ?? [],
          };
          const isSaving = saveMutation.isPending && saveMutation.variables?.personaId === persona.id;
          const avatarUploading = uploading[`${persona.id}:avatar_url`] === true;
          const videoUploading = uploading[`${persona.id}:preview_video_url`] === true;
          const galleryUploading = uploading[`${persona.id}:gallery_urls`] === true;

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
                    onMouseLeave={() => setHoveredPersonaId((current) => (current === persona.id ? null : current))}
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
                    <div className="text-sm font-semibold text-[var(--color-text-primary)]">{persona.name}</div>
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
                      onFileChange={(event) => handleUpload(persona.id, event.target.files?.[0], 'avatar_url')}
                      onClear={() => updateDraft(persona.id, { avatar_url: '' })}
                    />
                    {avatarUploading && (
                      <p className="text-xs text-[var(--color-text-secondary)]">Uploading avatar...</p>
                    )}
                    {uploadErrors[`${persona.id}:avatar_url`] && (
                      <p className="text-xs text-red-400">{uploadErrors[`${persona.id}:avatar_url`]}</p>
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
                      <p className="text-xs text-[var(--color-text-secondary)]">Uploading preview video...</p>
                    )}
                    {uploadErrors[`${persona.id}:preview_video_url`] && (
                      <p className="text-xs text-red-400">{uploadErrors[`${persona.id}:preview_video_url`]}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Gallery Images</h3>
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
                  <p className="text-xs text-[var(--color-text-secondary)]">Uploading gallery image...</p>
                )}
                {uploadErrors[`${persona.id}:gallery_urls`] && (
                  <p className="text-xs text-red-400">{uploadErrors[`${persona.id}:gallery_urls`]}</p>
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
                  <p className="text-xs text-[var(--color-text-secondary)]">No gallery images set.</p>
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
                  disabled={isSaving || avatarUploading || videoUploading || galleryUploading}
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
                    {saveMutation.error instanceof Error ? saveMutation.error.message : 'Save failed'}
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
