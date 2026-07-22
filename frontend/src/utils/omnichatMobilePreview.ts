type PreviewableEntity = {
  id: number;
  preview_video_url?: string;
};

export type MobilePreviewState = {
  id: number;
  version: number;
};

export type PreviewResumeMode = 'loop' | 'sequential';

export function getPreviewEligibleIds(items: PreviewableEntity[]): number[] {
  return items.filter((item) => Boolean(item.preview_video_url)).map((item) => item.id);
}

export function getNextPreviewState(
  visibleEligibleIds: number[],
  current: MobilePreviewState | null
): MobilePreviewState | null {
  if (visibleEligibleIds.length === 0) {
    return null;
  }
  if (current && visibleEligibleIds.includes(current.id)) {
    return current;
  }
  return {
    id: visibleEligibleIds[0],
    version: (current?.version ?? 0) + 1,
  };
}

export function getRotationPreviewState(
  visibleEligibleIds: number[],
  personaId: number,
  current: MobilePreviewState | null
): MobilePreviewState | null {
  if (visibleEligibleIds.length === 0) {
    return null;
  }

  const currentIndex = visibleEligibleIds.indexOf(personaId);
  const nextId =
    currentIndex === -1
      ? visibleEligibleIds[0]
      : visibleEligibleIds[(currentIndex + 1) % visibleEligibleIds.length];

  return {
    id: nextId,
    version: (current?.version ?? 0) + 1,
  };
}

export function getResumePreviewState(
  visibleEligibleIds: number[],
  personaId: number,
  current: MobilePreviewState | null,
  mode: PreviewResumeMode
): MobilePreviewState | null {
  if (mode === 'loop') {
    return {
      id: personaId,
      version: (current?.version ?? 0) + 1,
    };
  }

  return getRotationPreviewState(visibleEligibleIds, personaId, current);
}
