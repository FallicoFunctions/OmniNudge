import api from './api';

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
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<MediaFile>('/media/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },

  async batchUploadMedia(files: File[]): Promise<BatchUploadResponse> {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    const response = await api.post<BatchUploadResponse>('/media/batch-upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },
};
