function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => character.codePointAt(0)! <= 0x1f);
}

function isSafeRelativePath(value: string): boolean {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !containsControlCharacter(value)
  );
}

export function normalizeUploadedMediaUrl(storageUrl?: string, storagePath?: string): string {
  if (storageUrl?.trim()) {
    const candidate = storageUrl.trim();
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.toString();
      }
    } catch {
      // Relative uploads are handled below.
    }
    if (isSafeRelativePath(candidate)) {
      return candidate;
    }
  }

  if (storagePath?.trim()) {
    const normalizedPath = storagePath.trim().replace(/^\/?uploads\/?/, '');
    const segments = normalizedPath.split('/');
    if (
      normalizedPath &&
      !normalizedPath.includes('\\') &&
      !containsControlCharacter(normalizedPath) &&
      segments.every((segment) => segment && segment !== '.' && segment !== '..')
    ) {
      return `/uploads/${segments.map(encodeURIComponent).join('/')}`;
    }
  }

  return '';
}
