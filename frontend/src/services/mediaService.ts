import api from './api';

const ACTIVE_CONTENT_FILE_TYPES = new Set([
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'application/javascript',
  'text/javascript',
]);
const ACTIVE_CONTENT_FILE_EXTENSIONS = /\.(?:svg|svgz|html?|xhtml|mjs|cjs|js)$/i;

export function assertSafeMediaFile(file: File): void {
  const filename = file.name.trim();
  if (!filename || file.size === 0) {
    throw new Error('Please select a non-empty media file.');
  }
  // Uploaded files are rendered in-app and sometimes opened in a new tab. Do
  // not send active document formats to the media endpoint. The server must
  // still verify MIME type, content signature, and size independently.
  if (
    ACTIVE_CONTENT_FILE_TYPES.has(file.type.toLowerCase()) ||
    ACTIVE_CONTENT_FILE_EXTENSIONS.test(filename)
  ) {
    throw new Error('SVG and active document files cannot be uploaded as media.');
  }
}

export interface MediaFile {
  id: number;
  user_id: number;
  filename: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  storage_url: string;
  thumbnail_url?: string;
  storage_path: string;
  width?: number;
  height?: number;
  duration?: number;
  used_in_message_id?: number;
  uploaded_at: string;
}

export interface BatchUploadResponse {
  uploads: (MediaFile | null)[];
  success_count: number;
  total_count: number;
  errors?: string[];
}

export const mediaService = {
  async uploadMedia(file: File): Promise<MediaFile> {
    assertSafeMediaFile(file);
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<MediaFile>('/media/upload', formData, {
      // Let the browser add the multipart boundary. A manually supplied
      // Content-Type omits it in some clients and causes malformed uploads.
      headers: {},
    });

    return response.data;
  },

  async batchUploadMedia(files: File[]): Promise<BatchUploadResponse> {
    files.forEach(assertSafeMediaFile);
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    const response = await api.post<BatchUploadResponse>('/media/batch-upload', formData, {
      headers: {},
    });

    return response.data;
  },
};
