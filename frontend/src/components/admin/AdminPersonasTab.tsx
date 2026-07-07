import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/adminService';
import { mediaService } from '../../services/mediaService';
import type { AdminOmniChatPersona } from '../../types/admin';
import PersonaAvatar from '../omnichat/PersonaAvatar';
import { LoadingMessage } from '../common/StatusMessage';

type PersonaDraft = {
  avatar_url?: string;
  preview_video_url?: string;
};

export default function AdminPersonasTab() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<number, PersonaDraft>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
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
        },
      }));
    },
  });

  const sortedPersonas = useMemo(
    () => [...(personasQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [personasQuery.data]
  );

  const updateDraft = (personaId: number, patch: Partial<PersonaDraft>) => {
    setDrafts((current) => ({
      ...current,
      [personaId]: {
        ...(current[personaId] ?? {}),
        ...patch,
      },
    }));
  };

  const handleUpload = async (
    personaId: number,
    file: File | undefined,
    field: keyof PersonaDraft
  ) => {
    if (!file) return;
    const uploadKey = `${personaId}:${field}`;
    setUploading((current) => ({ ...current, [uploadKey]: true }));
    setUploadErrors((current) => ({ ...current, [uploadKey]: '' }));
    try {
      const uploaded = await mediaService.uploadMedia(file);
      updateDraft(personaId, { [field]: uploaded.storage_url });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setUploadErrors((current) => ({ ...current, [uploadKey]: message }));
    } finally {
      setUploading((current) => ({ ...current, [uploadKey]: false }));
    }
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
          };
          const isSaving = saveMutation.isPending && saveMutation.variables?.personaId === persona.id;
          const avatarUploading = uploading[`${persona.id}:avatar_url`] === true;
          const videoUploading = uploading[`${persona.id}:preview_video_url`] === true;

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
                  <label className="space-y-2">
                    <span className="block text-sm font-medium text-[var(--color-text-primary)]">Avatar image URL</span>
                    <input
                      type="text"
                      value={draft.avatar_url ?? ''}
                      onChange={(event) => updateDraft(persona.id, { avatar_url: event.target.value })}
                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                      placeholder="/uploads/persona-avatar.png"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => handleUpload(persona.id, event.target.files?.[0], 'avatar_url')}
                      className="block w-full text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateDraft(persona.id, { avatar_url: '' })}
                        className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm"
                      >
                        Clear image
                      </button>
                    </div>
                    {avatarUploading && (
                      <p className="text-xs text-[var(--color-text-secondary)]">Uploading avatar...</p>
                    )}
                    {uploadErrors[`${persona.id}:avatar_url`] && (
                      <p className="text-xs text-red-400">{uploadErrors[`${persona.id}:avatar_url`]}</p>
                    )}
                  </label>

                  <label className="space-y-2">
                    <span className="block text-sm font-medium text-[var(--color-text-primary)]">Preview video URL</span>
                    <input
                      type="text"
                      value={draft.preview_video_url ?? ''}
                      onChange={(event) =>
                        updateDraft(persona.id, { preview_video_url: event.target.value })
                      }
                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                      placeholder="/uploads/persona-preview.mp4"
                    />
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      onChange={(event) =>
                        handleUpload(persona.id, event.target.files?.[0], 'preview_video_url')
                      }
                      className="block w-full text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateDraft(persona.id, { preview_video_url: '' })}
                        className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm"
                      >
                        Clear video
                      </button>
                    </div>
                    {videoUploading && (
                      <p className="text-xs text-[var(--color-text-secondary)]">Uploading preview video...</p>
                    )}
                    {uploadErrors[`${persona.id}:preview_video_url`] && (
                      <p className="text-xs text-red-400">{uploadErrors[`${persona.id}:preview_video_url`]}</p>
                    )}
                  </label>
                </div>
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
                      },
                    })
                  }
                  disabled={isSaving || avatarUploading || videoUploading}
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
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
