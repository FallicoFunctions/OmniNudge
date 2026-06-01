export function normalizeUploadedMediaUrl(storageUrl?: string, storagePath?: string): string {
  if (storageUrl) {
    if (storageUrl.startsWith('http://') || storageUrl.startsWith('https://')) {
      return storageUrl;
    }
    return storageUrl.startsWith('/') ? storageUrl : `/${storageUrl}`;
  }

  if (storagePath) {
    const normalizedPath = storagePath.replace(/^\/?uploads\/?/, '');
    return `/uploads/${normalizedPath}`;
  }

  return '';
}
